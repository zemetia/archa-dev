import { isContainer, type Node, type NodeId, type Op } from '@archa/schema';
import type { ArchaDocument } from './document';

/*
 * Layers panel order and drag & drop (blueprint RENDERING/02 → Layer order).
 * `children` is paint order: the last child is drawn on top. The panel lists a free-form
 * container (page, group, frame without auto layout) top-most first — the reverse of `children`.
 * An auto-layout frame lists its children in flow order (first child first), because that is
 * what the person reads on the canvas. Drops are described in list terms and turned into
 * `move` ops here, so every surface reorders the same way and the result is undoable.
 */

export type LayerDropPosition = 'before' | 'after' | 'inside';
/** A drop relative to a row: above it, below it, or into it (containers only). */
export type LayerDrop = { targetId: NodeId; position: LayerDropPosition };
export type LayerMoveResult = { ops: Op[]; notes: string[]; label: string };

/** True when the panel lists this container's children in flow order instead of paint order. */
export const listsInFlowOrder = (n: Node): boolean => n.type === 'frame' && n.layout !== 'none';

/** Child ids of a container in the order the Layers panel shows them, top row first. */
export function layerOrder(doc: ArchaDocument, id: NodeId): NodeId[] {
  const n = doc.get(id);
  if (!n || !isContainer(n)) return [];
  return listsInFlowOrder(n) ? [...n.children] : [...n.children].reverse();
}

/** Containers a layer can be dropped into from the panel. */
export const acceptsLayers = (n: Node): boolean => n.type === 'frame' || n.type === 'group';

/** True when moving `id` under `parentId` would put it inside itself. */
export const wouldNestInSelf = (doc: ArchaDocument, id: NodeId, parentId: NodeId): boolean =>
  id === parentId || doc.isAncestor(id, parentId);

function originOf(doc: ArchaDocument, id: NodeId): { x: number; y: number } {
  if (doc.require(id).type === 'page') return { x: 0, y: 0 };
  const b = doc.worldBounds(id);
  return { x: b.x, y: b.y };
}

/** Where a drop lands in document terms: the new parent and the id the movers go in front of (`null` = end). */
function resolve(doc: ArchaDocument, drop: LayerDrop, movers: Set<NodeId>): { parentId: NodeId; before: NodeId | null } | null {
  const target = doc.get(drop.targetId);
  if (!target) return null;
  if (drop.position === 'inside') {
    if (!acceptsLayers(target)) return null;
    // Into a frame: on top of the stack, or at the end of an auto-layout flow.
    return { parentId: target.id, before: null };
  }
  if (!target.parentId || movers.has(target.id)) return null;
  const parent = doc.require(target.parentId);
  if (!isContainer(parent)) return null;
  const rest = parent.children.filter((c) => !movers.has(c));
  const at = rest.indexOf(target.id);
  // In flow order the list matches `children`; otherwise the list is reversed, so "above" means later.
  const above = drop.position === 'before';
  const docIndex = listsInFlowOrder(parent) === above ? at : at + 1;
  return { parentId: parent.id, before: rest[docIndex] ?? null };
}

/**
 * Ops that move `ids` to a Layers panel drop. Movers keep their relative order; a node whose
 * ancestor is also moving travels with it. Reparenting into a free-form container keeps the
 * node where it is on the canvas; into auto layout the parent places it (x / y still written so undo restores them).
 */
export function layerMoveOps(doc: ArchaDocument, ids: NodeId[], drop: LayerDrop): LayerMoveResult {
  const notes: string[] = [];
  const empty = (note?: string): LayerMoveResult => ({ ops: [], notes: note ? [note] : notes, label: 'Move layers' });
  const picked = [...new Set(ids)].filter((id) => {
    const n = doc.get(id);
    return n && n.type !== 'page' && n.parentId;
  });
  const top = picked.filter((id) => !picked.some((o) => o !== id && doc.isAncestor(o, id)));
  if (!top.length) return empty();
  const movers = new Set(top);
  const where = resolve(doc, drop, movers);
  if (!where) return empty();
  if (top.some((id) => wouldNestInSelf(doc, id, where.parentId))) return empty('A layer cannot be moved into itself or one of its own layers.');

  const parent = doc.container(where.parentId);
  // Movers in document order across the whole tree, so a multi-row drag keeps its stacking.
  const rank = new Map<NodeId, number>();
  let i = 0;
  const walk = (id: NodeId) => { rank.set(id, i++); for (const c of doc.children(id)) walk(c.id); };
  for (const page of doc.pages) walk(page.rootId);
  const ordered = [...top].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));

  const auto = listsInFlowOrder(parent);
  const target = originOf(doc, parent.id);
  const sim = [...parent.children];
  const ops: Op[] = [];
  let anchor = where.before;
  let changedParent = false;
  for (const id of [...ordered].reverse()) {
    // Place from the last mover backwards, each one in front of the previous, so indexes stay exact.
    const n = doc.require(id);
    const from = sim.indexOf(id);
    if (from >= 0) sim.splice(from, 1);
    const index = anchor === null ? sim.length : sim.indexOf(anchor);
    sim.splice(index, 0, id);
    anchor = id;
    ops.push({ op: 'move', id, parentId: parent.id, index });
    if (n.parentId === parent.id) continue;
    changedParent = true;
    if (n.type === 'connector') continue;
    // Keep the canvas position. Auto layout overrides it, but the undo then restores the old x / y.
    const world = doc.worldBounds(id);
    const patch: Record<string, unknown> = { x: Math.round(world.x - target.x), y: Math.round(world.y - target.y) };
    // Out of auto layout: keep the size it had there ("fill" means nothing in a free frame).
    if ((!auto || n.absolute) && (n.sizing.horizontal === 'fill' || n.sizing.vertical === 'fill')) {
      patch.sizing = { horizontal: n.sizing.horizontal === 'fill' ? 'fixed' : n.sizing.horizontal, vertical: n.sizing.vertical === 'fill' ? 'fixed' : n.sizing.vertical };
      patch.width = n.width;
      patch.height = n.height;
    }
    ops.push({ op: 'update', id, patch });
  }
  // Moves are emitted last mover first; apply them in that order, then the position patches.
  const moves = ops.filter((o) => o.op === 'move');
  if (!changedParent && sim.every((c, k) => parent.children[k] === c)) return empty();
  const label = !changedParent ? 'Reorder layers' : parent.type === 'page' ? 'Move out of frame' : 'Move into frame';
  return { ops: [...moves, ...ops.filter((o) => o.op !== 'move')], notes, label };
}
