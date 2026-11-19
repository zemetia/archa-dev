import type { Author, DocumentData, Issue, Op } from '@archa/schema';
import type { BrowserCommand, BrowserReply } from './browser';
import type { McpImportCandidate, McpImportSource, McpServer, McpServerInput, McpTestResult, SkillsOverview, Skill } from './settings';

export * from './agent-docs';
export * from './design-guides';
export * from './browser';
export * from './settings';

/* ----------------------------------------------------------------------------
 * One protocol for every client: renderer (MessagePort), CLI / MCP (socket).
 * Blueprint ARCHITECTURE/02.
 * ------------------------------------------------------------------------- */

/** svg / html / tailwind are written by the core; png / jpg are rendered by the renderer; pdf is printed by main. */
export type ExportFormat = 'png' | 'jpg' | 'svg' | 'html' | 'tailwind';

export type ClientKind = 'renderer' | 'cli' | 'mcp';
/** runId: set by an `archa mcp` that a launched chat run started (ARCHA_RUN_ID), so its activity is not shown twice. */
export type ClientInfo = { kind: ClientKind; name: string; agentId?: string; runId?: string };

export type DocSummary = { id: string; name: string; filePath: string | null; dirty: boolean; revision: number };
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

export type ExecuteResult =
  | { ok: true; revision: number; created: Array<{ name: string; id: string }>; changed: Array<{ name: string; id: string }>; output: string[]; screenshots: Array<{ nodeId: string; name: string; png?: string; unchanged?: boolean; error?: string }>; issues: Issue[] }
  | { ok: false; revision: number; statement?: string; reason: string; editId: string };

