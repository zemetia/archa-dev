import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { CORE_GUIDES, DESIGNER_PROMPT, EXECUTE_API_DOC, GUIDE_INDEX, type ModelOption } from '@archa/protocol';
import { agyErrorHint } from './agy-tool-schemas';

/*
 * Launch-mode adapters (blueprint AGENT_BRIDGE/01-02), ported from Gungnir's remediate/ package.
 * Each one builds an argv (the prompt is ONE argv element or stdin — never a shell string),
 * parses the CLI's JSON stream into chat events, and lists the models the installed CLI offers.
 */

export type McpCommand = { command: string; args: string[]; env: Record<string, string> };

export type BuildInput = {
  prompt: string;
  /** Per-run MCP server for the archadev tools. */
  mcp: McpCommand;
  mcpConfigFile: string;
  model?: string;
  sessionId?: string;
  /** Settings → MCP servers in the run's config (allowed whole as `mcp__<name>`). */
  extraServers?: string[];
  /** Settings → Skills were mirrored into the run cwd (needs the Skill tool). */
  skills?: boolean;
  images?: Attachment[];
};
/** A chat image saved in the thread folder; `data` is its base64 for CLIs that take images inline. */
export type Attachment = { path: string; mime: string; data: string };

export type Built = { args: string[]; stdin?: string };

/**
 * A persistent process per chat thread that reads one NDJSON message per turn (stream-json input),
 * so follow-ups skip the CLI and MCP start-up (plan CHAT_AGENT, D-11 A).
 */
export type WarmMode = {
  args: (o: Omit<BuildInput, 'prompt'>) => string[];
  /** `first` = first message this process gets; `resumed` = it continues an earlier CLI session. */
  message: (text: string, ctx: { first: boolean; resumed: boolean; images?: Attachment[] }) => string;
  /** Stops the running turn but keeps the process (and its session) alive. */
  interrupt?: () => string;
};

/** What a stream line means for the chat. `delta` is in-progress text; `text` is a finished message. */
export type AgentEvent =
  | { kind: 'session'; id: string }
  | { kind: 'delta'; text: string }
  | { kind: 'text'; text: string }
  /** A tool call: a one-line summary, the full input (`detail`) and an id to pair its result with. */
  | { kind: 'tool'; text: string; detail?: string; callId?: string }
  /** What a tool call returned (text only, clipped), for the chat's expandable tool rows. */
  | { kind: 'result'; callId: string; text: string; failed: boolean }
  | { kind: 'error'; text: string }
  | { kind: 'final'; text: string }
  /** End of one turn in a warm process; `costUsd` is the session total so far when the CLI reports it. */
  | { kind: 'turn'; ok: boolean; costUsd?: number };

export interface StreamParser { line(line: string): AgentEvent[] }

export type Adapter = {
  id: 'claude' | 'agy' | 'codex';
  label: string;
  bin: string;
  /** The CLI gets chat images inside the message; others are told the files' paths to open. */
  inlineImages?: boolean;
  /**
   * Called before a run with the base `archa mcp` command (no --doc/--agent): agy has no per-run
   * MCP flag, so the server is registered in its global config and finds the doc via ARCHA_DOC_ID.
   */
  prepare?: (bin: string, mcp: McpCommand) => Promise<void>;
  build: (o: BuildInput) => Built;
  warm?: WarmMode;
  parser: () => StreamParser;
  models: (bin: string | null, env: Record<string, string>) => Promise<{ models: ModelOption[]; source: string }>;
};

export const MCP_TOOLS = ['get_state', 'execute', 'place_svg', 'inspect', 'screenshot', 'export_svg', 'say', 'browser', 'place_image', 'done', 'read_guide', 'read_skill', 'delegate', 'wait_workers', 'tell_worker', 'reference', 'compare', 'remember', 'forget', 'recall', 'list_documents', 'open_document', 'new_document', 'save_document'];
/** Windows caps a command line near 32 KiB. */
const MAX_ARG_PROMPT = 28_000;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/[\]@+-]{0,127}$/;

