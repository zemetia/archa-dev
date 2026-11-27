import type { Author, Issue, NodeInput, Op } from '@archa/schema';
import type { MethodName, Params, Result } from './rpc';


/** An icon the person uploaded: a node tree at its natural size. */
export type CustomIconInfo = { name: string; width: number; height: number; node: NodeInput; addedAt: number; preview?: string };
export * from './agent-docs';
export * from './design-guides';
export * from './browser';
export * from './settings';
export * from './fonts';
export * from './gemini-schema';
export * from './rpc';
export * from './tools';

/* ----------------------------------------------------------------------------
 * One protocol for every client: renderer (MessagePort), CLI / MCP (socket).
 * Blueprint ARCHITECTURE/02.
 * ------------------------------------------------------------------------- */

/** svg / html / tailwind are written by the core; png / jpg are rendered by the renderer; pdf is printed by main. */
export type ExportFormat = 'png' | 'jpg' | 'svg' | 'html' | 'tailwind';

export type ClientKind = 'renderer' | 'cli' | 'mcp';
/** runId: set by an `archa mcp` that a launched chat run started (ARCHA_RUN_ID), so its activity is not shown twice. */
export type ClientInfo = { kind: ClientKind; name: string; agentId?: string; runId?: string };

/**
 * dataDir: the document's `<name>-data/` folder next to its `.archa` (a runtime folder while unsaved) — assets, chats,
 * skills, memory. assetDir: its `assets/`, where `asset:` references resolve.
 */
/** project: the folder the document belongs to (its window shows it; untitled ones save into `<project>/.design/`); null = public. */
export type DocSummary = { id: string; name: string; filePath: string | null; dataDir: string; assetDir: string; dirty: boolean; revision: number; project: string | null };
/** A `.archa` file in a project's `.design/` folder. */
export type ProjectFile = { path: string; name: string; modifiedAt: number; docId: string | null };
/** App-wide preferences in ARCHA_HOME/settings.json. autosave.seconds: interval for documents with unsaved changes. */
export type AppSettings = { autosave: { enabled: boolean; seconds: number } };
export type AppliedEvent = { docId: string; revision: number; txnId: string; author: Author; label: string; ops: Op[]; touched: string[] };
export type ActivityEntry = { id: string; ts: number; docId: string; author: Author; tool: string; text: string; nodeIds: string[]; runId?: string };
export type AgentClient = { id: string; name: string; kind: ClientKind; connectedAt: number };

/*
 * Agent trail (blueprint AGENT_BRIDGE/03 → Sessions): each tool call an agent makes is a list of steps,
 * so the canvas can move that session's cursor along the path the agent worked. Bounds are world
 * coordinates taken when the step ran, so a deleted node still has a place to point at.
 */
export type TrailAction = 'focus' | 'read' | 'create' | 'edit' | 'copy' | 'move' | 'delete' | 'look';
export type TrailStep = { action: TrailAction; nodeId: string; name: string; bounds: { x: number; y: number; width: number; height: number } };
export type AgentTrail = { docId: string; author: Author; runId?: string; threadId?: string; steps: TrailStep[] };

/**
 * An agent screenshot. The full-size PNG is always written to a temporary file (`path`, no size cap);
 * `png` is what goes inline — the same image, or a downscaled preview (`preview: true`) when the full
 * one is larger than vision models accept.
 */
export type Shot = { nodeId: string; name: string; png?: string; path?: string; width?: number; height?: number; preview?: boolean; unchanged?: boolean; error?: string;
  /** A tall shot cut into readable pieces (JPEG), top to bottom; y0/y1 in the node's own px. Sent inline instead of `png`. */
  slices?: InlineSlice[];
  /** Slices left out to keep the reply under the inline budget; they are in the full file at `path`. */
  omitted?: number };

/** One inline image piece: base64 data, its type, and the y range it covers. */
export type InlineSlice = { data: string; mime: 'image/png' | 'image/jpeg'; y0: number; y1: number };

/** Visual diff of a node against a reference (blueprint MCP/05 → Compare). y/x in the node's own px. */
export type CompareRegion = { y0: number; y1: number; x0: number; x1: number; mismatch: number; nodes?: string[] };
export type CompareStats = { width: number; height: number; refHeight: number; mismatch: number; meanDiff: number; regions: CompareRegion[] };
export type CompareResult = { stats: CompareStats; path?: string; slices?: InlineSlice[]; omitted?: number; png?: string };

