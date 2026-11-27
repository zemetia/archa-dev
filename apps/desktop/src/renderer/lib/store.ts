import { create } from 'zustand';
import { applyOps, ArchaDocument } from '@archa/core';
import { RpcClient, threadOf, type AccountsOverview, type AppSettings, type ChatMode, type CustomIconInfo, type LibraryItem, type McpServer, type SkillsOverview, type BrowserState, type ExportFormat, type ActivityEntry, type AgentClient, type AppInfo, type ChatMessage, type ChatQueued, type ChatRunEvent, type DocSummary, type Message } from '@archa/protocol';
import type { Op } from '@archa/schema';
import { renderNodeImage, renderNodePng, renderNodeSlices } from '@archa/render';
import { onChatRun } from './comments';
import { markDone, pushTrail, type AgentCursor } from '../canvas/cursors';
import * as changes from '../canvas/changes';
import { readingOrder } from './geometry';

export type LeftTab = 'chat' | 'history' | 'layers' | 'components' | 'slides' | 'library';
export type Tool = 'select' | 'scale' | 'hand' | 'frame' | 'rect' | 'ellipse' | 'polygon' | 'pen' | 'text' | 'sticky' | 'embed' | 'connector' | 'comment';
/** Floating panels opened from the tool rail. */
export type RailPanel = 'variables' | 'find' | 'assets' | null;
export type Camera = { x: number; y: number; zoom: number };
type Toast = { id: number; text: string; kind: 'info' | 'error' };

type State = {
  client: RpcClient | null;
  info: AppInfo | null;
  /** The folder this window works in (a project with `.design/`), or null for the public window. */
  project: string | null;
  /** Documents of this window's context only (the core holds every window's). */
  docs: DocSummary[];
  /** App preferences (Settings → General); null until loaded. */
  settings: AppSettings | null;
  activeDocId: string | null;
  /** Read-only mirror of the core's document, updated by doc.applied events (blueprint APP_UI/03). */
  doc: ArchaDocument | null;
  rev: number;
  selection: string[];
  hover: string | null;
  tool: Tool;
  camera: Camera;
  leftTab: LeftTab;
  /** Conversation shown in the Chat tab; null = a new conversation (blueprint APP_UI/01 → Left menu). */
  chatThread: string | null;
  /** Slide view (Canva-like vertical list of slides) covers the canvas; Back or Esc returns (blueprint APP_UI/05). */
  slidesView: boolean;
  /** Lead thread whose team view fills the window (orchestrate mode); null = closed. */
  orchestraView: string | null;
  /** Mode of the next new chat; remembered per machine. */
  chatMode: ChatMode;
  /** Global library components (Library tab, DESIGN_SYSTEM/02). Loaded on demand. */
  library: LibraryItem[] | null;
  /** Sidebar visibility; remembered per machine (localStorage), never part of the document. */
  leftOpen: boolean;
  rightOpen: boolean;
  /** Chat composer text, shared by the composer and the empty-state suggestions. */
  chatDraft: string;
  agents: AgentClient[];
  activity: ActivityEntry[];
  chat: ChatMessage[];
  /** Launched runs still working, by run id. Sessions run in parallel, one per thread. */
  runs: Record<string, ChatRunEvent>;
  /** Messages waiting for a thread's running turn (pinned above the composer), by thread. */
  chatQueue: Record<string, ChatQueued[]>;
  /** Replies still being written (streamed), by thread. */
  chatLive: Record<string, { runId: string; threadId: string; agent: string; text: string }>;
  /** One cursor per agent session on the active document, by author id (canvas/cursors.ts). */
  cursors: Record<string, AgentCursor>;
  editingText: string | null;
  /** Text Effects panel (Canva-like) open beside the canvas. */
  textEffectsOpen: boolean;
  toasts: Toast[];
  fitRequest: number;
  settingsOpen: boolean;
  /** Settings page to show when it opens (deep links from chat etc.). */
  settingsPage: SettingsPage;
  /** Agent CLIs + saved login profiles (Settings → Agents, chat account picker). */
  accounts: AccountsOverview | null;
  skills: SkillsOverview | null;
  mcpServers: McpServer[] | null;
  /** In-app browser pane (blueprint BROWSER). Pages live in main; this mirrors their state. */
  browserOpen: boolean;
  browserWidth: number;
  browser: BrowserState;
  railPanel: RailPanel;
  /** Comment pins on the canvas; the eye in the Comments panel toggles them. */
  showComments: boolean;
  /** Comment whose thread popover is open (or 'new' while composing one). */
  openComment: string | null;
  /** Where a new comment goes (set by the comment tool click). */
  commentDraft: { nodeId: string | null; x: number; y: number } | null;
  /** Embed node whose page takes pointer input (double-click it; Esc leaves). */
  interactEmbed: string | null;
  /** Canvas right-click menu: screen position and the page point under it. */
  contextMenu: { x: number; y: number; world: { x: number; y: number } } | null;
  /** Icons the person uploaded (Assets → My icons); null until first loaded. */
  customIcons: CustomIconInfo[] | null;
  /** 1px grid drawn when zoomed in far enough; remembered per machine. */
  pixelGrid: boolean;
  /** Background removal in progress: the image, and the model download share (0-1) while it downloads. */
  bgJob: { nodeId: string; phase: 'download' | 'working'; progress: number } | null;
};

