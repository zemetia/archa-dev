import { isContainer, type FrameNode, type Node, type NodeInput, type Op } from '@archa/schema';
import type { ArchaDocument, Rect } from './document';
import { insertOpsFor } from './factory';

/*
 * Arrange commands shared by the design panel, the CLI and agents (blueprint DOCUMENT_MODEL/03 → Arrange).
 * They only build ops; callers commit them. A node inside an auto-layout parent is placed by that
 * parent, so aligning it changes the parent's align / justify instead of its x / y.
 */

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Axis = 'horizontal' | 'vertical';
export type Place = 'start' | 'center' | 'end';
export type ArrangeResult = { ops: Op[]; notes: string[] };

/** True when the parent's auto layout positions this node (x / y are ignored). */
export function inAutoLayout(doc: ArchaDocument, n: Node): boolean {
  const p = n.parentId ? doc.get(n.parentId) : undefined;
  return p?.type === 'frame' && p.layout !== 'none' && !n.absolute;
}

/** Which frame property places children along a screen axis: the main axis is `justify`, the cross axis `align`. */
export function axisKey(frame: Pick<FrameNode, 'layout'>, axis: Axis): 'align' | 'justify' {
  const main = frame.layout === 'row' ? 'horizontal' : 'vertical';
  return axis === main ? 'justify' : 'align';
}

/** Where an auto-layout frame puts its children on each screen axis (`null` = distributed: space-between / space-around). */
export function placementOf(frame: FrameNode): { horizontal: Place | null; vertical: Place | null } {
  const read = (axis: Axis): Place | null => {
    const v = frame[axisKey(frame, axis)];
    return v === 'start' || v === 'center' || v === 'end' ? v : null;
  };
  return { horizontal: read('horizontal'), vertical: read('vertical') };
}

/** Patch that places children at a screen position; a distributed main axis keeps its spacing mode. */
export function placementPatch(frame: FrameNode, horizontal: Place, vertical: Place): Partial<Pick<FrameNode, 'align' | 'justify'>> {
  const patch: Partial<Pick<FrameNode, 'align' | 'justify'>> = {};
  for (const [axis, v] of [['horizontal', horizontal], ['vertical', vertical]] as const) {
    const key = axisKey(frame, axis);
    if (key === 'justify' && (frame.justify === 'space-between' || frame.justify === 'space-around')) continue;
    patch[key] = v;
  }
  return patch;
}

const EDGE: Record<AlignEdge, { axis: Axis; place: Place }> = {
  left: { axis: 'horizontal', place: 'start' }, center: { axis: 'horizontal', place: 'center' }, right: { axis: 'horizontal', place: 'end' },
  top: { axis: 'vertical', place: 'start' }, middle: { axis: 'vertical', place: 'center' }, bottom: { axis: 'vertical', place: 'end' },
};
const EDGE_ALIASES: Record<string, AlignEdge> = { start: 'left', end: 'right', 'center-x': 'center', hcenter: 'center', centre: 'center', 'center-y': 'middle', vcenter: 'middle' };

export function parseEdge(edge: string): AlignEdge {
  const e = (EDGE_ALIASES[edge.toLowerCase()] ?? edge.toLowerCase()) as AlignEdge;
  if (!EDGE[e]) throw new Error(`align edge must be left | center | right | top | middle | bottom (got "${edge}")`);
  return e;
}

/** Origin of a container's coordinate space on the page. */
function originOf(doc: ArchaDocument, id: string): { x: number; y: number } {
  const n = doc.require(id);
  return n.type === 'page' ? { x: 0, y: 0 } : doc.worldBounds(id);
}

function boundsOf(doc: ArchaDocument, ids: string[]): Rect {
  const rects = ids.map((id) => doc.worldBounds(id));
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
}

const usable = (doc: ArchaDocument, ids: string[]) =>
  [...new Set(ids)].map((id) => doc.get(id)).filter((n): n is Node => !!n && n.type !== 'page');

/**
 * Align layers to an edge or centre line. One free layer aligns inside its parent frame; several align to
 * their combined bounds (`to: 'parent'` forces the parent). Layers placed by auto layout set the parent instead.
 */
export function alignOps(doc: ArchaDocument, ids: string[], edgeIn: AlignEdge | string, to: 'auto' | 'parent' | 'selection' = 'auto'): ArrangeResult {
  const edge = parseEdge(edgeIn);
  const { axis, place } = EDGE[edge];
  const nodes = usable(doc, ids);
  const ops: Op[] = [];
  const notes: string[] = [];

  const flowParents = new Map<string, FrameNode>();
  for (const n of nodes) if (inAutoLayout(doc, n)) flowParents.set(n.parentId!, doc.require(n.parentId!) as FrameNode);
  for (const p of flowParents.values()) {
    const key = axisKey(p, axis);
    if (p[key] !== place) ops.push({ op: 'update', id: p.id, patch: { [key]: place } });
    notes.push(`"${p.name}" places its children with auto layout: set ${key} = "${place}"`);
  }

  const free = nodes.filter((n) => !inAutoLayout(doc, n));
  if (!free.length) return { ops, notes };
  const useParent = to === 'parent' || (to === 'auto' && free.length === 1);
  for (const n of free) {
    const parent = doc.require(n.parentId!);
    let ref: Rect;
    if (useParent) {
      if (parent.type === 'page') { notes.push(`"${n.name}" sits on the page: nothing to align it to — select 2+ layers or put it in a frame`); continue; }
      ref = doc.worldBounds(parent.id);
    } else ref = boundsOf(doc, free.map((f) => f.id));
    const b = doc.worldBounds(n.id);
    const o = originOf(doc, parent.id);
    const patch: Record<string, number> = {};
    if (axis === 'horizontal') {
      const x = place === 'start' ? ref.x : place === 'center' ? ref.x + (ref.width - b.width) / 2 : ref.x + ref.width - b.width;
      patch.x = Math.round(x - o.x);
      if (patch.x === n.x) continue;
    } else {
      const y = place === 'start' ? ref.y : place === 'center' ? ref.y + (ref.height - b.height) / 2 : ref.y + ref.height - b.height;
      patch.y = Math.round(y - o.y);
      if (patch.y === n.y) continue;
    }
    ops.push({ op: 'update', id: n.id, patch });
  }
  return { ops, notes };
}

