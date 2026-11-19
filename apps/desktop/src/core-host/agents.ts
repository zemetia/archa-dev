import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { newId } from '@archa/schema';
import { guidesFor, guideText, type ChatMessage, type ChatRunEvent, type ModelOption } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import type { Workspace } from './workspace';
import { describeState } from './execute';
import { ADAPTERS, type Adapter, type AgentEvent, type McpCommand, type StreamParser } from './agent-adapters';
import { resolveCli, type AccountManager } from './accounts';
import { randomPersona } from './personas';

/*
 * Launch mode (blueprint AGENT_BRIDGE): the app starts the agent's own CLI headless,
 * gives it the ArchaDev MCP server, and turns its stream into chat messages.
 * Adapters (argv, stream parsers, model lists) live in agent-adapters.ts.
 */

export { ADAPTERS, findBin, type McpCommand } from './agent-adapters';

type Run = { id: string; docId: string; threadId: string; agent: string; persona: string; prompt: string; child: ChildProcess | null; stopped: boolean; replied: boolean; failed: boolean; startedAt: number };
type SendOptions = { now?: boolean; focus?: string[] };
type Queued = { docId: string; agentId: string; prompt: string; model?: string; account?: string; focus?: string[] };
/** A thread's agent process kept alive between turns (plan CHAT_AGENT, D-11 A). */
type Warm = {
  id: string; threadId: string; docId: string; agent: string; key: string; persona: string;
  child: ChildProcess; sessionKey: string; mcpConfigFile: string;
  turn: Run | null; turns: number; resumed: boolean; cost?: number; dead: boolean; lastUsed: number;
  idle: ReturnType<typeof setTimeout> | undefined; stopTimer: ReturnType<typeof setTimeout> | undefined; ready: Promise<void>;
};
/** An idle warm process is closed after this; the next message resumes the CLI session cold. */
const WARM_IDLE_MS = 10 * 60_000;
const MAX_WARM = 6;

function killTree(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGTERM');
}

/*
 * Chat history lives in ARCHA_HOME/chats/<docId>.jsonl (one message per line) and the agent CLI
 * session ids in chats/sessions.json, so a thread can be resumed after a restart. Deleting the
 * folder only loses history, never design data.
 */
const chatsDir = () => join(archaHome(), 'chats');
const safeName = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'doc';
const threadDir = (threadId: string) => join(archaHome(), 'runtime', 'threads', safeName(threadId));

export class ChatRunner {
  private runs = new Map<string, Run>();
  private warm = new Map<string, Warm>(); // threadId -> live process
  private queue = new Map<string, Queued[]>(); // threadId -> messages waiting for the running turn
  private interrupted = new Map<string, string>(); // threadId -> prompt stopped before any reply
  private sessions: Map<string, string> | null = null; // threadId:agent:login -> CLI session id
  private messages = new Map<string, ChatMessage[]>();

  constructor(private ws: Workspace, private mcpCommand: () => McpCommand) {}

