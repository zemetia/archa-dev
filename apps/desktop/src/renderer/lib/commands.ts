import { insertOpsFor, subtreeInput, wrapOps } from '@archa/core';
import { isContainer, type NodeInput, type Op } from '@archa/schema';
import { commit, select, toast, useStore } from './store';
import { pageRoot } from './geometry';
import type { ArchaDocument } from '@archa/core';

/* Editing commands shared by shortcuts and menus. Every change is one transaction. */

let clipboard: NodeInput[] = [];

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
