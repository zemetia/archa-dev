import type { ArchaDocument, Rect } from '@archa/core';
import type { ConnectorEnd, Node } from '@archa/schema';
import { applyMat, handlePoint, HANDLES, invertMat, nodeMatrix, normalizeAngle, originOf, pageRotation, ROTATE_GAP, selectionBounds, type Handle, type Mat } from './geometry';
import { scaledStyle } from '../canvas/scale';

/*
 * Multi-selection transform (blueprint RENDERING/02): several layers scale or turn as one unit about a
 * shared box. Every step is page space → each layer's own parent space through world matrices, so
 * layers in different (even turned) parents move together. Pure: reads the document, returns patches.
 *
 * Page space has no skew, so a layer's new box is the decomposition of (group map × its own turn):
 * the centre maps exactly, the turn follows its own x axis, width is that axis' stretch and height
 * the stretch across it (area kept). Exact for 90° multiples; a turned layer under a non-uniform
 * scale drops the skew it would need. A flip (dragging past the anchor) mirrors positions and keeps
 * each outline; layers have no mirror property yet, so their content is not mirrored.
 */

type Pt = { x: number; y: number };
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** One layer's start state: its own box (parent coords) and how its parent maps to the page. */
export type Item = {
  id: string; x: number; y: number; width: number; height: number;
  /** Own turn, degrees. */
  rotation: number;
  /** Parent box → page. */
  parent: Mat;
  /** Turn of the parent on the page, degrees. */
  parentRotation: number;
  /** Position is owned by an auto-layout parent: only size / turn change, never x/y. */
  inLayout: boolean;
};

/** A layer's new box in its parent's coordinates. */
export type Placed = { x: number; y: number; width: number; height: number; rotation: number };

/** Scale (sx, sy) about `anchor`, in page space. Negative = flipped. */
export const scaleAbout = (anchor: Pt, sx: number, sy: number): Mat => [sx, 0, 0, sy, anchor.x * (1 - sx), anchor.y * (1 - sy)];

/** Turn by `degrees` (clockwise on screen) about `pivot`, in page space. */
export function rotateAbout(pivot: Pt, degrees: number): Mat {
  const c = Math.cos(rad(degrees)), s = Math.sin(rad(degrees));
  return [c, s, -s, c, pivot.x - c * pivot.x + s * pivot.y, pivot.y - s * pivot.x - c * pivot.y];
}

/** Page centre of an item's box. */
export function itemCenter(it: Item): Pt {
  return applyMat(it.parent, it.x + it.width / 2, it.y + it.height / 2);
}

/** Where `it` lands after the page-space map `t`. */
export function placeItem(it: Item, t: Mat): Placed {
  const phi = rad(it.parentRotation + it.rotation);
  const c = Math.cos(phi), s = Math.sin(phi);
  // Columns of (linear part of t) × R(φ): where the layer's own x and y axes go.
  const u = { x: t[0] * c + t[2] * s, y: t[1] * c + t[3] * s };
  const v = { x: -t[0] * s + t[2] * c, y: -t[1] * s + t[3] * c };
  const ul = Math.hypot(u.x, u.y) || 1;
  const det = u.x * v.y - u.y * v.x;
  const width = Math.max(1, it.width * ul);
  const height = Math.max(1, it.height * (Math.abs(det) / ul));
  const centre = applyMat(t, ...xy(itemCenter(it)));
  const local = applyMat(invertMat(it.parent), centre.x, centre.y);
  let a = deg(Math.atan2(u.y, u.x));
  // A flipped layer has two outlines-alike turns, a and a + 180: take the mirror of its old turn (−φ),
  // so a horizontal or vertical flip of upright text keeps it upright.
  if (det < 0 && gap(a + 180, -deg(phi)) < gap(a, -deg(phi))) a += 180;
  const turn = normalizeAngle(a - it.parentRotation);
  return { x: local.x - width / 2, y: local.y - height / 2, width, height, rotation: Object.is(turn, -0) ? 0 : turn };
}
const xy = (p: Pt): [number, number] => [p.x, p.y];
/** Unsigned difference of two angles, degrees in [0, 180]. */
const gap = (a: number, b: number) => Math.abs(normalizeAngle(a - b));