/* ---------------------------------- bins ---------------------------------- */

export function findBin(name: string): string | null {
  // On Windows an extensionless file is npm's sh shim, which spawn() cannot run (ENOENT).
  const exts = process.platform === 'win32' ? ['.exe'] : [''];
  const dirs = (process.env.PATH ?? '').split(delimiter);
  // fnm's per-shell folders vanish when that shell closes; anything saved for later must not point there.
  const stable = dirs.filter((d) => !/fnm_multishells/i.test(d));
  for (const dir of [...stable, ...dirs.filter((d) => !stable.includes(d))]) {
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const extra = [join(home, '.local', 'bin')];
  if (process.platform === 'win32') extra.push(join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), name, 'bin'));
  for (const dir of extra) for (const ext of exts) if (existsSync(join(dir, name + ext))) return join(dir, name + ext);
  return null;
}

function runQuiet(bin: string, args: string[], timeoutMs: number, env: Record<string, string> = {}): Promise<{ out: string; code: number | null }> {
  return new Promise((done) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env, NO_COLOR: '1' } });
    let out = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (c: string) => { out += c; });
    child.stderr.setEncoding('utf8').on('data', (c: string) => { out += c; });
    child.on('error', () => { clearTimeout(timer); done({ out, code: -1 }); });
    child.on('close', (code) => { clearTimeout(timer); done({ out, code }); });
  });
}

const readJson = (p: string): Record<string, unknown> | null => {
  try { return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>; } catch { return null; }
};
const clip = (t: string, n = 4000) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** The canvas state is a convenience; past the argv limit the agent fetches it with get_state. */
function withState(prompt: string, limit: number) {
  if (prompt.length <= limit) return prompt;
  const cut = prompt.indexOf('\n\n---\nCurrent canvas state');
  return `${cut > 0 ? prompt.slice(0, cut) : prompt.slice(0, limit)}\n\n(Call get_state first to read the canvas.)`;
}

/* --------------------------------- models --------------------------------- */

const CLAUDE_ALIASES: ModelOption[] = [
  { id: 'fable', label: 'Fable', description: 'Latest Fable' },
  { id: 'opus', label: 'Opus', description: 'Latest Opus' },
  { id: 'sonnet', label: 'Sonnet', description: 'Latest Sonnet' },
  { id: 'haiku', label: 'Haiku', description: 'Latest Haiku — fastest' },
];

/** Claude Code aliases plus the models the CLI cached for this account. */
async function claudeModels(_bin: string | null, env: Record<string, string>) {
  const models = [...CLAUDE_ALIASES];
  const dir = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const files = env.CLAUDE_CONFIG_DIR ? [join(dir, '.claude.json')] : [join(dirname(dir), '.claude.json'), join(dir, '.claude.json')];
  for (const f of files) {
    const extra = readJson(f)?.additionalModelOptionsCache;
    if (!Array.isArray(extra)) continue;
    for (const m of extra as Array<Record<string, unknown>>) {
      const id = typeof m.value === 'string' ? m.value : '';
      if (MODEL_ID.test(id) && !models.some((o) => o.id === id)) models.push({ id, label: String(m.label ?? id), description: typeof m.description === 'string' ? m.description : undefined });
    }
    break;
  }
  return { models, source: 'Claude Code aliases + account model cache' };
}

let agyCache: { at: number; models: ModelOption[] } | null = null;
/** `agy models` prints "<id>\t<label>" per line; cached for 10 minutes (it calls the network). */
async function agyModels(bin: string | null) {
  if (!bin) return { models: [], source: 'agy not installed' };
  if (agyCache && Date.now() - agyCache.at < 600_000) return { models: agyCache.models, source: 'agy models' };
  const { out } = await runQuiet(bin, ['models'], 45_000);
  const models: ModelOption[] = [];
  for (const line of out.split(/\r?\n/)) {
    const [id, label] = line.split('\t').map((p) => p?.trim());
    if (id && MODEL_ID.test(id) && label) models.push({ id, label });
  }
  if (models.length) agyCache = { at: Date.now(), models };
  return { models, source: models.length ? 'agy models' : 'agy models returned nothing (signed in?)' };
}

