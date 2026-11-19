import { colorToCss, type ConnectorEnd, type ConnectorNode } from '@archa/schema';
import type { ArchaDocument, Rect } from './document';

/*
 * Connector routing (blueprint DOCUMENT_MODEL/01 → Connectors). Runs after layout, in the core and in
 * the renderer mirror alike, so a line follows the nodes it is attached to without extra ops.
 */

type Pt = { x: number; y: number };
type Side = Exclude<ConnectorEnd['side'], 'auto'>;
/** One end in page coordinates: the box it is attached to (null = free) or its point. */
export type ResolvedEnd = { box: Rect | null; point: Pt; side: ConnectorEnd['side'] };

const OUT: Record<Side, Pt> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
/** Length an elbow line runs straight out of a node before it turns. */
const STUB = 24;
/** Line colour and width when a connector has no visible stroke. */
export const CONNECTOR_DEFAULT_STROKE = { css: '#71717a', width: 2 };

const r2 = (v: number) => Math.round(v * 100) / 100;
const center = (r: Rect): Pt => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const refOf = (e: ResolvedEnd) => (e.box ? center(e.box) : e.point);

/** Rebuilds the box and `points` of every connector from its ends. Mutates like layout does. */
export function routeConnectors(doc: ArchaDocument): void {
  for (const n of doc.nodes.values()) if (n.type === 'connector') routeOne(doc, n);
}

/** The page-space box a connector end is attached to, or null for a free (or dangling) end. */
export function attachedBox(doc: ArchaDocument, nodeId: string | null, selfId?: string): Rect | null {
  if (!nodeId || nodeId === selfId) return null;
  const t = doc.get(nodeId);
  if (!t || t.type === 'page' || t.type === 'connector') return null;
  return doc.worldBounds(t.id);
}

function originOf(doc: ArchaDocument, parentId: string | null): Pt {
  const p = parentId ? doc.get(parentId) : undefined;
  if (!p || p.type === 'page') return { x: 0, y: 0 };
  const b = doc.worldBounds(p.id);
  return { x: b.x, y: b.y };
}

function routeOne(doc: ArchaDocument, n: ConnectorNode) {
  const o = originOf(doc, n.parentId);
  const resolve = (e: ConnectorEnd): ResolvedEnd => ({ box: attachedBox(doc, e.nodeId, n.id), point: { x: o.x + e.x, y: o.y + e.y }, side: e.side });
  const a = resolve(n.start), b = resolve(n.end);
  const world = connectorRoute(a, b, n.routing);
  const xs = world.map((p) => p.x), ys = world.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const m = n as { -readonly [K in keyof ConnectorNode]: ConnectorNode[K] };
  m.x = r2(minX - o.x);
  m.y = r2(minY - o.y);
  m.width = Math.max(1, r2(Math.max(...xs) - minX));
  m.height = Math.max(1, r2(Math.max(...ys) - minY));
  m.points = world.map((p) => ({ x: r2(p.x - minX), y: r2(p.y - minY) }));
  // Attached ends remember where they were, so the line stays put if its node is deleted.
  const first = world[0]!, last = world.at(-1)!;
  if (a.box) m.start = { ...n.start, x: r2(first.x - o.x), y: r2(first.y - o.y) };
  if (b.box) m.end = { ...n.end, x: r2(last.x - o.x), y: r2(last.y - o.y) };
}

/** Route between two resolved ends, in page coordinates. Shared with the canvas preview while drawing. */
export function connectorRoute(a: ResolvedEnd, b: ResolvedEnd, routing: ConnectorNode['routing']): Pt[] {
  if (routing === 'straight') {
    const pa = a.box ? (a.side === 'auto' ? clipToBox(a.box, refOf(b)) : anchor(a.box, a.side)) : a.point;
    const pb = b.box ? (b.side === 'auto' ? clipToBox(b.box, pa) : anchor(b.box, b.side)) : b.point;
    return [pa, pb];
  }
  const axis = autoAxis(a, b);
  const sa = pickSide(a, b, axis), sb = pickSide(b, a, axis);
  const S = a.box ? anchor(a.box, sa) : a.point;
  const E = b.box ? anchor(b.box, sb) : b.point;
  return simplify(elbow(S, OUT[sa], E, OUT[sb]));
}