export interface CoreMethods {
  'workspace.list': { params: void; result: DocSummary[] };
  'doc.new': { params: { name?: string }; result: { docId: string } };
  'doc.open': { params: { path: string }; result: { docId: string } };
  'doc.save': { params: { docId: string; path?: string }; result: { path: string } };
  'doc.close': { params: { docId: string }; result: void };
  'doc.rename': { params: { docId: string; name: string }; result: void };
  'doc.snapshot': { params: { docId: string }; result: { data: DocumentData; revision: number } };
  'doc.apply': { params: { docId: string; baseRevision: number; ops: Op[]; label: string }; result: { revision: number; txnId: string } };
  'doc.undo': { params: { docId: string }; result: { revision: number } | null };
  'doc.redo': { params: { docId: string }; result: { revision: number } | null };
  'selection.set': { params: { docId: string; ids: string[] }; result: void };
  'render.respond': { params: { requestId: string; png?: string; error?: string }; result: void };
  'agents.list': { params: void; result: AgentClient[] };
  'activity.list': { params: { docId?: string; limit?: number }; result: ActivityEntry[] };
  // Agent-facing (MCP relay)
  'agent.state': { params: { docId?: string }; result: string };
  'agent.execute': { params: { docId?: string; code?: string; editId?: string; edits?: Array<{ find: string; replace: string }> }; result: ExecuteResult };
  'agent.screenshot': { params: { docId?: string; node: string; scale?: number }; result: { png?: string; unchanged?: boolean; name: string; nodeId: string } };
  'agent.exportSvg': { params: { docId?: string; node: string }; result: { svg: string } };
  /** Compact text tree of a node (default: the selection, else the page) — what the design panel shows, per layer. */
  'agent.outline': { params: { docId?: string; node?: string; depth?: number }; result: string };
  'agent.say': { params: { docId?: string; text: string; nodeId?: string }; result: void };
  /** Drive the in-app browser (blueprint BROWSER). */
  'agent.browser': { params: BrowserCommand; result: BrowserReply };
  /** Orchestrate mode (blueprint AGENT_BRIDGE/06): a lead thread starts worker threads and collects their reports. */
  'orchestra.delegate': { params: { tasks: OrchestraTask[] }; result: { workers: OrchestraWorker[] } };
  'orchestra.wait': { params: { workers?: string[]; timeoutSec?: number }; result: { workers: OrchestraReport[]; timedOut: boolean } };
  'orchestra.tell': { params: { worker: string; message: string }; result: { queued: boolean } };
  // App
  'app.info': { params: void; result: AppInfo };
  /** html / tailwind also write a CSS file and image assets next to `path`; png / jpg arrive rendered by the renderer as base64. */
  'export.save': { params: { docId: string; nodeId: string; format: ExportFormat; path: string; image?: string }; result: { files: string[] } };
  /** Self-contained HTML page of a node (CSS inlined, images embedded) — main prints it to PDF. */
  'export.page': { params: { docId: string; nodeId: string }; result: { html: string; width: number; height: number } };
  /** Code of a node for the clipboard: one HTML file (CSS inlined in a <style>, or Tailwind classes), images embedded. */
  'export.code': { params: { docId: string; nodeId: string; style: 'css' | 'tailwind' }; result: { code: string } };
  // Chat: launch a local agent CLI on this document (blueprint AGENT_BRIDGE/03)
  /** No threadId = start a new conversation. */
  /**
   * `now` stops the thread's running turn and runs this message next; otherwise a busy thread queues it.
   * `focus` = node ids the request is about (the composer's selection chip).
   */
  'chat.send': { params: { docId: string; agent: string; model?: string; account?: string; prompt: string; threadId?: string; now?: boolean; focus?: string[]; images?: ChatImage[]; mode?: ChatMode }; result: { runId: string; threadId: string; persona: string; queued?: boolean } };
  /** Start (or keep) the agent process for a thread before the person sends, so the first turn starts at once. No threadId = a fresh thread id is reserved and returned. */
  'chat.warm': { params: { docId: string; agent: string; model?: string; account?: string; threadId?: string }; result: { threadId: string; warm: boolean } };
  'chat.stop': { params: { runId: string }; result: void };
  /** Runs still working, so a reloaded window shows every parallel session. */
  'chat.runs': { params: void; result: ChatRunEvent[] };
  'chat.list': { params: { docId: string }; result: ChatMessage[] };
  'chat.deleteThread': { params: { docId: string; threadId: string }; result: void };
  /** Models the installed agent CLI offers (agy asks the network; cached). */
  'agents.models': { params: { agent: string; account?: string }; result: { models: ModelOption[]; source: string } };
  // Global component libraries (blueprint DESIGN_SYSTEM/02)
  'library.list': { params: void; result: LibraryItem[] };
  'library.publish': { params: { docId: string; nodeId: string; library?: string; png?: string }; result: LibraryItem };
  'library.remove': { params: { library: string; id: string }; result: void };
  /** First use places a local main linked to the library; later uses add instances of it. */
  'library.insert': { params: { docId: string; library: string; id: string; parentId?: string; x?: number; y?: number }; result: { nodeId: string; placed: 'main' | 'instance' } };
  // Agent login profiles (blueprint AGENT_BRIDGE/02)
  'accounts.overview': { params: void; result: AccountsOverview };
  'accounts.create': { params: { agent: AccountAgent; name?: string; apiKey?: string }; result: AgentAccount };
  'accounts.update': { params: { id: string; name?: string; enabled?: boolean; isDefault?: boolean }; result: AgentAccount };
  'accounts.delete': { params: { id: string }; result: void };
  'accounts.captureHost': { params: { agent: 'agy' }; result: AgentAccount };
  'accounts.useOnHost': { params: { id: string }; result: void };
  'accounts.login.start': { params: { id: string }; result: LoginState };
  'accounts.login.code': { params: { id: string; code: string }; result: AgentAccount };
  'accounts.login.cancel': { params: { id: string }; result: void };
  // Skills handed to chat runs (blueprint AGENT_BRIDGE/05)
  'skills.list': { params: void; result: SkillsOverview };
  'skills.create': { params: { name: string; description: string; body: string }; result: Skill };
  'skills.import': { params: { dir: string }; result: Skill };
  'skills.update': { params: { id: string; enabled: boolean }; result: Skill };
  'skills.delete': { params: { id: string }; result: void };
  'skills.read': { params: { id: string }; result: { content: string } };
  // External MCP servers handed to chat runs (blueprint AGENT_BRIDGE/05)
  'mcp.list': { params: void; result: McpServer[] };
  'mcp.save': { params: McpServerInput; result: McpServer };
  'mcp.delete': { params: { id: string }; result: void };
  'mcp.test': { params: { id: string }; result: McpTestResult };
  'mcp.importCandidates': { params: void; result: McpImportCandidate[] };
  'mcp.import': { params: { source: McpImportSource; names: string[] }; result: McpServer[] };
}

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
  /** Thumbnails (data URLs) of the images a user message carried. */
  images?: string[];
  /** Orchestrate mode: set on every message of a lead thread and of its worker threads. */
  orchestra?: OrchestraMeta;
  ts: number;
};
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
export type ChatRunEvent = { runId: string; docId: string; threadId: string; agent: string; persona: string; status: 'running' | 'finished' | 'failed' | 'stopped' };
export type MethodName = keyof CoreMethods;
export type Params<M extends MethodName> = CoreMethods[M]['params'];
export type Result<M extends MethodName> = CoreMethods[M]['result'];

export interface CoreEvents {
  'doc.applied': AppliedEvent;
  'workspace.changed': DocSummary[];
  'activity': ActivityEntry;
  'agents.changed': AgentClient[];
  'selection.changed': { docId: string; ids: string[]; by: Author };
  'render.request': { requestId: string; docId: string; nodeId: string; scale: number };
  'chat.message': ChatMessage;
  /** Text the agent is still writing (whole text so far); '' clears it. */
  'chat.delta': { docId: string; runId: string; threadId: string; agent: string; text: string };
  'chat.run': ChatRunEvent;
  /** Where an agent session just worked; the canvas moves its cursor along the steps. */
  'agent.trail': AgentTrail;
  /** Accounts or a sign-in changed; clients re-read `accounts.overview`. */
  'accounts.changed': { accountId?: string };
  /** Skills or MCP servers changed; clients re-read `skills.list` / `mcp.list`. */
  'skills.changed': Record<string, never>;
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
