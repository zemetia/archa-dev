import { normalize, resolve as resolvePath } from 'node:path';
import { ArchaDocument, DocumentError, DocumentSession } from '@archa/core';
import { newId, type Author } from '@archa/schema';
import type { ActivityEntry, AgentClient, Channel, ClientInfo, CoreEvents, DocSummary, EventName, Shot, TrailStep } from '@archa/protocol';
import { assetDirFor, dataDirFor, docPaths, externalizeOps } from '@archa/protocol/node';
import { describeState, type RenderReply, type ToolHost } from '@archa/mcp';
import type { ChatHost } from '@archa/agents';
import { contextKey, projectRoot } from './projects';
import { IconStore } from './stores/icons';
import { LibraryStore } from './stores/library';
import { takeScreenshot } from './screenshot';

/** threadId: the chat thread of a launched run's `archa mcp`; its trail is tagged with it. */
export type Connection = { id: string; channel: Channel; client: ClientInfo; author: Author; connectedAt: number; threadId?: string };

/**
 * State every domain module shares: open documents, connected clients, selection, activity and the
 * render round-trip to a window. The single writer (blueprint ARCHITECTURE/04). Domain stores that
 * only one module uses live in that module, not here.
 */
export class HostContext implements ToolHost, ChatHost {
  readonly sessions = new Map<string, DocumentSession>();
  readonly connections = new Map<string, Connection>();
  readonly selection = new Map<string, string[]>();
  readonly activity: ActivityEntry[] = [];
  /** Read by `execute` (fromLibrary, icon) and get_state, so they sit here rather than in their modules. */
  readonly library = new LibraryStore();
  readonly icons = new IconStore();
  lastDocId: string | null = null;
  /** Window context of each document: a project folder, or null (public). */
  readonly projects = new Map<string, string | null>();
  /** Called after every broadcast (auto-save and open-file tracking listen here). */
  afterBroadcast: (<E extends EventName>(event: E, data: CoreEvents[E]) => void) | null = null;
  private renderWaiters = new Map<string, (r: RenderReply) => void>();
  /** Subtree hash of the last screenshot each client got, per node and scale. */
  readonly sentHashes = new Map<string, string>();

  broadcast<E extends EventName>(event: E, data: CoreEvents[E]) {
    for (const c of this.connections.values()) c.channel.send({ t: 'evt', event, data });
    this.afterBroadcast?.(event, data);
  }

  agents(): AgentClient[] {
    return [...this.connections.values()].filter((c) => c.client.kind !== 'renderer').map((c) => ({ id: c.id, name: c.author.name ?? c.client.name, kind: c.client.kind, connectedAt: c.connectedAt }));
  }

  /* -------------------------------- documents ------------------------------- */

  summaries(): DocSummary[] {
    return [...this.sessions.values()].map((s) => ({ id: s.id, name: s.doc.meta.name, filePath: s.filePath, dataDir: this.dataDir(s), assetDir: this.assetDir(s), dirty: s.dirty, revision: s.revision, project: this.projectOf(s.id) }));
  }

  projectOf(docId: string | null): string | null {
    return docId ? this.projects.get(docId) ?? null : null;
  }

  /** The open documents of one window context (a project folder, or null = public). */
  inContext(project: string | null): DocumentSession[] {
    const key = contextKey(project);
    return [...this.sessions.values()].filter((s) => contextKey(this.projectOf(s.id)) === key);
  }

  /** The document's `<name>-data/` folder (assets, chats, skills, memory); a runtime folder while it has no file. */
  dataDir(s: DocumentSession | string): string {
    const session = typeof s === 'string' ? this.session(s) : s;
    return dataDirFor(session.filePath, session.id);
  }

  /**
   * The data folder agents and stores should use: the given document's, or without `docId` the one the
   * person used last. Null when that document is not open (or none is).
   */
  activeDataDir(docId?: string): string | null {
    const s = this.findSession(docId);
    return s ? this.dataDir(s) : null;
  }

  /** `<name>-data/skills/`: the document's own skills; undefined when no document is open. */
  skillsDir(docId?: string): string | undefined {
    const dir = this.activeDataDir(docId);
    return dir ? docPaths(dir).skills() : undefined;
  }

  /** `<name>-data/assets/`: where the document's `asset:` references resolve. */
  assetDir(s: DocumentSession | string): string {
    const session = typeof s === 'string' ? this.session(s) : s;
    return assetDirFor(session.filePath, session.id);
  }

  register(session: DocumentSession, project: string | null = null) {
    // No base64 in documents: images arriving as data: URLs are written to the asset folder first.
    session.transformOps = (ops) => externalizeOps(this.assetDir(session), ops);
    this.sessions.set(session.id, session);
    this.projects.set(session.id, project ? projectRoot(project) : null);
    this.lastDocId = session.id;
    session.onApplied((a) => this.broadcast('doc.applied', a));
    this.broadcast('workspace.changed', this.summaries());
    return session.id;
  }

