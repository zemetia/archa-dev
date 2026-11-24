import { isContainer, type Node, type NodeId, type Op } from '@archa/schema';
import type { ArchaDocument } from './document';
import { applyMat, turnAbout, turnedBox } from './transform';

/*
 * Group bounds (blueprint DOCUMENT_MODEL/01 → Groups). A group has no box of its own: after every
 * transaction its x / y / width / height become the union of its children, and the children shift
 * so they stay where they are on the canvas. `applyOps` runs this after layout and records each change
 * as a real update with its inverse, so undo puts the old box and positions back exactly.
 */

const EPS = 1e-6;
type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Union of the children's boxes in the group's own coordinates; hidden children count only when all are hidden. */
function childUnion(kids: Node[]): Box | null {
  const shown = kids.filter((k) => k.visible);
  const use = shown.length ? shown : kids;
  if (!use.length) return null;
  const boxes = use.map((k) => (k.type === 'connector'
    ? { minX: k.x, minY: k.y, maxX: k.x + k.width, maxY: k.y + k.height }
    : turnedBox(k.x, k.y, k.width, k.height, k.rotation)));
  return {
    minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/** Patches that fit one group to its children: the group's own patch and one per child. */
export function groupFitPatches(doc: ArchaDocument, g: Node): Array<{ id: NodeId; patch: Record<string, unknown> }> {
  if (g.type !== 'group') return [];
  const kids = doc.children(g.id);
  const u = childUnion(kids);
  if (!u) return [];
  const w = u.maxX - u.minX, h = u.maxY - u.minY;
  const fixed = g.sizing.horizontal === 'fixed' && g.sizing.vertical === 'fixed';
  if (Math.abs(u.minX) < EPS && Math.abs(u.minY) < EPS && Math.abs(w - g.width) < EPS && Math.abs(h - g.height) < EPS && fixed) return [];
  // The new origin, so a turned group keeps its children in place even though its centre moves.
  const turn = turnAbout(g.rotation, 0, 0);
  const d = applyMat(turn, u.minX + (w - g.width) / 2, u.minY + (h - g.height) / 2);
  const out: Array<{ id: NodeId; patch: Record<string, unknown> }> = [{
    id: g.id,
    patch: {
      x: g.x + g.width / 2 - w / 2 + d.x, y: g.y + g.height / 2 - h / 2 + d.y, width: w, height: h,
      ...(fixed ? {} : { sizing: { horizontal: 'fixed', vertical: 'fixed' } }),
    },
  }];
  if (Math.abs(u.minX) < EPS && Math.abs(u.minY) < EPS) return out;
  for (const k of kids) {
    const patch: Record<string, unknown> = { x: k.x - u.minX, y: k.y - u.minY };
    if (k.type === 'connector') {
      patch.start = { ...k.start, x: k.start.x - u.minX, y: k.start.y - u.minY };
      patch.end = { ...k.end, x: k.end.x - u.minX, y: k.end.y - u.minY };
    }
    out.push({ id: k.id, patch });
  }
  return out;
}

/** Groups deepest first, so an outer group fits around inner groups that already fitted. */
function groupsBottomUp(doc: ArchaDocument): Node[] {
  const out: Node[] = [];
  const visit = (id: NodeId) => {
    const n = doc.get(id);
    if (!n || !isContainer(n)) return;
    for (const c of n.children) visit(c);
    if (n.type === 'group') out.push(n);
  };
  for (const p of doc.pages) visit(p.rootId);
  return out;
}

/**
 * Fits every group to its children. Writes straight into the document (layout-style, no validation)
 * and returns the inverse ops, newest first, for the caller's undo record. Empty groups keep their box.
 */
export function fitGroups(doc: ArchaDocument, touched?: Set<string>): Op[] {
  const inverse: Op[] = [];
  for (const g of groupsBottomUp(doc)) {
    for (const { id, patch } of groupFitPatches(doc, doc.require(g.id))) {
      const prev = doc.require(id) as Record<string, unknown>;
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, structuredClone(prev[k])]));
      doc.nodes.set(id, { ...prev, ...patch } as Node);
      touched?.add(id);
      inverse.unshift({ op: 'update', id, patch: before });
    }
  }
  return inverse;
}