/** Centre of the union box, or the mean of the layers' own centres. */
export function pivotOf(items: Item[], box: Rect, mode: 'mean' | 'box'): Pt {
  if (mode === 'box' || !items.length) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cs = items.map(itemCenter);
  return { x: cs.reduce((a, p) => a + p.x, 0) / cs.length, y: cs.reduce((a, p) => a + p.y, 0) / cs.length };
}

const OPPOSITE: Record<Handle, Handle> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };

/**
 * Scale factors for dragging handle `h` of the shared box by (dx, dy) on the page. The opposite
 * handle stays put (`fromCenter`: the centre does); `keepRatio` makes both factors equal (a side
 * handle sets the other axis to the same size change, never flipping it).
 */
export function groupScale(box: Rect, h: Handle, dx: number, dy: number, opts: { fromCenter?: boolean; keepRatio?: boolean } = {}): { anchor: Pt; sx: number; sy: number } {
  const anchor = opts.fromCenter ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : handlePoint(box, OPPOSITE[h]);
  const grip = handlePoint(box, h);
  const factor = (from: number, at: number, d: number, size: number) => {
    if (Math.abs(from - at) < 1e-9) return 1;
    const f = (from + d - at) / (from - at);
    // Never thinner than one page unit (a zero factor would collapse every layer).
    const min = 1 / Math.max(1, size);
    return Math.abs(f) < min ? (f < 0 ? -min : min) : f;
  };
  let sx = h.includes('e') || h.includes('w') ? factor(grip.x, anchor.x, dx, box.width) : 1;
  let sy = h.includes('n') || h.includes('s') ? factor(grip.y, anchor.y, dy, box.height) : 1;
  if (opts.keepRatio) {
    if (h === 'n' || h === 's') sx = Math.abs(sy);
    else if (h === 'e' || h === 'w') sy = Math.abs(sx);
    else { const s = Math.abs(sx) >= Math.abs(sy) ? sx : sy; sx = s; sy = s; }
  }
  return { anchor, sx, sy };
}

/* ------------------------------ document side ------------------------------ */

/** The layers that move: connectors and layers inside another selected layer ride along instead. */
export function groupItems(doc: ArchaDocument, ids: string[]): Item[] {
  const live = ids.filter((id) => doc.get(id) && !ids.some((o) => o !== id && doc.isAncestor(o, id)));
  return live.flatMap((id) => {
    const n = doc.require(id);
    if (n.type === 'connector' || !n.parentId) return [];
    const p = doc.get(n.parentId);
    const turned = p && p.type !== 'page';
    return [{
      id, x: n.x, y: n.y, width: n.width, height: n.height, rotation: n.rotation,
      parent: turned ? nodeMatrix(doc, p.id) : [1, 0, 0, 1, 0, 0],
      parentRotation: turned ? pageRotation(doc, p.id) : 0,
      inLayout: !!turned && p.type === 'frame' && p.layout !== 'none' && !n.absolute,
    }];
  });
}

/** What the gesture keeps from its start: the layers, the shared box and every touched node as it was. */
export type GroupStart = { items: Item[]; box: Rect; nodes: Map<string, Node>; origins: Map<string, Pt> };

export function groupStart(doc: ArchaDocument, ids: string[]): GroupStart | null {
  const box = selectionBounds(doc, ids);
  if (!box) return null;
  const items = groupItems(doc, ids);
  const nodes = new Map<string, Node>();
  const origins = new Map<string, Pt>();
  for (const id of ids) {
    for (const n of doc.walk(id)) nodes.set(n.id, n);
    // Connector ends are stored relative to the connector's parent.
    const n = doc.get(id);
    if (n?.type === 'connector' && n.parentId) origins.set(id, originOf(doc, n.parentId));
  }
  return { items, box, nodes, origins };
}

