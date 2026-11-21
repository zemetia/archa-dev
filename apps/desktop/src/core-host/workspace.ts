import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { ArchaDocument, DocumentError, DocumentSession, findEmptySpace, libraryInsertOps, outline, subtreeHash } from '@archa/core';
import { decodeArcha, encodeArcha, exportHtml, exportHtmlStandalone, exportSvg } from '@archa/formats';
import { newId, opSchema, type Author, type Op } from '@archa/schema';
import { browserCommandSchema, placeImageSchema, type ActivityEntry, type TrailStep, type AgentClient, type Channel, type ClientInfo, type CoreEvents, type CoreMethods, type DocSummary, type EventName, type Message, type MethodName } from '@archa/protocol';
import { z } from 'zod';
import { AgentExecutor, describeState } from './execute';
import { ADAPTERS, ChatRunner, findBin, type McpCommand } from './agents';
import { AccountManager, parse, resolveCli } from './accounts';
import { LibraryStore, libraryInsertSchema, libraryItemSchema, libraryPublishSchema } from './library';
import { IconStore, iconsAddSchema, iconsRemoveSchema } from './icons';
import { SkillManager } from './skills';
import { McpServerManager } from './mcp-servers';
import { callBrowser } from './main-bridge';
import { randomPersona } from './personas';

const chatSendSchema = z.object({
  docId: z.string().min(1), agent: z.string().min(1), prompt: z.string().min(1).max(100_000),
  model: z.string().max(100).optional(), account: z.string().max(100).optional(), threadId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  now: z.boolean().optional(), focus: z.array(z.string().min(1).max(100)).max(50).optional(), mode: z.enum(['chat', 'orchestrate']).optional(),
  images: z.array(z.object({
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    data: z.string().min(1).max(15_000_000).regex(/^[A-Za-z0-9+/]+=*$/),
    thumb: z.string().max(300_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
  })).max(6).optional(),
});
const chatWarmSchema = z.object({
  docId: z.string().min(1), agent: z.string().min(1), model: z.string().max(100).optional(), account: z.string().max(100).optional(),
  threadId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});
const agentModelsSchema = z.object({ agent: z.enum(['claude', 'agy', 'codex']), account: z.string().max(100).optional() });
const clientInfoSchema = z.object({
  kind: z.enum(['renderer', 'cli', 'mcp']), name: z.string().min(1).max(200), agentId: z.string().max(200).optional(),
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});
const exportSaveSchema = z.object({
  docId: z.string().min(1), nodeId: z.string().min(1), format: z.enum(['png', 'jpg', 'svg', 'html', 'tailwind']),
  path: z.string().min(1).max(4096).refine((p) => isAbsolute(p), 'Export path must be absolute'),
  image: z.string().max(200_000_000).optional(),
});
const exportPageSchema = z.object({ docId: z.string().min(1), nodeId: z.string().min(1) });
const exportCodeSchema = z.object({ docId: z.string().min(1), nodeId: z.string().min(1), style: z.enum(['css', 'tailwind']) });
const outlineSchema = z.object({ docId: z.string().optional(), node: z.string().min(1).optional(), depth: z.number().int().min(0).max(12).optional() });
const orchestraDelegateSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(120), prompt: z.string().min(1).max(40_000), kind: z.string().max(40).optional(),
    agent: z.enum(['claude', 'agy', 'codex']).optional(), model: z.string().max(100).optional(), frame: z.string().min(1).max(100).optional(),
  })).min(1).max(8),
});
const orchestraWaitSchema = z.object({ workers: z.array(z.string().min(1).max(100)).max(8).optional(), timeoutSec: z.number().min(5).max(600).optional() });
const orchestraTellSchema = z.object({ worker: z.string().min(1).max(100), message: z.string().min(1).max(40_000) });
const chatThreadSchema = z.object({ docId: z.string().min(1), threadId: z.string().min(1).max(64) });
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

