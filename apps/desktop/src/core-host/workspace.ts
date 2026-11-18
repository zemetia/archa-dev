import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { ArchaDocument, DocumentError, DocumentSession, subtreeHash } from '@archa/core';
import { decodeArcha, encodeArcha, exportSvg } from '@archa/formats';
import { newId, opSchema, type Author, type Op } from '@archa/schema';
import type { ActivityEntry, AgentClient, Channel, ClientInfo, CoreEvents, CoreMethods, DocSummary, EventName, Message, MethodName } from '@archa/protocol';
import { z } from 'zod';
import { AgentExecutor, describeState } from './execute';
import { ADAPTERS, ChatRunner, findBin, type McpCommand } from './agents';
import { AccountManager } from './accounts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The `archa` CLI bundle: ARCHA_CLI override, else the monorepo build next to the desktop app (dev). */
export function cliPath(): string {
  return process.env.ARCHA_CLI ?? resolve(__dirname, '../../../cli/dist/archa.cjs');
}

export function mcpCommand(): McpCommand {
  const node = findBin('node');
  if (node) return { command: node, args: [cliPath(), 'mcp'], env: {} };
  return { command: process.execPath, args: [cliPath(), 'mcp'], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

export type Connection = { id: string; channel: Channel; client: ClientInfo; author: Author; connectedAt: number };

type Handler<M extends MethodName> = (params: CoreMethods[M]['params'], conn: Connection) => Promise<CoreMethods[M]['result']> | CoreMethods[M]['result'];

/** All open documents and every connected client. The single writer (blueprint ARCHITECTURE/04). */
export class Workspace {
  readonly sessions = new Map<string, DocumentSession>();
  readonly connections = new Map<string, Connection>();
  readonly selection = new Map<string, string[]>();
  readonly activity: ActivityEntry[] = [];
  private renderWaiters = new Map<string, (r: { png?: string; error?: string }) => void>();
  private executors = new Map<string, AgentExecutor>();
  private sentHashes = new Map<string, string>();
  private lastDocId: string | null = null;
  readonly accounts = new AccountManager((accountId) => this.broadcast('accounts.changed', accountId ? { accountId } : {}));
  readonly chat = new ChatRunner(this, mcpCommand);

  constructor() {
    this.newDoc('Untitled');
  }

  /* ------------------------------ connections ------------------------------ */

  attach(channel: Channel, client: ClientInfo): Connection {
    const id = newId();
    const author: Author = client.kind === 'renderer'
      ? { kind: 'user', id: `window-${id}`, name: 'You' }
      : { kind: 'agent', id: client.agentId ?? client.name, name: client.name };
    const conn: Connection = { id, channel, client, author, connectedAt: Date.now() };
    this.connections.set(id, conn);
    channel.onMessage((msg) => void this.onMessage(conn, msg));
    if (client.kind !== 'renderer') this.broadcast('agents.changed', this.agents());
    return conn;
  }

  detach(conn: Connection) {
    this.connections.delete(conn.id);
    this.executors.delete(conn.id);
    if (conn.client.kind !== 'renderer') this.broadcast('agents.changed', this.agents());
  }

  agents(): AgentClient[] {
    return [...this.connections.values()].filter((c) => c.client.kind !== 'renderer').map((c) => ({ id: c.id, name: c.client.name, kind: c.client.kind, connectedAt: c.connectedAt }));
  }

  broadcast<E extends EventName>(event: E, data: CoreEvents[E]) {
    for (const c of this.connections.values()) c.channel.send({ t: 'evt', event, data });
  }

  private async onMessage(conn: Connection, msg: Message) {
    if (msg.t !== 'req') return;
    const handler = (this.handlers as Record<string, Handler<MethodName>>)[msg.method];
    try {
      if (!handler) throw new DocumentError('NOT_FOUND', `Unknown method ${msg.method}`);
      const result = await handler(msg.params as never, conn);
      conn.channel.send({ t: 'res', id: msg.id, ok: true, result });
    } catch (e) {
      const err = e as Error & { code?: string };
      conn.channel.send({ t: 'res', id: msg.id, ok: false, error: { code: err.code ?? 'INTERNAL', message: err.message } });
    }
  }

  /* -------------------------------- documents ------------------------------- */

  summaries(): DocSummary[] {
    return [...this.sessions.values()].map((s) => ({ id: s.id, name: s.doc.meta.name, filePath: s.filePath, dirty: s.dirty, revision: s.revision }));
  }

  private register(session: DocumentSession) {
    this.sessions.set(session.id, session);
    this.lastDocId = session.id;
    session.onApplied((a) => this.broadcast('doc.applied', a));
    this.broadcast('workspace.changed', this.summaries());
    return session.id;
  }

  newDoc(name: string) {
    return this.register(new DocumentSession(ArchaDocument.create(name)));
  }

  session(docId?: string): DocumentSession {
    const id = docId ?? this.lastDocId ?? [...this.sessions.keys()][0];
    const s = id ? this.sessions.get(id) : undefined;
    if (!s) throw new DocumentError('NOT_FOUND', docId ? `Document ${docId} is not open` : 'No document is open in ArchaDev');
    return s;
  }

  log(docId: string, author: Author, tool: string, text: string, nodeIds: string[] = []) {
    const entry: ActivityEntry = { id: newId(), ts: Date.now(), docId, author, tool, text, nodeIds };
    this.activity.push(entry);
    if (this.activity.length > 2000) this.activity.shift();
    this.broadcast('activity', entry);
  }

  /** Asks a connected window to rasterise a node (the renderer owns the canvas engine). */
  requestRender(docId: string, nodeId: string, scale: number): Promise<{ png?: string; error?: string }> {
    const renderer = [...this.connections.values()].find((c) => c.client.kind === 'renderer');
    if (!renderer) return Promise.resolve({ error: 'No ArchaDev window is open to render screenshots' });
    const requestId = newId();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.renderWaiters.delete(requestId); resolve({ error: 'render timed out' }); }, 10_000);
      this.renderWaiters.set(requestId, (r) => { clearTimeout(timer); resolve(r); });
      renderer.channel.send({ t: 'evt', event: 'render.request', data: { requestId, docId, nodeId, scale } });
    });
  }

  /** Returns `unchanged` when this client already received the same subtree hash. */
  async screenshot(conn: Connection, docId: string, nodeId: string, scale = 1) {
    const s = this.session(docId);
    const node = s.doc.require(nodeId);
    const key = `${conn.id}:${nodeId}:${scale}`;
    const hash = subtreeHash(s.doc, nodeId);
    if (this.sentHashes.get(key) === hash) return { nodeId, name: node.name, unchanged: true };
    const longest = Math.max(node.width, node.height) * scale;
    const fit = longest > 1568 ? (1568 / longest) * scale : scale;
    const r = await this.requestRender(s.id, nodeId, fit);
    if (r.png) this.sentHashes.set(key, hash);
    return { nodeId, name: node.name, png: r.png, error: r.error };
  }

  private executor(conn: Connection) {
    let ex = this.executors.get(conn.id);
    if (!ex) { ex = new AgentExecutor(this, conn); this.executors.set(conn.id, ex); }
    return ex;
  }

  /* -------------------------------- handlers -------------------------------- */

  readonly handlers: { [M in MethodName]: Handler<M> } = {
    'workspace.list': () => this.summaries(),
    'doc.new': ({ name }) => ({ docId: this.newDoc(name ?? 'Untitled') }),
    'doc.open': async ({ path }) => {
      const existing = [...this.sessions.values()].find((s) => s.filePath === path);
      if (existing) return { docId: existing.id };
      const data = decodeArcha(new Uint8Array(await readFile(path)));
      if (this.sessions.has(data.meta.id)) data.meta.id = newId();
      const s = new DocumentSession(data, path);
      s.dirty = false;
      return { docId: this.register(s) };
    },
    'doc.save': async ({ docId, path }) => {
      const s = this.session(docId);
      const target = path ?? s.filePath;
      if (!target) throw new DocumentError('VALIDATION', 'No file path yet — choose where to save');
      const tmp = `${target}.tmp`;
      await writeFile(tmp, encodeArcha(s.doc.toData()));
      await rename(tmp, target);
      s.filePath = target;
      s.dirty = false;
      if (path && s.doc.meta.name === 'Untitled') s.doc.meta.name = basename(target).replace(/\.archa$/i, '');
      this.broadcast('workspace.changed', this.summaries());
      return { path: target };
    },
    'doc.close': ({ docId }) => {
      this.sessions.delete(docId);
      if (!this.sessions.size) this.newDoc('Untitled');
      this.lastDocId = [...this.sessions.keys()].at(-1) ?? null;
      this.broadcast('workspace.changed', this.summaries());
    },
    'doc.rename': ({ docId, name }) => {
      this.session(docId).doc.meta.name = name;
      this.broadcast('workspace.changed', this.summaries());
    },
    'doc.snapshot': ({ docId }) => {
      const s = this.session(docId);
      return { data: s.doc.toData(), revision: s.revision };
    },
    'doc.apply': ({ docId, baseRevision, ops, label }, conn) => {
      const parsed = z.array(opSchema).safeParse(ops);
      if (!parsed.success) throw new DocumentError('VALIDATION', `Invalid ops: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      const s = this.session(docId);
      const wasDirty = s.dirty;
      const a = s.apply({ author: conn.author, label, baseRevision, ops: ops as Op[] });
      if (!wasDirty) this.broadcast('workspace.changed', this.summaries());
      return { revision: a.revision, txnId: a.txnId };
    },
    'doc.undo': ({ docId }, conn) => {
      const a = this.session(docId).undo(conn.author);
      return a ? { revision: a.revision } : null;
    },
    'doc.redo': ({ docId }, conn) => {
      const a = this.session(docId).redo(conn.author);
      return a ? { revision: a.revision } : null;
    },
    'selection.set': ({ docId, ids }, conn) => {
      this.selection.set(docId, ids);
      this.lastDocId = docId;
      this.broadcast('selection.changed', { docId, ids, by: conn.author });
    },
    'render.respond': ({ requestId, png, error }) => {
      this.renderWaiters.get(requestId)?.({ png, error });
      this.renderWaiters.delete(requestId);
    },
    'agents.list': () => this.agents(),
    'activity.list': ({ docId, limit }) => this.activity.filter((a) => !docId || a.docId === docId).slice(-(limit ?? 200)),
    'agent.state': ({ docId }) => describeState(this, this.session(docId)),
    'agent.execute': (params, conn) => this.executor(conn).run(this.session(params.docId), params),
    'agent.screenshot': async ({ docId, node, scale }, conn) => {
      const s = this.session(docId);
      const id = resolveRef(s, node);
      const r = await this.screenshot(conn, s.id, id, scale ?? 1);
      if (r.error) throw new DocumentError('CONFLICT', r.error);
      this.log(s.id, conn.author, 'screenshot', `Screenshot "${r.name}"`, [id]);
      return r;
    },
    'agent.exportSvg': ({ docId, node }) => {
      const s = this.session(docId);
      return { svg: exportSvg(s.doc, resolveRef(s, node)) };
    },
    'agent.say': ({ docId, text, nodeId }, conn) => {
      const s = this.session(docId);
      this.log(s.id, conn.author, 'say', text, nodeId ? [resolveRef(s, nodeId)] : []);
    },
    'app.info': () => {
      const m = mcpCommand();
      return {
        version: '0.1.0',
        cliPath: cliPath(),
        mcpCommand: [m.command, ...m.args],
        agents: ADAPTERS.map((a) => ({ id: a.id, label: a.label, available: !!findBin(a.bin) && existsSync(cliPath()), models: a.models })),
      };
    },
    'export.save': async ({ docId, nodeId, format, path, png }) => {
      const s = this.session(docId);
      const data = format === 'svg' ? exportSvg(s.doc, nodeId) : Buffer.from(png ?? '', 'base64');
      await writeFile(path, data);
      return { path };
    },
    'chat.send': ({ docId, agent, model, account, prompt }) => ({ runId: this.chat.send(this.session(docId).id, agent, prompt, model, account) }),
    'chat.stop': ({ runId }) => this.chat.stop(runId),
    'chat.list': ({ docId }) => this.chat.messages.get(docId) ?? [],
    'accounts.overview': () => this.accounts.overview(),
    'accounts.create': (p) => this.accounts.create(p),
    'accounts.update': (p) => this.accounts.update(p),
    'accounts.delete': (p) => this.accounts.delete(p),
    'accounts.captureHost': (p) => this.accounts.captureHost(p),
    'accounts.useOnHost': (p) => this.accounts.useOnHost(p),
    'accounts.login.start': (p) => this.accounts.startLogin(p),
    'accounts.login.code': (p) => this.accounts.submitCode(p),
    'accounts.login.cancel': (p) => this.accounts.cancelLogin(p),
  };
}

export function resolveRef(s: DocumentSession, ref: string): string {
  if (s.doc.get(ref)) return ref;
  const byName = s.doc.findByName(ref);
  if (byName.length === 1) return byName[0]!.id;
  if (byName.length > 1) throw new DocumentError('VALIDATION', `Name "${ref}" matches ${byName.length} nodes — use an id`);
  throw new DocumentError('NOT_FOUND', `No node with id or name "${ref}"`);
}
