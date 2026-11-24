import { isContainer, type Node, type NodeId, type Op } from '@archa/schema';
import { applyOps } from './apply';
import { componentMeta, instanceOf } from './components';
import type { ArchaDocument } from './document';
import { insertOpsFor } from './factory';
import { placementIn, tidy, turnedBox } from './transform';

/*
 * Group and ungroup (blueprint DOCUMENT_MODEL/01 → Groups). Shared by Ctrl+G / Ctrl+Shift+G, the
 * context menus, the Layers panel and agents; each returns the ops of one undoable transaction.
 *
 * Group — the selection (descendants of selected layers travel with them) goes into a new group in
 *   the parent of the top-most selected layer (last in paint order), at that layer's z-slot. Members
 *   keep their place on the canvas (turned parents included) and their paint order. Inside auto
 *   layout the group takes that flow slot; "fill" members become fixed at their laid-out size.
 *   Locked and hidden layers group like any other. Layers inside a component instance are refused.
 * Ungroup — each selected group (or plain frame) is replaced by its children at its z-slot in its
 *   parent, kept in place: the group's rotation turns into theirs, its opacity multiplies into
 *   theirs, a hidden group hides them and a locked group locks them. Components, instances and
 *   layers inside an instance are refused; anything else is left alone (a note says why).
 */

export type GroupResult = { ops: Op[]; selection: NodeId[]; notes: string[]; label: string };

/** True when an ancestor of `id` is a component instance (its structure comes from the main). */
export function insideInstance(doc: ArchaDocument, id: NodeId): boolean {
  for (let p = doc.get(id)?.parentId; p; p = doc.get(p)?.parentId) if (instanceOf(doc.get(p))) return true;
  return false;
}

