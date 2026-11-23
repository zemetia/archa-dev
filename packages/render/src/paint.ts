import { colorToCss, type GradientStop, type Paint } from '@archa/schema';
import { linearGradientLine } from '@archa/core';
import { imageFor } from './images';

/*
 * Paints → canvas styles (blueprint RENDERING/01 → Paints). Coordinates are the node's own box
 * (0,0 → w,h). `ox`/`oy` shift the paint when the caller has translated the context (text runs).
 * Linear gradients follow CSS angles (core `linearGradientLine`), so a design and its HTML export match.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type CanvasStyle = string | CanvasGradient | CanvasPattern;

function addStops(g: CanvasGradient, stops: GradientStop[]) {
  for (const s of [...stops].sort((a, b) => a.position - b.position)) g.addColorStop(Math.min(1, Math.max(0, s.position)), colorToCss(s.color));
}

/** Where an image paint's picture lands in a w × h box: offset and scale of the natural-size image. */
export function imagePlacement(fit: 'fill' | 'fit' | 'crop' | 'tile', iw: number, ih: number, w: number, h: number, scale = 1) {
  if (fit === 'tile') return { x: 0, y: 0, sx: scale, sy: scale };
  if (fit === 'fill') return { x: 0, y: 0, sx: w / iw, sy: h / ih };
  const s = fit === 'fit' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  return { x: (w - iw * s) / 2, y: (h - ih * s) / 2, sx: s, sy: s };
}

/**
 * A canvas style for one paint, or null when there is nothing to draw yet (an image still loading).
 * Radial gradients come out circular here; `fillPaint` draws them as the ellipse they are.
 */
export function canvasPaint(ctx: Ctx, p: Paint, w: number, h: number, ox = 0, oy = 0): CanvasStyle | null {
  switch (p.type) {
    case 'solid':
      return colorToCss(p.color);
    case 'linear-gradient': {
      const l = linearGradientLine(p.angle, w, h);
      const g = ctx.createLinearGradient(l.x0 - ox, l.y0 - oy, l.x1 - ox, l.y1 - oy);
      addStops(g, p.stops);
      return g;
    }
    case 'radial-gradient': {
      const cx = p.center.x * w - ox, cy = p.center.y * h - oy;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1e-3, p.radius.x * w, p.radius.y * h));
      addStops(g, p.stops);
      return g;
    }
    case 'image': {
      const img = imageFor(p.src);
      if (!img || !img.naturalWidth || !img.naturalHeight) return null;
      const pat = ctx.createPattern(img, p.fit === 'tile' ? 'repeat' : 'no-repeat');
      if (!pat) return null;
      const at = imagePlacement(p.fit, img.naturalWidth, img.naturalHeight, w, h, p.scale);
      pat.setTransform(new DOMMatrix([at.sx, 0, 0, at.sy, at.x - ox, at.y - oy]));
      return pat;
    }
  }
}

/**
 * Fills `path` (a Path2D, or the context's current path when undefined) with one paint in a w × h box.
 * `fill` runs the actual fill so callers keep their fill rule.
 */
export function fillPaint(ctx: Ctx, p: Paint, w: number, h: number, path: Path2D | undefined, fill: (p: Path2D | undefined) => void): void {
  if (!p.visible) return;
  if (p.type === 'radial-gradient') {
    const rx = p.radius.x * w, ry = p.radius.y * h;
    if (rx <= 0 || ry <= 0) return;
    // An elliptical gradient is a unit-circle gradient in a scaled space. The current path is already
    // fixed in device space; a Path2D is mapped back so it lands where it was.
    const m = new DOMMatrix([rx, 0, 0, ry, p.center.x * w, p.center.y * h]);
    const mapped = path ? new Path2D() : undefined;
    mapped?.addPath(path!, m.inverse());
    ctx.save();
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    addStops(g, p.stops);
    ctx.fillStyle = g;
    fill(mapped);
    ctx.restore();
    return;
  }
  const style = canvasPaint(ctx, p, w, h);
  if (!style) return;
  ctx.save();
  if (p.type === 'image' && p.opacity < 1) ctx.globalAlpha *= p.opacity;
  ctx.fillStyle = style;
  fill(path);
  ctx.restore();
}

/** Every picture a node's paints use (fills, and rich-text span fills), to preload before a one-shot render. */
export function paintImageSources(n: { fills?: Paint[]; spans?: Array<{ fills?: Paint[] }> }): string[] {
  const all = [...(n.fills ?? []), ...(n.spans ?? []).flatMap((s) => s.fills ?? [])];
  return all.flatMap((p) => (p.type === 'image' && p.visible ? [p.src] : []));
}
