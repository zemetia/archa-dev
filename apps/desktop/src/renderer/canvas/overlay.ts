import type { ArchaDocument } from '@archa/core';
import { isContainer } from '@archa/schema';
import { handlePoint, HANDLES, pageRoot, selectionBounds, toScreen } from '../lib/geometry';
import type { Camera } from '../lib/store';

export type OverlayExtras = {
  marquee?: { x: number; y: number; width: number; height: number };
  create?: { x: number; y: number; width: number; height: number };
  insertLine?: { x1: number; y1: number; x2: number; y2: number };
  dropTarget?: string | null;
};

type View = { camera: Camera; selection: string[]; hover: string | null; editingText: string | null };

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

  // Hover.
  if (v.hover && !v.selection.includes(v.hover) && doc.get(v.hover)) {
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
  if (sel.length && !v.editingText) {
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