async function codexModels(_bin: string | null, env: Record<string, string>) {
  const home = env.CODEX_HOME || join(homedir(), '.codex');
  const doc = readJson(join(home, 'models_cache.json'));
  const list = Array.isArray(doc?.models) ? (doc.models as Array<Record<string, unknown>>) : [];
  const models: ModelOption[] = [];
  for (const m of list) {
    const id = String(m.slug ?? m.id ?? '');
    if (MODEL_ID.test(id)) models.push({ id, label: String(m.display_name ?? id), description: typeof m.description === 'string' ? m.description : undefined });
  }
  return { models, source: models.length ? 'Codex model cache' : 'No Codex model cache yet (run codex once)' };
}

/* --------------------------------- parsers -------------------------------- */

/** `claude -p --output-format stream-json --verbose --include-partial-messages` */
function claudeParser(): StreamParser {
  let live = '';
  let failed = false;
  return {
    line(line) {
      const ev = parse(line);
      if (!ev) return [];
      const out: AgentEvent[] = [];
      if (typeof ev.session_id === 'string') out.push({ kind: 'session', id: ev.session_id });
      if (ev.type === 'stream_event') {
        const e = ev.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
        if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
          live += e.delta.text;
          out.push({ kind: 'delta', text: live });
        }
        if (e?.type === 'message_start') live = '';
      } else if (ev.type === 'assistant') {
        const content = (ev.message as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? [];
        if (typeof ev.error === 'string') {
          const text = content.map((c) => (typeof c.text === 'string' ? c.text : '')).join('\n').trim() || ev.error;
          failed = true;
          out.push({ kind: 'error', text: clip(ev.error === 'authentication_failed' ? `${text}\n${CLAUDE_SIGN_IN_HINT}` : text) });
          return out;
        }
        for (const c of content) {
          if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) { live = ''; out.push({ kind: 'text', text: c.text }); }
          if (c.type === 'tool_use') out.push(toolEvent(String(c.name), c.input, typeof c.id === 'string' ? c.id : undefined));
        }
      } else if (ev.type === 'user') {
        const content = (ev.message as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? [];
        for (const c of content) {
          if (c.type !== 'tool_result') continue;
          const body = typeof c.content === 'string' ? c.content : Array.isArray(c.content) ? (c.content as Array<{ text?: string }>).map((x) => x.text ?? '').join('\n') : '';
          const r = resultEvent(body);
          if (r) out.push(r);
          if (typeof c.tool_use_id === 'string') out.push(callResult(c.tool_use_id, body, c.is_error === true));
        }
      } else if (ev.type === 'result') {
        if (ev.is_error) {
          if (!failed) out.push({ kind: 'error', text: clip(String(ev.result ?? (Array.isArray(ev.errors) ? ev.errors.join('\n') : '') ?? 'Agent run failed')) });
        } else if (typeof ev.result === 'string') out.push({ kind: 'final', text: ev.result });
        out.push({ kind: 'turn', ok: !ev.is_error && !failed, ...(typeof ev.total_cost_usd === 'number' ? { costUsd: ev.total_cost_usd } : {}) });
        failed = false;
        live = '';
      }
      return out;
    },
  };
}