/** Horizontal when the ends are further apart sideways than vertically (gaps between boxes, not centres). */
function autoAxis(a: ResolvedEnd, b: ResolvedEnd): 'h' | 'v' {
  const ca = refOf(a), cb = refOf(b);
  const gx = Math.abs(cb.x - ca.x) - ((a.box?.width ?? 0) + (b.box?.width ?? 0)) / 2;
  const gy = Math.abs(cb.y - ca.y) - ((a.box?.height ?? 0) + (b.box?.height ?? 0)) / 2;
  return gx >= gy ? 'h' : 'v';
}

function pickSide(e: ResolvedEnd, other: ResolvedEnd, axis: 'h' | 'v'): Side {
  // A free end has no side of its own: it always faces the other end.
  if (e.side !== 'auto' && e.box) return e.side;
  const c = refOf(e), t = refOf(other);
  return axis === 'h' ? (t.x >= c.x ? 'right' : 'left') : (t.y >= c.y ? 'bottom' : 'top');
}

function anchor(r: Rect, side: Side): Pt {
  const c = center(r);
  return side === 'top' ? { x: c.x, y: r.y } : side === 'bottom' ? { x: c.x, y: r.y + r.height } : side === 'left' ? { x: r.x, y: c.y } : { x: r.x + r.width, y: c.y };
}

