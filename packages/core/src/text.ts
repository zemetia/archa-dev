import type { TextNode, TextSpan } from '@archa/schema';
import { FONT_METRICS, METRIC_RANGES } from './text-metrics-data';

/*
 * Text measure (blueprint DOCUMENT_MODEL/03 → Text measure). The core and the renderer mirror must
 * lay text out identically, and the renderer must draw it inside the boxes they computed. So both use
 * the real advance widths of the fonts ArchaDev bundles (Inter, Inter Tight), the renderer draws with
 * kerning off, and line breaking happens in one place — `textLines` — for layout, canvas and SVG.
 * A family that is not bundled measures as Inter (the renderer's fallback); code points without a
 * table entry (CJK, emoji…) use a per-class estimate.
 */

type Face = { upm: number; adv: Uint16Array };
export type TextStyle = Pick<TextNode, 'fontFamily' | 'fontWeight' | 'fontSize' | 'letterSpacing'>;

const faces = new Map<string, Face>();
const FAMILIES = new Map<string, string>();
const WEIGHTS = new Map<string, number[]>();
for (const key of Object.keys(FONT_METRICS)) {
  const [family, w] = key.split('|') as [string, string];
  FAMILIES.set(family.toLowerCase(), family);
  WEIGHTS.set(family, [...(WEIGHTS.get(family) ?? []), Number(w)].sort((a, b) => a - b));
}
const OFFSETS: number[] = [];
{
  let off = 0;
  for (const [a, b] of METRIC_RANGES) { OFFSETS.push(off); off += b - a + 1; }
}

/** Families the app ships (drawn and measured exactly) with their weights. */
export const BUNDLED_FONTS: ReadonlyArray<{ family: string; weights: number[] }> = [...WEIGHTS].map(([family, weights]) => ({ family, weights }));

/** The bundled family a font name renders with: itself when bundled, else Inter. */
export function bundledFamily(fontFamily: string): string {
  const name = fontFamily.split(',')[0]!.trim().replace(/^["']|["']$/g, '').toLowerCase();
  return FAMILIES.get(name) ?? 'Inter';
}

function faceFor(fontFamily: string, weight: number): Face {
  const family = bundledFamily(fontFamily);
  const ws = WEIGHTS.get(family)!;
  const w = ws.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best), ws[0]!);
  const key = `${family}|${w}`;
  let f = faces.get(key);
  if (!f) {
    const m = FONT_METRICS[key]!;
    f = { upm: m.upm, adv: Uint16Array.from(m.adv.split(','), (s) => parseInt(s, 36)) };
    faces.set(key, f);
  }
  return f;
}

/** Advance of one code point in em, or null when the font has no table entry for it. */
function advanceEm(face: Face, cp: number): number | null {
  for (let i = 0; i < METRIC_RANGES.length; i++) {
    const [a, b] = METRIC_RANGES[i]!;
    if (cp < a) return null;
    if (cp <= b) {
      const w = face.adv[OFFSETS[i]! + cp - a]!;
      return w ? w / face.upm : null;
    }
  }
  return null;
}

/** Estimate (em) for code points outside the tables. */
function estimateEm(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x2e80 && cp <= 0x9fff) return 1; // CJK
  if (cp >= 0xac00 && cp <= 0xd7af) return 1; // Hangul
  if (cp >= 0x1f000) return 1.2; // emoji and pictographs
  if (' il.,:;|!\'`'.includes(ch)) return 0.27;
  if ('mwMW@%'.includes(ch)) return 0.86;
  return 0.58;
}

/** Width in px of one line, as the canvas draws it (kerning off; letter spacing after every character). */
export function textWidth(text: string, style: TextStyle): number {
  if (!text) return 0;
  const face = faceFor(style.fontFamily, style.fontWeight);
  let em = 0;
  let n = 0;
  for (const ch of text) {
    const cp = ch === '\t' ? 0x20 : ch.codePointAt(0)!;
    em += advanceEm(face, cp) ?? estimateEm(ch);
    n++;
  }
  return em * style.fontSize + style.letterSpacing * n;
}

/** What a text node (or one of its spans) is drawn with. */
export type RunStyle = TextStyle & Pick<TextSpan, 'fills' | 'underline' | 'strikethrough'>;
type TextLike = TextStyle & Pick<TextNode, 'text'> & { spans?: TextSpan[] };

/** The style of the character at UTF-16 index `i`: the node's, overridden by the last span that covers it. */
function styleAt(node: TextLike, i: number): RunStyle {
  let st: RunStyle = node;
  for (const sp of node.spans ?? []) {
    if (i < sp.start || i >= sp.end) continue;
    st = {
      ...st,
      ...(sp.fontFamily !== undefined ? { fontFamily: sp.fontFamily } : {}),
      ...(sp.fontWeight !== undefined ? { fontWeight: sp.fontWeight } : {}),
      ...(sp.letterSpacing !== undefined ? { letterSpacing: sp.letterSpacing } : {}),
      ...(sp.fills !== undefined ? { fills: sp.fills } : {}),
      ...(sp.underline !== undefined ? { underline: sp.underline } : {}),
      ...(sp.strikethrough !== undefined ? { strikethrough: sp.strikethrough } : {}),
    };
  }
  return st;
}