/** threadId: the chat thread of a launched run's `archa mcp`; its trail is tagged with it. */
export type Connection = { id: string; channel: Channel; client: ClientInfo; author: Author; connectedAt: number; threadId?: string };

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
  readonly skills = new SkillManager(() => this.broadcast('skills.changed', {}));
  readonly mcpServers = new McpServerManager(() => this.broadcast('mcp.changed', {}));
  readonly chat = new ChatRunner(this, mcpCommand);
  readonly library = new LibraryStore();
  readonly icons = new IconStore();

  constructor() {
    this.newDoc('Untitled');
  }

  /* ------------------------------ connections ------------------------------ */

  attach(channel: Channel, raw: ClientInfo): Connection {
    const id = newId();
    const client = clientInfoSchema.parse(raw);
    // Agents work under a session name, never the CLI id: a launched run takes its thread's name,
    // a terminal (listen-mode) agent gets one per connection (blueprint AGENT_BRIDGE/03 → Sessions).
    const run = client.runId ? this.chat.identity(client.runId) : null;
    const taken = [...this.connections.values()].map((c) => c.author.name ?? '');
    const author: Author = client.kind === 'renderer'
      ? { kind: 'user', id: `window-${id}`, name: 'You' }
      : run
        ? { kind: 'agent', id: `${run.agent}:${run.threadId}`, name: run.persona }
        : { kind: 'agent', id: `${client.agentId ?? client.name}:${id}`, name: randomPersona([], [...taken, ...this.chat.active().map((r) => r.persona)]) };
    const conn: Connection = { id, channel, client, author, connectedAt: Date.now(), ...(run ? { threadId: run.threadId } : {}) };
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
    return [...this.connections.values()].filter((c) => c.client.kind !== 'renderer').map((c) => ({ id: c.id, name: c.author.name ?? c.client.name, kind: c.client.kind, connectedAt: c.connectedAt }));
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

  log(docId: string, author: Author, tool: string, text: string, nodeIds: string[] = [], runId?: string) {
    const entry: ActivityEntry = { id: newId(), ts: Date.now(), docId, author, tool, text, nodeIds, ...(runId ? { runId } : {}) };
    this.activity.push(entry);
    if (this.activity.length > 2000) this.activity.shift();
    this.broadcast('activity', entry);
  }

  /** Moves the session's cursor on the canvas along the steps of one tool call. */
  trail(conn: Connection, docId: string, steps: TrailStep[]) {
    if (!steps.length || conn.author.kind !== 'agent') return;
    this.broadcast('agent.trail', { docId, author: conn.author, steps, ...(conn.client.runId ? { runId: conn.client.runId } : {}), ...(conn.threadId ? { threadId: conn.threadId } : {}) });
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
      this.log(s.id, conn.author, 'screenshot', `Screenshot "${r.name}"`, [id], conn.client.runId);
      this.trail(conn, s.id, [trailStep(s, 'look', id)]);
      return r;
    },
    'agent.exportSvg': ({ docId, node }, conn) => {
      const s = this.session(docId);
      const id = resolveRef(s, node);
      this.trail(conn, s.id, [trailStep(s, 'read', id)]);
      return { svg: exportSvg(s.doc, id) };
    },
    'agent.outline': (params, conn) => {
      const { docId, node, depth } = parse(outlineSchema, params);
      const s = this.session(docId);
      const sel = (this.selection.get(s.id) ?? []).filter((id) => s.doc.get(id));
      const ids = node ? [resolveRef(s, node)] : sel.length ? sel : [s.doc.pages[0]!.rootId];
      const read = ids.filter((id) => id !== s.doc.pages[0]!.rootId).slice(0, 5);
      if (read.length) this.trail(conn, s.id, read.map((id) => trailStep(s, 'read', id)));
      const head = node ? '' : sel.length ? `Selection (${sel.length}):\n` : 'Nothing selected — the page:\n';
      return head + ids.map((id) => outline(s.doc, id, depth ?? (id === s.doc.pages[0]!.rootId ? 1 : 3))).join('\n');
    },
    'agent.say': ({ docId, text, nodeId }, conn) => {
      const s = this.session(docId);
      const id = nodeId ? resolveRef(s, nodeId) : null;
      this.log(s.id, conn.author, 'say', text, id ? [id] : [], conn.client.runId);
      if (id) this.trail(conn, s.id, [trailStep(s, 'focus', id)]);
    },
    'agent.done': ({ docId, summary }, conn) => {
      const s = this.session(docId);
      this.log(s.id, conn.author, 'done', summary?.trim() ? summary.trim().slice(0, 300) : 'Done', [], conn.client.runId);
      this.broadcast('agent.done', { docId: s.id, author: conn.author, ...(conn.client.runId ? { runId: conn.client.runId } : {}) });
    },
    'agent.browser': async (params, conn) => {
      const parsed = browserCommandSchema.safeParse(params);
      if (!parsed.success) throw new DocumentError('VALIDATION', `Invalid browser input: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      const cmd = parsed.data;
      const { text, png } = await callBrowser(cmd, conn.author.name ?? conn.author.id);
      const detail = (cmd.url ?? cmd.query ?? cmd.ref ?? cmd.selector ?? cmd.key ?? (cmd.text !== undefined ? `"${cmd.text.slice(0, 40)}"` : '')).slice(0, 120);
      this.log(this.session().id, conn.author, 'browser', `Browser · ${cmd.action}${detail ? ` ${detail}` : ''}`, [], conn.client.runId);
      // The canvas-ready copy of a download stays here; the agent gets the text and the preview.
      return { text, png };
    },
    'agent.placeImage': async (params, conn) => {
      const { docId, url, ref, selector, capture, path, ...place } = parse(placeImageSchema, params);
      if (!url && !ref && !selector) throw new DocumentError('VALIDATION', 'place_image needs url (web address, data: URL or file path), or ref/selector of an image on the open browser page.');
      const s = this.session(docId);
      const { image } = await callBrowser({ action: 'download', url, ref, selector, capture, path }, conn.author.name ?? conn.author.id);
      if (!image?.embed) throw new DocumentError('VALIDATION', `ArchaDev cannot show ${image?.mime ?? 'that file'} on the canvas. Saved to ${image?.path ?? '?'} — use capture: true with the element on the browser page for a PNG.`);
      const r = await this.executor(conn).placeImage(s, image.embed, { ...place, name: place.name ?? basename(image.path).replace(/(-\d+)?\.[^.]+$/, ''), naturalWidth: image.width || undefined, naturalHeight: image.height || undefined });
      if (r.ok) r.output.push(`Saved file: ${image.path} (${image.mime}, from ${image.source.slice(0, 200)})`);
      return r;
    },
    'app.info': () => {
      const m = mcpCommand();
      return {
        version: '1.5.0',
        user: userName(),
        cliPath: cliPath(),
        mcpCommand: [m.command, ...m.args],
        agents: ADAPTERS.map((a) => ({ id: a.id, label: a.label, available: !!resolveCli(a.bin) && existsSync(cliPath()) })),
      };
    },
    'export.save': async (params) => {
      const { docId, nodeId, format, path, image } = parse(exportSaveSchema, params);
      const s = this.session(docId);
      if (format === 'png' || format === 'jpg') {
        if (!image) throw new DocumentError('VALIDATION', `${format.toUpperCase()} export needs the rendered image`);
        await writeFile(path, Buffer.from(image, 'base64'));
        return { files: [path] };
      }
      if (format === 'svg') {
        await writeFile(path, exportSvg(s.doc, nodeId));
        return { files: [path] };
      }
      // HTML: the page goes where the person chose; its CSS and image assets go next to it.
      const dir = dirname(path);
      const files = exportHtml(s.doc, nodeId, { style: format === 'tailwind' ? 'tailwind' : 'css', name: basename(path, extname(path)) });
      const written: string[] = [];
      for (const f of files) {
        const target = join(dir, f.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, f.data);
        written.push(target);
      }
      return { files: written };
    },
    'export.page': (params) => {
      const { docId, nodeId } = parse(exportPageSchema, params);
      const s = this.session(docId);
      const n = s.doc.require(nodeId);
      return { html: exportHtmlStandalone(s.doc, nodeId), width: n.width, height: n.height };
    },
    'export.code': (params) => {
      const { docId, nodeId, style } = parse(exportCodeSchema, params);
      const s = this.session(docId);
      if (style === 'css') return { code: exportHtmlStandalone(s.doc, nodeId) };
      const [page] = exportHtml(s.doc, nodeId, { style: 'tailwind', inlineAssets: true });
      return { code: String(page!.data) };
    },
    'chat.send': (params) => {
      const p = parse(chatSendSchema, params);
      return this.chat.send(this.session(p.docId).id, p.agent, p.prompt, p.model, p.account, p.threadId, { now: p.now, focus: p.focus, images: p.images, mode: p.mode });
    },
    'chat.warm': (params) => {
      const p = parse(chatWarmSchema, params);
      return this.chat.warmUp(this.session(p.docId).id, p.agent, p.model, p.account, p.threadId);
    },
    'chat.stop': ({ runId }) => this.chat.stop(runId),
    // Team tools of an orchestrate lead; the connection's thread is the lead (blueprint AGENT_BRIDGE/06).
    'orchestra.delegate': (params, conn) => this.chat.delegate(conn.threadId, parse(orchestraDelegateSchema, params).tasks),
    'orchestra.wait': (params, conn) => { const p = parse(orchestraWaitSchema, params ?? {}); return this.chat.wait(conn.threadId, p.workers, p.timeoutSec); },
    'orchestra.tell': (params, conn) => { const p = parse(orchestraTellSchema, params); return this.chat.tell(conn.threadId, p.worker, p.message); },
    'chat.runs': () => this.chat.active(),
    'chat.list': ({ docId }) => this.chat.list(this.session(docId).id),
    'library.list': () => this.library.list(),
    'library.publish': (params) => {
      const p = parse(libraryPublishSchema, params);
      return this.library.publish(this.session(p.docId).doc, p.nodeId, p.library, p.png);
    },
    'library.remove': (params) => {
      const p = parse(libraryItemSchema, params);
      this.library.remove(p.library, p.id);
    },
    'icons.custom.list': () => this.icons.list(),
    'icons.custom.add': (params) => this.icons.add(parse(iconsAddSchema, params).icons),
    'icons.custom.remove': (params) => { this.icons.remove(parse(iconsRemoveSchema, params).name); },
    'library.insert': (params, conn) => {
      const p = parse(libraryInsertSchema, params);
      const s = this.session(p.docId);
      const item = this.library.read(p.library, p.id);
      if (!item) throw new DocumentError('NOT_FOUND', `Library component ${p.library}:${p.id} not found`);
      const parentId = p.parentId ?? s.doc.pages[0]!.rootId;
      const spot = p.x === undefined || p.y === undefined ? findEmptySpace(s.doc, parentId, item.width, item.height) : { x: p.x, y: p.y };
      const r = libraryInsertOps(s.doc, `${p.library}:${p.id}`, item, parentId, spot);
      const wasDirty = s.dirty;
      s.apply({ author: conn.author, label: `Insert ${item.name} from library`, baseRevision: s.revision, ops: r.ops });
      if (!wasDirty) this.broadcast('workspace.changed', this.summaries());
      return { nodeId: r.rootId, placed: r.placed };
    },
    'agents.models': (params) => {
      const p = parse(agentModelsSchema, params);
      return this.chat.models(p.agent, p.account);
    },
    'chat.deleteThread': (params) => {
      const p = parse(chatThreadSchema, params);
      this.chat.deleteThread(this.session(p.docId).id, p.threadId);
    },
    'accounts.overview': () => this.accounts.overview(),
    'accounts.create': (p) => this.accounts.create(p),
    'accounts.update': (p) => this.accounts.update(p),
    'accounts.delete': (p) => this.accounts.delete(p),
    'accounts.captureHost': (p) => this.accounts.captureHost(p),
    'accounts.useOnHost': (p) => this.accounts.useOnHost(p),
    'accounts.login.start': (p) => this.accounts.startLogin(p),
    'accounts.login.code': (p) => this.accounts.submitCode(p),
    'accounts.login.cancel': (p) => this.accounts.cancelLogin(p),
    'skills.list': () => this.skills.overview(),
    'skills.create': (p) => this.skills.create(p),
    'skills.import': (p) => this.skills.import(p),
    'skills.update': (p) => this.skills.update(p),
    'skills.delete': (p) => this.skills.delete(p),
    'skills.read': (p) => this.skills.read(p),
    'mcp.list': () => this.mcpServers.list(),
    'mcp.save': (p) => this.mcpServers.save(p),
    'mcp.delete': (p) => this.mcpServers.delete(p),
    'mcp.test': (p) => this.mcpServers.test(p),
    'mcp.importCandidates': () => this.mcpServers.importCandidates(),
    'mcp.import': (p) => this.mcpServers.import(p),
  };
}

function trailStep(s: DocumentSession, action: TrailStep['action'], id: string): TrailStep {
  return { action, nodeId: id, name: s.doc.require(id).name, bounds: s.doc.worldBounds(id) };
}

export function resolveRef(s: DocumentSession, ref: string): string {
  if (s.doc.get(ref)) return ref;
  const byName = s.doc.findByName(ref);
  if (byName.length === 1) return byName[0]!.id;
  if (byName.length > 1) throw new DocumentError('VALIDATION', `Name "${ref}" matches ${byName.length} nodes — use an id`);
  throw new DocumentError('NOT_FOUND', `No node with id or name "${ref}"`);
}

let cachedUser: string | null = null;
/** Comment author name: git's user.name when set, else the OS account. */
function userName(): string {
  if (cachedUser !== null) return cachedUser;
  try {
    cachedUser = execFileSync('git', ['config', '--global', 'user.name'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    cachedUser = '';
  }
  if (!cachedUser) {
    try { cachedUser = userInfo().username; } catch { cachedUser = 'You'; }
  }
  return cachedUser;
}
