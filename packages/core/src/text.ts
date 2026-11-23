import type { TextNode, TextSpan } from '@archa/schema';

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

/* ------------------------------ rich text ------------------------------ */

/** The style one piece of text is drawn with: the node's own, with a span's fields on top. */
export type RunStyle = Pick<TextNode, 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'letterSpacing' | 'underline' | 'strikethrough' | 'fills'>;
export type StyledPiece = { text: string; style: RunStyle };

type RichLike = TextLike & RunStyle & { spans: TextSpan[] };

export const baseStyle = (n: RunStyle): RunStyle => ({
  fontFamily: n.fontFamily, fontSize: n.fontSize, fontWeight: n.fontWeight, fontStyle: n.fontStyle,
  letterSpacing: n.letterSpacing, underline: n.underline, strikethrough: n.strikethrough, fills: n.fills,
});

function styleAt(n: RichLike, i: number): RunStyle {
  let s = baseStyle(n);
  for (const sp of n.spans) {
    if (i < sp.start || i >= sp.end) continue;
    const { start: _s, end: _e, ...fields } = sp;
    s = { ...s, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
  }
  return s;
}

/**
 * Paragraphs as shown (case, list markers, curve), each cut into pieces of one style at span edges.
 * Without spans every paragraph is one piece in the node's own style.
 */
export function styledParagraphs(n: RichLike): StyledPiece[][] {
  const base = baseStyle(n);
  if (!n.spans.length) return displayParagraphs(n).map((text) => [{ text, style: base }]);
  const cuts = new Set<number>();
  for (const sp of n.spans) { cuts.add(sp.start); cuts.add(sp.end); }
  const out: StyledPiece[][] = [];
  let offset = 0;
  n.text.split('\n').forEach((para, pi) => {
    const pieces: StyledPiece[] = [];
    const marker = listMarker(n.list, pi);
    if (marker) pieces.push({ text: marker, style: styleAt(n, offset) });
    // Case per paragraph keeps title case right across span edges; per piece only when it changes length (ß → SS).
    const cased = applyCase(para, n.textCase);
    const whole = cased.length === para.length;
    let from = 0;
    for (let i = 1; i <= para.length; i++) {
      if (i < para.length && !cuts.has(offset + i)) continue;
      pieces.push({ text: whole ? cased.slice(from, i) : applyCase(para.slice(from, i), n.textCase), style: styleAt(n, offset + from) });
      from = i;
    }
    if (!pieces.length) pieces.push({ text: '', style: styleAt(n, offset) });
    out.push(merge(pieces));
    offset += para.length + 1;
  });
  if (!n.curve) return out;
  return [out.flatMap((p, i) => (i ? [{ text: ' ', style: base }, ...p] : p))];
}

/** Neighbouring pieces in the same style become one (fewer draw calls, kerning kept). */
function merge(pieces: StyledPiece[]): StyledPiece[] {
  const out: StyledPiece[] = [];
  for (const p of pieces) {
    const last = out.at(-1);
    if (last && JSON.stringify(last.style) === JSON.stringify(p.style)) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

/**
 * Keeps span ranges on the same characters after `text` changes (typing, pasting, deleting).
 * Text typed right after a span takes its style, like typing at the end of a bold word.
 */
export function remapSpans(before: string, after: string, spans: TextSpan[]): TextSpan[] {
  if (!spans.length || before === after) return spans;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const oldEnd = before.length - s, newEnd = after.length - s, delta = after.length - before.length;
  const start = (x: number) => (x < p ? x : x >= oldEnd ? x + delta : newEnd);
  const end = (x: number) => (x < p ? x : x > oldEnd ? x + delta : newEnd);
  return spans.map((sp) => ({ ...sp, start: start(sp.start), end: Math.min(after.length, end(sp.end)) })).filter((sp) => sp.end > sp.start);
}
