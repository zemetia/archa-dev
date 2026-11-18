import { z } from 'zod';

/** Colours are stored as oklch so lightness edits stay perceptual (blueprint DOCUMENT_MODEL/01). */
export const colorSchema = z
  .object({
    l: z.number().min(0).max(1).describe('Lightness 0–1'),
    c: z.number().min(0).max(0.5).describe('Chroma 0–0.5'),
    h: z.number().describe('Hue in degrees'),
    a: z.number().min(0).max(1).default(1).describe('Alpha 0–1'),
  })
  .describe('oklch colour');
export type Color = z.infer<typeof colorSchema>;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function rgbToOklch(r: number, g: number, b: number, a = 1): Color {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: round(L), c: round(Math.min(c, 0.5)), h: c < 1e-4 ? 0 : round(h), a: round(a) };
}

export function oklchToRgb({ l, c, h }: Color): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr), B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [clamp01(fromLinear(r)), clamp01(fromLinear(g)), clamp01(fromLinear(bb))];
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Accepts #rgb, #rgba, #rrggbb, #rrggbbaa. */
export function hexToColor(hex: string): Color {
  let s = hex.trim().replace(/^#/, '');
  if (s.length === 3 || s.length === 4) s = [...s].map((ch) => ch + ch).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) throw new Error(`Invalid hex colour "${hex}"`);
  const n = (i: number) => parseInt(s.slice(i, i + 2), 16) / 255;
  return rgbToOklch(n(0), n(2), n(4), s.length === 8 ? n(6) : 1);
}

export function colorToHex(color: Color, withAlpha = false): string {
  const [r, g, b] = oklchToRgb(color);
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${withAlpha && color.a < 1 ? h(color.a) : ''}`;
}

export function colorToCss(color: Color): string {
  const [r, g, b] = oklchToRgb(color);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${color.a})`;
}

/** Contrast ratio per WCAG 2.x between two colours (alpha ignored). */
export function contrastRatio(a: Color, b: Color): number {
  const lum = (c: Color) => {
    const [r, g, bl] = oklchToRgb(c).map(toLinear) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