/** `agy --output-format stream-json`: step_update events, text arrives as text_delta per step. */
function agyParser(): StreamParser {
  const text = new Map<number, string>();
  return {
    line(line) {
      const ev = parse(line);
      if (!ev) return [];
      const out: AgentEvent[] = [];
      if (typeof ev.conversation_id === 'string') out.push({ kind: 'session', id: ev.conversation_id });
      const s = ev.step_update as { conversation_id?: string; step_index?: number; state?: string; step_type?: string; text_delta?: string; tool_name?: string; tool_info?: { parameters?: Record<string, unknown> }; error?: string } | undefined;
      if (ev.event === 'step_update' && s) {
        if (s.conversation_id) out.push({ kind: 'session', id: s.conversation_id });
        const i = s.step_index ?? 0;
        if (s.step_type === 'agent_response') {
          const t = (text.get(i) ?? '') + (s.text_delta ?? '');
          text.set(i, t);
          if (s.state === 'DONE') {
            text.delete(i);
            if (t.trim()) out.push({ kind: 'text', text: t.trim() });
          } else if (s.text_delta) out.push({ kind: 'delta', text: t });
        } else if (s.step_type === 'tool' && s.state === 'ACTIVE') {
          const p = s.tool_info?.parameters ?? {};
          // MCP calls come through agy's call_mcp_tool wrapper; show the archadev tool itself.
          const callId = `agy-${i}`;
          out.push(s.tool_name === 'call_mcp_tool' ? toolEvent(String(p.ToolName ?? 'mcp'), p.Arguments, callId) : { kind: 'tool', text: agyToolSummary(s.tool_name ?? 'tool', p), detail: pretty(p), callId });
        } else if (s.step_type === 'tool' && s.state === 'DONE') {
          const output = String((s.tool_info as { output?: unknown } | undefined)?.output ?? '');
          if (s.tool_name === 'call_mcp_tool') {
            const r = resultEvent(output);
            if (r) out.push(r);
          }
          if (output) out.push(callResult(`agy-${i}`, output, output.startsWith('FAILED')));
        } else if (s.step_type === 'error_message' && s.error) out.push({ kind: 'error', text: clip(s.error) + agyErrorHint(s.error) });
      } else if (ev.event === 'result') {
        const r = (ev.result ?? {}) as { status?: string; response?: string; error?: string };
        if (r.status && r.status !== 'SUCCESS') out.push({ kind: 'error', text: r.error ? clip(r.error) + agyErrorHint(r.error) : `Antigravity run ended: ${r.status}` });
        else if (r.response) out.push({ kind: 'final', text: r.response });
        out.push({ kind: 'turn', ok: !r.status || r.status === 'SUCCESS' });
        text.clear();
      }
      return out;
    },
  };
}

/** `codex exec --json` */
function codexParser(): StreamParser {
  return {
    line(line) {
      const ev = parse(line);
      if (!ev) return [];
      const it = (ev.item ?? {}) as Record<string, unknown>;
      if (ev.type === 'thread.started' && typeof ev.thread_id === 'string') return [{ kind: 'session', id: ev.thread_id }];
      if (ev.type === 'item.completed' && it.type === 'agent_message' && typeof it.text === 'string' && it.text.trim()) return [{ kind: 'text', text: it.text }];
      if (ev.type === 'item.started' && it.type === 'mcp_tool_call') return [toolEvent(String(it.tool ?? 'mcp'), it.arguments, typeof it.id === 'string' ? it.id : undefined)];
      if (ev.type === 'item.completed' && it.type === 'mcp_tool_call' && typeof it.id === 'string') {
        const res = it.result as { content?: Array<{ text?: string }> } | undefined;
        const text = (res?.content ?? []).map((c) => c.text ?? '').join('\n') || String((it.error as { message?: string } | undefined)?.message ?? '');
        return text ? [callResult(it.id, text, it.status === 'failed' || !!it.error)] : [];
      }
      if (ev.type === 'turn.failed' || ev.type === 'error') {
        const msg = (ev.error as { message?: string } | undefined)?.message ?? String(ev.message ?? 'Codex run failed');
        return [{ kind: 'error', text: clip(msg) }];
      }
      return [];
    },
  };
}

function parse(line: string): Record<string, unknown> | null {
  try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; }
}

const CLAUDE_SIGN_IN_HINT = 'Claude Code is not signed in for this run. Sign in from Settings → Agents (add a Claude account), or run `claude` in a terminal and use /login.';

