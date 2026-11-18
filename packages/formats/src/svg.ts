import { colorToCss, isContainer, type Node } from '@archa/schema';
import type { ArchaDocument } from '@archa/core';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Vector export of one node and its subtree. Text is kept as text. */
export function exportSvg(doc: ArchaDocument, nodeId: string): string {
  const root = doc.require(nodeId);
  const defs: string[] = [];
  const body = draw(doc, root, true, defs);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${root.width}" height="${root.height}" viewBox="0 0 ${root.width} ${root.height}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}

function draw(doc: ArchaDocument, n: Node, isRoot: boolean, defs: string[]): string {
  if (!n.visible || n.type === 'page') return '';
  const tx = isRoot ? 0 : n.x, ty = isRoot ? 0 : n.y;
  const attrs = `${n.opacity < 1 ? ` opacity="${n.opacity}"` : ''}`;
  const fill = 'fills' in n ? n.fills.find((f) => f.visible) : undefined;
  const stroke = 'strokes' in n ? n.strokes.find((s) => s.visible) : undefined;
  const paint = `fill="${fill ? colorToCss(fill.color) : 'none'}"${stroke ? ` stroke="${colorToCss(stroke.color)}" stroke-width="${stroke.width}"` : ''}`;
  const inner = isContainer(n) ? n.children.map((c) => doc.get(c)).filter((c): c is Node => !!c).map((c) => draw(doc, c, false, defs)).join('') : '';
  switch (n.type) {
    case 'frame': {
      let clip = '';
      if (n.clip) {
        defs.push(`<clipPath id="c-${n.id}"><rect width="${n.width}" height="${n.height}" rx="${n.cornerRadius}"/></clipPath>`);
        clip = ` clip-path="url(#c-${n.id})"`;
      }
      return `<g transform="translate(${tx} ${ty})"${attrs}><rect width="${n.width}" height="${n.height}" rx="${n.cornerRadius}" ${paint}/><g${clip}>${inner}</g></g>`;
    }
    case 'group':
      return `<g transform="translate(${tx} ${ty})"${attrs}>${inner}</g>`;
    case 'rect':
      return `<rect x="${tx}" y="${ty}" width="${n.width}" height="${n.height}" rx="${n.cornerRadius}" ${paint}${attrs}/>`;
    case 'ellipse':
      return `<ellipse cx="${tx + n.width / 2}" cy="${ty + n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" ${paint}${attrs}/>`;
    case 'text': {
      const lh = n.fontSize * n.lineHeight;
      const anchor = n.textAlign === 'center' ? 'middle' : n.textAlign === 'right' ? 'end' : 'start';
      const ax = n.textAlign === 'center' ? n.width / 2 : n.textAlign === 'right' ? n.width : 0;
      const lines = n.text.split('\n').map((l, i) => `<tspan x="${tx + ax}" y="${ty + lh * i + (lh + n.fontSize * 0.7) / 2}">${esc(l)}</tspan>`).join('');
      return `<text font-family="${esc(n.fontFamily)}" font-size="${n.fontSize}" font-weight="${n.fontWeight}" text-anchor="${anchor}" ${paint}${attrs}>${lines}</text>`;
    }
  }
}