/** The browser pane opens at this width (fits a phone-width page) and can only be dragged wider. */
export const BROWSER_MIN_WIDTH = 360;

export const useStore = create<State>(() => ({
  client: null, info: null, project: null, docs: [], settings: null, activeDocId: null, doc: null, rev: 0,
  selection: [], hover: null, tool: 'select', camera: { x: 0, y: 0, zoom: 1 }, leftTab: 'layers', chatThread: null, slidesView: false, orchestraView: null, chatMode: readMode(), library: null,
  leftOpen: readFlag('archa.leftOpen'), rightOpen: readFlag('archa.rightOpen'), chatDraft: '',
  agents: [], activity: [], chat: [], runs: {}, chatQueue: {}, chatLive: {}, cursors: {}, editingText: null, textEffectsOpen: false, toasts: [], fitRequest: 0,
  settingsOpen: false, settingsPage: 'providers', accounts: null, skills: null, mcpServers: null,
  browserOpen: false, browserWidth: BROWSER_MIN_WIDTH, browser: { tabs: [], activeId: null, agent: null, emulated: null },
  railPanel: null, showComments: true, openComment: null, commentDraft: null, interactEmbed: null,
  contextMenu: null, customIcons: null, pixelGrid: readFlag('archa.pixelGrid'), bgJob: null,
}));

/** Switches tool and closes per-tool UI that no longer applies. */
export function setTool(tool: Tool) {
  set((s) => ({ tool, openComment: tool === 'comment' ? s.openComment : null, interactEmbed: null }));
}

export function toggleRailPanel(p: Exclude<RailPanel, null>) {
  set((s) => ({ railPanel: s.railPanel === p ? null : p }));
}

function readFlag(key: string) {
  try { return localStorage.getItem(key) !== '0'; } catch { return true; }
}

export function togglePixelGrid() {
  const next = !useStore.getState().pixelGrid;
  useStore.setState({ pixelGrid: next });
  try { localStorage.setItem('archa.pixelGrid', next ? '1' : '0'); } catch { /* storage blocked: keep in-memory state */ }
}

function readMode(): ChatMode {
  try { return localStorage.getItem('archa.chatMode') === 'orchestrate' ? 'orchestrate' : 'chat'; } catch { return 'chat'; }
}

export function togglePanel(side: 'left' | 'right', open?: boolean) {
  const key = side === 'left' ? 'leftOpen' : 'rightOpen';
  const next = open ?? !useStore.getState()[key];
  useStore.setState({ [key]: next });
  try { localStorage.setItem(`archa.${key}`, next ? '1' : '0'); } catch { /* storage blocked: keep in-memory state */ }
}

const set = useStore.setState;
const get = useStore.getState;

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++toastId, text, kind };
  set((s) => ({ toasts: [...s.toasts, t] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), kind === 'error' ? 6000 : 2500);
}

