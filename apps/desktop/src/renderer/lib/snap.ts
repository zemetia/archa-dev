import type { ArchaDocument } from '@archa/core';
import { isContainer } from '@archa/schema';
import { visualBounds } from './geometry';

/*
 * Smart guides while moving layers (Canva / Figma style): the dragged box's left, centre and right
 * edges snap to the same edges of nearby layers, and likewise top, middle and bottom. Every edge pair
 * that lines up after the snap is drawn as a guide line spanning both boxes. Pure: Canvas supplies boxes.
 */

type Rect = { x: number; y: number; width: number; height: number };
/** A guide line in page coordinates: vertical (`x`, at = x) or horizontal (`y`, at = y), from → to on the other axis. */
export type Guide = { axis: 'x' | 'y'; at: number; from: number; to: number };

const edgesX = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width];
const edgesY = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height];

/** Smallest shift (|shift| ≤ threshold) that lines one moving edge up with a target edge, or 0. */
function nearest(moving: number[], targets: number[][], threshold: number): number | null {
  let best: number | null = null;
  for (const t of targets) for (const te of t) for (const me of moving) {
    const d = te - me;
    if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best;
}

/**
 * Snaps a moving box to target boxes. `threshold` is in page units (screen px / zoom); `round` keeps the
 * snapped shift on whole units like a plain move. Returns the extra shift to apply and the guides to draw.
 */
export function snapMove(moving: Rect, targets: Rect[], threshold: number, round = true): { dx: number; dy: number; guides: Guide[] } {
  const sx = nearest(edgesX(moving), targets.map(edgesX), threshold);
  const sy = nearest(edgesY(moving), targets.map(edgesY), threshold);
  const dx = sx === null ? 0 : round ? Math.round(sx) : sx;
  const dy = sy === null ? 0 : round ? Math.round(sy) : sy;
  const m = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  const eps = round ? 0.51 : 1e-6;
  // One line per position: boxes sharing an edge widen the same guide.
  const add = (g: Guide) => {
    const prev = guides.find((o) => o.axis === g.axis && Math.abs(o.at - g.at) < 0.01);
    if (prev) { prev.from = Math.min(prev.from, g.from); prev.to = Math.max(prev.to, g.to); } else guides.push(g);
  };
  for (const t of targets) {
    if (sx !== null) for (const te of edgesX(t)) for (const me of edgesX(m)) {
      if (Math.abs(te - me) <= eps) add({ axis: 'x', at: te, from: Math.min(m.y, t.y), to: Math.max(m.y + m.height, t.y + t.height) });
    }
    if (sy !== null) for (const te of edgesY(t)) for (const me of edgesY(m)) {
      if (Math.abs(te - me) <= eps) add({ axis: 'y', at: te, from: Math.min(m.x, t.x), to: Math.max(m.x + m.width, t.x + t.width) });
    }
  }
  return { dx, dy, guides };
}

/**
 * What a drag can snap to: the other layers in the dragged layers' frame and in the frame under the
 * pointer, plus those frames' own boxes (a page has no box). Hidden layers and the dragged ones are skipped.
 */
export function snapTargets(doc: ArchaDocument, containers: string[], exclude: Set<string>): Rect[] {
  const out: Rect[] = [];
  const done = new Set<string>();
  for (const id of containers) {
    const c = doc.get(id);
    if (!c || done.has(id)) continue;
    done.add(id);
    if (c.type !== 'page' && !exclude.has(id)) out.push(visualBounds(doc, id));
    if (!isContainer(c)) continue;
    for (const k of doc.children(id)) if (k.visible && !exclude.has(k.id) && k.type !== 'connector') out.push(visualBounds(doc, k.id));
  }
  return out;
}
