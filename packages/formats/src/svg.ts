import { colorToCss, isContainer, type Node } from '@archa/schema';
import { connectorGeometry, connectorStroke, polygonPoints, viewBoxMatrix, type ArchaDocument } from '@archa/core';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Vector export of one node and its subtree. Text is kept as text. */
export function exportSvg(doc: ArchaDocument, nodeId: string): string {
  const root = doc.require(nodeId);
  const defs: string[] = [];
  const body = draw(doc, root, true, defs);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${root.width}" height="${root.height}" viewBox="0 0 ${root.width} ${root.height}"${root.type === 'connector' ? ' overflow="visible"' : ''}>${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

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
    case 'polygon':
      return `<polygon transform="translate(${tx} ${ty})" points="${polygonPoints(n.sides, n.width, n.height).map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ')}" ${paint}${attrs}/>`;
    case 'path': {
      const [a, , , d, e, f] = viewBoxMatrix(n.viewBox, n.width, n.height);
      // Scale the geometry, not the stroke: vector-effect keeps the stroke width in node units.
      return `<path transform="translate(${tx} ${ty}) matrix(${a} 0 0 ${d} ${e} ${f})" vector-effect="non-scaling-stroke" d="${esc(n.d)}" fill-rule="${n.fillRule}" stroke-linecap="${n.lineCap}" stroke-linejoin="${n.lineJoin}" ${paint}${attrs}/>`;
    }
    case 'image': {
      const ratio = n.fit === 'fill' ? 'none' : n.fit === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice';
      defs.push(`<clipPath id="c-${n.id}"><rect width="${n.width}" height="${n.height}" rx="${n.cornerRadius}"/></clipPath>`);
      return `<g transform="translate(${tx} ${ty})"${attrs}><image href="${esc(n.src)}" width="${n.width}" height="${n.height}" preserveAspectRatio="${ratio}" clip-path="url(#c-${n.id})"/></g>`;
    }
    case 'sticky': {
      const lh = n.fontSize * 1.35;
      const lines = n.text.split('\n').map((l, i) => `<tspan x="16" y="${16 + lh * i + (lh + n.fontSize * 0.7) / 2}">${esc(l)}</tspan>`).join('');
      return `<g transform="translate(${tx} ${ty})"${attrs}><rect width="${n.width}" height="${n.height}" rx="4" ${paint}/><text font-family="Inter" font-size="${n.fontSize}" font-weight="500" fill="#1f1f23">${lines}</text></g>`;
    }
    case 'embed':
      return `<g transform="translate(${tx} ${ty})"${attrs}><rect width="${n.width}" height="${n.height}" rx="${n.cornerRadius}" fill="#ffffff" stroke="#e4e4e7"/><text x="14" y="22" font-family="Inter" font-size="13" fill="#52525b">${esc(n.url)}</text></g>`;
    case 'connector': {
      const { line, caps } = connectorGeometry(n);
      const { css, width } = connectorStroke(n);
      return `<g transform="translate(${tx} ${ty})"${attrs}><path d="${line}" fill="none" stroke="${css}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>${caps.map((d) => `<path d="${d}" fill="${css}"/>`).join('')}</g>`;
    }
  }
}