/** agy's own tools (shell, files): show what they touched, so the person can see why the run takes time. */
function agyToolSummary(name: string, p: Record<string, unknown>): string {
  const arg = [p.CommandLine, p.Command, p.Path, p.AbsolutePath, p.File, p.Query, p.Url].find((v) => typeof v === 'string' && v.trim());
  return arg ? `${name} · ${String(arg).replace(/\s+/g, ' ').slice(0, 120)}` : name;
}

/** A failed `execute` rolls back; surface its reason so the person sees why the agent retries. */
function resultEvent(text: string): AgentEvent | null {
  if (!text.startsWith('FAILED')) return null;
  const reason = /^Reason: (.*)$/m.exec(text)?.[1] ?? text.split('\n')[0]!;
  return { kind: 'tool', text: `execute failed · ${reason.slice(0, 160)}` };
}

/** `say` is the agent talking to the person: show it as a message, not a tool line. */
function toolEvent(name: string, input: unknown, callId?: string): AgentEvent {
  const i = (input ?? {}) as Record<string, unknown>;
  if (name.replace(/^mcp__archadev__/, '') === 'say' && typeof i.text === 'string' && i.text.trim()) return { kind: 'text', text: i.text.trim() };
  const detail = toolDetail(input);
  return { kind: 'tool', text: toolSummary(name, input), ...(detail ? { detail } : {}), ...(callId ? { callId } : {}) };
}

/** Longest tool input / result kept for the chat's expandable rows. */
const MAX_DETAIL = 20_000;
const clipDetail = (s: string) => (s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL)}\n… (${s.length - MAX_DETAIL} more characters)` : s);
function pretty(v: unknown): string | undefined {
  if (v === undefined || v === null || (typeof v === 'object' && !Object.keys(v as object).length)) return undefined;
  return clipDetail(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

/** The full input of a tool call: the code an execute ran, otherwise its arguments. */
export function toolDetail(input: unknown): string | undefined {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.code === 'string') return clipDetail(i.code);
  if (typeof i.svg === 'string') return clipDetail(i.svg);
  return pretty(input);
}

function callResult(callId: string, text: string, failed: boolean): AgentEvent {
  // Screenshots come back as image blocks or long base64: keep the text around them only.
  const clean = text.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{200,}/g, '[image]').replace(/[A-Za-z0-9+/=]{2000,}/g, '[binary]').trim();
  return { kind: 'result', callId, text: clipDetail(clean || '(no text output)'), failed };
}

/** The line of a snippet worth showing in its summary: its leading comment, else its first statement. */
function codeHint(code: string): string {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean);
  const comment = lines.find((l) => l.startsWith('//'));
  const hint = (comment ? comment.replace(/^\/\/+\s*/, '') : lines[0] ?? '').replace(/\s+/g, ' ');
  return hint.length > 60 ? `${hint.slice(0, 57)}…` : hint;
}

export function toolSummary(name: string, input: unknown): string {
  const short = name.replace(/^mcp__archadev__/, '');
  const i = (input ?? {}) as Record<string, unknown>;
  if (short === 'execute' && typeof i.code === 'string') {
    const n = i.code.split('\n').length;
    const hint = codeHint(i.code);
    return `execute · ${hint ? `${hint} · ` : ''}${n} ${n === 1 ? 'line' : 'lines'}`;
  }
  if (short === 'execute' && i.editId) return `execute · patch ${String(i.editId)}`;
  if (short === 'get_state') return 'get_state · read the canvas';
  if (short === 'inspect') return `inspect · ${i.node ? String(i.node) : 'whole page'}${i.depth !== undefined ? ` · depth ${String(i.depth)}` : ''}`;
  if (short === 'read_guide') return `read_guide · ${String(i.topic ?? '')}`;
  if (short === 'read_skill') return `read_skill · ${String(i.name ?? '')}${i.file ? ` · ${String(i.file)}` : ''}`;
  if (short === 'place_svg') return `place_svg · ${String(i.name ?? (typeof i.svg === 'string' ? `${i.svg.length} chars` : ''))}`;
  if (short === 'export_svg') return `export_svg · ${String(i.node ?? '')}`;
  if (short === 'screenshot') return `screenshot · ${String(i.node ?? '')}`;
  if (short === 'say') return String(i.text ?? '');
  if (short === 'done') return `done${i.summary ? ` · ${String(i.summary)}` : ''}`;
  if (short === 'delegate' && Array.isArray(i.tasks)) return `delegate · ${(i.tasks as Array<{ title?: unknown }>).map((t) => String(t.title ?? '')).join(' · ')}`;
  if (short === 'wait_workers') return 'waiting for the team';
  if (short === 'tell_worker') return `tell ${String(i.worker ?? '')} · ${String(i.message ?? '').slice(0, 80)}`;
  if (short === 'browser') return `browser · ${String(i.action ?? '')}${i.query ? ` "${String(i.query)}"` : i.url ? ` ${String(i.url).slice(0, 120)}` : i.ref ? ` ${String(i.ref)}` : ''}`;
  if (short === 'place_image') return `place_image · ${String(i.name ?? (i.url ? String(i.url).slice(0, 120) : i.ref ?? i.selector ?? ''))}`;
  return short;
}

/* -------------------------------- adapters -------------------------------- */

const toml = (v: unknown) => JSON.stringify(v); // JSON strings/arrays are valid TOML values

/*
 * agy does not put MCP tool descriptions in the model's context: it reads them from schema files,
 * which costs minutes of shell/file probing per run. Hand it the tools and the execute API up front.
 */
const AGY_TOOLS_NOTE = `Tools: use ONLY the "archadev" MCP server (call_mcp_tool, ServerName "archadev"): get_state {}, execute { code } or { editId, edits }, place_svg { svg, parent?, x?, y?, width?, height?, name?, mode? }, inspect { node?, depth? }, screenshot { node }, export_svg { node }, say { text }, read_guide { topic }, read_skill { name, file? } (a skill's SKILL.md and file list, or one of its files — the only way to read skills), browser { action, … } (the built-in web browser: search, open, screenshot, images, download), place_image { url | ref, parent? | fillOf?, x?, y?, width?, height?, fit? } (a real photo or logo onto the canvas; fillOf puts it into a frame's fills as a background), done { summary? } (call once when finished — it puts your canvas cursor away). reference { path, page? } (read a PDF/image mockup into numbers), compare { node, reference, page? } (visual diff against it), remember { text, scope: "global"|"document", replaces? } (keep a preference, correction or lesson for later chats), forget { id }, recall {}, list_documents {}, open_document { path }, new_document { name? }, save_document { path? }. Every document tool also takes doc (id, .archa path or name). The canvas state is at the end of this message, so start designing right away; use browser and place_image for web research and pictures — never a shell, Python or file tools.

