import type { FrameNode, Node, TextNode } from '@archa/schema';
import type { ArchaDocument } from './document';
import { routeConnectors } from './connectors';
import { curveBox, displayParagraphs } from './text';

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
 * Word-wraps like the renderer; the renderer draws the real glyphs.
 */
export const approxMeasure: TextMeasure = (node, maxWidth) => {
  const weight = 1 + (node.fontWeight - 400) / 3000;
  const width = (s: string) => [...s].reduce((w, ch) => w + charEm(ch) * node.fontSize * weight + node.letterSpacing, 0);
  const lineH = node.fontSize * node.lineHeight;
  const paras = displayParagraphs(node);
  // Curved text is one line bent into an arc; its box is the arc's.
  if (node.curve) { const b = curveBox(width(paras[0]!), lineH, node.curve); return { width: b.width, height: b.height }; }
  if (maxWidth === undefined) {
    return { width: Math.ceil(Math.max(1, ...paras.map(width))), height: Math.ceil(paras.length * lineH) };
  }
  let lines = 0;
  for (const para of paras) {
    let line = '';
    lines++;
    for (const word of para.split(/(\s+)/)) {
      if (line && width(line + word) > maxWidth) { lines++; line = word.trimStart(); } else line += word;
    }
  }
  return { width: maxWidth, height: Math.ceil(lines * lineH) };
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

const round = (n: number) => Math.round(n * 100) / 100;