export type ExecuteResult =
  | { ok: true; revision: number; created: Array<{ name: string; id: string }>; changed: Array<{ name: string; id: string }>; output: string[]; screenshots: Shot[]; issues: Issue[] }
  | { ok: false; revision: number; statement?: string; reason: string; editId: string };

/* -------------------------------- accounts -------------------------------- */

export type AccountAgent = 'claude' | 'agy' | 'codex';

/** A running sign-in: the CLI's link, and whether it waits for a pasted code. Tokens never cross the protocol. */
export type LoginState = { active: boolean; url: string; output: string; needsCode: boolean; error?: string };

export type AgentAccount = {
  id: string;
  agent: AccountAgent;
  name: string;
  email: string;
  plan: string;
  signedIn: boolean;
  enabled: boolean;
  isDefault: boolean;
  /** true = ArchaDev owns the folder (and deletes it with the account). */
  managed: boolean;
  dir: string;
  createdAt: number;
  login: LoginState | null;
};

export type HostLogin = { email: string; plan: string; signedIn: boolean; savedAccountId: string | null; error?: string };
export type AgentCli = { id: AccountAgent; label: string; bin: string | null; version: string | null; host: HostLogin };
export type AccountsOverview = { clis: AgentCli[]; accounts: AgentAccount[]; profilesDir: string };

export type ModelOption = { id: string; label: string; description?: string };
/** user: display name for comments (git user.name, else the OS account). */
export type AppInfo = { version: string; user: string; cliPath: string; mcpCommand: string[]; agents: Array<{ id: string; label: string; available: boolean }> };

/** An image pasted into the chat composer: base64 pixels for the agent, a small data-URL thumbnail for the history. */
export type ChatImage = { mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string; thumb: string };

export type ChatMessage = {
  id: string;
  docId: string;
  runId: string;
  /** Conversation the message belongs to; the agent CLI session resumes per thread. Missing on pre-0.2.1 history. */
  threadId?: string;
  role: 'user' | 'agent' | 'tool' | 'status' | 'error';
  agent: string;
  /** Random session name the run works under on the canvas (e.g. "Swift Heron"); one per thread. */
  persona?: string;
  text: string;
  /** Thumbnails of the images a user message carried: `asset:chats/attachments/…` files in the document's asset folder. */
  images?: string[];
  /** Tool rows: the call's full input (code or arguments) and, once it returns, its text result. */
  detail?: string;
  result?: string;
  /** The tool call returned an error. */
  failed?: boolean;
  /** Pairs a tool row with the result the agent CLI reports later. */
  callId?: string;
  /** Orchestrate mode: set on every message of a lead thread and of its worker threads. */
  orchestra?: OrchestraMeta;
  /** The status that ends a turn: how long the agent worked on it (ms), shown under its reply. */
  elapsedMs?: number;
  ts: number;
};
/** A message waiting for the thread's running turn; the chat pins it above the composer until it starts. */
export type ChatQueued = { id: string; text: string; images?: string[]; ts: number };
/** "42s", "3m 05s", "1h 02m": how long a turn took. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
export type ChatMode = 'chat' | 'orchestrate';
/** lead: the thread that plans and delegates. Worker threads carry their lead's thread id, task title and prompt. */
export type OrchestraMeta = { lead: true } | { parent: string; title: string; kind?: string; prompt: string };
export type OrchestraTask = { title: string; prompt: string; kind?: string; agent?: string; model?: string; frame?: string };
export type OrchestraWorker = { threadId: string; persona: string; title: string; agent: string };
export type OrchestraReport = OrchestraWorker & { status: 'working' | 'finished' | 'failed' | 'stopped'; reply: string };
export type LibraryItem = { library: string; id: string; ref: string; name: string; description: string; width: number; height: number; publishedAt: number; thumb?: string };
export type ChatThread = { id: string; title: string; agent: string; persona?: string; startedAt: number; updatedAt: number; messages: number; orchestra?: OrchestraMeta };
/** Group a document's messages into conversations, newest first (History tab). */
export function chatThreads(messages: ChatMessage[]): ChatThread[] {
  const by = new Map<string, ChatThread>();
  for (const m of messages) {
    const id = m.threadId ?? m.runId;
    const t: ChatThread = by.get(id) ?? { id, title: '', agent: m.agent, startedAt: m.ts, updatedAt: m.ts, messages: 0 };
    if (!t.title && m.role === 'user') t.title = m.text.slice(0, 120);
    if (!t.persona && m.persona) t.persona = m.persona;
    if (!t.orchestra && m.orchestra) t.orchestra = m.orchestra;
    t.updatedAt = Math.max(t.updatedAt, m.ts);
    t.messages++;
    by.set(id, t);
  }
  // A worker's first message is its whole brief; its task title reads better.
  return [...by.values()].map((t) => ({ ...t, title: (t.orchestra && 'parent' in t.orchestra ? t.orchestra.title : t.title) || 'Untitled conversation' })).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const threadOf = (m: ChatMessage) => m.threadId ?? m.runId;
export const PERSONA_COLORS = 8;
/** Colour slot (0..7) of a session name, so its cursor and its chat label match everywhere. */
export function personaColor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % PERSONA_COLORS;
}
/** startedAt: when the turn began (epoch ms), for the live "working for" timer. */
export type ChatRunEvent = { runId: string; docId: string; threadId: string; agent: string; persona: string; status: 'running' | 'finished' | 'failed' | 'stopped'; startedAt?: number };