execute tool documentation:
${EXECUTE_API_DOC}`;

/**
 * Claude design runs replace Claude Code's coding system prompt with ours and switch its built-in
 * tools off: about a tenth of the context per step, and nothing to tempt it away from the canvas.
 */
export const CLAUDE_DESIGN_SYSTEM = `${DESIGNER_PROMPT}

The archadev MCP tools are your only tools.

${CORE_GUIDES}

Other guides (read_guide tool):
${GUIDE_INDEX}`;

const claudeArgs = ({ mcpConfigFile, model, sessionId, extraServers = [], skills }: Omit<BuildInput, 'prompt'>) => [
  '--setting-sources', 'project,local',
  '--mcp-config', mcpConfigFile, '--strict-mcp-config',
  '--allowedTools', [...MCP_TOOLS.map((t) => `mcp__archadev__${t}`), ...extraServers.map((n) => `mcp__${n}`), ...(skills ? ['Skill'] : [])].join(','),
  '--tools', skills ? 'Skill' : '',
  '--system-prompt', CLAUDE_DESIGN_SYSTEM,
  ...(model ? ['--model', model] : []),
  ...(sessionId ? ['--resume', sessionId] : []),
];

let agyRegistered = '';
export const ADAPTERS: Adapter[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    // Design runs have no file tools, so pasted images ride in the message as image blocks.
    inlineImages: true,
    // Prompt on stdin (no argv limit, and stdin is closed so the CLI never waits for more).
    // setting-sources without "user": the person's own hooks and plugins stay out of design runs.
    build: ({ prompt, ...o }) => ({
      args: ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', ...claudeArgs(o)],
      stdin: prompt,
    }),
    warm: {
      args: (o) => ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', ...claudeArgs(o)],
      message: (text, { images = [] }) => JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text }] },
      }),
      interrupt: () => JSON.stringify({ type: 'control_request', request_id: `int-${Date.now()}`, request: { subtype: 'interrupt' } }),
    },
    parser: claudeParser,
    models: claudeModels,
  },
  {
    id: 'agy',
    label: 'Antigravity',
    bin: 'agy',
    // agy has no per-run MCP flag: register (or refresh) the archadev server in its own config.
    prepare: async (bin, mcp) => {
      const key = JSON.stringify(mcp);
      if (agyRegistered === key) return;
      const env = Object.entries(mcp.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]);
      const r = await runQuiet(bin, ['mcp', 'add', ...env, 'archadev', '--', mcp.command, ...mcp.args, '--agent', 'agy'], 30_000);
      if (r.code !== 0) throw new Error(`Could not register the ArchaDev MCP server with agy: ${r.out.trim().slice(0, 300)}`);
      agyRegistered = key;
    },
    build: ({ prompt, model, sessionId }) => ({
      args: [
        '--dangerously-skip-permissions', '--disable-slash-commands', '--output-format', 'stream-json', '--print-timeout', '30m',
        ...(model ? ['--model', model] : []),
        ...(sessionId ? ['--conversation', sessionId] : []),
        '-p', withState(`${sessionId ? AGY_TOOLS_NOTE : `${DESIGNER_PROMPT}\n\n${AGY_TOOLS_NOTE}`}\n\n---\n${prompt}`, MAX_ARG_PROMPT),
      ],
    }),
    // agy has no system-prompt flag: the designer brief rides on the first message a process gets.
    warm: {
      args: ({ model, sessionId }) => [
        '--dangerously-skip-permissions', '--disable-slash-commands', '--input-format', 'stream-json', '--output-format', 'stream-json',
        ...(model ? ['--model', model] : []),
        ...(sessionId ? ['--conversation', sessionId] : []),
        '-p=',
      ],
      message: (text, { first, resumed }) => JSON.stringify({ event: 'user', message: { content: first ? `${resumed ? AGY_TOOLS_NOTE : `${DESIGNER_PROMPT}\n\n${CORE_GUIDES}\n\n${AGY_TOOLS_NOTE}`}\n\n---\n${text}` : text } }),
    },
    parser: agyParser,
    models: (bin) => agyModels(bin),
  },
  {
    id: 'codex',
    label: 'Codex',
    bin: 'codex',
    build: ({ prompt, mcp, model, sessionId, images = [] }) => {
      const flags = [
        '--json', '--full-auto', '--skip-git-repo-check',
        '-c', `mcp_servers.archadev.command=${toml(mcp.command)}`,
        '-c', `mcp_servers.archadev.args=${toml([...mcp.args])}`,
        ...Object.entries(mcp.env).flatMap(([k, v]) => ['-c', `mcp_servers.archadev.env.${k}=${toml(v)}`]),
        // wait_workers (orchestrate mode) blocks for minutes; codex gives an MCP call 60 s by default.
        '-c', 'mcp_servers.archadev.tool_timeout_sec=660',
        ...(model ? ['--model', model] : []),
        // `=` form: the flag takes several values and must not swallow the `resume` subcommand.
        ...(images.length ? [`--image=${images.map((i) => i.path).join(',')}`] : []),
      ];
      return {
        args: ['exec', ...flags, ...(sessionId ? ['resume', sessionId] : []), '-'],
        stdin: sessionId ? prompt : `${DESIGNER_PROMPT}\n\n---\n${prompt}`,
      };
    },
    parser: codexParser,
    models: codexModels,
  },
];
