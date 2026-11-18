import type { Author, DocumentData, Issue, Op } from '@archa/schema';

export * from './agent-docs';

/* ----------------------------------------------------------------------------
 * One protocol for every client: renderer (MessagePort), CLI / MCP (socket).
 * Blueprint ARCHITECTURE/02.
 * ------------------------------------------------------------------------- */

export type ClientKind = 'renderer' | 'cli' | 'mcp';
export type ClientInfo = { kind: ClientKind; name: string; agentId?: string };

export type DocSummary = { id: string; name: string; filePath: string | null; dirty: boolean; revision: number };
export type AppliedEvent = { docId: string; revision: number; txnId: string; author: Author; label: string; ops: Op[]; touched: string[] };
export type ActivityEntry = { id: string; ts: number; docId: string; author: Author; tool: string; text: string; nodeIds: string[] };
export type AgentClient = { id: string; name: string; kind: ClientKind; connectedAt: number };

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
  'agent.say': { params: { docId?: string; text: string; nodeId?: string }; result: void };
  // App
  'app.info': { params: void; result: AppInfo };
  'export.save': { params: { docId: string; nodeId: string; format: 'svg' | 'png'; path: string; png?: string }; result: { path: string } };
  // Chat: launch a local agent CLI on this document (blueprint AGENT_BRIDGE/03)
  'chat.send': { params: { docId: string; agent: string; model?: string; account?: string; prompt: string }; result: { runId: string } };
  'chat.stop': { params: { runId: string }; result: void };
  'chat.list': { params: { docId: string }; result: ChatMessage[] };
  // Agent login profiles (blueprint AGENT_BRIDGE/02)
  'accounts.overview': { params: void; result: AccountsOverview };
  'accounts.create': { params: { agent: AccountAgent; name: string; dir?: string; apiKey?: string }; result: AgentAccount };
  'accounts.update': { params: { id: string; name?: string; enabled?: boolean; isDefault?: boolean }; result: AgentAccount };
  'accounts.delete': { params: { id: string }; result: void };
  'accounts.captureHost': { params: { agent: 'agy' }; result: AgentAccount };
  'accounts.useOnHost': { params: { id: string }; result: void };
  'accounts.login.start': { params: { id: string }; result: LoginState };
  'accounts.login.code': { params: { id: string; code: string }; result: AgentAccount };
  'accounts.login.cancel': { params: { id: string }; result: void };
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

export type AppInfo = { version: string; cliPath: string; mcpCommand: string[]; agents: Array<{ id: string; label: string; available: boolean; models: string[] }> };

export type ChatMessage = {
  id: string;
  docId: string;
  runId: string;
  role: 'user' | 'agent' | 'tool' | 'status' | 'error';
  agent: string;
  text: string;
  ts: number;
};
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
  'chat.run': { runId: string; docId: string; status: 'running' | 'finished' | 'failed' | 'stopped' };
  /** Accounts or a sign-in changed; clients re-read `accounts.overview`. */
  'accounts.changed': { accountId?: string };
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