/**
 * Patches (per node id) for the page-space map `t`. `scaleAll` (Scale tool, Figma's K) also scales
 * what is inside each layer: children, font sizes, strokes, radii, gaps, padding, shadows. Otherwise
 * (a normal resize) only boxes and positions change: text keeps its font size, wrapping at its new
 * width (fixed size once its height changed too), strokes and radii stay as they are.
 */
export function groupPatches(start: GroupStart, t: Mat, ids: string[], scaleAll: boolean): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const it of start.items) {
    const n = start.nodes.get(it.id)!;
    const b = placeItem(it, t);
    const patch: Record<string, unknown> = { width: r2(b.width), height: r2(b.height), rotation: b.rotation };
    if (!it.inLayout) Object.assign(patch, { x: r2(b.x), y: r2(b.y) });
    const kx = b.width / (it.width || 1), ky = b.height / (it.height || 1);
    const wide = Math.abs(kx - 1) > 1e-6, tall = Math.abs(ky - 1) > 1e-6;
    if (wide || tall) patch.sizing = { horizontal: wide ? 'fixed' : n.sizing.horizontal, vertical: tall ? 'fixed' : n.sizing.vertical };
    if (scaleAll && (wide || tall)) {
      Object.assign(patch, scaledStyle(n, Math.sqrt(kx * ky)));
      for (const c of start.nodes.values()) {
        if (c.id === n.id || !isInside(start, c, n.id)) continue;
        out.set(c.id, { x: r2(c.x * kx), y: r2(c.y * ky), width: r2(c.width * kx), height: r2(c.height * ky), ...scaledStyle(c, Math.sqrt(kx * ky)) });
      }
    } else if (n.type === 'text' && (wide || tall)) patch.textSizing = tall ? 'fixed' : n.textSizing === 'fixed' ? 'fixed' : 'auto-height';
    out.set(it.id, patch);
  }
  // Connectors in the selection: free ends follow the map, attached ends stay on their layers.
  for (const id of ids) {
    const n = start.nodes.get(id);
    if (n?.type !== 'connector') continue;
    const o = start.origins.get(id) ?? { x: 0, y: 0 };
    const end = (e: ConnectorEnd): ConnectorEnd => {
      if (e.nodeId) return e;
      const p = applyMat(t, o.x + e.x, o.y + e.y);
      return { ...e, x: r2(p.x - o.x), y: r2(p.y - o.y) };
    };
    out.set(id, { start: end(n.start), end: end(n.end) });
  }
  return out;
}

function isInside(start: GroupStart, n: Node, ancestorId: string): boolean {
  for (let p = n.parentId; p; p = start.nodes.get(p)?.parentId ?? null) if (p === ancestorId) return true;
  return false;
}

/** The shared box's four corners after the map (for the live outline): nw, ne, se, sw. */
export function mappedCorners(box: Rect, t: Mat): Pt[] {
  return [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]].map(([x, y]) => applyMat(t, x!, y!));
}

/** The shared box's rotate knob: above the middle of its top edge. */
export const groupKnob = (box: Rect, zoom: number): Pt => ({ x: box.x + box.width / 2, y: box.y - ROTATE_GAP / zoom });

/** Shared-box handle or knob under page point `w`. */
export function groupHandleAt(box: Rect, w: Pt, zoom: number): Handle | 'rotate' | null {
  const tol = 6 / zoom;
  const h = HANDLES.find((hh) => { const p = handlePoint(box, hh); return Math.abs(p.x - w.x) <= tol && Math.abs(p.y - w.y) <= tol; });
  if (h) return h;
  const k = groupKnob(box, zoom);
  return Math.hypot(k.x - w.x, k.y - w.y) <= 7 / zoom ? 'rotate' : null;
}
