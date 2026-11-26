import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { newId } from '@archa/schema';
import { formatElapsed, GUIDES, guidesFor, guideText, ORCHESTRATOR_PROMPT, threadOf, workerBrief, type ChatImage, type ChatMessage, type ChatMode, type ChatQueued, type ChatRunEvent, type ModelOption, type OrchestraMeta, type OrchestraReport, type OrchestraTask, type OrchestraWorker } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import type { Workspace } from './workspace';
import { describeState } from './execute';
import { ADAPTERS, type Adapter, type AgentEvent, type Attachment, type McpCommand, type StreamParser } from './agent-adapters';
import { resolveCli, type AccountManager } from './accounts';
import { randomPersona } from './personas';
import { ChatStore } from './chat-store';
import { assetDirFor } from './assets';

/*
 * Launch mode (blueprint AGENT_BRIDGE): the app starts the agent's own CLI headless,
 * gives it the ArchaDev MCP server, and turns its stream into chat messages.
 * Adapters (argv, stream parsers, model lists) live in agent-adapters.ts.
 */

export { ADAPTERS, findBin, type McpCommand } from './agent-adapters';

type Run = { id: string; docId: string; threadId: string; agent: string; persona: string; prompt: string; child: ChildProcess | null; stopped: boolean; replied: boolean; failed: boolean; startedAt: number; fromLead: boolean };
/** brief: what the agent gets instead of `prompt` (a worker's team brief); fromLead: the turn was started by its orchestrate lead. */
type SendOptions = { now?: boolean; focus?: string[]; images?: ChatImage[]; mode?: ChatMode; brief?: string; fromLead?: boolean };
type Queued = { docId: string; agentId: string; prompt: string; model?: string; account?: string; focus?: string[]; images?: ChatImage[]; brief?: string; fromLead?: boolean; id?: string; ts?: number };
type Waiter = { check: () => void };
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
/** wait_workers blocks up to 10 min: Claude Code's MCP call timeout must outlast it. */
const MCP_TIMEOUT_MS = String(11 * 60_000);
/** Workers one orchestrate lead may have working at once. */
const MAX_WORKERS = 8;

function killTree(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGTERM');
}

