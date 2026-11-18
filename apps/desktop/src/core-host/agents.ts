import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { newId } from '@archa/schema';
import { DESIGNER_PROMPT, type ChatMessage } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import type { Workspace } from './workspace';
import { describeState } from './execute';

/*
 * Launch mode (blueprint AGENT_BRIDGE): the app starts the agent's own CLI headless,
 * gives it only the ArchaDev MCP server, and turns its stream into chat messages.
 * Ported from Gungnir's remediate/ adapters. The prompt is one argv element — never a shell string.
 */

type Adapter = {
  id: string;
  label: string;
  bin: string;
  models: string[];
  args: (o: { prompt: string; mcpConfig: string; model?: string; sessionId?: string; tools: string[] }) => string[];
};

const MCP_TOOLS = ['get_state', 'execute', 'screenshot', 'export_svg', 'say'];

export const ADAPTERS: Adapter[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    models: ['opus', 'sonnet', 'haiku'],
    args: ({ prompt, mcpConfig, model, sessionId, tools }) => [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--mcp-config', mcpConfig, '--strict-mcp-config',
      '--allowedTools', tools.map((t) => `mcp__archadev__${t}`).join(','),
      '--append-system-prompt', DESIGNER_PROMPT,
      ...(model ? ['--model', model] : []),
      ...(sessionId ? ['--resume', sessionId] : []),
    ],
  },
];

export function findBin(name: string): string | null {
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  for (const p of [join(home, '.local', 'bin', `${name}.exe`), join(home, '.local', 'bin', name)]) if (existsSync(p)) return p;
  return null;
}

export type McpCommand = { command: string; args: string[]; env: Record<string, string> };

type Run = { id: string; docId: string; agent: string; child: ChildProcess; stopped: boolean };

export class ChatRunner {
  private runs = new Map<string, Run>();
  private sessions = new Map<string, string>(); // docId:agent → CLI session id
  readonly messages = new Map<string, ChatMessage[]>();

  constructor(private ws: Workspace, private mcpCommand: () => McpCommand) {}

  private emit(docId: string, runId: string, agent: string, role: ChatMessage['role'], text: string) {
    const m: ChatMessage = { id: newId(), docId, runId, role, agent, text, ts: Date.now() };
    const list = this.messages.get(docId) ?? [];
    list.push(m);
    this.messages.set(docId, list);
    this.ws.broadcast('chat.message', m);
  }

  send(docId: string, agentId: string, prompt: string, model?: string): string {
    const adapter = ADAPTERS.find((a) => a.id === agentId);
    if (!adapter) throw new Error(`Unknown agent "${agentId}"`);
    const bin = findBin(adapter.bin);
    if (!bin) throw new Error(`${adapter.label} CLI ("${adapter.bin}") was not found on PATH`);
    const session = this.ws.session(docId);
    const runId = newId();

    const mcp = this.mcpCommand();
    const cfgDir = join(archaHome(), 'runtime');
    mkdirSync(cfgDir, { recursive: true });
    const mcpConfig = join(cfgDir, `mcp-${runId}.json`);
    writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { archadev: { command: mcp.command, args: [...mcp.args, '--doc', docId, '--agent', adapter.id], env: mcp.env } } }, null, 2));

    const sessionKey = `${docId}:${agentId}`;
    const fullPrompt = `${prompt}\n\n---\nCurrent canvas state (fresh, no need to call get_state first):\n${describeState(this.ws, session)}`;
    const child = spawn(bin, adapter.args({ prompt: fullPrompt, mcpConfig, model, sessionId: this.sessions.get(sessionKey), tools: MCP_TOOLS }), {
      cwd: cfgDir, shell: false, windowsHide: true, env: { ...process.env, ARCHA_RUN_ID: runId },
    });
    const run: Run = { id: runId, docId, agent: agentId, child, stopped: false };
    this.runs.set(runId, run);
    this.emit(docId, runId, agentId, 'user', prompt);
    this.ws.broadcast('chat.run', { runId, docId, status: 'running' });

    let buf = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) this.parseClaude(run, line, sessionKey);
      }
    });
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (c: string) => { stderr = (stderr + c).slice(-4000); });
    child.on('error', (e) => this.emit(docId, runId, agentId, 'error', e.message));
    child.on('exit', (code) => {
      this.runs.delete(runId);
      const status = run.stopped ? 'stopped' : code === 0 ? 'finished' : 'failed';
      if (status === 'failed') this.emit(docId, runId, agentId, 'error', stderr.trim() || `Agent exited with code ${code}`);
      this.ws.broadcast('chat.run', { runId, docId, status });
    });
    return runId;
  }

  stop(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return;
    run.stopped = true;
    if (process.platform === 'win32' && run.child.pid) spawn('taskkill', ['/pid', String(run.child.pid), '/T', '/F'], { windowsHide: true });
    else run.child.kill('SIGTERM');
  }

  private parseClaude(run: Run, line: string, sessionKey: string) {
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(line) as Record<string, unknown>; } catch { return; }
    if (typeof ev.session_id === 'string') this.sessions.set(sessionKey, ev.session_id);
    const content = (ev.message as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? [];
    if (ev.type === 'assistant') {
      for (const c of content) {
        if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) this.emit(run.docId, run.id, run.agent, 'agent', c.text);
        if (c.type === 'tool_use') this.emit(run.docId, run.id, run.agent, 'tool', toolSummary(String(c.name), c.input));
      }
    } else if (ev.type === 'result' && ev.is_error) {
      this.emit(run.docId, run.id, run.agent, 'error', String(ev.result ?? 'Agent run failed'));
    }
  }
}

function toolSummary(name: string, input: unknown): string {
  const short = name.replace(/^mcp__archadev__/, '');
  const i = (input ?? {}) as Record<string, unknown>;
  if (short === 'execute' && typeof i.code === 'string') return `execute · ${i.code.split('\n').length} lines`;
  if (short === 'execute' && i.editId) return `execute · patch ${String(i.editId)}`;
  if (short === 'screenshot') return `screenshot · ${String(i.node ?? '')}`;
  if (short === 'say') return String(i.text ?? '');
  return short;
}
