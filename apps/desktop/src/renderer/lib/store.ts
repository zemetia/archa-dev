import { create } from 'zustand';
import { applyOps, ArchaDocument } from '@archa/core';
import { RpcClient, type AccountsOverview, type ActivityEntry, type AgentClient, type AppInfo, type ChatMessage, type DocSummary, type Message } from '@archa/protocol';
import type { Op } from '@archa/schema';
import { renderNodePng } from '@archa/render';

export type Tool = 'select' | 'frame' | 'rect' | 'ellipse' | 'text' | 'hand';
export type Camera = { x: number; y: number; zoom: number };
type Toast = { id: number; text: string; kind: 'info' | 'error' };

type State = {
  client: RpcClient | null;
  info: AppInfo | null;
  docs: DocSummary[];
  activeDocId: string | null;
  /** Read-only mirror of the core's document, updated by doc.applied events (blueprint APP_UI/03). */
  doc: ArchaDocument | null;
  rev: number;
  selection: string[];
  hover: string | null;
  tool: Tool;
  camera: Camera;
  leftTab: 'layers' | 'chat';
  agents: AgentClient[];
  activity: ActivityEntry[];
  chat: ChatMessage[];
  runningRun: string | null;
  agentFocus: { name: string; nodeIds: string[]; ts: number } | null;
  editingText: string | null;
  toasts: Toast[];
  fitRequest: number;
  settingsOpen: boolean;
  /** Agent CLIs + saved login profiles (Settings → Agents, chat account picker). */
  accounts: AccountsOverview | null;
};

export const useStore = create<State>(() => ({
  client: null, info: null, docs: [], activeDocId: null, doc: null, rev: 0,
  selection: [], hover: null, tool: 'select', camera: { x: 0, y: 0, zoom: 1 }, leftTab: 'layers',
  agents: [], activity: [], chat: [], runningRun: null, agentFocus: null, editingText: null, toasts: [], fitRequest: 0,
  settingsOpen: false, accounts: null,
}));

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

export async function init() {
  const client = await connectPort();
  set({ client });

  client.on('workspace.changed', (docs) => {
    set({ docs });
    const { activeDocId } = get();
    if (!activeDocId || !docs.some((d) => d.id === activeDocId)) void activate(docs.at(-1)?.id ?? null);
  });
  client.on('doc.applied', (e) => {
    const { doc, activeDocId } = get();
    if (!doc || e.docId !== activeDocId) return;
    if (e.revision === doc.revision + 1) {
      try {
        applyOps(doc, e.ops);
        doc.revision = e.revision;
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
    if (e.author.kind === 'agent') set({ agentFocus: { name: e.author.name ?? e.author.id, nodeIds: e.touched.filter((id) => doc.get(id)), ts: Date.now() } });
  });
  client.on('agents.changed', (agents) => set({ agents }));
  client.on('activity', (a) => {
    set((s) => ({ activity: [...s.activity.slice(-300), a] }));
    if (a.author.kind === 'agent' && a.nodeIds.length) set({ agentFocus: { name: a.author.name ?? a.author.id, nodeIds: a.nodeIds, ts: Date.now() } });
  });
  client.on('chat.message', (m) => { if (m.docId === get().activeDocId) set((s) => ({ chat: [...s.chat, m] })); });
  client.on('chat.run', (r) => {
    if (r.status === 'running') set({ runningRun: r.runId });
    else if (get().runningRun === r.runId) set({ runningRun: null });
  });
  let accountsTimer: ReturnType<typeof setTimeout> | undefined;
  client.on('accounts.changed', () => { clearTimeout(accountsTimer); accountsTimer = setTimeout(() => void loadAccounts(), 120); });
  client.on('render.request', async ({ requestId, docId, nodeId, scale }) => {
    try {
      let doc = get().doc;
      if (!doc || get().activeDocId !== docId) {
        const snap = await client.call('doc.snapshot', { docId });
        doc = new ArchaDocument(snap.data, snap.revision);
      }
      await document.fonts.ready;
      const png = await renderNodePng(doc, nodeId, scale);
      await client.call('render.respond', { requestId, png });
    } catch (e) {
      await client.call('render.respond', { requestId, error: (e as Error).message });
    }
  });

  window.archa.onOpenIntent(async (intent) => {
    if (intent.kind === 'file' && intent.path) await openPath(intent.path);
  });

  const [docs, agents, info] = await Promise.all([client.call('workspace.list'), client.call('agents.list'), client.call('app.info')]);
  set({ docs, agents, info });
  void loadAccounts();
  await activate(docs.at(-1)?.id ?? null);
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
  set((s) => ({ activeDocId: docId, doc: new ArchaDocument(snap.data, snap.revision), rev: s.rev + 1, selection: [], chat, editingText: null, fitRequest: s.fitRequest + 1 }));
}

export async function resync() {
  const { client, activeDocId } = get();
  if (!client || !activeDocId) return;
  const snap = await client.call('doc.snapshot', { docId: activeDocId });
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
  const { docId } = await client.call('doc.new', {});
  await activate(docId);
}

export async function openPath(path: string) {
  const { client } = get();
  if (!client) return;
  try {
    const { docId } = await client.call('doc.open', { path });
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
  const { client, activeDocId, docs } = get();
  if (!client || !activeDocId) return;
  const summary = docs.find((d) => d.id === activeDocId);
  let path = as ? null : summary?.filePath ?? null;
  if (!path) path = await window.archa.showSaveDialog(`${summary?.name ?? 'Untitled'}.archa`);
  if (!path) return;
  try {
    await client.call('doc.save', { docId: activeDocId, path });
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

export async function exportNode(nodeId: string, format: 'png' | 'svg') {
  const { client, doc, activeDocId } = get();
  if (!client || !doc || !activeDocId) return;
  const node = doc.get(nodeId);
  if (!node) return;
  const path = await window.archa.showExportDialog(`${node.name}.${format}`, format);
  if (!path) return;
  const png = format === 'png' ? await renderNodePng(doc, nodeId, 2) : undefined;
  await client.call('export.save', { docId: activeDocId, nodeId, format, path, png });
  toast(`Exported ${format.toUpperCase()}`);
}
