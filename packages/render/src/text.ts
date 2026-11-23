import { colorToCss, hexToColor, paintColor, type Color, type TextEffect, type TextNode } from '@archa/schema';
import { curveAngle, curveBox, styledParagraphs, textWidth, type RunStyle } from '@archa/core';
import { canvasPaint } from './paint';
import { requestFont } from './fonts';

/*
 * Text drawing (blueprint RENDERING/01): lines or a curved run, rich-text pieces, decorations, and
 * the Canva-style effects. Effect sliders are 0–100 and scale with the font size so a look holds at any size.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/**
 * One piece of text to paint: part of a line (x = its left edge), or one letter of a curved run
 * (x = the letter's centre). y is the em middle; `angle` turns it.
 */
type Run = { text: string; x: number; y: number; angle: number; width: number; style: RunStyle; font: string };
type Bit = { text: string; style: RunStyle; font: string };
/** A wrapped line: its pieces, measured; `size` is its largest font size. */
type Line = { pieces: Array<Bit & { width: number }>; width: number; size: number };

const fontOf = (st: Pick<RunStyle, 'fontStyle' | 'fontWeight' | 'fontSize' | 'fontFamily'>) =>
  `${st.fontStyle === 'italic' ? 'italic ' : ''}${st.fontWeight} ${st.fontSize}px "${st.fontFamily}", Inter, system-ui, sans-serif`;
export const fontString = (n: TextNode) => fontOf(n);

/** Distance from the em middle to the baseline, as a share of the font size (typical UI sans). */
const MID_TO_BASELINE = 0.365;
const isSpace = (s: string) => /^\s/.test(s);

