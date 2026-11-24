import type { Node, NodeId } from '@archa/schema';
import type { ArchaDocument } from './document';

/*
 * Node transforms for moving layers between containers without moving them on the canvas
 * (group / ungroup). A node's step is: move to x / y, then turn `rotation` degrees about its box
 * centre; a child's page transform is its ancestors' steps applied in turn. There is no scale or
 * skew, so every matrix here is a rotation plus a translation. Connectors never turn.
 */

/** Affine map [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (canvas order). */
export type Mat = [number, number, number, number, number, number];
export type Pt = { x: number; y: number };

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
export const mulMat = (m: Mat, n: Mat): Mat => [
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

/** Turn `deg` about (cx, cy). */
export function turnAbout(deg: number, cx: number, cy: number): Mat {
  if (!deg) return IDENTITY;
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

/** A node's own step inside its parent. */
export function stepMat(n: Node): Mat {
  const t: Mat = [1, 0, 0, 1, n.x, n.y];
  if (!n.rotation || n.type === 'connector') return t;
  return mulMat(t, turnAbout(n.rotation, n.width / 2, n.height / 2));
}

/** Box coordinates of `id` → its page; for a page (or a missing node) the identity. */
export function pageMatrix(doc: ArchaDocument, id: NodeId): Mat {
  const chain: Node[] = [];
  for (let n = doc.get(id); n && n.type !== 'page'; n = n.parentId ? doc.get(n.parentId) : undefined) chain.unshift(n);
  return chain.reduce((m, n) => mulMat(m, stepMat(n)), IDENTITY);
}

/** Degrees in [-180, 180), with float noise near whole degrees removed. */
export function normalizeDegrees(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  const r = Math.round(d * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

/** Rounds away float noise (1/1000 px) so moved layers keep tidy numbers. */
export const tidy = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

/**
 * Where node `id` sits in container `parentId`'s own coordinates if it were its child, keeping it
 * exactly where it is on the page: its x / y (upright box) and rotation there.
 */
export function placementIn(doc: ArchaDocument, id: NodeId, parentId: NodeId): { x: number; y: number; rotation: number } {
  const n = doc.require(id);
  const rel = mulMat(invertMat(pageMatrix(doc, parentId)), pageMatrix(doc, id));
  if (n.type === 'connector') {
    // Connectors are routed from translated origins only, so they move by the origin difference.
    const o = applyMat(rel, 0, 0);
    return { x: o.x, y: o.y, rotation: 0 };
  }
  const c = applyMat(rel, n.width / 2, n.height / 2);
  const rotation = normalizeDegrees((Math.atan2(rel[1], rel[0]) * 180) / Math.PI);
  return { x: c.x - n.width / 2, y: c.y - n.height / 2, rotation };
}

/** Axis-aligned box of a w × h box at x / y turned `rotation` degrees about its centre. */
export function turnedBox(x: number, y: number, w: number, h: number, rotation: number): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!rotation) return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  const m = mulMat([1, 0, 0, 1, x, y], turnAbout(rotation, w / 2, h / 2));
  const ps = [applyMat(m, 0, 0), applyMat(m, w, 0), applyMat(m, w, h), applyMat(m, 0, h)];
  return {
    minX: Math.min(...ps.map((p) => p.x)), minY: Math.min(...ps.map((p) => p.y)),
    maxX: Math.max(...ps.map((p) => p.x)), maxY: Math.max(...ps.map((p) => p.y)),
  };
}