function connectPort(): Promise<RpcClient> {
  return new Promise((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type !== 'archa:core-port' || !e.ports[0]) return;
      window.removeEventListener('message', onMsg);
      const port = e.ports[0];
      const subs: Array<(m: Message) => void> = [];
      port.onmessage = (ev) => { for (const s of subs) s(ev.data as Message); };
      resolve(new RpcClient({ send: (m) => port.postMessage(m), onMessage: (cb) => subs.push(cb) }));
    };
    window.addEventListener('message', onMsg);
  });
}

/** Same folder, ignoring case and separators (Windows paths). */
const folderKey = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
export const sameProject = (a: string | null, b: string | null) => (a && b ? folderKey(a) === folderKey(b) : !a && !b);
const ownDocs = (all: DocSummary[]) => all.filter((d) => sameProject(d.project, get().project));

export async function init() {
  const [client, context] = await Promise.all([connectPort(), window.archa.windowContext()]);
  set({ client, project: context.project });

  client.on('workspace.changed', (all) => {
    const docs = ownDocs(all);
    set({ docs });
    const { activeDocId } = get();
    if (!activeDocId || !docs.some((d) => d.id === activeDocId)) void activate(docs.at(-1)?.id ?? null);
  });
  client.on('doc.applied', (e) => {
    const { doc, activeDocId } = get();
    if (!doc || e.docId !== activeDocId) return;
    if (e.revision === doc.revision + 1) {
      try {
        // Snapshot what is about to change so the change can play (canvas/changes.ts).
        const fx = changes.animates(e.author, e.label) ? changes.before(doc, e.ops, get().camera.zoom * (window.devicePixelRatio || 1)) : null;
        applyOps(doc, e.ops);
        doc.revision = e.revision;
        if (fx) changes.after(doc, fx, performance.now());
      } catch {
        void resync();
        return;
      }
    } else if (e.revision > doc.revision) {
      void resync();
      return;
    }
    set((s) => ({
      rev: s.rev + 1,
      selection: s.selection.filter((id) => doc.get(id)),
      docs: s.docs.map((d) => (d.id === e.docId ? { ...d, dirty: true, revision: e.revision } : d)),
    }));
  });
  client.on('agents.changed', (agents) => set({ agents }));
  client.on('activity', (a) => {
    set((s) => ({ activity: [...s.activity.slice(-300), a] }));
  });
  client.on('chat.message', (m) => {
    if (m.docId !== get().activeDocId) return;
    // A finished agent message replaces the streamed preview of the same run.
    // A tool row comes again with its result: replace it in place.
    const at = m.role === 'tool' && m.callId ? get().chat.findLastIndex((c) => c.id === m.id) : -1;
    if (at >= 0) { set((s) => ({ chat: s.chat.map((c, i) => (i === at ? m : c)) })); return; }
    set((s) => ({ chat: [...s.chat, m], chatLive: m.role === 'agent' && s.chatLive[threadOf(m)]?.runId === m.runId ? omit(s.chatLive, threadOf(m)) : s.chatLive }));
  });
  client.on('chat.delta', (d) => {
    if (d.docId !== get().activeDocId) return;
    set((s) => ({ chatLive: d.text ? { ...s.chatLive, [d.threadId]: { runId: d.runId, threadId: d.threadId, agent: d.agent, text: d.text } } : omit(s.chatLive, d.threadId) }));
  });
  client.on('chat.queue', (q) => {
    set((s) => ({ chatQueue: q.items.length ? { ...s.chatQueue, [q.threadId]: q.items } : omit(s.chatQueue, q.threadId) }));
  });
  client.on('chat.run', (r) => {
    onChatRun(r.runId, r.status);
    // A run started elsewhere (another window, the CLI) opens its conversation when none is shown.
    if (r.status === 'running') set((s) => ({ runs: { ...s.runs, [r.runId]: r }, chatThread: s.chatThread === null && r.docId === s.activeDocId ? r.threadId : s.chatThread }));
    else set((s) => ({ runs: omit(s.runs, r.runId) }));
  });
  client.on('agent.trail', (t) => {
    if (t.docId !== get().activeDocId) return;
    set((s) => ({ cursors: { ...s.cursors, [t.author.id]: pushTrail(s.cursors[t.author.id], t, performance.now()) } }));
  });
  client.on('agent.done', (e) => {
    const c = get().cursors[e.author.id];
    if (e.docId === get().activeDocId && c) set((s) => ({ cursors: { ...s.cursors, [e.author.id]: markDone(c) } }));
  });
  let accountsTimer: ReturnType<typeof setTimeout> | undefined;
  client.on('accounts.changed', () => { clearTimeout(accountsTimer); accountsTimer = setTimeout(() => void loadAccounts(), 120); });
  let skillsTimer: ReturnType<typeof setTimeout> | undefined;
  client.on('skills.changed', () => { clearTimeout(skillsTimer); skillsTimer = setTimeout(() => void loadSkills(), 120); });
  let mcpTimer: ReturnType<typeof setTimeout> | undefined;
  client.on('mcp.changed', () => { clearTimeout(mcpTimer); mcpTimer = setTimeout(() => void loadMcpServers(), 120); });
  client.on('render.request', async ({ requestId, docId, nodeId, scale, slice }) => {
    try {
      let doc = get().doc;
      if (!doc || get().activeDocId !== docId) {
        const snap = await client.call('doc.snapshot', { docId });
        doc = new ArchaDocument(snap.data, snap.revision);
      }
      await document.fonts.ready;
      if (slice) {
        const slices = await renderNodeSlices(doc, nodeId, scale, slice);
        await client.call('render.respond', { requestId, slices });
      } else {
        const png = await renderNodePng(doc, nodeId, scale);
        await client.call('render.respond', { requestId, png });
      }
    } catch (e) {
      await client.call('render.respond', { requestId, error: (e as Error).message });
    }
  });

  // Reference tools (pdf.js) load on first use — they are heavy and most sessions never need them.
  client.on('render.reference', async ({ requestId, url, page, scale, boxes }) => {
    try {
      const { referenceRaster } = await import('./reference');
      const r = await referenceRaster(url, page, scale, boxes);
      await client.call('render.respond', { requestId, png: r.png, colors: r.colors });
    } catch (e) {
      await client.call('render.respond', { requestId, error: (e as Error).message });
    }
  });
  client.on('render.compare', async ({ requestId, docId, nodeId, url, page, scale, slice }) => {
    try {
      let doc = get().doc;
      if (!doc || get().activeDocId !== docId) {
        const snap = await client.call('doc.snapshot', { docId });
        doc = new ArchaDocument(snap.data, snap.revision);
      }
      const { compareToReference } = await import('./reference');
      const r = await compareToReference(doc, nodeId, url, page, scale, slice);
      await client.call('render.respond', { requestId, png: r.png, slices: r.slices, stats: r.stats });
    } catch (e) {
      await client.call('render.respond', { requestId, error: (e as Error).message });
    }
  });

  window.archa.onOpenIntent(async (intent) => {
    if (intent.kind === 'file' && intent.path) await openPath(intent.path);
  });

  // Reopens the files this window's context had open last time (and creates `.design/` for a project).
  const { active } = await client.call('workspace.restore', { project: context.project });
  const [all, agents, info, runs, settings] = await Promise.all([client.call('workspace.list'), client.call('agents.list'), client.call('app.info'), client.call('chat.runs'), client.call('settings.get')]);
  const docs = ownDocs(all);
  set({ docs, agents, info, settings, runs: Object.fromEntries(runs.map((r) => [r.runId, r])) });
  void loadAccounts();
  await activate(active && docs.some((d) => d.id === active) ? active : docs.at(-1)?.id ?? null);
}

