import type { FrameNode, Node, TextNode } from '@archa/schema';
import type { ArchaDocument } from './document';
import { routeConnectors } from './connectors';
import { curveBox, styledParagraphs, type RunStyle } from './text';

export type TextMeasure = (node: TextNode, maxWidth?: number) => { width: number; height: number };

/** Relative advance per character class for a typical UI sans (Inter-like), in em. */
function charEm(ch: string): number {
  if (ch === ' ') return 0.27;
  if ("il.,:;|!'`ìíîïj".includes(ch)) return 0.27;
  if ('ftr()[]{}/\\-"'.includes(ch)) return 0.36;
  if ('mwMW@%'.includes(ch)) return 0.86;
  if (ch >= '0' && ch <= '9') return 0.58;
  if (ch >= 'A' && ch <= 'Z') return 0.66;
  return 0.54;
}

/**
 * Approximate text metrics so the core can lay out without a DOM (CLI, core host).
 * Word-wraps like the renderer (rich-text pieces keep their own size); the renderer draws the real glyphs.
 */
export const approxMeasure: TextMeasure = (node, maxWidth) => {
  const em = (ch: string, st: RunStyle) => charEm(ch) * st.fontSize * (1 + (st.fontWeight - 400) / 3000) + st.letterSpacing;
  const paras = styledParagraphs(node).map((pieces) => pieces.flatMap((p) => [...p.text].map((ch) => ({ ch, w: em(ch, p.style), size: p.style.fontSize }))));
  // A line is as tall as its largest letters.
  const lineH = (chars: Array<{ size: number }>) => Math.max(node.fontSize, ...chars.map((c) => c.size)) * node.lineHeight;
  const sum = (chars: Array<{ w: number }>) => chars.reduce((a, c) => a + c.w, 0);
  // Curved text is one line bent into an arc; its box is the arc's.
  if (node.curve) { const b = curveBox(sum(paras[0]!), lineH(paras[0]!), node.curve); return { width: b.width, height: b.height }; }
  if (maxWidth === undefined) {
    return { width: Math.ceil(Math.max(1, ...paras.map(sum))), height: Math.ceil(paras.reduce((h, p) => h + lineH(p), 0)) };
  }
  let height = 0;
  for (const para of paras) {
    let line: typeof para = [], word: typeof para = [];
    const flush = () => { height += lineH(line); line = []; };
    for (const c of [...para, null]) {
      if (c && !/\s/.test(c.ch)) { word.push(c); continue; }
      if (line.length && sum(line) + sum(word) > maxWidth) { const trimmed = word; flush(); line = trimmed; } else line.push(...word);
      word = [];
      if (c) line.push(c);
    }
    flush();
  }
  return { width: maxWidth, height: Math.ceil(height) };
};

let measure: TextMeasure = approxMeasure;
export const setTextMeasure = (m: TextMeasure) => { measure = m; };

type Mutable = { -readonly [K in keyof Node]: Node[K] };

/**
 * Narrow flexbox (blueprint DOCUMENT_MODEL/03): row/column, gap, padding, align, justify,
 * sizing fixed/hug/fill. Deterministic, so the renderer mirror reproduces it from the same ops.
 */
export function runLayout(doc: ArchaDocument): void {
  for (const page of doc.pages) layoutNode(doc, page.rootId);
  // Connectors last: they follow the boxes layout just placed.
  routeConnectors(doc);
}

function layoutNode(doc: ArchaDocument, id: string): void {
  const node = doc.get(id);
  if (!node) return;
  if (node.type === 'text') sizeText(node);
  for (const child of doc.children(id)) layoutNode(doc, child.id);
  if (node.type === 'frame' && node.layout !== 'none') layoutFrame(doc, node);
}

function sizeText(node: TextNode, forcedWidth?: number) {
  const m = node as Mutable & TextNode;
  if (forcedWidth !== undefined) {
    m.width = forcedWidth;
    if (node.textSizing !== 'fixed') m.height = measure(node, forcedWidth).height;
    return;
  }
  // A curve sizes the box to its arc whatever the text sizing.
  if (node.textSizing === 'auto-width' || node.curve) Object.assign(m, measure(node));
  else if (node.textSizing === 'auto-height') m.height = measure(node, node.width).height;
}

