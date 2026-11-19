import { insertOpsFor, subtreeInput } from '@archa/core';
import { isContainer, type NodeInput, type Op } from '@archa/schema';
import { commit, select, toast, useStore } from './store';
import { originOf, pageRoot, selectionBounds, toWorld } from './geometry';
import type { ArchaDocument } from '@archa/core';
import { importFile, place, svgToNodes } from './importers';

/* Editing commands shared by shortcuts and menus. Every change is one transaction. */

let clipboard: NodeInput[] = [];
/** Put on the system clipboard by Copy: a paste that still finds it pastes the copied layers, not text. */
const LAYERS_MARK = 'archadev:layers';

/** Friendly input from a subtree, for copy and duplicate (shared with the agent `copy()`). */
export const toInput = subtreeInput;

const ctx = () => {
  const { doc, selection } = useStore.getState();
  return { doc: doc!, ids: selection.filter((id) => doc?.get(id)) };
};

export async function deleteSelection() {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  const roots = ids.filter((id) => !ids.some((other) => other !== id && doc.isAncestor(other, id)));
  if (await commit(`Delete ${roots.length} layer${roots.length > 1 ? 's' : ''}`, roots.map((id) => ({ op: 'delete', id })))) select([]);
}

export async function duplicate() {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  const ops: Op[] = [];
  const created: string[] = [];
  for (const id of ids) {
    const n = doc.require(id);
    const parent = doc.require(n.parentId!);
    const input = toInput(doc, id) as NodeInput & { x: number; y: number };
    const inLayout = parent.type === 'frame' && parent.layout !== 'none';
    if (!inLayout) { input.x = n.x + (parent.type === 'page' ? n.width + 40 : 16); input.y = n.y + (parent.type === 'page' ? 0 : 16); }
    const index = isContainer(parent) ? parent.children.indexOf(id) + 1 : undefined;
    const r = insertOpsFor(input, parent.id, index);
    ops.push(...r.ops);
    created.push(r.rootId);
  }
  if (await commit('Duplicate', ops)) select(created);
}

export function copy() {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  clipboard = ids.map((id) => toInput(doc, id));
  // Replaces whatever the system clipboard held, so a later Ctrl+V knows the layers are the newest copy.
  void navigator.clipboard.writeText(`${LAYERS_MARK}:${ids.length}`).catch(() => { /* layers still paste */ });
  toast(`Copied ${ids.length} layer${ids.length > 1 ? 's' : ''}`);
}

export async function paste() {
  const { doc, ids } = ctx();
  if (!doc || !clipboard.length) return;
  const target = ids[0] ? doc.require(ids[0]) : null;
  const parentId = target && target.type === 'frame' ? target.id : target?.parentId ?? pageRoot(doc);
  const ops: Op[] = [];
  const created: string[] = [];
  for (const item of clipboard) {
    const input = { ...item } as NodeInput & { x?: number; y?: number };
    if (parentId === pageRoot(doc)) { input.x = (input.x ?? 0) + 40; input.y = (input.y ?? 0) + 40; }
    const r = insertOpsFor(input, parentId);
    ops.push(...r.ops);
    created.push(r.rootId);
  }
  if (await commit('Paste', ops)) select(created);
}

/**
 * Ctrl+V on the canvas: images (screenshots, copied pictures) and SVG markup from the system clipboard
 * are imported; otherwise the layers copied in ArchaDev are pasted.
 */