function setSpacing(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${px}px`;
  // The core measures plain advances (no kerning); drawing the same way keeps every piece where layout put it.
  if ('fontKerning' in ctx) (ctx as CanvasRenderingContext2D).fontKerning = 'none';
}

/**
 * Widths come from the core's font metrics (blueprint DOCUMENT_MODEL/03 → Text measure), not the canvas, so
 * the lines drawn here are the lines the core measured — on every machine, in the mirror and in exports.
 */
function measure(_ctx: Ctx, b: Bit): number {
  return textWidth(b.text, b.style);
}

/** Wraps styled paragraphs into lines for fixed / auto-height boxes; auto-width and curves keep hard breaks only. */
function layoutRich(ctx: Ctx, n: TextNode): Line[] {
  const wrap = !(n.textSizing === 'auto-width' || n.curve);
  const out: Line[] = [];
  for (const para of styledParagraphs(n)) {
    // A word keeps all its pieces, so a word half bold, half regular still wraps as one word.
    const words: Bit[][] = [];
    for (const p of para) {
      const font = fontOf(p.style);
      for (const part of p.text.split(/(\s+)/)) {
        if (!part) continue;
        const last = words.at(-1);
        if (last && isSpace(part) === isSpace(last[0]!.text)) last.push({ text: part, style: p.style, font });
        else words.push([{ text: part, style: p.style, font }]);
      }
    }
    const width = (bits: Bit[]) => bits.reduce((w, b) => w + measure(ctx, b), 0);
    const size = para[0]?.style.fontSize ?? n.fontSize;
    let line: Bit[] = [];
    const flush = () => {
      const pieces = line.map((b) => ({ ...b, width: measure(ctx, b) }));
      out.push({ pieces, width: pieces.reduce((w, p) => w + p.width, 0), size: pieces.length ? Math.max(...pieces.map((p) => p.style.fontSize)) : size });
      line = [];
    };
    for (const word of words) {
      if (wrap && line.length && !isSpace(word[0]!.text) && width(line) + width(word) > n.width) {
        // The space before a wrapped word stays on the line it ends.
        while (line.length && isSpace(line.at(-1)!.text)) line.pop();
        flush();
      }
      if (wrap && !line.length && isSpace(word[0]!.text) && out.length) continue;
      line.push(...word);
    }
    flush();
  }
  return out;
}

/** Wrapped lines as plain strings. */
export function layoutLines(ctx: Ctx, n: TextNode): string[] {
  return layoutRich(ctx, n).map((l) => l.pieces.map((p) => p.text).join(''));
}

function runsOf(ctx: Ctx, n: TextNode): Run[] {
  const lines = layoutRich(ctx, n);
  if (!n.curve) {
    const runs: Run[] = [];
    let top = 0;
    for (const line of lines) {
      const lh = line.size * n.lineHeight;
      // Pieces of different sizes share a baseline.
      const baseline = top + lh / 2 + line.size * MID_TO_BASELINE;
      let x = n.textAlign === 'center' ? (n.width - line.width) / 2 : n.textAlign === 'right' ? n.width - line.width : 0;
      for (const p of line.pieces) {
        runs.push({ text: p.text, x, y: baseline - p.style.fontSize * MID_TO_BASELINE, angle: 0, width: p.width, style: p.style, font: p.font });
        x += p.width;
      }
      top += lh;
    }
    return runs;
  }
  // Curved: letters along an arc whose length is the line's width, centred in the box.
  const chars = (lines[0]?.pieces ?? []).flatMap((p) => [...p.text].map((ch) => ({ text: ch, style: p.style, font: p.font })));
  const lh = (lines[0]?.size ?? n.fontSize) * n.lineHeight;
  const widths = chars.map((c) => measure(ctx, { ...c, style: { ...c.style, letterSpacing: 0 } }) + c.style.letterSpacing);
  const total = widths.reduce((a, b) => a + b, 0);
  const box = curveBox(total, lh, n.curve);
  const r = total / Math.abs(curveAngle(n.curve));
  const up = n.curve > 0 ? 1 : -1;
  const cx = n.width / 2, cy = (n.height - box.height) / 2 + box.cy;
  let at = -total / 2;
  return chars.map((c, i) => {
    const t = (at + widths[i]! / 2) / r;
    at += widths[i]!;
    return { ...c, x: cx + r * Math.sin(t), y: cy - up * r * Math.cos(t), angle: up * t, width: widths[i]! };
  });
}

const hex = (s: string) => hexToColor(s);
const css = (c: Color, alpha = 1) => colorToCss({ ...c, a: c.a * alpha });
/** A paler, less saturated version of a colour: the hot core of a neon tube. */
const pale = (c: Color, k: number): Color => ({ ...c, l: Math.min(1, c.l + (1 - c.l) * k), c: c.c * (1 - k * 0.7) });
const firstPaint = (st: RunStyle) => st.fills.find((f) => f.visible);

export function drawText(ctx: Ctx, n: TextNode, deviceScale: number) {
  const fill = firstPaint(n) ?? n.spans.flatMap((sp) => sp.fills ?? []).find((f) => f.visible);
  const fx = n.textEffect;
  if (!fill && !fx) return;
  const ink = (fill && paintColor(fill)) ?? hex('#000000');
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = n.curve ? 'center' : 'left';
  const runs = runsOf(ctx, n);
  for (const r of runs) void requestFont(r.font);
  const fs = n.fontSize;

  /** Paints every run in one style (effects), or, with `style` null, each run in its own fills. */
  const paint = (style: string | null, mode: 'fill' | 'stroke' = 'fill', dx = 0, dy = 0) => {
    for (const r of runs) {
      const paints = style === null ? r.style.fills.filter((f) => f.visible) : [null];
      if (!paints.length) continue;
      ctx.save();
      const alpha = ctx.globalAlpha;
      ctx.font = r.font;
      setSpacing(ctx, n.curve ? 0 : r.style.letterSpacing);
      ctx.translate(r.x + dx, r.y + dy);
      if (r.angle) ctx.rotate(r.angle);
      for (const p of paints) {
        // Gradients and pictures span the whole text box, not each run: shift them by the run's origin.
        const s = p ? canvasPaint(ctx, p, n.width, n.height, r.x + dx, r.y + dy) : style;
        if (!s) continue;
        ctx.globalAlpha = alpha * (p?.type === 'image' ? p.opacity : 1);
        if (mode === 'fill') { ctx.fillStyle = s; ctx.fillText(r.text, 0, 0); } else { ctx.strokeStyle = s; ctx.strokeText(r.text, 0, 0); }
      }
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

  if (main === 'fill' && fill) paint(null);
  decorate(ctx, n, runs);
  ctx.restore();
}

type EffectKit = {
  n: TextNode; ink: Color; fs: number; runs: Run[]; ctx: Ctx;
  paint: (style: string | null, mode?: 'fill' | 'stroke', dx?: number, dy?: number) => void;
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
        const left = k.n.curve ? r.x - r.width / 2 : r.x;
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

/** Underline and strikethrough under each straight run, in the run's colour (curved text has none). */
function decorate(ctx: Ctx, n: TextNode, runs: Run[]) {
  if (n.curve) return;
  for (const r of runs) {
    if (!r.width || (!r.style.underline && !r.style.strikethrough)) continue;
    const p = firstPaint(r.style);
    const c = p ? paintColor(p) : null;
    if (!c) continue;
    const fs = r.style.fontSize;
    const t = Math.max(1, fs * 0.06);
    ctx.fillStyle = colorToCss(c);
    if (r.style.underline) ctx.fillRect(r.x, r.y + fs * 0.4, r.width, t);
    if (r.style.strikethrough) ctx.fillRect(r.x, r.y - t / 2 + fs * 0.02, r.width, t);
  }
}