/*
 * Conversations live in the document's asset folder, one JSON file per thread (chat-store.ts), so
 * they travel with the `.archa` and never enter it. The agent CLI session ids stay per machine in
 * ARCHA_HOME/chats/sessions.json, so a thread can be resumed after a restart. Deleting either only
 * loses history, never design data.
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
  /** A run can outlive its document's tab; its history then lands in the runtime folder of that id. */
  readonly store = new ChatStore((docId) => {
    try { return this.ws.assetDir(docId); } catch { return assetDirFor(null, docId); }
  });
  // Orchestrate mode (blueprint AGENT_BRIDGE/06)
  private meta = new Map<string, OrchestraMeta | null>(); // threadId -> lead / worker role (null = plain chat)
  private names = new Map<string, string>(); // threadId -> session name reserved before its first run
  private threadOpts = new Map<string, { docId: string; agent: string; model?: string; account?: string }>();
  private lastStatus = new Map<string, 'finished' | 'failed' | 'stopped'>();
  private reports = new Map<string, Set<string>>(); // lead threadId -> workers whose lead-started turn ended unreported
  private halted = new Set<string>(); // leads the person stopped: no automatic report until they write again
  private waiters = new Set<Waiter>();

  constructor(private ws: Workspace, private mcpCommand: () => McpCommand) {}

  list(docId: string): ChatMessage[] {
    return this.store.list(docId);
  }

  /** Pasted chat images go to the thread's attachments in the asset folder, so file-reading agents can open them. */
  private saveImages(docId: string, threadId: string, images: ChatImage[]): Attachment[] {
    return images.flatMap((img) => {
      const saved = this.store.saveImage(docId, threadId, img.mime, img.data);
      return saved ? [{ path: saved.file, mime: img.mime, data: img.data }] : [];
    });
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
    return { runId: r.id, docId: r.docId, threadId: r.threadId, agent: r.agent, persona: r.persona, status, startedAt: r.startedAt };
  }

  /** A thread keeps its name across turns; a new one gets a name no other session on the doc uses. */
  private personaFor(docId: string, threadId: string): string {
    const list = this.list(docId);
    const own = this.names.get(threadId) ?? list.find((m) => (m.threadId ?? m.runId) === threadId && m.persona)?.persona ?? this.warm.get(threadId)?.persona;
    if (own) return own;
    return randomPersona(list.map((m) => m.persona ?? ''), [...[...this.runs.values()].map((r) => r.persona), ...this.names.values(), ...this.ws.agents().map((a) => a.name)]);
  }

  deleteThread(docId: string, threadId: string) {
    // A lead's workers go with it.
    const ids = [threadId, ...(this.isLead(docId, threadId) ? this.workersOf(docId, threadId) : [])];
    if ([...this.runs.values()].some((r) => ids.includes(r.threadId))) throw new Error('Stop the running agent before deleting this conversation');
    for (const id of ids) {
      const w = this.warm.get(id);
      if (w) this.killWarm(w);
      this.dropQueue(id);
      this.meta.delete(id);
      rmSync(threadDir(id), { recursive: true, force: true });
    }
    for (const id of ids) this.store.deleteThread(docId, id);
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

  private emit(run: Pick<Run, 'docId' | 'id' | 'threadId' | 'agent' | 'persona'>, role: ChatMessage['role'], text: string, images?: ChatImage[], extra?: Pick<ChatMessage, 'detail' | 'callId' | 'elapsedMs'>) {
    const m: ChatMessage = { id: newId(), docId: run.docId, runId: run.id, threadId: run.threadId, role, agent: run.agent, persona: run.persona, text, ts: Date.now(), ...extra };
    // Thumbnails become files in the thread's attachments; the message keeps `asset:` references only.
    if (images?.length) m.images = images.map((i) => this.store.saveImage(run.docId, run.threadId, '', i.thumb)?.ref ?? i.thumb);
    const team = this.metaOf(run.docId, run.threadId);
    if (team) m.orchestra = team;
    this.store.append(run.docId, m);
    this.ws.broadcast('chat.message', m);
  }

  /** A tool call's result arrives after its row: fill it in (same id, so the chat and history replace the row). */
  private attachResult(run: Run, callId: string, result: string, failed: boolean) {
    const list = this.list(run.docId);
    const i = list.findLastIndex((m) => m.runId === run.id && m.callId === callId);
    if (i < 0) return;
    const m: ChatMessage = { ...list[i]!, result, ...(failed ? { failed } : {}) };
    this.store.append(run.docId, m);
    this.ws.broadcast('chat.message', m);
  }

  /** Node ids in a tool summary read as their layer names ("inspect · Hero" instead of an opaque id). */
  private named(docId: string, text: string): string {
    let doc: ReturnType<Workspace['session']>['doc'];
    try { doc = this.ws.session(docId).doc; } catch { return text; }
    return text.replace(/[A-Za-z0-9_-]{6,40}/g, (id) => { const n = doc.get(id); return n && n.type !== 'page' ? `"${n.name}"` : id; });
  }

  /**
   * One turn of a conversation. A thread that is still working queues the message (`now` stops the
   * running turn first). Queued messages are not in the history yet: the chat pins them above the
   * composer (`chat.queue`) and each lands in the thread when its turn starts. Agents with a warm mode
   * keep one process per thread between turns.
   */
  send(docId: string, agentId: string, prompt: string, model?: string, account?: string, threadId = newId(), opts: SendOptions = {}): { runId: string; threadId: string; persona: string; queued?: boolean } {
    if (opts.mode === 'orchestrate' && !this.metaOf(docId, threadId)) this.meta.set(threadId, { lead: true });
    // The person writing to a lead again re-enables the team's automatic report.
    if (!opts.fromLead) this.halted.delete(threadId);
    const busy = [...this.runs.values()].find((r) => r.threadId === threadId);
    if (busy) {
      const q = this.queue.get(threadId) ?? [];
      const item: Queued = { docId, agentId, prompt, model, account, focus: opts.focus, images: opts.images, brief: opts.brief, fromLead: opts.fromLead, id: newId(), ts: Date.now() };
      if (opts.now) q.unshift(item); else q.push(item);
      this.queue.set(threadId, q);
      this.queueChanged(docId, threadId);
      if (opts.now) this.stop(busy.id, false);
      return { runId: '', threadId, persona: busy.persona, queued: true };
    }
    return this.start({ docId, agentId, prompt, model, account, focus: opts.focus, images: opts.images, brief: opts.brief, fromLead: opts.fromLead }, threadId, false);
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
    const asked = q.brief ?? prompt;
    const request = interrupted ? `Earlier request (stopped before you answered it):\n${interrupted}\n\nNow:\n${asked}` : asked;
    this.threadOpts.set(threadId, { docId, agent: agentId, model, account });
    // A lead learns the team tools on its first turn as lead (any agent CLI: it rides on the message).
    const lead = this.isLead(docId, threadId) && !this.list(docId).some((m) => threadOf(m) === threadId && m.orchestra && 'lead' in m.orchestra && (m.role === 'agent' || m.role === 'tool'));
    const focus = (q.focus ?? []).map((id) => session.doc.get(id)).filter((n) => !!n).slice(0, 12);
    const focusLine = focus.length ? `\nFocus — this request is about: ${focus.map((n) => `${n.name} "${n.id}" (${n.type})`).join(', ')}` : '';
    const images = this.saveImages(docId, threadId, q.images ?? []);
    const imageLine = images.length && !adapter.inlineImages
      ? `\nThe person attached ${images.length === 1 ? 'an image' : `${images.length} images`} — open ${images.length === 1 ? 'it' : 'them'} to see what they mean:\n${images.map((i) => `- ${i.path}`).join('\n')}`
      : '';
    // The internal skill: guides that fit the request ride along on the first turn (saves a guide call).
    const guides = firstTurn ? guidesFor(request).map((t) => guideText(t)).join('\n\n') : '';
    // Claude Code loads skills itself (mirrored into its project, Skill tool); other CLIs get the list to read from.
    const runSkills = firstTurn && adapter.id !== 'claude' ? this.ws.skills.forRunSkills() : [];
    const skillIndex = runSkills.length
      ? `\n\n---\nSkills you can use — when the task fits one, read its SKILL.md first and follow it:\n${runSkills.map((s) => `- ${s.name}: ${s.description.slice(0, 300)} (${join(s.dir, 'SKILL.md')})`).join('\n')}`
      : '';
    const skillLine = this.mentions(asked);
    const fullPrompt = `${lead ? `${ORCHESTRATOR_PROMPT}\n\n---\nRequest:\n` : ''}${request}${focusLine}${imageLine}${skillLine}${skillIndex}\n\n---\nCurrent canvas state (fresh, no need to call get_state first):\n${describeState(this.ws, session)}${guides ? `\n\n---\nGuides for this task:\n${guides}` : ''}`;
    const run: Run = { id: runId, docId, threadId, agent: agentId, persona: this.personaFor(docId, threadId), prompt: request, child: null, stopped: false, replied: false, failed: false, startedAt: Date.now(), fromLead: !!q.fromLead };
    this.runs.set(runId, run);
    if (!echoed) this.emit(run, 'user', prompt, q.images);
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
        w.child.stdin?.write(`${adapter.warm!.message(fullPrompt, { first: w.turns === 0, resumed: w.resumed, images })}\n`);
        w.turns++;
      }, (e: Error) => { run.failed = true; this.emit(run, 'error', e.message); this.finishRun(run, 'failed'); });
    } else this.startCold(run, adapter, cli, login, fullPrompt, model, account, images);
    return { runId, threadId, persona: run.persona };
  }

  /**
   * `/skill-name` in a message: that skill's instructions (or a built-in guide) go with the message,
   * so the agent follows them whichever CLI it is. Unknown names are left as plain text.
   */
  private mentions(text: string): string {
    const names = [...new Set([...text.matchAll(/(?:^|\s)\/([a-z0-9][a-z0-9-]{0,63})(?=$|[\s.,;:!?)])/gi)].map((m) => m[1]!.toLowerCase()))].slice(0, 5);
    const blocks: string[] = [];
    for (const name of names) {
      const skill = this.ws.skills.mention(name);
      if (skill) blocks.push(`## /${name} — ${skill.description}\n(Skill folder: ${skill.dir} — its examples and references are there.)\n\n${skill.body}`);
      else if (name in GUIDES) blocks.push(`## /${name}\n${guideText(name)}`);
    }
    return blocks.length ? `\n\n---\nSkills the person asked for with /name — follow them for this request:\n\n${blocks.join('\n\n')}` : '';
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
        env: { ...process.env, ...login.env, ARCHA_RUN_ID: id, ARCHA_DOC_ID: docId, NO_COLOR: '1', MCP_TOOL_TIMEOUT: MCP_TIMEOUT_MS },
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
      const cost = costUsd !== undefined ? costUsd - (w.cost ?? 0) : undefined;
      if (costUsd !== undefined) w.cost = costUsd;
      const status = run.stopped ? 'stopped' : ok && !run.failed ? 'finished' : 'failed';
      if (status === 'failed' && !run.failed) this.emit(run, 'error', 'The agent ended this turn with an error');
      this.finishRun(run, status, cost !== undefined && cost > 0 ? ` · $${cost.toFixed(3)}` : '');
    }
    this.armIdle(w);
  }

  /**
   * Common end of a turn: statuses, chat.run broadcast, then the next queued message of the thread.
   * Every turn ends with one status carrying `elapsedMs` (how long it worked); `note` adds the cost.
   */
  private finishRun(run: Run, status: 'finished' | 'failed' | 'stopped', note = '') {
    if (!this.runs.has(run.id)) return;
    this.runs.delete(run.id);
    this.ws.broadcast('chat.delta', { docId: run.docId, runId: run.id, threadId: run.threadId, agent: run.agent, text: '' });
    if (status === 'finished' && !run.replied) this.emit(run, 'status', 'Finished without a reply');
    if (status === 'stopped' && !run.replied) this.interrupted.set(run.threadId, run.prompt);
    const elapsedMs = Date.now() - run.startedAt;
    const verb = status === 'finished' ? 'Worked for' : status === 'stopped' ? 'Stopped after' : 'Failed after';
    this.emit(run, 'status', `${verb} ${formatElapsed(elapsedMs)}${note}`, undefined, { elapsedMs });
    this.ws.broadcast('chat.run', this.runEvent(run, status));
    this.lastStatus.set(run.threadId, status);
    const role = this.metaOf(run.docId, run.threadId);
    if (role && 'parent' in role && run.fromLead) this.reports.set(role.parent, new Set([...(this.reports.get(role.parent) ?? []), run.threadId]));
    const next = this.queue.get(run.threadId)?.shift();
    if (!this.queue.get(run.threadId)?.length) this.queue.delete(run.threadId);
    if (next) {
      this.queueChanged(run.docId, run.threadId);
      try { this.start(next, run.threadId, false); } catch (e) { this.emit(run, 'error', (e as Error).message); }
    }
    for (const w of [...this.waiters]) w.check();
    if (role) this.reportToLead(run.docId, 'parent' in role ? role.parent : run.threadId);
  }

  /* ------------------------------ orchestrate ------------------------------ */

  /** Lead / worker role of a thread, from memory or its stored messages. */
  private metaOf(docId: string, threadId: string): OrchestraMeta | null {
    if (!this.meta.has(threadId)) this.meta.set(threadId, this.list(docId).find((m) => threadOf(m) === threadId && m.orchestra)?.orchestra ?? null);
    return this.meta.get(threadId) ?? null;
  }

  private isLead(docId: string, threadId: string) {
    const m = this.metaOf(docId, threadId);
    return !!m && 'lead' in m;
  }

  /** Worker thread ids of a lead, oldest first. */
  private workersOf(docId: string, lead: string): string[] {
    const ids = new Set<string>();
    for (const m of this.list(docId)) if (m.orchestra && 'parent' in m.orchestra && m.orchestra.parent === lead) ids.add(threadOf(m));
    for (const [id, m] of this.meta) if (m && 'parent' in m && m.parent === lead) ids.add(id);
    return [...ids];
  }

  private working(threadId: string) {
    return [...this.runs.values()].some((r) => r.threadId === threadId) || !!this.queue.get(threadId)?.length;
  }

  /** The lead behind an `archa mcp` connection (its thread must be in orchestrate mode). */
  private leadOf(threadId: string | undefined) {
    const opts = threadId ? this.threadOpts.get(threadId) : undefined;
    if (!threadId || !opts || !this.isLead(opts.docId, threadId)) throw new Error('Team tools work only in an Orchestrate chat: pick Orchestrate in the ArchaDev chat composer.');
    return { threadId, ...opts, persona: this.personaFor(opts.docId, threadId) };
  }

  /** A worker by thread id or session name. */
  private workerOf(lead: { docId: string; threadId: string }, ref: string): string {
    const ids = this.workersOf(lead.docId, lead.threadId);
    const hit = ids.find((id) => id === ref) ?? ids.find((id) => this.personaFor(lead.docId, id).toLowerCase() === ref.trim().toLowerCase());
    if (!hit) throw new Error(`No worker "${ref}" in this team. Workers: ${ids.map((id) => this.personaFor(lead.docId, id)).join(', ') || 'none yet'}`);
    return hit;
  }

  /** `delegate`: one new worker thread per task, all started at once. */
  delegate(leadThread: string | undefined, tasks: OrchestraTask[]): { workers: OrchestraWorker[] } {
    const lead = this.leadOf(leadThread);
    const live = this.workersOf(lead.docId, lead.threadId).filter((id) => this.working(id)).length;
    if (live + tasks.length > MAX_WORKERS) throw new Error(`At most ${MAX_WORKERS} workers at once (${live} still working). Wait for them or send fewer tasks.`);
    const doc = this.ws.session(lead.docId).doc;
    for (const t of tasks) {
      if (t.agent && !ADAPTERS.some((a) => a.id === t.agent)) throw new Error(`Unknown agent "${t.agent}" — use claude, agy or codex`);
      if (t.frame && !doc.get(t.frame)) throw new Error(`Frame "${t.frame}" for "${t.title}" was not found — pass the frame id`);
    }
    const workers: OrchestraWorker[] = [];
    for (const t of tasks) {
      const agent = t.agent ?? lead.agent;
      const own = agent === lead.agent;
      const frame = t.frame ? doc.get(t.frame) : undefined;
      const threadId = newId();
      const persona = this.personaFor(lead.docId, threadId);
      this.names.set(threadId, persona);
      this.meta.set(threadId, { parent: lead.threadId, title: t.title, prompt: t.prompt, ...(t.kind ? { kind: t.kind } : {}) });
      const brief = workerBrief({ persona, lead: lead.persona, title: t.title, kind: t.kind, prompt: t.prompt, frame: frame ? { id: frame.id, name: frame.name } : undefined });
      this.send(lead.docId, agent, t.prompt, t.model ?? (own ? lead.model : undefined), own ? lead.account : undefined, threadId, { brief, fromLead: true, focus: frame ? [frame.id] : undefined });
      workers.push({ threadId, persona, title: t.title, agent });
    }
    return { workers };
  }

  /** `wait_workers`: resolves when the named workers (default: all) stop working, the lead's turn ends, or the timeout. */
  async wait(leadThread: string | undefined, refs: string[] = [], timeoutSec = 240): Promise<{ workers: OrchestraReport[]; timedOut: boolean }> {
    const lead = this.leadOf(leadThread);
    const ids = refs.length ? refs.map((r) => this.workerOf(lead, r)) : this.workersOf(lead.docId, lead.threadId);
    const busy = () => ids.some((id) => this.working(id));
    const leadRunning = () => [...this.runs.values()].some((r) => r.threadId === lead.threadId);
    let timedOut = false;
    if (busy()) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); this.waiters.delete(waiter); resolve(); };
        const waiter: Waiter = { check: () => { if (!busy() || !leadRunning()) done(); } };
        const timer = setTimeout(() => { timedOut = true; done(); }, Math.min(Math.max(timeoutSec, 5), 600) * 1000);
        this.waiters.add(waiter);
      });
    }
    const pending = this.reports.get(lead.threadId);
    for (const id of ids) pending?.delete(id);
    return { workers: ids.map((id) => this.report(lead.docId, id)), timedOut };
  }

  /** `tell_worker`: a follow-up from the lead to one of its workers (queued if it is still working). */
  tell(leadThread: string | undefined, ref: string, message: string): { queued: boolean } {
    const lead = this.leadOf(leadThread);
    const id = this.workerOf(lead, ref);
    const o = this.threadOpts.get(id) ?? { agent: this.report(lead.docId, id).agent || lead.agent, model: undefined, account: undefined };
    const r = this.send(lead.docId, o.agent, message, o.model, o.account, id, { fromLead: true });
    return { queued: !!r.queued };
  }

  private report(docId: string, id: string): OrchestraReport {
    const role = this.metaOf(docId, id);
    const msgs = this.list(docId).filter((m) => threadOf(m) === id);
    const reply = msgs.filter((m) => m.role === 'agent' || m.role === 'error').at(-1)?.text ?? '';
    return {
      threadId: id, persona: this.personaFor(docId, id), title: role && 'parent' in role ? role.title : '', agent: msgs[0]?.agent ?? this.threadOpts.get(id)?.agent ?? '',
      status: this.working(id) ? 'working' : this.lastStatus.get(id) ?? 'finished', reply: reply.length > 2400 ? `${reply.slice(0, 2400)}…` : reply,
    };
  }

  /**
   * Workers that finish while their lead is idle (it ended its turn without waiting) report back on
   * their own once the whole team is done, so the lead can check and integrate the work.
   */
  private reportToLead(docId: string, lead: string) {
    const pending = this.reports.get(lead);
    if (!pending?.size || this.halted.has(lead) || this.working(lead)) return;
    if (this.workersOf(docId, lead).some((id) => this.working(id))) return;
    const opts = this.threadOpts.get(lead);
    if (!opts) return;
    const reports = [...pending].map((id) => this.report(docId, id));
    this.reports.delete(lead);
    const text = `Your workers finished:\n${reports.map((r) => `- ${r.persona} — ${r.title} (${r.status}):\n${r.reply || '(no reply)'}`).join('\n\n')}\n\nCheck their work on the canvas (screenshot), fix the seams between parts, then reply with a short summary.`;
    const at = { docId, id: newId(), threadId: lead, agent: opts.agent, persona: this.personaFor(docId, lead) };
    this.emit(at, 'status', `Team finished — ${at.persona} is checking their work`);
    try { this.start({ docId, agentId: opts.agent, prompt: text, model: opts.model, account: opts.account }, lead, true); } catch (e) { this.emit(at, 'error', (e as Error).message); }
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

  private startCold(run: Run, adapter: Adapter, cli: NonNullable<ReturnType<typeof resolveCli>>, login: ReturnType<AccountManager['runEnv']>, fullPrompt: string, model?: string, account?: string, images: Attachment[] = []) {
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
      const built = adapter.build({ prompt: fullPrompt, mcp, mcpConfigFile, model, sessionId, extraServers: Object.keys(extra), skills, images });
      const child = spawn(cli.bin, [...cli.pre, ...built.args], {
        cwd: cfgDir, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...login.env, ARCHA_RUN_ID: runId, ARCHA_DOC_ID: docId, NO_COLOR: '1', MCP_TOOL_TIMEOUT: MCP_TIMEOUT_MS },
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
    else if (ev.kind === 'tool') this.emit(run, 'tool', this.named(run.docId, ev.text), undefined, { ...(ev.detail ? { detail: ev.detail } : {}), ...(ev.callId ? { callId: ev.callId } : {}) });
    else if (ev.kind === 'result') this.attachResult(run, ev.callId, ev.text, ev.failed);
    // An interrupted turn ends "with an error" by design; that is a stop, not a failure.
    else if (ev.kind === 'error') { if (!run.stopped) { run.failed = true; this.emit(run, 'error', ev.text); } }
    // The final answer repeats the last message; show it only when nothing was said along the way.
    else if (ev.kind === 'final' && !run.replied && ev.text.trim()) { run.replied = true; this.emit(run, 'agent', ev.text.trim()); }
  }

  /* -------------------------------- queue -------------------------------- */

  /** What waits in a thread, oldest first, as the chat shows it. */
  queued(threadId: string): ChatQueued[] {
    return (this.queue.get(threadId) ?? []).map((q) => ({ id: q.id!, text: q.prompt, ts: q.ts!, ...(q.images?.length ? { images: q.images.map((i) => i.thumb) } : {}) }));
  }

  private queueChanged(docId: string, threadId: string) {
    this.ws.broadcast('chat.queue', { docId, threadId, items: this.queued(threadId) });
  }

  private dropQueue(threadId: string) {
    const q = this.queue.get(threadId);
    if (!q?.length) return;
    this.queue.delete(threadId);
    this.queueChanged(q[0]!.docId, threadId);
  }

  /** Send now: the queued message moves to the front and the running turn stops (its workers keep going). */
  sendQueued(threadId: string, id: string) {
    const q = this.queue.get(threadId);
    const i = q ? q.findIndex((x) => x.id === id) : -1;
    if (!q || i < 0) throw new Error('That message is no longer waiting');
    q.unshift(...q.splice(i, 1));
    const busy = [...this.runs.values()].find((r) => r.threadId === threadId);
    if (busy) { this.queueChanged(q[0]!.docId, threadId); this.stop(busy.id, false); return; }
    // Nothing running (the turn just ended): start it straight away.
    const next = q.shift()!;
    if (!q.length) this.queue.delete(threadId);
    this.queueChanged(next.docId, threadId);
    this.start(next, threadId, false);
  }

  unqueue(threadId: string, id: string) {
    const q = this.queue.get(threadId);
    const i = q ? q.findIndex((x) => x.id === id) : -1;
    if (!q || i < 0) return;
    const [gone] = q.splice(i, 1);
    if (!q.length) this.queue.delete(threadId);
    this.queueChanged(gone!.docId, threadId);
  }

  /** cascade: stopping a lead also stops the workers it has running (Send now does not). */
  stop(runId: string, cascade = true) {
    const run = this.runs.get(runId);
    if (!run) return;
    run.stopped = true;
    if (cascade && this.isLead(run.docId, run.threadId)) {
      this.halted.add(run.threadId);
      for (const id of this.workersOf(run.docId, run.threadId)) {
        this.dropQueue(id);
        const r = [...this.runs.values()].find((x) => x.threadId === id);
        if (r) this.stop(r.id, false);
      }
    }
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
