import { colorToCss, hexToColor, type Color, type TextEffect, type TextNode } from '@archa/schema';
import { curveAngle, curveBox, displayParagraphs } from '@archa/core';

/*
 * Text drawing (blueprint RENDERING/01): lines or a curved run, decorations, and the Canva-style
 * effects. Effect sliders are 0–100 and scale with the font size so a look holds at any size.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** One piece of text to paint: a line, or one letter of a curved run, at (x, y) turned by `angle`. */
type Run = { text: string; x: number; y: number; angle: number; width: number };

export const fontString = (n: TextNode) => `${n.fontStyle === 'italic' ? 'italic ' : ''}${n.fontWeight} ${n.fontSize}px "${n.fontFamily}", Inter, system-ui, sans-serif`;

/** Wraps text into lines for fixed / auto-height boxes; auto-width keeps hard breaks only. */
export function layoutLines(ctx: Ctx, n: TextNode): string[] {
  ctx.font = fontString(n);
  const hard = displayParagraphs(n);
  if (n.textSizing === 'auto-width' || n.curve) return hard;
  const out: string[] = [];
  for (const para of hard) {
    let line = '';
    for (const w of para.split(/(\s+)/)) {
      const next = line + w;
      if (line && ctx.measureText(next).width > n.width) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function runsOf(ctx: Ctx, n: TextNode): Run[] {
  const lh = n.fontSize * n.lineHeight;
  const lines = layoutLines(ctx, n);
  if (!n.curve) {
    const x = n.textAlign === 'center' ? n.width / 2 : n.textAlign === 'right' ? n.width : 0;
    return lines.map((text, i) => ({ text, x, y: lh * i + lh / 2, angle: 0, width: ctx.measureText(text).width }));
  }
  // Curved: letters along an arc whose length is the line's width, centred in the box.
  const chars = [...lines[0]!];
  const widths = chars.map((ch) => ctx.measureText(ch).width + n.letterSpacing);
  const total = widths.reduce((a, b) => a + b, 0);
  const box = curveBox(total, lh, n.curve);
  const r = total / Math.abs(curveAngle(n.curve));
  const up = n.curve > 0 ? 1 : -1;
  const cx = n.width / 2, cy = (n.height - box.height) / 2 + box.cy;
  let at = -total / 2;
  return chars.map((text, i) => {
    const t = (at + widths[i]! / 2) / r;
    at += widths[i]!;
    return { text, x: cx + r * Math.sin(t), y: cy - up * r * Math.cos(t), angle: up * t, width: widths[i]! };
  });
}

const hex = (s: string) => hexToColor(s);
const css = (c: Color, alpha = 1) => colorToCss({ ...c, a: c.a * alpha });
/** A paler, less saturated version of a colour: the hot core of a neon tube. */
const pale = (c: Color, k: number): Color => ({ ...c, l: Math.min(1, c.l + (1 - c.l) * k), c: c.c * (1 - k * 0.7) });

export function drawText(ctx: Ctx, n: TextNode, deviceScale: number) {
  const fill = n.fills.find((f) => f.visible);
  const fx = n.textEffect;
  if (!fill && !fx) return;
  const ink = fill?.color ?? hex('#000000');
  ctx.save();
  ctx.font = fontString(n);
  ctx.textBaseline = 'middle';
  ctx.textAlign = n.curve ? 'center' : n.textAlign;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = n.curve ? '0px' : `${n.letterSpacing}px`;
  const runs = runsOf(ctx, n);
  const fs = n.fontSize;

  const paint = (style: string, mode: 'fill' | 'stroke' = 'fill', dx = 0, dy = 0) => {
    for (const r of runs) {
      ctx.save();
      ctx.translate(r.x + dx, r.y + dy);
      if (r.angle) ctx.rotate(r.angle);
      if (mode === 'fill') { ctx.fillStyle = style; ctx.fillText(r.text, 0, 0); } else { ctx.strokeStyle = style; ctx.strokeText(r.text, 0, 0); }
      ctx.restore();
    }
  };
  const blurred = (px: number, draw: () => void) => {
    ctx.save();
    if (px > 0) ctx.filter = `blur(${px * deviceScale}px)`;
    draw();
    ctx.restore();
  };
  const stroke = (width: number) => { ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.miterLimit = 2; };

  let main: 'fill' | 'stroke' | 'none' = fill ? 'fill' : 'none';
  if (fx) main = drawEffect(fx, { n, ink, fs, runs, ctx, paint, blurred, stroke }) ?? main;

  if (main === 'fill' && fill) paint(css(ink));
  decorate(ctx, n, runs, css(ink));
  ctx.restore();
}

type EffectKit = {
  n: TextNode; ink: Color; fs: number; runs: Run[]; ctx: Ctx;
  paint: (style: string, mode?: 'fill' | 'stroke', dx?: number, dy?: number) => void;
  blurred: (px: number, draw: () => void) => void;
  stroke: (width: number) => void;
};

/** Paints the effect under (or instead of) the words; returns 'none' when it already drew them. */
function drawEffect(fx: TextEffect, k: EffectKit): 'none' | void {
  const { ink, fs, paint, blurred, stroke, ctx } = k;
  const dist = (fx.offset / 100) * fs * 0.25;
  const rad = (fx.direction * Math.PI) / 180;
  const dx = Math.cos(rad) * dist, dy = Math.sin(rad) * dist;
  const opaque = 1 - fx.transparency / 100;
  const color = fx.color;
  const width = Math.max(0.5, (fx.thickness / 100) * fs * 0.16);
  switch (fx.type) {
    case 'drop':
      blurred((fx.blur / 100) * fs * 0.4, () => paint(css(color ?? hex('#000000'), opaque), 'fill', dx, dy));
      return;
    case 'glow': {
      const reach = fs * (0.06 + (fx.spread / 100) * 0.3);
      const c = css(color ?? ink, opaque);
      blurred(reach, () => { paint(c); paint(c); });
      return;
    }
    case 'echo': {
      const c = color ?? ink;
      paint(css(c, 0.25), 'fill', dx * 2, dy * 2);
      paint(css(c, 0.5), 'fill', dx, dy);
      return;
    }
    case 'outline':
      stroke(width * 2);
      paint(css(color ?? hex('#000000')), 'stroke');
      return;
    case 'background': {
      const pad = (fx.spread / 100) * fs * 0.5;
      const lh = fs * k.n.lineHeight;
      ctx.fillStyle = css(color ?? hex('#fde047'), opaque);
      for (const r of k.runs) {
        if (!r.text.trim()) continue;
        const left = k.n.curve ? r.x - r.width / 2 : ctx.textAlign === 'center' ? r.x - r.width / 2 : ctx.textAlign === 'right' ? r.x - r.width : r.x;
        const w = r.width + pad * 2, h = lh + pad * 0.6;
        const rr = Math.min(w, h) / 2 * (fx.roundness / 100);
        ctx.save();
        ctx.translate(left, r.y);
        if (r.angle) { ctx.translate(r.width / 2, 0); ctx.rotate(r.angle); ctx.translate(-r.width / 2, 0); }
        ctx.beginPath();
        ctx.roundRect(-pad, -h / 2, w, h, rr);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    case 'splice':
      paint(css(color ?? pale(ink, 0.6)), 'fill', dx, dy);
      stroke(width);
      paint(css(ink), 'stroke');
      return 'none';
    case 'hollow':
      stroke(width);
      paint(css(ink), 'stroke');
      return 'none';
    case 'neon': {
      const glow = color ?? ink;
      const power = 0.4 + (fx.intensity / 100) * 0.8;
      blurred(fs * 0.35 * power, () => paint(css(glow, 0.9)));
      blurred(fs * 0.12 * power, () => paint(css(glow)));
      paint(css(pale(glow, 0.75)));
      return 'none';
    }
    case 'glitch':
      paint(css(hex('#00e5ff'), 0.9), 'fill', -dx, -dy);
      paint(css(color ?? hex('#ff2bd6'), 0.9), 'fill', dx, dy);
      return;
  }
}

/** Underline and strikethrough under each straight line (curved text has none). */
function decorate(ctx: Ctx, n: TextNode, runs: Run[], style: string) {
  if ((!n.underline && !n.strikethrough) || n.curve) return;
  const t = Math.max(1, n.fontSize * 0.06);
  ctx.fillStyle = style;
  for (const r of runs) {
    if (!r.width) continue;
    const left = n.textAlign === 'center' ? r.x - r.width / 2 : n.textAlign === 'right' ? r.x - r.width : r.x;
    if (n.underline) ctx.fillRect(left, r.y + n.fontSize * 0.4, r.width, t);
    if (n.strikethrough) ctx.fillRect(left, r.y - t / 2 + n.fontSize * 0.02, r.width, t);
  }
}