export async function pasteFrom(data: DataTransfer | null) {
  const text = data?.getData('text/plain') ?? '';
  if (text.startsWith(LAYERS_MARK)) return paste();
  const images = [...(data?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (images.length) {
    const st = useStore.getState();
    const host = document.querySelector('[data-canvas-host]');
    const c = toWorld(st.camera, (host?.clientWidth ?? 800) / 2, (host?.clientHeight ?? 600) / 2);
    try {
      for (const [i, f] of images.entries()) {
        const named = /^image\.\w+$/i.test(f.name) ? new File([f], `Pasted image.${f.name.split('.').pop()}`, { type: f.type }) : f;
        await importFile(named, { x: c.x + i * 32, y: c.y + i * 32 });
      }
    } catch (e) {
      toast(`Paste failed: ${(e as Error).message}`, 'error');
    }
    return;
  }
  const svg = text.trim();
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) {
    const vector = svgToNodes(svg, 'Pasted SVG');
    if (vector) return place(vector, undefined, 'Paste SVG');
  }
  return paste();
}

export async function nudge(dx: number, dy: number) {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  await commit('Nudge', ids.map((id) => {
    const n = doc.require(id);
    return { op: 'update', id, patch: { x: n.x + dx, y: n.y + dy } };
  }));
}

/** Wraps the selection in a new frame (auto-layout column when `layout`). */
export async function wrapInFrame(layout: boolean) {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  if (layout && ids.length === 1) {
    const n = doc.require(ids[0]!);
    if (n.type === 'frame' && n.layout === 'none') {
      await commit('Add auto layout', [{ op: 'update', id: n.id, patch: { layout: 'column', gap: 12, sizing: { horizontal: 'hug', vertical: 'hug' } } }]);
      return;
    }
  }
  const parentId = doc.require(ids[0]!).parentId!;
  if (!ids.every((id) => doc.get(id)?.parentId === parentId)) { toast('Select layers with the same parent', 'error'); return; }
  const parent = doc.require(parentId);
  const b = selectionBounds(doc, ids)!;
  const o = originOf(doc, parentId);
  const sorted = isContainer(parent) ? [...ids].sort((a, c) => parent.children.indexOf(a) - parent.children.indexOf(c)) : ids;
  const index = isContainer(parent) ? parent.children.indexOf(sorted[0]!) : undefined;
  const frame = { type: 'frame', name: layout ? 'Auto layout' : 'Frame', x: Math.round(b.x - o.x), y: Math.round(b.y - o.y), width: Math.round(b.width), height: Math.round(b.height), clip: false,
    ...(layout ? { layout: b.width > b.height * 1.5 ? 'row' : 'column', gap: 12, sizing: { horizontal: 'hug', vertical: 'hug' } } : {}) } as unknown as NodeInput;
  const inserted = insertOpsFor(frame, parentId, index);
  const rootId = inserted.rootId;
  const ops: Op[] = [...inserted.ops];
  const byPos = layout ? [...sorted].sort((a, c) => (b.width > b.height * 1.5 ? doc.require(a).x - doc.require(c).x : doc.require(a).y - doc.require(c).y)) : sorted;
  for (const id of byPos) {
    const wb = doc.worldBounds(id);
    ops.push({ op: 'move', id, parentId: rootId });
    if (!layout) ops.push({ op: 'update', id, patch: { x: Math.round(wb.x - b.x), y: Math.round(wb.y - b.y) } });
  }
  if (await commit(layout ? 'Wrap in auto layout' : 'Frame selection', ops)) select([rootId]);
}

export async function reorder(delta: 1 | -1) {
  const { doc, ids } = ctx();
  if (!doc || ids.length !== 1) return;
  const n = doc.require(ids[0]!);
  const parent = doc.require(n.parentId!);
  if (!isContainer(parent)) return;
  const i = parent.children.indexOf(n.id);
  const next = Math.max(0, Math.min(parent.children.length - 1, i + delta));
  if (next !== i) await commit(delta > 0 ? 'Bring forward' : 'Send backward', [{ op: 'move', id: n.id, parentId: parent.id, index: next }]);
}

export function selectAll() {
  const { doc, ids } = ctx();
  if (!doc) return;
  const scope = ids[0] ? doc.get(ids[0])?.parentId ?? pageRoot(doc) : pageRoot(doc);
  select(doc.children(scope).filter((n) => !n.locked).map((n) => n.id));
}

export function selectParent() {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  const p = doc.get(ids[0]!)?.parentId;
  select(p && doc.get(p)?.type !== 'page' ? [p] : []);
}

export function selectChildren() {
  const { doc, ids } = ctx();
  if (!doc || ids.length !== 1) return;
  const kids = doc.children(ids[0]!);
  if (kids.length) select(kids.map((k) => k.id));
}