export async function updateSettings(patch: Partial<AppSettings>) {
  const { client } = get();
  if (!client) return;
  try {
    set({ settings: await client.call('settings.set', patch) });
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

/** Opens a folder as a project in its own window (asks which one without a path). */
export async function openProject(path?: string) {
  await window.archa.openProject(path);
}

export type SettingsPage = 'general' | 'providers' | 'skills' | 'memory' | 'mcp' | 'connect' | 'github' | 'integrations' | 'about';

export function openSettings(page?: SettingsPage) {
  set({ settingsOpen: true, ...(page ? { settingsPage: page } : {}) });
}

export async function loadSkills() {
  const { client } = get();
  if (!client) return;
  try {
    set({ skills: await client.call('skills.list', { docId: get().activeDocId ?? undefined }) });
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function loadMcpServers() {
  const { client } = get();
  if (!client) return;
  try {
    set({ mcpServers: await client.call('mcp.list') });
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function loadLibrary() {
  const { client } = get();
  if (!client) return;
  try {
    set({ library: await client.call('library.list') });
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function loadAccounts() {
  const { client } = get();
  if (!client) return;
  try {
    set({ accounts: await client.call('accounts.overview') });
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function activate(docId: string | null) {
  const { client } = get();
  if (!client || !docId) { set({ activeDocId: null, doc: null }); return; }
  const snap = await client.call('doc.snapshot', { docId });
  const chat = await client.call('chat.list', { docId });
  changes.reset();
  // Reopen the most recent conversation of this document.
  const last = chat.at(-1);
  set((s) => ({ activeDocId: docId, doc: new ArchaDocument(snap.data, snap.revision), rev: s.rev + 1, selection: [], chat, chatThread: last ? threadOf(last) : null, orchestraView: null, cursors: {}, editingText: null, fitRequest: s.fitRequest + 1 }));
  // The core remembers the shown document: it reopens active next start, and agents default to it.
  void client.call('selection.set', { docId, ids: [] }).catch(() => {});
}

function omit<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const { [key]: _gone, ...rest } = map;
  return rest;
}

/** The run working in a thread, if any. */
export const runOfThread = (runs: Record<string, ChatRunEvent>, threadId: string | null) =>
  threadId ? Object.values(runs).find((r) => r.threadId === threadId) ?? null : null;

export async function resync() {
  const { client, activeDocId } = get();
  if (!client || !activeDocId) return;
  const snap = await client.call('doc.snapshot', { docId: activeDocId });
  changes.reset();
  set((s) => ({ doc: new ArchaDocument(snap.data, snap.revision), rev: s.rev + 1 }));
}

/** Sends ops to the core host — the only writer. The mirror updates from the echo event. */
export async function commit(label: string, ops: Op[]): Promise<boolean> {
  const { client, doc, activeDocId } = get();
  if (!client || !doc || !activeDocId || !ops.length) return false;
  try {
    await client.call('doc.apply', { docId: activeDocId, baseRevision: doc.revision, ops, label });
    return true;
  } catch (e) {
    toast((e as Error).message, 'error');
    await resync();
    return false;
  }
}

export function select(ids: string[]) {
  set({ selection: ids });
  const { client, activeDocId } = get();
  if (client && activeDocId) void client.call('selection.set', { docId: activeDocId, ids });
}

export async function undo() {
  const { client, activeDocId } = get();
  if (client && activeDocId && !(await client.call('doc.undo', { docId: activeDocId }))) toast('Nothing to undo');
}
export async function redo() {
  const { client, activeDocId } = get();
  if (client && activeDocId && !(await client.call('doc.redo', { docId: activeDocId }))) toast('Nothing to redo');
}

export async function newDoc() {
  const { client } = get();
  if (!client) return;
  const { docId } = await client.call('doc.new', { project: get().project });
  await activate(docId);
}

export async function openPath(path: string) {
  const { client } = get();
  if (!client) return;
  try {
    const { docId } = await client.call('doc.open', { path, project: get().project });
    await activate(docId);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function openFile() {
  const path = await window.archa.showOpenDialog();
  if (path) await openPath(path);
}

export async function save(as = false) {
  const { client, activeDocId, docs, project } = get();
  if (!client || !activeDocId) return;
  const summary = docs.find((d) => d.id === activeDocId);
  let path = as ? null : summary?.filePath ?? null;
  // In a project an untitled document saves into `.design/` without asking; Save As starts there too.
  if (!path && !(project && !as)) {
    const sep = window.archa.platform === 'win32' ? '\\' : '/';
    const name = `${summary?.name ?? 'Untitled'}.archa`;
    path = await window.archa.showSaveDialog(project ? `${project.replace(/[\\/]+$/, '')}${sep}.design${sep}${name}` : name);
    if (!path) return;
  }
  try {
    await client.call('doc.save', { docId: activeDocId, ...(path ? { path } : {}) });
    toast('Saved');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function closeDoc(docId: string) {
  const { client, docs } = get();
  const d = docs.find((x) => x.id === docId);
  if (d?.dirty && !confirm(`Close "${d.name}" without saving?`)) return;
  await client?.call('doc.close', { docId });
}

export type ExportKind = ExportFormat | 'pdf';
export const EXPORT_KINDS: Array<{ value: ExportKind; label: string; ext: string }> = [
  { value: 'png', label: 'PNG', ext: 'png' },
  { value: 'jpg', label: 'JPG', ext: 'jpg' },
  { value: 'svg', label: 'SVG', ext: 'svg' },
  { value: 'pdf', label: 'PDF', ext: 'pdf' },
  { value: 'html', label: 'HTML + CSS', ext: 'html' },
  { value: 'tailwind', label: 'HTML + Tailwind', ext: 'html' },
];

/** Several layers as one PDF, a page each (vector, own size), in reading order. */
export { readingOrder };

export async function exportPdf(nodeIds: string[]) {
  const { client, doc, activeDocId, docs } = get();
  if (!client || !doc || !activeDocId) return;
  const ids = readingOrder(doc, nodeIds);
  if (!ids.length) return;
  const name = ids.length === 1 ? doc.require(ids[0]!).name : docs.find((d) => d.id === activeDocId)?.name ?? 'Pages';
  const path = await window.archa.showExportDialog(`${name}.pdf`, 'pdf');
  if (!path) return;
  try {
    const pages = [];
    for (const nodeId of ids) pages.push(await client.call('export.page', { docId: activeDocId, nodeId }));
    if (ids.length > 1) toast(`Printing ${ids.length} pages…`);
    const err = await window.archa.exportPdf({ pages, path });
    if (err) throw new Error(err);
    toast(ids.length > 1 ? `Exported PDF · ${ids.length} pages` : 'Exported PDF');
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, 'error');
  }
}

/** Export a node (blueprint RENDERING/03): rasters render here, PDF prints in main, the rest is written by the core. */
export async function exportNode(nodeId: string, kind: ExportKind, scale = 2) {
  const { doc } = get();
  const node = doc?.get(nodeId);
  const spec = EXPORT_KINDS.find((k) => k.value === kind);
  if (!node || !spec) return;
  if (kind === 'pdf') return exportPdf([nodeId]);
  const path = await window.archa.showExportDialog(`${node.name}${scaleSuffix(kind, scale)}.${spec.ext}`, spec.ext);
  if (!path) return;
  try {
    const files = await saveExport(nodeId, kind, scale, path);
    toast(files > 1 ? `Exported ${spec.label} (${files} files)` : `Exported ${spec.label}`);
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, 'error');
  }
}

const scaleSuffix = (kind: ExportKind, scale: number) => ((kind === 'png' || kind === 'jpg') && scale !== 1 ? `@${scale}x` : '');

async function saveExport(nodeId: string, kind: Exclude<ExportKind, 'pdf'>, scale: number, path: string): Promise<number> {
  const { client, doc, activeDocId } = get();
  if (!client || !doc || !activeDocId) return 0;
  const image = kind === 'png' || kind === 'jpg' ? await renderNodeImage(doc, nodeId, scale, kind === 'png' ? 'png' : 'jpeg') : undefined;
  const { files } = await client.call('export.save', { docId: activeDocId, nodeId, format: kind, path, image });
  return files.length;
}

/** Several layers as image files: one per layer, into a folder the person picks; equal names get a number. */
export async function exportEach(nodeIds: string[], kind: Exclude<ExportKind, 'pdf'>, scale = 2) {
  const { doc } = get();
  const spec = EXPORT_KINDS.find((k) => k.value === kind);
  if (!doc || !spec) return;
  const ids = readingOrder(doc, nodeIds);
  const folder = ids.length ? await window.archa.pickFolder(`Export ${ids.length} layers as ${spec.label}`) : null;
  if (!folder) return;
  const sep = folder.includes('\\') ? '\\' : '/';
  const used = new Map<string, number>();
  try {
    for (const id of ids) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strips characters Windows forbids in file names
      const base = doc.require(id).name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').trim() || 'Layer';
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      await saveExport(id, kind, scale, `${folder}${sep}${n > 1 ? `${base} ${n}` : base}${scaleSuffix(kind, scale)}.${spec.ext}`);
    }
    toast(`Exported ${ids.length} ${spec.label} files`);
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, 'error');
  }
}
