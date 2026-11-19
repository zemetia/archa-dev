import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { newId } from '@archa/schema';
import type { ChatMessage, ChatRunEvent, ModelOption } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import type { Workspace } from './workspace';
import { describeState } from './execute';
import { ADAPTERS, type AgentEvent, type McpCommand } from './agent-adapters';
import { resolveCli } from './accounts';
import { randomPersona } from './personas';

/*
 * Launch mode (blueprint AGENT_BRIDGE): the app starts the agent's own CLI headless,
 * gives it the ArchaDev MCP server, and turns its stream into chat messages.
 * Adapters (argv, stream parsers, model lists) live in agent-adapters.ts.
 */

export { ADAPTERS, findBin, type McpCommand } from './agent-adapters';

type Run = { id: string; docId: string; threadId: string; agent: string; persona: string; prompt: string; child: ChildProcess | null; stopped: boolean; replied: boolean; failed: boolean };

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
    const r = this.runs.get(runId);
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
    const own = list.find((m) => (m.threadId ?? m.runId) === threadId && m.persona)?.persona;
    if (own) return own;
    return randomPersona(list.map((m) => m.persona ?? ''), [...[...this.runs.values()].map((r) => r.persona), ...this.ws.agents().map((a) => a.name)]);
  }

  deleteThread(docId: string, threadId: string) {
    if ([...this.runs.values()].some((r) => r.threadId === threadId)) throw new Error('Stop the running agent before deleting this conversation');
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

  send(docId: string, agentId: string, prompt: string, model?: string, account?: string, threadId = newId()): { runId: string; threadId: string; persona: string } {
    const adapter = ADAPTERS.find((a) => a.id === agentId);
    if (!adapter) throw new Error(`Unknown agent "${agentId}"`);
    const cli = resolveCli(adapter.bin);
    if (!cli) throw new Error(`${adapter.label} CLI ("${adapter.bin}") was not found on PATH`);
    // Sessions run in parallel on the same document; only one turn per conversation at a time.
    if ([...this.runs.values()].some((r) => r.threadId === threadId)) throw new Error('This conversation is still working — stop it or start a new chat');
    // A saved account runs in its own config folder (blueprint AGENT_BRIDGE/02).
    const login = this.ws.accounts.runEnv(adapter.id, account);
    const session = this.ws.session(docId);
    const runId = newId();

    const base = this.mcpCommand();
    const mcp: McpCommand = { ...base, args: [...base.args, '--doc', docId, '--agent', adapter.id] };
    const sessionKey = `${threadId}:${agentId}:${login.label ? Object.values(login.env).join() : 'host'}`;
    const sessionId = this.sessionMap().get(sessionKey);
    // Each thread works in its own folder, so parallel runs never share skills or MCP config files.
    // Claude Code files sessions by cwd: a pre-0.2.5 thread that already has one keeps the shared folder.
    const legacy = join(archaHome(), 'runtime');
    const cfgDir = sessionId && !existsSync(threadDir(threadId)) ? legacy : threadDir(threadId);
    mkdirSync(cfgDir, { recursive: true });
    const mcpConfigFile = join(cfgDir, `mcp-${runId}.json`);
    // Settings → MCP servers join the run next to archadev; the file may hold their secrets.
    const extra = this.ws.mcpServers.forRun();
    writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: { ...extra, archadev: { command: mcp.command, args: mcp.args, env: mcp.env } } }, null, 2), { mode: 0o600 });
    const skills = syncRunSkills(cfgDir, this.ws.skills.forRun());

    // A request stopped before the agent answered never reached its session; carry it into this turn.
    const interrupted = this.interrupted.get(threadId);
    this.interrupted.delete(threadId);
    const request = interrupted ? `Earlier request (stopped before you answered it):\n${interrupted}\n\nNow:\n${prompt}` : prompt;
    const fullPrompt = `${request}\n\n---\nCurrent canvas state (fresh, no need to call get_state first):\n${describeState(this.ws, session)}`;
    const run: Run = { id: runId, docId, threadId, agent: agentId, persona: this.personaFor(docId, threadId), prompt: request, child: null, stopped: false, replied: false, failed: false };
    this.runs.set(runId, run);
    this.emit(run, 'user', prompt);
    if (login.label) this.emit(run, 'status', `Running as ${login.label}`);
    this.ws.broadcast('chat.run', this.runEvent(run, 'running'));

    const fail = (text: string) => {
      this.runs.delete(runId);
      rmSync(mcpConfigFile, { force: true });
      this.emit(run, 'error', text);
      this.ws.broadcast('chat.run', this.runEvent(run, 'failed'));
    };
    const start = () => {
      if (run.stopped) {
        this.runs.delete(runId);
        this.interrupted.set(threadId, request);
        rmSync(mcpConfigFile, { force: true });
        this.ws.broadcast('chat.run', this.runEvent(run, 'stopped'));
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
    if (adapter.prepare) adapter.prepare(cli.bin, base).then(start, (e: Error) => fail(e.message));
    else start();
    return { runId, threadId, persona: run.persona };
  }

  private pipe(run: Run, child: ChildProcess, parser: { line(l: string): AgentEvent[] }, sessionKey: string, mcpConfigFile: string) {
    const { id: runId, docId } = run;
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
      this.runs.delete(runId);
      rmSync(mcpConfigFile, { force: true });
      this.ws.broadcast('chat.delta', { docId, runId, threadId: run.threadId, agent: run.agent, text: '' });
      const status = run.stopped ? 'stopped' : code === 0 && !run.failed ? 'finished' : 'failed';
      if (status === 'failed' && !run.failed) this.emit(run, 'error', stderr.trim() || `Agent exited with code ${code}`);
      if (status === 'finished' && !run.replied) this.emit(run, 'status', 'Finished without a reply');
      if (status === 'stopped') {
        this.emit(run, 'status', 'Stopped');
        if (!run.replied) this.interrupted.set(run.threadId, run.prompt);
      }
      this.ws.broadcast('chat.run', this.runEvent(run, status));
    });
  }

  private onEvent(run: Run, ev: AgentEvent, sessionKey: string) {
    if (ev.kind === 'session') this.rememberSession(sessionKey, ev.id);
    else if (ev.kind === 'delta') this.ws.broadcast('chat.delta', { docId: run.docId, runId: run.id, threadId: run.threadId, agent: run.agent, text: ev.text });
    else if (ev.kind === 'text') { run.replied = true; this.emit(run, 'agent', ev.text); }
    else if (ev.kind === 'tool') this.emit(run, 'tool', ev.text);
    else if (ev.kind === 'error') { run.failed = true; this.emit(run, 'error', ev.text); }
    // The final answer repeats the last message; show it only when nothing was said along the way.
    else if (ev.kind === 'final' && !run.replied && ev.text.trim()) { run.replied = true; this.emit(run, 'agent', ev.text.trim()); }
  }

  stop(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return;
    run.stopped = true;
    const child = run.child;
    if (!child) return;
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
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