/** Where the ray from the box centre towards `to` leaves the box. */
function clipToBox(r: Rect, to: Pt): Pt {
  const c = center(r);
  const dx = to.x - c.x, dy = to.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? r.width / 2 / Math.abs(dx) : Infinity, dy ? r.height / 2 / Math.abs(dy) : Infinity, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Orthogonal path from S (leaving along dS) to E (entered against dE). */
function elbow(S: Pt, dS: Pt, E: Pt, dE: Pt): Pt[] {
  const S1 = { x: S.x + dS.x * STUB, y: S.y + dS.y * STUB };
  const E1 = { x: E.x + dE.x * STUB, y: E.y + dE.y * STUB };
  const ahead = (from: Pt, d: Pt, to: Pt) => (to.x - from.x) * d.x + (to.y - from.y) * d.y > 0;
  const hS = dS.x !== 0, hE = dE.x !== 0;
  if (hS && hE) {
    if (ahead(S, dS, E) && ahead(E, dE, S)) { const mx = (S.x + E.x) / 2; return [S, { x: mx, y: S.y }, { x: mx, y: E.y }, E]; }
    if (dS.x === dE.x) { const x = dS.x > 0 ? Math.max(S1.x, E1.x) : Math.min(S1.x, E1.x); return [S, { x, y: S.y }, { x, y: E.y }, E]; }
    const my = (S.y + E.y) / 2;
    return [S, S1, { x: S1.x, y: my }, { x: E1.x, y: my }, E1, E];
  }
  if (!hS && !hE) {
    if (ahead(S, dS, E) && ahead(E, dE, S)) { const my = (S.y + E.y) / 2; return [S, { x: S.x, y: my }, { x: E.x, y: my }, E]; }
    if (dS.y === dE.y) { const y = dS.y > 0 ? Math.max(S1.y, E1.y) : Math.min(S1.y, E1.y); return [S, { x: S.x, y }, { x: E.x, y }, E]; }
    const mx = (S.x + E.x) / 2;
    return [S, S1, { x: mx, y: S1.y }, { x: mx, y: E1.y }, E1, E];
  }
  if (hS) {
    const c = { x: E.x, y: S.y };
    return ahead(S, dS, c) && ahead(E, dE, c) ? [S, c, E] : [S, S1, { x: S1.x, y: E1.y }, E1, E];
  }
  const c = { x: S.x, y: E.y };
  return ahead(S, dS, c) && ahead(E, dE, c) ? [S, c, E] : [S, S1, { x: E1.x, y: S1.y }, E1, E];
}

/** Drops repeated points and points in the middle of a straight run. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out.at(-1);
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    const prev = out.at(-2);
    if (prev && last && Math.abs((last.x - prev.x) * (p.y - last.y) - (last.y - prev.y) * (p.x - last.x)) < 0.01) out.pop();
    out.push(p);
  }
  return out.length >= 2 ? out : [pts[0]!, pts.at(-1)!];
}

/** Colour (CSS) and width the line is drawn with. */
export function connectorStroke(n: ConnectorNode): { css: string; width: number } {
  const s = n.strokes.find((st) => st.visible && st.width > 0);
  return s ? { css: colorToCss(s.color), width: s.width } : CONNECTOR_DEFAULT_STROKE;
}

/**
 * SVG path data in node coordinates: the line (stroked) and its end caps (filled with the line colour).
 * Shared by the canvas renderer and the SVG/HTML exporters.
 */
export function connectorGeometry(n: ConnectorNode): { line: string; caps: string[] } {
  const pts = n.points.map((p) => ({ ...p }));
  if (pts.length < 2) return { line: '', caps: [] };
  const { width } = connectorStroke(n);
  const caps: string[] = [];
  const cap = (kind: ConnectorNode['startCap'], tip: Pt, prev: Pt): number => {
    const dx = tip.x - prev.x, dy = tip.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (kind === 'none' || !len) return 0;
    const ux = dx / len, uy = dy / len;
    if (kind === 'dot') {
      const r = Math.max(3, width * 1.75);
      caps.push(`M${r2(tip.x - r)} ${r2(tip.y)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`);
      return 0;
    }
    const size = Math.max(9, width * 4.5), hw = size * 0.5;
    const bx = tip.x - ux * size, by = tip.y - uy * size;
    caps.push(`M${r2(tip.x)} ${r2(tip.y)}L${r2(bx - uy * hw)} ${r2(by + ux * hw)}L${r2(bx + uy * hw)} ${r2(by - ux * hw)}Z`);
    // Stop the line inside the arrow so a thick stroke does not poke out of its tip.
    return Math.min(size * 0.7, len - 0.01);
  };
  const shorten = (i: number, j: number, by: number) => {
    if (!by) return;
    const p = pts[i]!, q = pts[j]!;
    const len = Math.hypot(p.x - q.x, p.y - q.y);
    p.x -= ((p.x - q.x) / len) * by;
    p.y -= ((p.y - q.y) / len) * by;
  };
  const last = pts.length - 1;
  shorten(0, 1, cap(n.startCap, pts[0]!, pts[1]!));
  shorten(last, last - 1, cap(n.endCap, pts[last]!, pts[last - 1]!));
  return { line: roundedPolyline(pts, n.routing === 'elbow' ? n.cornerRadius : 0), caps };
}

function roundedPolyline(pts: Pt[], radius: number): string {
  let d = `M${r2(pts[0]!.x)} ${r2(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]!, c = pts[i]!, nx = pts[i + 1]!;
    const lin = Math.hypot(c.x - p.x, c.y - p.y), lout = Math.hypot(nx.x - c.x, nx.y - c.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    if (r <= 0.5) { d += `L${r2(c.x)} ${r2(c.y)}`; continue; }
    const a = { x: c.x - ((c.x - p.x) / lin) * r, y: c.y - ((c.y - p.y) / lin) * r };
    const b = { x: c.x + ((nx.x - c.x) / lout) * r, y: c.y + ((nx.y - c.y) / lout) * r };
    d += `L${r2(a.x)} ${r2(a.y)}Q${r2(c.x)} ${r2(c.y)} ${r2(b.x)} ${r2(b.y)}`;
  }
  const end = pts.at(-1)!;
  return `${d}L${r2(end.x)} ${r2(end.y)}`;
}
