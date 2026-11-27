import type { ArchaDocument } from '@archa/core';
import { isContainer } from '@archa/schema';
import { groupKnob } from '../lib/groupTransform';
import { connectorEnds, handlePoint, HANDLES, handlesFor, nodeCorners, nodeHandlePoint, pageRoot, pageRotation, rotateHandlePoint, selectionBounds, toScreen } from '../lib/geometry';
import type { Camera } from '../lib/store';

export type OverlayExtras = {
  marquee?: { x: number; y: number; width: number; height: number };
  create?: { x: number; y: number; width: number; height: number };
  insertLine?: { x1: number; y1: number; x2: number; y2: number };
  dropTarget?: string | null;
  /** Layers being dragged: drawn above everything so a clipping frame does not hide them while they leave it. */
  lifted?: string[];
  /** Pen tool in progress: committed path, its points, and the rubber-band line to the pointer. */
  /** Connector being drawn or reattached: preview route (page coords) and the node it would stick to. */
  connect?: { points: Array<{ x: number; y: number }> | null; target: { x: number; y: number; width: number; height: number } | null };
  /** Multi-selection being scaled or turned: the shared box as it maps now, the turn pivot, the size / angle readout. */
  group?: { corners: Array<{ x: number; y: number }>; pivot?: { x: number; y: number }; label: string };
  /** Smart guides while moving: lines where the dragged layers line up with their neighbours (page coords). */
  guides?: Array<{ axis: 'x' | 'y'; at: number; from: number; to: number }>;
  pen?: { d: string; points: Array<{ x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number } }>; cursor: { x: number; y: number } | null };
};

type View = { camera: Camera; selection: string[]; hover: string | null; editingText: string | null; pixelGrid: boolean };

/** Zoom at which the 1px grid appears (a pixel is 8 screen px wide). */
const PIXEL_GRID_ZOOM = 8;

const ACCENT = '#8b5cf6';
/** Smart guides: a warm red that reads against the purple selection and most fills. */
const GUIDE = '#f43f5e';