  newDoc(name: string, project: string | null = null) {
    return this.register(new DocumentSession(ArchaDocument.create(name)), project);
  }

  /** Forgets a closed document; the window it was in keeps one open. */
  forget(docId: string) {
    const project = this.projectOf(docId);
    this.sessions.delete(docId);
    this.projects.delete(docId);
    if (!this.inContext(project).length) this.newDoc('Untitled', project);
    if (!this.lastDocId || !this.sessions.has(this.lastDocId)) this.lastDocId = this.inContext(project).at(-1)?.id ?? null;
  }

  /**
   * A document by id, `.archa` path or unique name; without one, the document the person used last.
   * Agents pass `doc` on any MCP tool to work on a document that is not the active one.
   */
  session(ref?: string): DocumentSession {
    const found = this.findSession(ref);
    if (found) return found;
    if (!ref) throw new DocumentError('NOT_FOUND', 'No document is open in ArchaDev');
    const all = [...this.sessions.values()];
    const byName = all.filter((s) => s.doc.meta.name === ref);
    const open = all.map((s) => `${s.doc.meta.name} (${s.id})`).join(', ');
    if (byName.length > 1) throw new DocumentError('VALIDATION', `${byName.length} open documents are named "${ref}" — pass the id. Open: ${open}`);
    throw new DocumentError('NOT_FOUND', `Document "${ref}" is not open. Open: ${open || 'none'}`);
  }

  /** Like `session`, but null instead of an error when nothing (or more than one document) matches. */
  findSession(ref?: string): DocumentSession | null {
    if (!ref) {
      const id = this.lastDocId ?? [...this.sessions.keys()][0];
      return (id && this.sessions.get(id)) || null;
    }
    const byId = this.sessions.get(ref);
    if (byId) return byId;
    const all = [...this.sessions.values()];
    const key = (p: string) => normalize(resolvePath(p)).toLowerCase();
    const byPath = /[\\/]|\.archa$/i.test(ref) ? all.find((s) => s.filePath && key(s.filePath) === key(ref)) : undefined;
    if (byPath) return byPath;
    const byName = all.filter((s) => s.doc.meta.name === ref);
    return byName.length === 1 ? byName[0]! : null;
  }

  /** The `get_state` text (ChatHost: pre-injected into prompts). */
  describe(s: DocumentSession): string {
    return describeState(this, s);
  }

  /* ------------------------------ agent activity ----------------------------- */

  log(docId: string, author: Author, tool: string, text: string, nodeIds: string[] = [], runId?: string) {
    const entry: ActivityEntry = { id: newId(), ts: Date.now(), docId, author, tool, text, nodeIds, ...(runId ? { runId } : {}) };
    this.activity.push(entry);
    if (this.activity.length > 2000) this.activity.shift();
    this.broadcast('activity', entry);
  }

  /** Moves the session's cursor on the canvas along the steps of one tool call. */
  trail(conn: Pick<Connection, 'author' | 'client' | 'threadId'>, docId: string, steps: TrailStep[]) {
    if (!steps.length || conn.author.kind !== 'agent') return;
    this.broadcast('agent.trail', { docId, author: conn.author, steps, ...(conn.client.runId ? { runId: conn.client.runId } : {}), ...(conn.threadId ? { threadId: conn.threadId } : {}) });
  }

  /* --------------------------------- render --------------------------------- */

  /** Asks a connected window to rasterise a node (the renderer owns the canvas engine). */
  requestRender(docId: string, nodeId: string, scale: number, slice?: number): Promise<RenderReply> {
    return this.askRenderer('render.request', (requestId) => ({ requestId, docId, nodeId, scale, ...(slice ? { slice } : {}) }));
  }

  /** Sends a request event to a window (the renderer owns canvas, pdf.js and pixels) and waits for `render.respond`. */
  askRenderer<E extends 'render.request' | 'render.reference' | 'render.compare'>(event: E, data: (requestId: string) => CoreEvents[E], timeoutMs = 120_000): Promise<RenderReply> {
    const renderer = [...this.connections.values()].find((c) => c.client.kind === 'renderer');
    if (!renderer) return Promise.resolve({ error: 'No ArchaDev window is open to render' });
    const requestId = newId();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.renderWaiters.delete(requestId); resolve({ error: 'render timed out' }); }, timeoutMs);
      this.renderWaiters.set(requestId, (r) => { clearTimeout(timer); resolve(r); });
      renderer.channel.send({ t: 'evt', event, data: data(requestId) });
    });
  }

  /** A window's answer to askRenderer. */
  resolveRender(requestId: string, reply: RenderReply) {
    this.renderWaiters.get(requestId)?.(reply);
    this.renderWaiters.delete(requestId);
  }

  screenshot(conn: Pick<Connection, 'id'>, docId: string, nodeId: string, scale = 1, opts: { slices?: boolean } = {}): Promise<Shot> {
    return takeScreenshot(this, conn.id, docId, nodeId, scale, opts);
  }
}