/** Selected layers without the ones whose ancestor is also selected, in paint order (bottom first). */
function topLevelInPaintOrder(doc: ArchaDocument, ids: NodeId[]): Node[] {
  const picked = [...new Set(ids)].map((id) => doc.get(id)).filter((n): n is Node => !!n && n.type !== 'page' && !!n.parentId);
  const top = picked.filter((n) => !picked.some((o) => o.id !== n.id && doc.isAncestor(o.id, n.id)));
  const rank = new Map<NodeId, number>();
  let i = 0;
  const walk = (id: NodeId) => { rank.set(id, i++); for (const c of doc.children(id)) walk(c.id); };
  for (const page of doc.pages) walk(page.rootId);
  return top.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

const isFlow = (n: Node | undefined) => n?.type === 'frame' && n.layout !== 'none';

/** Page origin of a container, translation only (how connector ends are routed). */
function originOf(doc: ArchaDocument, id: NodeId): { x: number; y: number } {
  if (doc.require(id).type === 'page') return { x: 0, y: 0 };
  const b = doc.worldBounds(id);
  return { x: b.x, y: b.y };
}

type Reparent = {
  /** The container the node moves into, and where (`undefined` = on top). */
  parentId: NodeId; index?: number;
  /** An existing container whose coordinates the new parent shares, offset by `origin`. */
  ref: NodeId; origin: { x: number; y: number };
  /** True when the new parent is auto layout. */
  flow: boolean;
  extra?: Record<string, unknown>;
};

/** Ops that move `n` to a new parent while it stays where it is on the canvas. */
function reparentOps(doc: ArchaDocument, n: Node, r: Reparent): Op[] {
  const patch: Record<string, unknown> = { ...r.extra };
  if (n.type === 'connector') {
    // Free ends are stored in parent coordinates and routed from translated origins.
    const from = originOf(doc, n.parentId!), to = originOf(doc, r.ref);
    const dx = from.x - to.x - r.origin.x, dy = from.y - to.y - r.origin.y;
    patch.start = { ...n.start, x: tidy(n.start.x + dx), y: tidy(n.start.y + dy) };
    patch.end = { ...n.end, x: tidy(n.end.x + dx), y: tidy(n.end.y + dy) };
  } else {
    const p = placementIn(doc, n.id, r.ref);
    patch.x = tidy(p.x - r.origin.x);
    patch.y = tidy(p.y - r.origin.y);
    if (p.rotation !== n.rotation) patch.rotation = p.rotation;
    // Out of auto layout: keep the size it had there ("fill" means nothing in a free container).
    if (isFlow(doc.get(n.parentId!)) && !n.absolute && !r.flow && (n.sizing.horizontal === 'fill' || n.sizing.vertical === 'fill')) {
      patch.sizing = { horizontal: n.sizing.horizontal === 'fill' ? 'fixed' : n.sizing.horizontal, vertical: n.sizing.vertical === 'fill' ? 'fixed' : n.sizing.vertical };
      patch.width = n.width;
      patch.height = n.height;
    }
  }
  return [{ op: 'move', id: n.id, parentId: r.parentId, ...(r.index === undefined ? {} : { index: r.index }) }, { op: 'update', id: n.id, patch }];
}

/** Ops that wrap the selection in a new group (rules at the top of this file). */
export function groupOps(doc: ArchaDocument, ids: NodeId[], opts: { name?: string } = {}): GroupResult {
  const label = 'Group selection';
  const members = topLevelInPaintOrder(doc, ids);
  if (!members.length) return { ops: [], selection: [], notes: ['Select layers to group.'], label };
  if (members.some((n) => insideInstance(doc, n.id))) {
    return { ops: [], selection: [], notes: ['Layers inside a component instance cannot be grouped — detach the instance first.'], label };
  }
  const topMost = members.at(-1)!;
  const parentId = topMost.parentId!;
  const parent = doc.container(parentId);
  // The group's box: the members' boxes in the new parent's coordinates.
  const places = members.map((n) => {
    if (n.type === 'connector') {
      const o = doc.worldBounds(n.id), at = parent.type === 'page' ? { x: 0, y: 0 } : doc.worldBounds(parentId);
      return { minX: o.x - at.x, minY: o.y - at.y, maxX: o.x - at.x + n.width, maxY: o.y - at.y + n.height };
    }
    const p = placementIn(doc, n.id, parentId);
    return turnedBox(p.x, p.y, n.width, n.height, p.rotation);
  });
  const box = {
    x: tidy(Math.min(...places.map((b) => b.minX))), y: tidy(Math.min(...places.map((b) => b.minY))),
    right: Math.max(...places.map((b) => b.maxX)), bottom: Math.max(...places.map((b) => b.maxY)),
  };
  // In front of the top-most member: once the members leave, the group holds exactly its slot.
  const inserted = insertOpsFor({
    type: 'group', name: opts.name ?? 'Group', x: box.x, y: box.y, width: tidy(box.right - box.x), height: tidy(box.bottom - box.y),
  } as never, parentId, parent.children.indexOf(topMost.id) + 1);
  const ops: Op[] = [...inserted.ops];
  for (const n of members) ops.push(...reparentOps(doc, n, { parentId: inserted.rootId, ref: parentId, origin: { x: box.x, y: box.y }, flow: false }));
  return { ops, selection: [inserted.rootId], notes: [], label };
}

/** Why a node cannot be ungrouped, or null when it can. */
export function ungroupBlocker(doc: ArchaDocument, n: Node | undefined): string | null {
  if (!n || (n.type !== 'group' && n.type !== 'frame')) return 'Only groups and frames can be ungrouped.';
  if (componentMeta(n)) return `"${n.name}" is a component — ungrouping would break its instances.`;
  if (instanceOf(n) || insideInstance(doc, n.id)) return `"${n.name}" is part of a component instance — detach it first.`;
  if (!doc.children(n.id).length) return `"${n.name}" has no layers to release.`;
  return null;
}

/** True when ungroup would do something for this selection (menus show "Ungroup" then). */
export const canUngroup = (doc: ArchaDocument, ids: NodeId[]) => ids.some((id) => !ungroupBlocker(doc, doc.get(id)));

/** Ops that dissolve every ungroupable layer in `ids` (rules at the top of this file). */
export function ungroupOps(doc: ArchaDocument, ids: NodeId[]): GroupResult {
  const label = 'Ungroup';
  const picked = [...new Set(ids)].map((id) => doc.get(id)).filter((n): n is Node => !!n);
  const notes = [...new Set(picked.map((n) => ungroupBlocker(doc, n)).filter((r): r is string => !!r))];
  // Nested picks dissolve too: outer ones first, then inner ones from their new place.
  const depth = (id: NodeId) => { let d = 0; for (let p = doc.get(id)?.parentId; p; p = doc.get(p)?.parentId) d++; return d; };
  const targets = picked.filter((n) => !ungroupBlocker(doc, n)).sort((a, b) => depth(a.id) - depth(b.id));
  if (!targets.length) return { ops: [], selection: [], notes: notes.length ? notes : ['Select a group to ungroup.'], label };
  // Each dissolve is worked out on a scratch copy after the previous one, so nested picks see their new parent.
  const scratch = doc.clone();
  const ops: Op[] = [];
  const released = new Set<NodeId>();
  for (const t of targets) {
    const g = scratch.require(t.id);
    const parent = scratch.container(g.parentId!);
    const at = parent.children.indexOf(g.id);
    const step: Op[] = [];
    scratch.children(g.id).forEach((c, i) => {
      const fold: Record<string, unknown> = {};
      if (g.opacity < 1) fold.opacity = tidy(c.opacity * g.opacity);
      if (!g.visible && c.visible) fold.visible = false;
      if (g.locked && !c.locked) fold.locked = true;
      step.push(...reparentOps(scratch, c, { parentId: parent.id, index: at + i, ref: parent.id, origin: { x: 0, y: 0 }, flow: isFlow(parent), extra: fold }));
      released.add(c.id);
    });
    step.push({ op: 'delete', id: g.id });
    released.delete(g.id);
    applyOps(scratch, step);
    ops.push(...step);
  }
  return { ops, selection: [...released].filter((id) => scratch.get(id)), notes, label };
}

/** Groups that `deleteIds` would leave empty (they go with them, as a group with no layers has no box). */
export function emptiedGroups(doc: ArchaDocument, deleteIds: NodeId[]): NodeId[] {
  const gone = new Set(deleteIds);
  const out: NodeId[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of gone) {
      const p = doc.get(id)?.parentId;
      const parent = p ? doc.get(p) : undefined;
      if (!parent || parent.type !== 'group' || gone.has(parent.id) || !isContainer(parent)) continue;
      if (parent.children.every((c) => gone.has(c))) { gone.add(parent.id); out.push(parent.id); changed = true; }
    }
  }
  return out;
}
