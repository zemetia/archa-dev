import type { TextNode } from '@archa/schema';

/*
 * How a text node reads once its display options apply (blueprint DOCUMENT_MODEL/01, text):
 * case, list markers and the curve. Layout, the renderer and the exporters all use these, so
 * the box the core measures is the box the canvas draws.
 */

type TextLike = Pick<TextNode, 'text' | 'textCase' | 'list' | 'curve'>;

export function applyCase(s: string, c: TextNode['textCase']): string {
  if (c === 'upper') return s.toUpperCase();
  if (c === 'lower') return s.toLowerCase();
  if (c === 'title') return s.toLowerCase().replace(/(^|[\s\-/("'“])(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase());
  return s;
}

/** Marker in front of paragraph `i` (0-based) of a list. */
export const listMarker = (list: TextNode['list'], i: number) => (list === 'bullet' ? '•  ' : list === 'number' ? `${i + 1}.  ` : '');

/** Paragraphs as shown: case applied and list markers in front. Curved text is one line. */
export function displayParagraphs(n: TextLike): string[] {
  const paras = n.text.split('\n');
  const shown = paras.map((p, i) => listMarker(n.list, i) + applyCase(p, n.textCase));
  return n.curve ? [shown.join(' ')] : shown;
}

/** Arc the text bends through, in radians: ±100 turns it 288° (nearly a ring). */
export const curveAngle = (curve: number) => (curve / 100) * Math.PI * 1.6;

/**
 * Box of one line `width` px long and `lineHeight` tall bent by `curve`. `radius` is the arc the
 * line's middle runs along; `cy` is the circle centre's y from the box top (+ arches: centre below
 * the words; − sags: centre above).
 */
export function curveBox(width: number, lineHeight: number, curve: number): { width: number; height: number; radius: number; cy: number } {
  const a = Math.abs(curveAngle(curve));
  if (!a || width <= 0) return { width, height: lineHeight, radius: Infinity, cy: 0 };
  const radius = width / a;
  const half = a / 2;
  const outer = radius + lineHeight / 2, inner = Math.max(0, radius - lineHeight / 2);
  // Measured with the words on top of the circle: y grows downward from the centre.
  const top = -outer;
  const bottom = Math.max(-inner * Math.cos(half), -outer * Math.cos(half), -inner);
  const reach = half >= Math.PI / 2 ? outer : outer * Math.sin(half);
  const height = bottom - top;
  return { width: Math.ceil(reach * 2), height: Math.ceil(height), radius, cy: curve > 0 ? outer : height - outer };
}