/**
 * Even spacing along an axis. Without `gap` the outer layers stay put and the space between is equalised
 * (needs 3+); with `gap` the layers are packed from the first one. Auto-layout children use the parent's gap.
 */
export function distributeOps(doc: ArchaDocument, ids: string[], axisIn: Axis | string, gap?: number): ArrangeResult {
  const axis: Axis = /^(h|x|row|horizontal)/i.test(axisIn) ? 'horizontal' : /^(v|y|col|vertical)/i.test(axisIn) ? 'vertical' : (() => { throw new Error(`distribute axis must be "horizontal" or "vertical" (got "${axisIn}")`); })();
  const nodes = usable(doc, ids);
  const ops: Op[] = [];
  const notes: string[] = [];
  const flow = nodes.filter((n) => inAutoLayout(doc, n));
  if (flow.length) {
    const parents = new Set(flow.map((n) => n.parentId!));
    for (const pid of parents) {
      const p = doc.require(pid) as FrameNode;
      if (gap !== undefined && p.gap !== gap) ops.push({ op: 'update', id: p.id, patch: { gap: Math.max(0, gap) } });
      notes.push(gap !== undefined ? `"${p.name}" is auto layout: set its gap to ${gap}` : `"${p.name}" is auto layout and already spaces its children evenly — change its gap instead`);
    }
  }
  const free = nodes.filter((n) => !inAutoLayout(doc, n));
  if (free.length < (gap === undefined ? 3 : 2)) {
    if (free.length) notes.push(gap === undefined ? 'distribute needs 3+ free layers (or pass a gap)' : 'distribute needs 2+ free layers');
    return { ops, notes };
  }
  const h = axis === 'horizontal';
  const items = free.map((n) => ({ n, b: doc.worldBounds(n.id) })).sort((a, c) => (h ? a.b.x - c.b.x : a.b.y - c.b.y));
  const start = h ? items[0]!.b.x : items[0]!.b.y;
  const size = (b: Rect) => (h ? b.width : b.height);
  let space = gap;
  if (space === undefined) {
    const last = items.at(-1)!.b;
    const end = h ? last.x + last.width : last.y + last.height;
    space = (end - start - items.reduce((s, i) => s + size(i.b), 0)) / (items.length - 1);
  }
  let cursor = start;
  for (const { n, b } of items) {
    const o = originOf(doc, n.parentId!);
    const v = Math.round(cursor - (h ? o.x : o.y));
    if (v !== (h ? n.x : n.y)) ops.push({ op: 'update', id: n.id, patch: h ? { x: v } : { y: v } });
    cursor += size(b) + space;
  }
  return { ops, notes };
}

/**
 * Wraps layers that share a parent in a new frame at their place. `frame.layout` "row" | "column" makes it
 * auto layout (hugging its content); "auto" picks the direction from the layers' arrangement.
 */
export function wrapOps(doc: ArchaDocument, ids: string[], frame: Record<string, unknown> = {}): { ops: Op[]; rootId: string } {
  const nodes = usable(doc, ids);
  if (!nodes.length) throw new Error('wrap needs at least one layer');
  const parentId = nodes[0]!.parentId!;
  if (!nodes.every((n) => n.parentId === parentId)) throw new Error('wrap: the layers must share a parent');
  const parent = doc.require(parentId);
  const order = isContainer(parent) ? parent.children : [];
  const sorted = [...nodes].sort((a, c) => order.indexOf(a.id) - order.indexOf(c.id));
  const b = boundsOf(doc, sorted.map((n) => n.id));
  const o = originOf(doc, parentId);
  const wide = b.width > b.height * 1.5;
  const layout = frame.layout === 'auto' ? (wide ? 'row' : 'column') : (frame.layout as string | undefined) ?? 'none';
  const flow = layout !== 'none';
  const input = {
    type: 'frame', name: flow ? 'Auto layout' : 'Frame', clip: false, fills: [],
    x: Math.round(b.x - o.x), y: Math.round(b.y - o.y), width: Math.round(b.width), height: Math.round(b.height),
    ...(flow ? { gap: 12, sizing: { horizontal: 'hug', vertical: 'hug' } } : {}),
    ...frame, layout,
  } as unknown as NodeInput;
  const inserted = insertOpsFor(input, parentId, order.indexOf(sorted[0]!.id));
  const ops: Op[] = [...inserted.ops];
  // Auto layout keeps reading order: left→right for a row, top→bottom for a column.
  const row = layout === 'row' || (layout !== 'column' && wide);
  const byPos = flow ? [...sorted].sort((a, c) => { const ab = doc.worldBounds(a.id), cb = doc.worldBounds(c.id); return row ? ab.x - cb.x : ab.y - cb.y; }) : sorted;
  for (const n of byPos) {
    const wb = doc.worldBounds(n.id);
    ops.push({ op: 'move', id: n.id, parentId: inserted.rootId });
    if (!flow) ops.push({ op: 'update', id: n.id, patch: { x: Math.round(wb.x - b.x), y: Math.round(wb.y - b.y) } });
  }
  return { ops, rootId: inserted.rootId };
}
