import type { ArchaDocument } from '@archa/core';
import { isContainer } from '@archa/schema';
import { connectorEnds, handlePoint, HANDLES, pageRoot, selectionBounds, toScreen } from '../lib/geometry';
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
  pen?: { d: string; points: Array<{ x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number } }>; cursor: { x: number; y: number } | null };
};

type View = { camera: Camera; selection: string[]; hover: string | null; editingText: string | null; pixelGrid: boolean };

/** Zoom at which the 1px grid appears (a pixel is 8 screen px wide). */
const PIXEL_GRID_ZOOM = 8;

const ACCENT = '#8b5cf6';

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

  // Hover.
  if (v.hover && !v.selection.includes(v.hover) && doc.get(v.hover) && !route(v.hover, 1.5)) {
    const b = box(doc.worldBounds(v.hover));
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }

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
  } else if (sel.length && !v.editingText) {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    if (sel.length > 1) for (const id of sel) { const b = box(doc.worldBounds(id)); ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h); }
    const r = selectionBounds(doc, sel)!;
    const b = box(r);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (sel.length === 1) {
      for (const h of HANDLES) {
        const p = handlePoint(r, h);
        const s = toScreen(cam, p.x, p.y);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5;
        ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
        ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
      }
    }
    tag(ctx, `${fmt(r.width)} × ${fmt(r.height)}`, b.x + b.w / 2, b.y + b.h + 8, ACCENT, false, true);
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
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
}
