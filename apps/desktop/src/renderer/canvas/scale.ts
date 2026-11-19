import type { ArchaDocument } from '@archa/core';
import type { Node, Op } from '@archa/schema';
import { originOf } from '../lib/geometry';

/**
 * Scale tool: resizes a node *and everything inside it* — child positions and sizes, font sizes,
 * strokes, radii, gaps, padding and shadows — so the result looks like a zoomed copy.
 * `target` is the new box in page coordinates.
 */
export function scaleOps(doc: ArchaDocument, id: string, target: { x: number; y: number; width: number; height: number }): Op[] {
  const root = doc.get(id);
  if (!root || !root.width || !root.height) return [];
  const sx = target.width / root.width, sy = target.height / root.height;
  if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3) return [];
  const k = Math.sqrt(sx * sy);
  const o = originOf(doc, root.parentId!);
  const ops: Op[] = [];
  for (const n of doc.walk(id)) {
    const patch: Record<string, unknown> = n.id === id
      ? { x: r(target.x - o.x), y: r(target.y - o.y), width: r(target.width), height: r(target.height) }
      : { x: r(n.x * sx), y: r(n.y * sy), width: r(n.width * sx), height: r(n.height * sy) };
    Object.assign(patch, scaledStyle(n, k));
    ops.push({ op: 'update', id: n.id, patch });
  }
  return ops;
}

function scaledStyle(n: Node, k: number): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if ('strokes' in n && n.strokes.length) p.strokes = n.strokes.map((s) => ({ ...s, width: r(s.width * k) }));
  if ('effects' in n && n.effects.length) p.effects = n.effects.map((e) => ({ ...e, x: r(e.x * k), y: r(e.y * k), blur: r(e.blur * k) }));
  if ('cornerRadius' in n) p.cornerRadius = r(n.cornerRadius * k);
  if (n.type === 'text') Object.assign(p, { fontSize: r(n.fontSize * k), letterSpacing: r(n.letterSpacing * k) });
  if (n.type === 'sticky') p.fontSize = r(n.fontSize * k);
  if (n.type === 'frame') {
    p.gap = r(n.gap * k);
    p.padding = { top: r(n.padding.top * k), right: r(n.padding.right * k), bottom: r(n.padding.bottom * k), left: r(n.padding.left * k) };
  }
  return p;
}

const r = (v: number) => Math.round(v * 100) / 100;
