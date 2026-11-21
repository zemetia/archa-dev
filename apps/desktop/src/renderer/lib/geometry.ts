import { isContainer, type Node } from '@archa/schema';
import type { ArchaDocument, Rect } from '@archa/core';
import type { Camera } from './store';

export const toWorld = (cam: Camera, sx: number, sy: number) => ({ x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom });
export const toScreen = (cam: Camera, wx: number, wy: number) => ({ x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y });

export const pageRoot = (doc: ArchaDocument) => doc.pages[0]!.rootId;

/** How close (page units) a click must land to a connector line to hit it. */
const LINE_HIT = 6;

function contains(n: Node, r: Rect, x: number, y: number): boolean {
  if (n.type === 'connector') return distanceToPolyline(n.points, r.x, r.y, x, y) <= LINE_HIT;
  if (x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.height) return false;
  if (n.type === 'ellipse') {
    const rx = r.width / 2, ry = r.height / 2;
    const dx = (x - r.x - rx) / rx, dy = (y - r.y - ry) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return true;
}

/**
 * Path from the top-level node down to the deepest node under the point.
 * Clipping frames hide children outside their box; hidden and locked nodes are skipped.
 */
export function hitPath(doc: ArchaDocument, x: number, y: number, exclude?: Set<string>): Node[] {
  // (px, py) is the point in the parent's own coordinates, so turned frames hit-test their children right.
  const visit = (id: string, px: number, py: number): Node[] | null => {
    const n = doc.get(id);
    if (!n || !n.visible || n.locked || exclude?.has(id)) return null;
    const local = toLocal(n, px, py);
    const inside = contains(n, { x: 0, y: 0, width: n.width, height: n.height }, local.x, local.y);
    if (isContainer(n) && (inside || !(n.type === 'frame' && n.clip))) {
      for (let i = n.children.length - 1; i >= 0; i--) {
        const sub = visit(n.children[i]!, local.x, local.y);
        if (sub) return [n, ...sub];
      }
    }
    if (n.type === 'group') return null;
    return inside ? [n] : null;
  };
  const root = doc.get(pageRoot(doc));
  if (!root || !isContainer(root)) return [];
  for (let i = root.children.length - 1; i >= 0; i--) {
    const p = visit(root.children[i]!, x, y);
    if (p) return p;
  }
  return [];
}

/* -------------------------------- rotation -------------------------------- */

type Pt = { x: number; y: number };
/** Affine map [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (canvas order). */
export type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const applyMat = (m: Mat, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export function invertMat(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
const rad = (deg: number) => (deg * Math.PI) / 180;

/** A node's own step: move to x/y, then turn about the box centre (connectors never turn). */
function stepMat(n: Node): Mat {
  const t: Mat = [1, 0, 0, 1, n.x, n.y];
  if (!n.rotation || n.type === 'connector') return t;
  const c = Math.cos(rad(n.rotation)), s = Math.sin(rad(n.rotation));
  const cx = n.width / 2, cy = n.height / 2;
  return mul(t, [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]);
}

/** Page point → the node's own box coordinates (0,0 = its top-left corner, unrotated). */
function toLocal(n: Node, px: number, py: number): Pt {
  return applyMat(invertMat(stepMat(n)), px, py);
}

/** Node box → page coordinates, through every turned ancestor. */
export function nodeMatrix(doc: ArchaDocument, id: string): Mat {
  const chain: Node[] = [];
  for (let n = doc.get(id); n && n.type !== 'page'; n = n.parentId ? doc.get(n.parentId) : undefined) chain.unshift(n);
  return chain.reduce((m, n) => mul(m, stepMat(n)), IDENTITY);
}

/** Total turn of a node on the page, in degrees (its own plus its ancestors'). */
export function pageRotation(doc: ArchaDocument, id: string): number {
  let deg = 0;
  for (let n = doc.get(id); n && n.type !== 'page'; n = n.parentId ? doc.get(n.parentId) : undefined) if (n.type !== 'connector') deg += n.rotation;
  return deg;
}

/** The four corners of a node's box on the page: nw, ne, se, sw. */
export function nodeCorners(doc: ArchaDocument, id: string): Pt[] {
  const n = doc.require(id);
  const m = nodeMatrix(doc, id);
  return [applyMat(m, 0, 0), applyMat(m, n.width, 0), applyMat(m, n.width, n.height), applyMat(m, 0, n.height)];
}

/** Page bounding box of a node, turned corners included. */
export function visualBounds(doc: ArchaDocument, id: string): Rect {
  const n = doc.require(id);
  if (n.type === 'connector' || !pageRotation(doc, id)) return doc.worldBounds(id);
  const ps = nodeCorners(doc, id);
  const x = Math.min(...ps.map((p) => p.x)), y = Math.min(...ps.map((p) => p.y));
  return { x, y, width: Math.max(...ps.map((p) => p.x)) - x, height: Math.max(...ps.map((p) => p.y)) - y };
}

/**
 * Which node a click selects (Figma-like): inside a top-level frame its direct child is picked;
 * once something is selected, clicks stay at that depth; `deep` picks the deepest node.
 */
export function pickFromPath(doc: ArchaDocument, path: Node[], selection: string[], deep: boolean): Node | undefined {
  if (!path.length) return undefined;
  if (deep) return path.at(-1);
  const scopeParent = selection[0] ? doc.get(selection[0])?.parentId : undefined;
  if (scopeParent) {
    const i = path.findIndex((n) => n.id === scopeParent);
    if (i >= 0 && path[i + 1]) return path[i + 1];
  }
  const top = path[0]!;
  if (top.type === 'frame' && path[1]) return path[1];
  return top;
}

/** Deepest container frame under the point that can receive children (drop / create target). */
export function containerAt(doc: ArchaDocument, x: number, y: number, exclude?: Set<string>): Node {
  const path = hitPath(doc, x, y, exclude);
  for (let i = path.length - 1; i >= 0; i--) {
    const n = path[i]!;
    if (n.type === 'frame') return n;
  }
  return doc.require(pageRoot(doc));
}

export function selectionBounds(doc: ArchaDocument, ids: string[]): Rect | null {
  const rects = ids.filter((id) => doc.get(id)).map((id) => visualBounds(doc, id));
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** World origin of a container's coordinate space. */
export function originOf(doc: ArchaDocument, id: string): { x: number; y: number } {
  const n = doc.require(id);
  if (n.type === 'page') return { x: 0, y: 0 };
  const b = doc.worldBounds(id);
  return { x: b.x, y: b.y };
}

export function fitCamera(doc: ArchaDocument, viewport: { width: number; height: number }): Camera {
  const kids = doc.children(pageRoot(doc)).filter((n) => n.visible);
  if (!kids.length) return { x: viewport.width / 2 - 200, y: viewport.height / 2 - 150, zoom: 1 };
  const b = selectionBounds(doc, kids.map((k) => k.id))!;
  const zoom = Math.min(2, Math.max(0.02, Math.min((viewport.width - 160) / b.width, (viewport.height - 160) / b.height)));
  return { zoom, x: viewport.width / 2 - (b.x + b.width / 2) * zoom, y: viewport.height / 2 - (b.y + b.height / 2) * zoom };
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function handlePoint(r: Rect, h: Handle): { x: number; y: number } {
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  return {
    x: h.includes('w') ? r.x : h.includes('e') ? r.x + r.width : cx,
    y: h.includes('n') ? r.y : h.includes('s') ? r.y + r.height : cy,
  };
}

/** Text keeps its height from its lines (Canva-like): only width (sides) and scale (corners) handles. */
export const handlesFor = (n: Node): Handle[] => (n.type === 'text' ? HANDLES.filter((h) => h !== 'n' && h !== 's') : HANDLES);

/** Where a resize handle of one node sits on the page (turned with the node). */
export function nodeHandlePoint(doc: ArchaDocument, id: string, h: Handle): Pt {
  const n = doc.require(id);
  const p = handlePoint({ x: 0, y: 0, width: n.width, height: n.height }, h);
  return applyMat(nodeMatrix(doc, id), p.x, p.y);
}

/** Screen px between the top edge and the rotate knob. */
export const ROTATE_GAP = 22;

/** The rotate knob: above the middle of the top edge, along the node's own "up". */
export function rotateHandlePoint(doc: ArchaDocument, id: string, zoom: number): Pt {
  const n = doc.require(id);
  const m = nodeMatrix(doc, id);
  const top = applyMat(m, n.width / 2, 0);
  const len = Math.hypot(m[2], m[3]) || 1;
  return { x: top.x - (m[2] / len) * (ROTATE_GAP / zoom), y: top.y - (m[3] / len) * (ROTATE_GAP / zoom) };
}

/** Degrees in (-180, 180], two decimals. */
export function normalizeAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 100) / 100;
}

const OPPOSITE: Record<Handle, Handle> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };

/** What a resize drag needs from its start: the fixed corner on the page and the maps to undo turns. */
export type ResizeFrame = { anchor: Pt; toNodeAxes: Mat; toParent: Mat; rotation: number };

export function resizeFrame(doc: ArchaDocument, id: string, h: Handle): ResizeFrame {
  const n = doc.require(id);
  const m = nodeMatrix(doc, id);
  const a = handlePoint({ x: 0, y: 0, width: n.width, height: n.height }, OPPOSITE[h]);
  const parent = n.parentId ? doc.get(n.parentId) : undefined;
  return {
    anchor: applyMat(m, a.x, a.y),
    toNodeAxes: invertMat([m[0], m[1], m[2], m[3], 0, 0]),
    toParent: invertMat(parent && parent.type !== 'page' ? nodeMatrix(doc, parent.id) : IDENTITY),
    rotation: n.type === 'connector' ? 0 : n.rotation,
  };
}

/**
 * New box (parent coordinates) for a resize: the pointer moved by (dx, dy) on the page, read along the
 * node's own (possibly turned) axes, and the opposite handle stays where it was on the page.
 */
export function resizedBox(f: ResizeFrame, h: Handle, orig: { width: number; height: number }, dx: number, dy: number, keepRatio: boolean): Rect {
  const d = applyMat(f.toNodeAxes, dx, dy);
  let width = orig.width, height = orig.height;
  if (h.includes('e')) width += d.x;
  if (h.includes('w')) width -= d.x;
  if (h.includes('s')) height += d.y;
  if (h.includes('n')) height -= d.y;
  if (keepRatio && orig.width && orig.height) {
    const ratio = orig.width / orig.height;
    if (h === 'n' || h === 's') width = height * ratio; else height = width / ratio;
  }
  width = Math.max(1, width); height = Math.max(1, height);
  const a = handlePoint({ x: 0, y: 0, width, height }, OPPOSITE[h]);
  const p = applyMat(f.toParent, f.anchor.x, f.anchor.y);
  // The box turns about its centre: the anchor's offset from x/y is the turned (a − centre) + centre.
  const c = Math.cos(rad(f.rotation)), s = Math.sin(rad(f.rotation));
  const ax = a.x - width / 2, ay = a.y - height / 2;
  return { x: p.x - (width / 2 + c * ax - s * ay), y: p.y - (height / 2 + s * ax + c * ay), width, height };
}

/** Resize cursor for a handle on a box turned by `deg`. */
export function turnedCursor(h: Handle, deg: number): string {
  const ring: Handle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const i = (ring.indexOf(h) + Math.round(deg / 45) + 800) % 8;
  return handleCursor[ring[i]!];
}

export const handleCursor: Record<Handle, string> ={ nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

/** A connector's route in page coordinates, with its two ends. */
export function connectorEnds(doc: ArchaDocument, id: string) {
  const n = doc.get(id);
  if (n?.type !== 'connector' || n.points.length < 2) return null;
  const b = doc.worldBounds(id);
  const points = n.points.map((p) => ({ x: b.x + p.x, y: b.y + p.y }));
  return { points, start: points[0]!, end: points.at(-1)! };
}

/** Distance from (x, y) to a polyline whose points are relative to (ox, oy). */
export function distanceToPolyline(pts: ReadonlyArray<{ x: number; y: number }>, ox: number, oy: number, x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = ox + pts[i - 1]!.x, ay = oy + pts[i - 1]!.y, bx = ox + pts[i]!.x, by = oy + pts[i]!.y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

/**
 * Pages of a multi-layer export in canvas reading order: rows top to bottom (layers whose vertical
 * middles fall inside one another's height share a row), left to right within a row.
 */
export function readingOrder(doc: ArchaDocument, ids: string[]): string[] {
  // A layer inside another selected layer is already on that page.
  const live = ids.filter((id) => doc.get(id) && !ids.some((other) => other !== id && doc.isAncestor(other, id)));
  const boxes = [...new Set(live)].map((id) => ({ id, b: doc.worldBounds(id) }));
  boxes.sort((a, b) => a.b.y - b.b.y);
  const rows: Array<{ top: number; bottom: number; items: typeof boxes }> = [];
  for (const it of boxes) {
    const mid = it.b.y + it.b.height / 2;
    const row = rows.find((r) => mid >= r.top && mid <= r.bottom);
    if (row) { row.items.push(it); row.bottom = Math.max(row.bottom, it.b.y + it.b.height); }
    else rows.push({ top: it.b.y, bottom: it.b.y + it.b.height, items: [it] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.b.x - b.b.x).map((it) => it.id));
}