/** Prefix sums of per-character widths: W(a, b) = P[b] − P[a]. Widths are additive because kerning is off. */
function prefixWidths(node: TextLike): Float64Array {
  const t = node.text;
  const P = new Float64Array(t.length + 1);
  const plain = !node.spans?.length;
  const face0 = faceFor(node.fontFamily, node.fontWeight);
  for (let i = 0; i < t.length; i++) {
    const code = t.charCodeAt(i);
    let w = 0;
    if (code < 0xdc00 || code > 0xdfff) { // a low surrogate adds nothing; its pair was counted
      const st = plain ? node : styleAt(node, i);
      const face = plain ? face0 : faceFor(st.fontFamily, st.fontWeight);
      const ch = String.fromCodePoint(t.codePointAt(i)!);
      const cp = ch === '\t' ? 0x20 : ch.codePointAt(0)!;
      w = (advanceEm(face, cp) ?? estimateEm(ch)) * node.fontSize + st.letterSpacing;
    }
    P[i + 1] = P[i]! + w;
  }
  return P;
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\u00a0' || c === '\r';

/** A line of a text node: UTF-16 range in `text` and its drawn width. */
export type TextLine = { start: number; end: number; width: number };

/**
 * Line breaking — the one place it happens (layout, canvas, SVG/HTML export). Hard breaks always;
 * with `maxWidth`, greedy word wrap (a word wider than the box keeps its own line).
 */
export function layoutText(node: TextLike, maxWidth?: number): TextLine[] {
  const t = node.text;
  const P = prefixWidths(node);
  const W = (a: number, b: number) => P[b]! - P[a]!;
  const trimEnd = (a: number, b: number) => { while (b > a && isSpace(t[b - 1]!)) b--; return b; };
  const out: TextLine[] = [];
  let ps = 0;
  for (const para of t.split('\n')) {
    const pe = ps + para.length;
    if (maxWidth === undefined) out.push({ start: ps, end: pe, width: W(ps, pe) });
    else {
      let ls = ps, le = ps;
      const re = /\s+|\S+/g;
      for (let m = re.exec(para); m; m = re.exec(para)) {
        const s = ps + m.index, e = s + m[0].length;
        const space = isSpace(m[0][0]!);
        if (le > ls && W(ls, space ? trimEnd(ls, le) : e) > maxWidth) {
          const end = trimEnd(ls, le);
          out.push({ start: ls, end, width: W(ls, end) });
          ls = space ? e : s;
        }
        le = e;
      }
      const end = trimEnd(ls, le);
      out.push({ start: ls, end, width: W(ls, end) });
    }
    ps = pe + 1;
  }
  return out;
}

/** The lines a text node shows, as strings (hard breaks; wrapped at `maxWidth` when given). */
export function textLines(node: TextLike, maxWidth?: number): string[] {
  return layoutText(node, maxWidth).map((l) => node.text.slice(l.start, l.end));
}

const wrapWidth = (node: TextNode) => (node.textSizing === 'auto-width' ? undefined : node.width);

/** The lines of a text node at its current size (auto-width keeps hard breaks only). */
export const linesOf = (node: TextNode): string[] => textLines(node, wrapWidth(node));

/** Lines with their ranges and widths, at the node's current size. */
export const lineLayoutOf = (node: TextNode): TextLine[] => layoutText(node, wrapWidth(node));

/** A stretch of one line drawn in one style: where it starts (x from the line start) and its width. */
export type TextSegment = { start: number; end: number; x: number; width: number; style: RunStyle };

/** Splits a line at span boundaries — what the canvas and the exporters draw run by run. */
export function textSegments(node: TextLike, line: TextLine): TextSegment[] {
  const cuts = new Set([line.start, line.end]);
  for (const sp of node.spans ?? []) for (const c of [sp.start, sp.end]) if (c > line.start && c < line.end) cuts.add(c);
  const points = [...cuts].sort((a, b) => a - b);
  const P = prefixWidths(node);
  const out: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    if (b <= a) continue;
    out.push({ start: a, end: b, x: P[a]! - P[line.start]!, width: P[b]! - P[a]!, style: styleAt(node, a) });
  }
  return out;
}

/** Size of a text node: widest line × (lines × line height). With maxWidth the text wraps to it. */
export function measureText(node: TextNode, maxWidth?: number): { width: number; height: number } {
  const lineH = node.fontSize * node.lineHeight;
  const lines = layoutText(node, maxWidth);
  if (maxWidth !== undefined) return { width: maxWidth, height: Math.ceil(lines.length * lineH) };
  return { width: Math.ceil(Math.max(1, ...lines.map((l) => l.width))), height: Math.ceil(lines.length * lineH) };
}

/**
 * Keeps style ranges on the same characters after the text changed: the edit is the stretch between the
 * common prefix and suffix; spans after it shift, spans inside it shrink or grow, empty spans go.
 */
export function adjustSpans(before: string, after: string, spans: TextSpan[]): TextSpan[] {
  let pre = 0;
  while (pre < before.length && pre < after.length && before[pre] === after[pre]) pre++;
  let suf = 0;
  while (suf < before.length - pre && suf < after.length - pre && before[before.length - 1 - suf] === after[after.length - 1 - suf]) suf++;
  const oldEnd = before.length - suf, delta = after.length - before.length;
  // A pure insertion at a span's edge goes outside it: before its start, after its end.
  const map = (i: number, isEnd: boolean) => {
    if (i < pre) return i;
    if (oldEnd === pre && isEnd && i === pre) return i;
    if (i >= oldEnd) return i + delta;
    return isEnd ? oldEnd + delta : pre;
  };
  return spans.map((sp) => ({ ...sp, start: map(sp.start, false), end: map(sp.end, true) }))
    .map((sp) => ({ ...sp, start: Math.min(sp.start, after.length), end: Math.min(sp.end, after.length) }))
    .filter((sp) => sp.end > sp.start);
}
