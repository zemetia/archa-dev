import { componentMeta, emptiedGroups, groupOps, instanceOf, insertOpsFor, makeComponentOps, subtreeInput, ungroupOps, wrapOps } from '@archa/core';
import { isContainer, type Node, type NodeInput, type Op } from '@archa/schema';
import { commit, select, toast, useStore } from './store';
import { containerAt, originOf, pageRoot, toWorld } from './geometry';
import type { ArchaDocument } from '@archa/core';
import { importFile, place, svgInput } from './importers';
import { isSvgMarkup } from '@archa/formats';

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
  // A group left with no layers goes too (it has no box of its own).
  roots.push(...emptiedGroups(doc, roots));
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

export const hasCopiedLayers = () => clipboard.length > 0;

/** Context menu "Paste here": the copied layers land with their top-left at the pointer, inside the frame under it. */
export async function pasteAt(at: { x: number; y: number }) {
  const { doc } = ctx();
  if (!doc || !clipboard.length) return;
  const parent = containerAt(doc, at.x, at.y);
  const o = originOf(doc, parent.id);
  const inLayout = parent.type === 'frame' && parent.layout !== 'none';
  const items = clipboard as Array<NodeInput & { x?: number; y?: number }>;
  const minX = Math.min(...items.map((i) => i.x ?? 0));
  const minY = Math.min(...items.map((i) => i.y ?? 0));
  const ops: Op[] = [];
  const created: string[] = [];
  for (const item of items) {
    const input = { ...item };
    if (!inLayout) { input.x = Math.round(at.x - o.x + (item.x ?? 0) - minX); input.y = Math.round(at.y - o.y + (item.y ?? 0) - minY); }
    const r = insertOpsFor(input, parent.id);
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
  if (isSvgMarkup(svg)) {
    try {
      return void await place(svgInput(svg, 'Pasted SVG'), undefined, 'Paste SVG');
    } catch (e) {
      return toast(`Paste failed: ${(e as Error).message}`, 'error');
    }
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
  if (!ids.every((id) => doc.get(id)?.parentId === doc.get(ids[0]!)?.parentId)) { toast('Select layers with the same parent', 'error'); return; }
  const { ops, rootId } = wrapOps(doc, ids, layout ? { layout: 'auto' } : {});
  if (await commit(layout ? 'Wrap in auto layout' : 'Frame selection', ops)) select([rootId]);
}

/** Ctrl+G: wraps the selection in a group at the top-most layer's place (rules: core `groups.ts`). */
export async function group() {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  const r = groupOps(doc, ids);
  for (const note of r.notes) toast(note, 'error');
  if (r.ops.length && await commit(r.label, r.ops)) select(r.selection);
}

/** Ctrl+Shift+G: replaces each selected group (or plain frame) by its layers, kept in place. */
export async function ungroup() {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  const r = ungroupOps(doc, ids);
  if (!r.ops.length) { for (const note of r.notes) toast(note); return; }
  if (await commit(r.label, r.ops)) select(r.selection);
}

/** Shift+Alt+A: turns auto layout off, keeping every child where the layout put it. */
export async function removeLayout() {
  const { doc, ids } = ctx();
  if (!doc) return;
  const frames = ids.map((id) => doc.get(id)).filter((n): n is Node => n?.type === 'frame' && n.layout !== 'none');
  if (!frames.length) return;
  const fixed = { horizontal: 'fixed', vertical: 'fixed' } as const;
  const ops: Op[] = [];
  for (const f of frames) {
    const o = originOf(doc, f.id);
    ops.push({ op: 'update', id: f.id, patch: { layout: 'none', width: f.width, height: f.height, sizing: fixed } });
    for (const c of doc.children(f.id)) {
      const wb = doc.worldBounds(c.id);
      ops.push({ op: 'update', id: c.id, patch: { x: Math.round(wb.x - o.x), y: Math.round(wb.y - o.y), width: c.width, height: c.height, sizing: fixed } });
    }
  }
  await commit('Remove auto layout', ops);
}

export function canMakeComponent(doc: ArchaDocument, id: string) {
  const n = doc.get(id);
  return n?.type === 'frame' && !componentMeta(n) && !instanceOf(n);
}

/** Ctrl+Alt+K: makes the selected frame a component. */
export async function createComponent() {
  const { doc, ids } = ctx();
  if (!doc || ids.length !== 1 || !canMakeComponent(doc, ids[0]!)) return;
  try { await commit('Create component', makeComponentOps(doc, ids[0]!)); } catch (e) { toast((e as Error).message, 'error'); }
}

/** Ctrl+] / Ctrl+[: moves the selection to the top or bottom of its parent, keeping its own order. */
export async function arrange(edge: 'front' | 'back') {
  const { doc, ids } = ctx();
  if (!doc || !ids.length) return;
  const byParent = new Map<string, string[]>();
  for (const id of ids) { const p = doc.require(id).parentId!; byParent.set(p, [...(byParent.get(p) ?? []), id]); }
  const ops: Op[] = [];
  for (const [pid, list] of byParent) {
    const parent = doc.require(pid);
    if (!isContainer(parent)) continue;
    const sorted = [...list].sort((a, c) => parent.children.indexOf(a) - parent.children.indexOf(c));
    if (edge === 'front') for (const id of sorted) ops.push({ op: 'move', id, parentId: pid, index: parent.children.length - 1 });
    else for (const id of sorted.reverse()) ops.push({ op: 'move', id, parentId: pid, index: 0 });
  }
  if (ops.length) await commit(edge === 'front' ? 'Bring to front' : 'Send to back', ops);
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
