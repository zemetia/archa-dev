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
  const visit = (id: string, ox: number, oy: number): Node[] | null => {
    const n = doc.get(id);
    if (!n || !n.visible || n.locked || exclude?.has(id)) return null;
    const r = { x: ox + n.x, y: oy + n.y, width: n.width, height: n.height };
    const inside = contains(n, r, x, y);
    if (isContainer(n) && (inside || !(n.type === 'frame' && n.clip))) {
      for (let i = n.children.length - 1; i >= 0; i--) {
        const sub = visit(n.children[i]!, r.x, r.y);
        if (sub) return [n, ...sub];
      }
    }
    if (n.type === 'group') return null;
    return inside ? [n] : null;
  };
  const root = doc.get(pageRoot(doc));
  if (!root || !isContainer(root)) return [];
  for (let i = root.children.length - 1; i >= 0; i--) {
    const p = visit(root.children[i]!, 0, 0);
    if (p) return p;
  }
  return [];
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
  const rects = ids.filter((id) => doc.get(id)).map((id) => doc.worldBounds(id));
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

export const handleCursor: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

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