/** Selection, hover, labels and guides, drawn in screen space (blueprint RENDERING/02). Agent cursors: cursors.ts. */
export function drawOverlay(ctx: CanvasRenderingContext2D, doc: ArchaDocument, v: View, x: OverlayExtras) {
  const cam = v.camera;
  const box = (r: { x: number; y: number; width: number; height: number }) => {
    const p = toScreen(cam, r.x, r.y);
    return { x: p.x, y: p.y, w: r.width * cam.zoom, h: r.height * cam.zoom };
  };
  ctx.font = '500 11px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';

  // Pixel grid: one line per page unit, over the content (mid grey so it reads on light and dark fills).
  if (v.pixelGrid && cam.zoom >= PIXEL_GRID_ZOOM) {
    const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
    ctx.beginPath();
    for (let px = Math.ceil(-cam.x / cam.zoom); ; px++) {
      const s = Math.round(cam.x + px * cam.zoom) + 0.5;
      if (s > w) break;
      ctx.moveTo(s, 0); ctx.lineTo(s, h);
    }
    for (let py = Math.ceil(-cam.y / cam.zoom); ; py++) {
      const s = Math.round(cam.y + py * cam.zoom) + 0.5;
      if (s > h) break;
      ctx.moveTo(0, s); ctx.lineTo(w, s);
    }
    ctx.strokeStyle = '#80808033';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Frame labels.
  const root = doc.get(pageRoot(doc));
  if (root && isContainer(root)) {
    for (const id of root.children) {
      const n = doc.get(id);
      if (!n || !n.visible || n.type !== 'frame') continue;
      const b = box(n);
      const selected = v.selection.includes(n.id);
      ctx.fillStyle = selected ? ACCENT : v.hover === n.id ? '#d4d4d8' : '#8b8b93';
      const max = Math.max(24, b.w);
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y - 20, max, 20);
      ctx.clip();
      ctx.fillText(n.name, b.x, b.y - 6);
      ctx.restore();
    }
  }

  // A connector's outline is its line, not its box.
  const route = (id: string, width: number) => {
    const ends = connectorEnds(doc, id);
    if (!ends) return false;
    polyline(ctx, ends.points.map((p) => toScreen(cam, p.x, p.y)));
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = width;
    ctx.stroke();
    return true;
  };

  // A node's outline: its box, turned with it when it (or a parent) is rotated.
  const outline = (id: string, width: number) => {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = width;
    if (!pageRotation(doc, id)) { const b = box(doc.worldBounds(id)); ctx.strokeRect(b.x, b.y, b.w, b.h); return; }
    polyline(ctx, [...nodeCorners(doc, id), nodeCorners(doc, id)[0]!].map((p) => toScreen(cam, p.x, p.y)));
    ctx.stroke();
  };

  // Hover.
  if (v.hover && !v.selection.includes(v.hover) && doc.get(v.hover) && !route(v.hover, 1.5)) outline(v.hover, 1.5);

  // Drop target while dragging.
  if (x.dropTarget && doc.get(x.dropTarget)?.type === 'frame') {
    const b = box(doc.worldBounds(x.dropTarget));
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
  }

  // Selection.
  const sel = v.selection.filter((id) => doc.get(id));
  const lone = sel.length === 1 ? connectorEnds(doc, sel[0]!) : null;
  if (lone && !v.editingText) {
    route(sel[0]!, 1.5);
    for (const p of [lone.start, lone.end]) {
      const s = toScreen(cam, p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else if (sel.length > 1 && x.group && !v.editingText) {
    // Mid-gesture: every layer's outline plus the shared box as it maps right now.
    for (const id of sel) outline(id, 1);
    const pts = x.group.corners.map((p) => toScreen(cam, p.x, p.y));
    polyline(ctx, [...pts, pts[0]!]);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (x.group.pivot) {
      const c = toScreen(cam, x.group.pivot.x, x.group.pivot.y);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.moveTo(c.x - 8, c.y); ctx.lineTo(c.x + 8, c.y);
      ctx.moveTo(c.x, c.y - 8); ctx.lineTo(c.x, c.y + 8);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    tag(ctx, x.group.label, cx, Math.max(...pts.map((p) => p.y)) + 8, ACCENT, false, true);
  } else if (sel.length && !v.editingText) {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    if (sel.length > 1) {
      for (const id of sel) outline(id, 1);
      const r = selectionBounds(doc, sel)!;
      const b = box(r);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Shared box handles: scale (corners / sides) and the rotate knob, for the whole selection.
      const top = toScreen(cam, r.x + r.width / 2, r.y);
      const knob = groupKnob(r, cam.zoom);
      const k = toScreen(cam, knob.x, knob.y);
      polyline(ctx, [top, k]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(k.x, k.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (const h of HANDLES) {
        const s = toScreen(cam, handlePoint(r, h).x, handlePoint(r, h).y);
        ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
        ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
      }
    }
    const r = selectionBounds(doc, sel)!;
    const b = box(r);
    let size = `${fmt(r.width)} × ${fmt(r.height)}`;
    if (sel.length === 1) {
      const id = sel[0]!;
      const n = doc.require(id);
      outline(id, 1.5);
      // Rotate knob above the top edge, joined to it by a short stem.
      const top = toScreen(cam, nodeHandlePoint(doc, id, 'n').x, nodeHandlePoint(doc, id, 'n').y);
      const knob = rotateHandlePoint(doc, id, cam.zoom);
      const k = toScreen(cam, knob.x, knob.y);
      polyline(ctx, [top, k]);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(k.x, k.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (const h of handlesFor(n)) {
        const p = nodeHandlePoint(doc, id, h);
        const s = toScreen(cam, p.x, p.y);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5;
        ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
        ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
      }
      size = `${fmt(n.width)} × ${fmt(n.height)}${n.rotation ? ` · ${fmt(n.rotation)}°` : ''}`;
    }
    tag(ctx, size, b.x + b.w / 2, b.y + b.h + 8, ACCENT, false, true);
  }

  if (x.connect) {
    if (x.connect.target) {
      const b = box(x.connect.target);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    if (x.connect.points) {
      polyline(ctx, x.connect.points.map((p) => toScreen(cam, p.x, p.y)));
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (x.marquee) {
    const b = box(x.marquee);
    ctx.fillStyle = '#8b5cf61a';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  if (x.create) {
    const b = box(x.create);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    tag(ctx, `${fmt(x.create.width)} × ${fmt(x.create.height)}`, b.x + b.w / 2, b.y + b.h + 8, ACCENT, false, true);
  }
  if (x.pen && x.pen.points.length) {
    const pts = x.pen.points;
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5 / cam.zoom;
    if (x.pen.d) ctx.stroke(new Path2D(x.pen.d));
    const last = pts.at(-1)!;
    if (x.pen.cursor) {
      ctx.setLineDash([4 / cam.zoom, 4 / cam.zoom]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x.pen.cursor.x, x.pen.cursor.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    for (const p of pts) {
      for (const h of [p.in, p.out]) {
        if (!h) continue;
        const a = toScreen(cam, p.x, p.y), b = toScreen(cam, h.x, h.y);
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const s = toScreen(cam, p.x, p.y);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.fillRect(s.x - 3.5, s.y - 3.5, 7, 7);
      ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
    }
  }
  if (x.guides?.length) {
    ctx.strokeStyle = GUIDE;
    ctx.fillStyle = GUIDE;
    ctx.lineWidth = 1;
    for (const g of x.guides) {
      const a = g.axis === 'x' ? toScreen(cam, g.at, g.from) : toScreen(cam, g.from, g.at);
      const b = g.axis === 'x' ? toScreen(cam, g.at, g.to) : toScreen(cam, g.to, g.at);
      // Half-pixel offset keeps a 1px line crisp; small ticks mark both ends like a ruler.
      const ax = Math.round(a.x) + 0.5, ay = Math.round(a.y) + 0.5, bx = Math.round(b.x) + 0.5, by = Math.round(b.y) + 0.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      for (const [px, py] of [[ax, ay], [bx, by]] as const) {
        ctx.beginPath();
        ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3);
        ctx.moveTo(px + 3, py - 3); ctx.lineTo(px - 3, py + 3);
        ctx.stroke();
      }
    }
  }
  if (x.insertLine) {
    const a = toScreen(cam, x.insertLine.x1, x.insertLine.y1);
    const c = toScreen(cam, x.insertLine.x2, x.insertLine.y2);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, alignRight: boolean, center = false) {
  ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  const left = center ? x - w / 2 : alignRight ? x - w : x;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(left, y, w, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, left + 6, y + 13);
}

function polyline(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>) {
  ctx.beginPath();
  pts.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
}