export interface CoreEvents {
  'doc.applied': AppliedEvent;
  'workspace.changed': DocSummary[];
  'activity': ActivityEntry;
  'agents.changed': AgentClient[];
  'selection.changed': { docId: string; ids: string[]; by: Author };
  'render.request': { requestId: string; docId: string; nodeId: string; scale: number; slice?: number };
  /** Rasterise a reference page and sample the ink colour inside each box (page px). */
  'render.reference': { requestId: string; url: string; page: number; scale: number; boxes: Array<{ x: number; y: number; w: number; h: number }> };
  /** Diff a node against a reference image or PDF page: stats + a heat-map PNG (sliced when tall). */
  'render.compare': { requestId: string; docId: string; nodeId: string; url: string; page: number; scale: number; slice: number };
  'chat.message': ChatMessage;
  /** Text the agent is still writing (whole text so far); '' clears it. */
  'chat.delta': { docId: string; runId: string; threadId: string; agent: string; text: string };
  'chat.run': ChatRunEvent;
  /** A thread's queue changed (every item, oldest first; empty when nothing waits). */
  'chat.queue': { docId: string; threadId: string; items: ChatQueued[] };
  /** Where an agent session just worked; the canvas moves its cursor along the steps. */
  'agent.trail': AgentTrail;
  /** An agent session called done(): its cursor fades now instead of idling until the process exits. */
  'agent.done': { docId: string; author: Author; runId?: string };
  /** Accounts or a sign-in changed; clients re-read `accounts.overview`. */
  'accounts.changed': { accountId?: string };
  /** Skills or MCP servers changed; clients re-read `skills.list` / `mcp.list`. */
  'skills.changed': Record<string, never>;
  'memory.changed': Record<string, never>;
  'mcp.changed': Record<string, never>;
}
export type EventName = keyof CoreEvents;

export type RpcError = { code: string; message: string };
export type Message =
  | { t: 'req'; id: number; method: string; params: unknown }
  | { t: 'res'; id: number; ok: true; result: unknown }
  | { t: 'res'; id: number; ok: false; error: RpcError }
  | { t: 'evt'; event: string; data: unknown }
  | { t: 'hello'; client: ClientInfo; token?: string };

/** Minimal duplex: MessagePort, Electron parentPort/MessagePortMain and sockets all adapt to this. */
export interface Channel {
  send(msg: Message): void;
  onMessage(cb: (msg: Message) => void): void;
}

export class RpcClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private handlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(private channel: Channel) {
    channel.onMessage((msg) => {
      if (msg.t === 'res') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
      } else if (msg.t === 'evt') {
        for (const h of this.handlers.get(msg.event) ?? []) h(msg.data);
      }
    });
  }

  call<M extends MethodName>(method: M, ...params: Params<M> extends void ? [] : [Params<M>]): Promise<Result<M>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.channel.send({ t: 'req', id, method, params: params[0] });
    });
  }

  on<E extends EventName>(event: E, cb: (data: CoreEvents[E]) => void): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(cb as (d: unknown) => void);
    this.handlers.set(event, set);
    return () => set.delete(cb as (d: unknown) => void);
  }
}

/** Newline-delimited JSON framing for sockets. */
export function jsonLines(write: (s: string) => void, onData: (cb: (chunk: string) => void) => void): Channel {
  let buf = '';
  const subs: Array<(m: Message) => void> = [];
  onData((chunk) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line) as Message;
        for (const s of subs) s(m);
      } catch {
        /* a malformed line is dropped; the peer gets no response and times out */
      }
    }
  });
  return { send: (m) => write(`${JSON.stringify(m)}\n`), onMessage: (cb) => subs.push(cb) };
}