  list(docId: string): ChatMessage[] {
    let list = this.messages.get(docId);
    if (!list) {
      list = [];
      const file = join(chatsDir(), `${safeName(docId)}.jsonl`);
      if (existsSync(file)) {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          try { list.push(JSON.parse(line) as ChatMessage); } catch { /* skip a torn line */ }
        }
      }
      this.messages.set(docId, list);
    }
    return list;
  }

  /** Session name of a run's thread, for the identity of the `archa mcp` it starts. */
  identity(runId: string): { persona: string; threadId: string; agent: string } | null {
    const r = this.runs.get(runId) ?? [...this.warm.values()].find((w) => w.id === runId);
    return r ? { persona: r.persona, threadId: r.threadId, agent: r.agent } : null;
  }

  active(): ChatRunEvent[] {
    return [...this.runs.values()].map((r) => this.runEvent(r, 'running'));
  }

  private runEvent(r: Run, status: ChatRunEvent['status']): ChatRunEvent {
    return { runId: r.id, docId: r.docId, threadId: r.threadId, agent: r.agent, persona: r.persona, status };
  }

  /** A thread keeps its name across turns; a new one gets a name no other session on the doc uses. */
  private personaFor(docId: string, threadId: string): string {
    const list = this.list(docId);
    const own = list.find((m) => (m.threadId ?? m.runId) === threadId && m.persona)?.persona ?? this.warm.get(threadId)?.persona;
    if (own) return own;
    return randomPersona(list.map((m) => m.persona ?? ''), [...[...this.runs.values()].map((r) => r.persona), ...this.ws.agents().map((a) => a.name)]);
  }

  deleteThread(docId: string, threadId: string) {
    if ([...this.runs.values()].some((r) => r.threadId === threadId)) throw new Error('Stop the running agent before deleting this conversation');
    const w = this.warm.get(threadId);
    if (w) this.killWarm(w);
    this.queue.delete(threadId);
    rmSync(threadDir(threadId), { recursive: true, force: true });
    const kept = this.list(docId).filter((m) => (m.threadId ?? m.runId) !== threadId);
    this.messages.set(docId, kept);
    mkdirSync(chatsDir(), { recursive: true });
    writeFileSync(join(chatsDir(), `${safeName(docId)}.jsonl`), kept.map((m) => JSON.stringify(m)).join('\n') + (kept.length ? '\n' : ''));
  }

  private sessionMap(): Map<string, string> {
    if (this.sessions) return this.sessions;
    this.sessions = new Map();
    try {
      const raw = JSON.parse(readFileSync(join(chatsDir(), 'sessions.json'), 'utf8')) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') this.sessions.set(k, v);
    } catch { /* first run */ }
    return this.sessions;
  }

  private rememberSession(key: string, id: string) {
    const map = this.sessionMap();
    if (map.get(key) === id) return;
    map.set(key, id);
    try {
      mkdirSync(chatsDir(), { recursive: true });
      writeFileSync(join(chatsDir(), 'sessions.json'), JSON.stringify(Object.fromEntries(map), null, 2));
    } catch { /* resume is best-effort */ }
  }

  private emit(run: Pick<Run, 'docId' | 'id' | 'threadId' | 'agent' | 'persona'>, role: ChatMessage['role'], text: string) {
    const m: ChatMessage = { id: newId(), docId: run.docId, runId: run.id, threadId: run.threadId, role, agent: run.agent, persona: run.persona, text, ts: Date.now() };
    this.list(run.docId).push(m);
    try {
      mkdirSync(chatsDir(), { recursive: true });
      appendFileSync(join(chatsDir(), `${safeName(run.docId)}.jsonl`), JSON.stringify(m) + '\n');
    } catch { /* history is best-effort; the live chat still works */ }
    this.ws.broadcast('chat.message', m);
  }

  /**
   * One turn of a conversation. A thread that is still working queues the message (`now` stops the
   * running turn first). Agents with a warm mode keep one process per thread between turns.
   */
  send(docId: string, agentId: string, prompt: string, model?: string, account?: string, threadId = newId(), opts: SendOptions = {}): { runId: string; threadId: string; persona: string; queued?: boolean } {
    const busy = [...this.runs.values()].find((r) => r.threadId === threadId);
    if (busy) {
      const q = this.queue.get(threadId) ?? [];
      const item: Queued = { docId, agentId, prompt, model, account, focus: opts.focus };
      if (opts.now) q.unshift(item); else q.push(item);
      this.queue.set(threadId, q);
      const echo = { docId, id: newId(), threadId, agent: agentId, persona: busy.persona };
      this.emit(echo, 'user', prompt);
      this.emit(echo, 'status', opts.now ? `Stopping ${busy.persona} — this runs next` : 'Queued — runs when the current turn ends');
      if (opts.now) this.stop(busy.id);
      return { runId: '', threadId, persona: busy.persona, queued: true };
    }
    return this.start({ docId, agentId, prompt, model, account, focus: opts.focus }, threadId, false);
  }

  private start(q: Queued, threadId: string, echoed: boolean): { runId: string; threadId: string; persona: string } {
    const { docId, agentId, prompt, model, account } = q;
    const adapter = ADAPTERS.find((a) => a.id === agentId);
    if (!adapter) throw new Error(`Unknown agent "${agentId}"`);
    const cli = resolveCli(adapter.bin);
    if (!cli) throw new Error(`${adapter.label} CLI ("${adapter.bin}") was not found on PATH`);
    // A saved account runs in its own config folder (blueprint AGENT_BRIDGE/02).
    const login = this.ws.accounts.runEnv(adapter.id, account);
    const session = this.ws.session(docId);
    const runId = newId();
    const firstTurn = !this.list(docId).some((m) => (m.threadId ?? m.runId) === threadId && m.role === 'agent');

    // A request stopped before the agent answered never reached its session; carry it into this turn.
    const interrupted = this.interrupted.get(threadId);
    this.interrupted.delete(threadId);
    const request = interrupted ? `Earlier request (stopped before you answered it):\n${interrupted}\n\nNow:\n${prompt}` : prompt;
    const focus = (q.focus ?? []).map((id) => session.doc.get(id)).filter((n) => !!n).slice(0, 12);
    const focusLine = focus.length ? `\nFocus — this request is about: ${focus.map((n) => `${n.name} "${n.id}" (${n.type})`).join(', ')}` : '';
    // The internal skill: guides that fit the request ride along on the first turn (saves a guide call).
    const guides = firstTurn ? guidesFor(request).map((t) => guideText(t)).join('\n\n') : '';
    const fullPrompt = `${request}${focusLine}\n\n---\nCurrent canvas state (fresh, no need to call get_state first):\n${describeState(this.ws, session)}${guides ? `\n\n---\nGuides for this task:\n${guides}` : ''}`;
    const run: Run = { id: runId, docId, threadId, agent: agentId, persona: this.personaFor(docId, threadId), prompt: request, child: null, stopped: false, replied: false, failed: false, startedAt: Date.now() };
    this.runs.set(runId, run);
    if (!echoed) this.emit(run, 'user', prompt);
    if (login.label) this.emit(run, 'status', `Running as ${login.label}`);
    this.ws.broadcast('chat.run', this.runEvent(run, 'running'));

    if (adapter.warm) {
      this.ensureWarm(docId, threadId, adapter, model, account).then((w) => {
        if (run.stopped) { this.finishRun(run, 'stopped'); return; }
        if (w.dead) { run.failed = true; this.emit(run, 'error', 'The agent process closed before this turn started'); this.finishRun(run, 'failed'); return; }
        clearTimeout(w.idle);
        w.turn = run;
        w.lastUsed = Date.now();
        run.child = w.child;
        w.child.stdin?.write(`${adapter.warm!.message(fullPrompt, { first: w.turns === 0, resumed: w.resumed })}\n`);
        w.turns++;
      }, (e: Error) => { run.failed = true; this.emit(run, 'error', e.message); this.finishRun(run, 'failed'); });
    } else this.startCold(run, adapter, cli, login, fullPrompt, model, account);
    return { runId, threadId, persona: run.persona };
  }

  /** Spawn the agent's process for a thread ahead of the first message (composer focus), so Send starts at once. */
  async warmUp(docId: string, agentId: string, model?: string, account?: string, threadId = newId()): Promise<{ threadId: string; warm: boolean }> {
    const adapter = ADAPTERS.find((a) => a.id === agentId);
    if (!adapter?.warm || !resolveCli(adapter.bin)) return { threadId, warm: false };
    if ([...this.runs.values()].some((r) => r.threadId === threadId)) return { threadId, warm: true };
    const w = await this.ensureWarm(docId, threadId, adapter, model, account);
    if (!w.turn) this.armIdle(w);
    return { threadId, warm: true };
  }

  private warmKey(docId: string, agentId: string, model?: string, account?: string) {
    return JSON.stringify([docId, agentId, model ?? '', account ?? '', Object.keys(this.ws.mcpServers.forRun()).sort(), this.ws.skills.forRun()]);
  }

  /** The thread's live process when its settings still match, else a fresh one (resuming the CLI session). */
  private ensureWarm(docId: string, threadId: string, adapter: Adapter, model?: string, account?: string): Promise<Warm> {
    const key = this.warmKey(docId, adapter.id, model, account);
    const live = this.warm.get(threadId);
    if (live && live.key === key && !live.dead) return live.ready.then(() => live);
    if (live) this.killWarm(live);

    const cli = resolveCli(adapter.bin);
    if (!cli) return Promise.reject(new Error(`${adapter.label} CLI ("${adapter.bin}") was not found on PATH`));
    const login = this.ws.accounts.runEnv(adapter.id, account);
    const base = this.mcpCommand();
    const mcp: McpCommand = { ...base, args: [...base.args, '--doc', docId, '--agent', adapter.id] };
    const sessionKey = `${threadId}:${adapter.id}:${login.label ? Object.values(login.env).join() : 'host'}`;
    const sessionId = this.sessionMap().get(sessionKey);
    // Claude Code files sessions by cwd: a pre-0.2.5 thread that already has one keeps the shared folder.
    const cfgDir = sessionId && !existsSync(threadDir(threadId)) ? join(archaHome(), 'runtime') : threadDir(threadId);
    mkdirSync(cfgDir, { recursive: true });
    const id = newId();
    const mcpConfigFile = join(cfgDir, `mcp-${id}.json`);
    const extra = this.ws.mcpServers.forRun();
    writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: { ...extra, archadev: { command: mcp.command, args: mcp.args, env: mcp.env } } }, null, 2), { mode: 0o600 });
    const skills = syncRunSkills(cfgDir, this.ws.skills.forRun());

    const w: Warm = {
      id, threadId, docId, agent: adapter.id, key, persona: this.personaFor(docId, threadId), child: null as unknown as ChildProcess, sessionKey, mcpConfigFile,
      turn: null, turns: 0, resumed: !!sessionId, idle: undefined, stopTimer: undefined, dead: false, lastUsed: Date.now(), ready: Promise.resolve(),
    };
    this.warm.set(threadId, w);
    this.trimWarm();
    w.ready = (adapter.prepare ? adapter.prepare(cli.bin, base) : Promise.resolve()).then(() => {
      if (w.dead) throw new Error('Agent session was closed');
      const args = adapter.warm!.args({ mcp, mcpConfigFile, model, sessionId, extraServers: Object.keys(extra), skills });
      // ARCHA_RUN_ID = the process id: its `archa mcp` keeps one identity across every turn.
      w.child = spawn(cli.bin, [...cli.pre, ...args], {
        cwd: cfgDir, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...login.env, ARCHA_RUN_ID: id, ARCHA_DOC_ID: docId, NO_COLOR: '1' },
      });
      w.child.stdin?.on('error', () => { /* process gone; the close handler reports it */ });
      this.pipeWarm(w, adapter.parser());
    });
    w.ready.catch(() => { this.warm.delete(threadId); rmSync(mcpConfigFile, { force: true }); });
    return w.ready.then(() => w);
  }

  private pipeWarm(w: Warm, parser: StreamParser) {
    let buf = '';
    let stderr = '';
    const handle = (line: string) => {
      for (const ev of parser.line(line)) {
        if (ev.kind === 'session') this.rememberSession(w.sessionKey, ev.id);
        if (ev.kind === 'turn') this.endTurn(w, ev.ok, ev.costUsd);
        else if (w.turn) this.onEvent(w.turn, ev, w.sessionKey);
      }
    };
    w.child.stdout?.setEncoding('utf8');
    w.child.stdout?.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handle(line);
      }
    });
    w.child.stderr?.setEncoding('utf8');
    w.child.stderr?.on('data', (c: string) => { stderr = (stderr + c).slice(-4000); });
    w.child.on('error', (e) => { if (w.turn) { w.turn.failed = true; this.emit(w.turn, 'error', e.message); } });
    w.child.on('close', (code) => {
      if (buf.trim()) handle(buf.trim());
      w.dead = true;
      clearTimeout(w.idle);
      clearTimeout(w.stopTimer);
      if (this.warm.get(w.threadId) === w) this.warm.delete(w.threadId);
      rmSync(w.mcpConfigFile, { force: true });
      const run = w.turn;
      w.turn = null;
      if (!run) return;
      if (!run.stopped && !run.failed) { run.failed = true; this.emit(run, 'error', stderr.trim() || `Agent exited with code ${code}`); }
      this.finishRun(run, run.stopped ? 'stopped' : 'failed');
    });
  }

  private endTurn(w: Warm, ok: boolean, costUsd?: number) {
    const run = w.turn;
    w.turn = null;
    clearTimeout(w.stopTimer);
    if (run) {
      const secs = Math.round((Date.now() - run.startedAt) / 1000);
      const cost = costUsd !== undefined ? costUsd - (w.cost ?? 0) : undefined;
      if (costUsd !== undefined) w.cost = costUsd;
      const status = run.stopped ? 'stopped' : ok && !run.failed ? 'finished' : 'failed';
      if (status === 'failed' && !run.failed) this.emit(run, 'error', 'The agent ended this turn with an error');
      if (status === 'finished') this.emit(run, 'status', `Done in ${secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min ${secs % 60} s`}${cost !== undefined && cost > 0 ? ` · $${cost.toFixed(3)}` : ''}`);
      this.finishRun(run, status);
    }
    this.armIdle(w);
  }

  /** Common end of a turn: statuses, chat.run broadcast, then the next queued message of the thread. */
  private finishRun(run: Run, status: 'finished' | 'failed' | 'stopped') {
    if (!this.runs.has(run.id)) return;
    this.runs.delete(run.id);
    this.ws.broadcast('chat.delta', { docId: run.docId, runId: run.id, threadId: run.threadId, agent: run.agent, text: '' });
    if (status === 'finished' && !run.replied) this.emit(run, 'status', 'Finished without a reply');
    if (status === 'stopped') {
      this.emit(run, 'status', 'Stopped');
      if (!run.replied) this.interrupted.set(run.threadId, run.prompt);
    }
    this.ws.broadcast('chat.run', this.runEvent(run, status));
    const next = this.queue.get(run.threadId)?.shift();
    if (!this.queue.get(run.threadId)?.length) this.queue.delete(run.threadId);
    if (next) {
      try { this.start(next, run.threadId, true); } catch (e) { this.emit(run, 'error', (e as Error).message); }
    }
  }

  private armIdle(w: Warm) {
    clearTimeout(w.idle);
    w.lastUsed = Date.now();
    w.idle = setTimeout(() => this.killWarm(w), WARM_IDLE_MS);
  }

  /** At most MAX_WARM processes: the least recently used idle one goes first. */
  private trimWarm() {
    const idle = [...this.warm.values()].filter((w) => !w.turn).sort((a, b) => a.lastUsed - b.lastUsed);
    while (this.warm.size > MAX_WARM && idle.length) this.killWarm(idle.shift()!);
  }

  private killWarm(w: Warm) {
    w.dead = true;
    clearTimeout(w.idle);
    clearTimeout(w.stopTimer);
    if (this.warm.get(w.threadId) === w) this.warm.delete(w.threadId);
    killTree(w.child);
  }

  private startCold(run: Run, adapter: Adapter, cli: NonNullable<ReturnType<typeof resolveCli>>, login: ReturnType<AccountManager['runEnv']>, fullPrompt: string, model?: string, account?: string) {
    const { id: runId, docId, threadId } = run;
    const base = this.mcpCommand();
    const mcp: McpCommand = { ...base, args: [...base.args, '--doc', docId, '--agent', adapter.id] };
    const sessionKey = `${threadId}:${adapter.id}:${login.label ? Object.values(login.env).join() : 'host'}`;
    const sessionId = this.sessionMap().get(sessionKey);
    void account;
    // Each thread works in its own folder, so parallel runs never share skills or MCP config files.
    const cfgDir = sessionId && !existsSync(threadDir(threadId)) ? join(archaHome(), 'runtime') : threadDir(threadId);
    mkdirSync(cfgDir, { recursive: true });
    const mcpConfigFile = join(cfgDir, `mcp-${runId}.json`);
    // Settings → MCP servers join the run next to archadev; the file may hold their secrets.
    const extra = this.ws.mcpServers.forRun();
    writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: { ...extra, archadev: { command: mcp.command, args: mcp.args, env: mcp.env } } }, null, 2), { mode: 0o600 });
    const skills = syncRunSkills(cfgDir, this.ws.skills.forRun());

    const start = () => {
      if (run.stopped) {
        rmSync(mcpConfigFile, { force: true });
        this.finishRun(run, 'stopped');
        return;
      }
      const built = adapter.build({ prompt: fullPrompt, mcp, mcpConfigFile, model, sessionId, extraServers: Object.keys(extra), skills });
      const child = spawn(cli.bin, [...cli.pre, ...built.args], {
        cwd: cfgDir, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...login.env, ARCHA_RUN_ID: runId, ARCHA_DOC_ID: docId, NO_COLOR: '1' },
      });
      run.child = child;
      // Always close stdin: a CLI left with an open pipe waits for more input before it starts.
      child.stdin.on('error', () => { /* the CLI exited before reading; the close handler reports it */ });
      child.stdin.end(built.stdin ?? '');
      this.pipe(run, child, adapter.parser(), sessionKey, mcpConfigFile);
    };
    if (adapter.prepare) adapter.prepare(cli.bin, base).then(start, (e: Error) => { rmSync(mcpConfigFile, { force: true }); run.failed = true; this.emit(run, 'error', e.message); this.finishRun(run, 'failed'); });
    else start();
  }

  private pipe(run: Run, child: ChildProcess, parser: StreamParser, sessionKey: string, mcpConfigFile: string) {
    let buf = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) for (const ev of parser.line(line)) this.onEvent(run, ev, sessionKey);
      }
    });
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (c: string) => { stderr = (stderr + c).slice(-4000); });
    child.on('error', (e) => { run.failed = true; this.emit(run, 'error', e.message); });
    child.on('close', (code) => {
      if (buf.trim()) for (const ev of parser.line(buf.trim())) this.onEvent(run, ev, sessionKey);
      rmSync(mcpConfigFile, { force: true });
      const status = run.stopped ? 'stopped' : code === 0 && !run.failed ? 'finished' : 'failed';
      if (status === 'failed' && !run.failed) this.emit(run, 'error', stderr.trim() || `Agent exited with code ${code}`);
      this.finishRun(run, status);
    });
  }

  private onEvent(run: Run, ev: AgentEvent, sessionKey: string) {
    if (ev.kind === 'session') this.rememberSession(sessionKey, ev.id);
    else if (ev.kind === 'delta') this.ws.broadcast('chat.delta', { docId: run.docId, runId: run.id, threadId: run.threadId, agent: run.agent, text: ev.text });
    else if (ev.kind === 'text') { run.replied = true; this.emit(run, 'agent', ev.text); }
    else if (ev.kind === 'tool') this.emit(run, 'tool', ev.text);
    // An interrupted turn ends "with an error" by design; that is a stop, not a failure.
    else if (ev.kind === 'error') { if (!run.stopped) { run.failed = true; this.emit(run, 'error', ev.text); } }
    // The final answer repeats the last message; show it only when nothing was said along the way.
    else if (ev.kind === 'final' && !run.replied && ev.text.trim()) { run.replied = true; this.emit(run, 'agent', ev.text.trim()); }
  }

  stop(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return;
    run.stopped = true;
    const w = [...this.warm.values()].find((x) => x.turn === run);
    const interrupt = w ? ADAPTERS.find((a) => a.id === w.agent)?.warm?.interrupt : undefined;
    if (w && interrupt) {
      // Interrupt keeps the session warm; a CLI that does not answer within 5 s is killed instead.
      w.child.stdin?.write(`${interrupt()}\n`);
      w.stopTimer = setTimeout(() => { if (w.turn === run) this.killWarm(w); }, 5000);
      return;
    }
    if (w) { this.killWarm(w); return; }
    if (run.child) killTree(run.child);
  }

  /** App shutdown: no agent process outlives the core. Resolves when they have exited (max 5 s). */
  shutdown(): Promise<void> {
    const children = [...[...this.warm.values()].map((w) => w.child), ...[...this.runs.values()].map((r) => r.child)].filter((c): c is ChildProcess => !!c && c.exitCode === null);
    const exited = children.map((c) => new Promise<void>((resolve) => c.once('close', () => resolve())));
    for (const w of [...this.warm.values()]) this.killWarm(w);
    for (const c of children) killTree(c);
    return Promise.race([Promise.all(exited).then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
  }

  /** Models the installed CLI offers, for the composer's picker. */
  async models(agentId: string, account?: string): Promise<{ models: ModelOption[]; source: string }> {
    const adapter = ADAPTERS.find((a) => a.id === agentId);
    if (!adapter) throw new Error(`Unknown agent "${agentId}"`);
    let env: Record<string, string> = {};
    try { env = this.ws.accounts.runEnv(adapter.id, account).env; } catch { /* signed-out account: list the host's models */ }
    return adapter.models(resolveCli(adapter.bin)?.bin ?? null, env);
  }
}

/**
 * The run's cwd is a project to Claude Code, so enabled library skills are mirrored into its
 * `.claude/skills`. Returns whether any skill is present.
 */
function syncRunSkills(cwd: string, dirs: string[]): boolean {
  const target = join(cwd, '.claude', 'skills');
  rmSync(target, { recursive: true, force: true });
  if (!dirs.length) return false;
  mkdirSync(target, { recursive: true });
  for (const d of dirs) cpSync(d, join(target, basename(d)), { recursive: true });
  return true;
}