function layoutFrame(doc: ArchaDocument, frame: FrameNode) {
  if (frame.wrap > 0) return layoutGrid(doc, frame);
  const row = frame.layout === 'row';
  const kids = doc.children(frame.id).filter((c) => c.visible && !c.absolute);
  const main = (n: Node) => (row ? n.width : n.height);
  const cross = (n: Node) => (row ? n.height : n.width);
  const mainSizing = (n: Node) => (row ? n.sizing.horizontal : n.sizing.vertical);
  const crossSizing = (n: Node) => (row ? n.sizing.vertical : n.sizing.horizontal);
  const p = frame.padding;
  const padMainStart = row ? p.left : p.top;
  const padMain = row ? p.left + p.right : p.top + p.bottom;
  const padCrossStart = row ? p.top : p.left;
  const padCross = row ? p.top + p.bottom : p.left + p.right;
  const gaps = Math.max(0, kids.length - 1) * frame.gap;
  const f = frame as Mutable & FrameNode;

  // Cross-axis fill first when the frame's cross size is known, so wrapped text measures at its final width.
  if ((row ? frame.sizing.vertical : frame.sizing.horizontal) !== 'hug') {
    const known = Math.max(0, cross(frame) - padCross);
    for (const k of kids) {
      if (crossSizing(k) !== 'fill') continue;
      setCross(k as Mutable, known);
      if (k.type === 'text' && !row) sizeText(k, k.width);
      if (k.type === 'frame' && k.layout !== 'none') layoutFrame(doc, k);
    }
  }

  // Hug: the frame takes the size of its content (fill children count as 0 on the main axis).
  const fixedMain = kids.filter((k) => mainSizing(k) !== 'fill').reduce((s, k) => s + main(k), 0);
  if ((row ? frame.sizing.horizontal : frame.sizing.vertical) === 'hug') setMain(f, fixedMain + gaps + padMain);
  if ((row ? frame.sizing.vertical : frame.sizing.horizontal) === 'hug') {
    const maxCross = Math.max(0, ...kids.filter((k) => crossSizing(k) !== 'fill').map(cross));
    setCross(f, maxCross + padCross);
  }

  const innerMain = Math.max(0, main(frame) - padMain);
  const innerCross = Math.max(0, cross(frame) - padCross);
  const fillers = kids.filter((k) => mainSizing(k) === 'fill');
  const share = fillers.length ? Math.max(0, innerMain - fixedMain - gaps) / fillers.length : 0;

  for (const k of kids) {
    const m = k as Mutable;
    if (mainSizing(k) === 'fill') setMainOf(m, share);
    if (crossSizing(k) === 'fill') setCrossOf(m, innerCross);
    if (k.type === 'text' && k.sizing.horizontal === 'fill') sizeText(k, k.width);
  }

  const used = kids.reduce((s, k) => s + main(k), 0) + gaps;
  const free = Math.max(0, innerMain - used);
  let cursor = padMainStart;
  let gap = frame.gap;
  if (frame.justify === 'center') cursor += free / 2;
  else if (frame.justify === 'end') cursor += free;
  else if (frame.justify === 'space-between' && kids.length > 1) gap += free / (kids.length - 1);
  else if (frame.justify === 'space-around' && kids.length) { cursor += free / kids.length / 2; gap += free / kids.length; }

  for (const k of kids) {
    const m = k as Mutable;
    const crossFree = innerCross - cross(k);
    const crossPos = padCrossStart + (frame.align === 'center' ? crossFree / 2 : frame.align === 'end' ? crossFree : 0);
    if (row) { m.x = round(cursor); m.y = round(crossPos); } else { m.y = round(cursor); m.x = round(crossPos); }
    cursor += main(k) + gap;
  }

  // Top-down pass: a child frame that just received a fill size lays out its own children again.
  for (const k of kids) {
    if (k.type === 'frame' && k.layout !== 'none' && (mainSizing(k) === 'fill' || crossSizing(k) === 'fill')) layoutFrame(doc, k);
  }

  function setMain(n: Mutable, v: number) { if (row) n.width = round(v); else n.height = round(v); }
  function setCross(n: Mutable, v: number) { if (row) n.height = round(v); else n.width = round(v); }
  function setMainOf(n: Mutable, v: number) { setMain(n, v); }
  function setCrossOf(n: Mutable, v: number) { setCross(n, v); }
}

/**
 * Grid (blueprint DOCUMENT_MODEL/03 → Grid): `wrap` items per line, then a new line — CSS
 * `grid-template-columns: repeat(wrap, 1fr)` for a row layout, `grid-auto-flow: column` with
 * `wrap` rows for a column layout. Tracks are equal shares of a fixed/fill frame, or as wide as
 * their widest item in a hugging frame. A line is as tall as its tallest item; `fill` children take
 * their cell, the others sit in it by justify (main axis) and align (cross axis).
 */
function layoutGrid(doc: ArchaDocument, frame: FrameNode) {
  const row = frame.layout !== 'column';
  const per = frame.wrap;
  const kids = doc.children(frame.id).filter((c) => c.visible && !c.absolute);
  const main = (n: Node) => (row ? n.width : n.height);
  const cross = (n: Node) => (row ? n.height : n.width);
  const mainSizing = (n: Node) => (row ? n.sizing.horizontal : n.sizing.vertical);
  const crossSizing = (n: Node) => (row ? n.sizing.vertical : n.sizing.horizontal);
  const setMain = (n: Mutable, v: number) => { if (row) n.width = round(v); else n.height = round(v); };
  const setCross = (n: Mutable, v: number) => { if (row) n.height = round(v); else n.width = round(v); };
  const relayout = (k: Node) => {
    if (k.type === 'text') sizeText(k, k.width);
    if (k.type === 'frame' && k.layout !== 'none') layoutFrame(doc, k);
  };
  const p = frame.padding;
  const padMainStart = row ? p.left : p.top, padMain = row ? p.left + p.right : p.top + p.bottom;
  const padCrossStart = row ? p.top : p.left, padCross = row ? p.top + p.bottom : p.left + p.right;
  const lineGap = frame.lineGap ?? frame.gap;
  const f = frame as Mutable & FrameNode;
  const cols = Math.max(1, Math.min(per, kids.length));
  const lines: Node[][] = [];
  for (let i = 0; i < kids.length; i += per) lines.push(kids.slice(i, i + per));

  // Main-axis tracks: equal shares of a known size, else each as wide as its widest item.
  let track: number[];
  if (mainSizing(frame) === 'hug') {
    track = Array.from({ length: cols }, (_, j) => Math.max(0, ...kids.filter((k, i) => i % per === j && mainSizing(k) !== 'fill').map(main)));
    setMain(f, track.reduce((a, b) => a + b, 0) + frame.gap * (cols - 1) + padMain);
  } else {
    const share = Math.max(0, (main(frame) - padMain - frame.gap * (per - 1)) / per);
    track = Array.from({ length: per }, () => share);
  }
  kids.forEach((k, i) => {
    if (mainSizing(k) !== 'fill') return;
    setMain(k as Mutable, track[i % per]!);
    // Text in a row grid wraps at the cell width; its height follows.
    if (row) relayout(k);
  });
  for (const k of kids) if (k.type === 'frame' && k.layout !== 'none' && mainSizing(k) === 'fill') layoutFrame(doc, k);

  // Lines are as deep as their deepest item; cross-fill items stretch to their line.
  const depth = lines.map((line) => Math.max(0, ...line.filter((k) => crossSizing(k) !== 'fill').map(cross)));
  lines.forEach((line, l) => {
    for (const k of line) if (crossSizing(k) === 'fill') { setCross(k as Mutable, depth[l]!); if (!row) relayout(k); else if (k.type === 'frame' && k.layout !== 'none') layoutFrame(doc, k); }
  });
  if (crossSizing(frame) === 'hug') setCross(f, depth.reduce((a, b) => a + b, 0) + lineGap * Math.max(0, lines.length - 1) + padCross);

  let at = padCrossStart;
  lines.forEach((line, l) => {
    let x = padMainStart;
    line.forEach((k, j) => {
      const m = k as Mutable;
      const w = track[j] ?? 0;
      const free = Math.max(0, w - main(k)), crossFree = Math.max(0, depth[l]! - cross(k));
      const mainPos = x + (frame.justify === 'center' ? free / 2 : frame.justify === 'end' ? free : 0);
      const crossPos = at + (frame.align === 'center' ? crossFree / 2 : frame.align === 'end' ? crossFree : 0);
      if (row) { m.x = round(mainPos); m.y = round(crossPos); } else { m.y = round(mainPos); m.x = round(crossPos); }
      x += w + frame.gap;
    });
    at += depth[l]! + lineGap;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
