import { colorToCss, isContainer, linearGradientLine, type Node, type Paint } from '@archa/schema';
import { lineLayoutOf, polygonPoints, textSegments, viewBoxMatrix, type ArchaDocument } from '@archa/core';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Vector export of one node and its subtree. Text is kept as text. */
export function exportSvg(doc: ArchaDocument, nodeId: string): string {
  const root = doc.require(nodeId);
  const defs: string[] = [];
  const body = draw(doc, root, true, defs);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${root.width}" height="${root.height}" viewBox="0 0 ${root.width} ${root.height}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * SVG `fill` for a paint. Gradients become defs in user space: (ox, oy) is where the node box starts in the
 * element's coordinates; `bbox` uses the shape's own bounding box instead (paths drawn through a viewBox).
 */
function fillOf(p: Paint | undefined, defs: string[], id: string, box: { ox: number; oy: number; w: number; h: number; bbox?: boolean }): string {
  if (!p) return 'none';
  if (p.type === 'solid') return colorToCss(p.color);
  const gid = `g-${id}-${defs.length}`;
  const stops = [...p.stops].sort((a, b) => a.offset - b.offset).map((st) => `<stop offset="${r2(st.offset)}" stop-color="${colorToCss(st.color)}"/>`).join('');
  if (p.type === 'linear') {
    const l = linearGradientLine(p.angle, box.w, box.h);
    const [x1, y1, x2, y2] = box.bbox
      ? [l.x0 / box.w, l.y0 / box.h, l.x1 / box.w, l.y1 / box.h]
      : [box.ox + l.x0, box.oy + l.y0, box.ox + l.x1, box.oy + l.y1];
    defs.push(`<linearGradient id="${gid}" gradientUnits="${box.bbox ? 'objectBoundingBox' : 'userSpaceOnUse'}" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}">${stops}</linearGradient>`);
  } else {
    const r = p.radius * Math.max(box.w, box.h);
    defs.push(box.bbox
      ? `<radialGradient id="${gid}" cx="${r2(p.cx)}" cy="${r2(p.cy)}" r="${r2(r / Math.max(box.w, box.h))}">${stops}</radialGradient>`
      : `<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${r2(box.ox + p.cx * box.w)}" cy="${r2(box.oy + p.cy * box.h)}" r="${r2(r)}">${stops}</radialGradient>`);
  }
  return `url(#${gid})`;
}

function draw(doc: ArchaDocument, n: Node, isRoot: boolean, defs: string[]): string {
  if (!n.visible || n.type === 'page') return '';
  const tx = isRoot ? 0 : n.x, ty = isRoot ? 0 : n.y;
  const attrs = `${n.opacity < 1 ? ` opacity="${n.opacity}"` : ''}`;
  const fill = 'fills' in n ? n.fills.find((f) => f.visible) : undefined;
  const stroke = 'strokes' in n ? n.strokes.find((s) => s.visible) : undefined;
  const strokeAttr = stroke ? ` stroke="${colorToCss(stroke.color)}" stroke-width="${stroke.width}"` : '';
  // Elements placed with x/y attributes start their box at (tx, ty); the rest sit inside a translate.
  const placed = n.type === 'rect' || n.type === 'ellipse' || n.type === 'text';
  const paint = `fill="${fillOf(fill, defs, n.id, { ox: placed ? tx : 0, oy: placed ? ty : 0, w: n.width, h: n.height, bbox: n.type === 'path' })}"${strokeAttr}`;
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
      // Same lines and run positions as the canvas (core text measure): each run is placed at its own x.
      const lh = n.fontSize * n.lineHeight;
      const lines = lineLayoutOf(n).map((line, i) => {
        const x0 = n.textAlign === 'center' ? (n.width - line.width) / 2 : n.textAlign === 'right' ? n.width - line.width : 0;
        const y = ty + lh * i + (lh + n.fontSize * 0.7) / 2;
        return textSegments(n, line).map((seg) => {
          const st = seg.style;
          const own: string[] = [];
          if (st.fills) own.push(`fill="${fillOf(st.fills.filter((f) => f.visible).at(-1), defs, n.id, { ox: tx, oy: ty, w: n.width, h: n.height })}"`);
          if (st.fontWeight !== n.fontWeight) own.push(`font-weight="${st.fontWeight}"`);
          if (st.fontFamily !== n.fontFamily) own.push(`font-family="${esc(st.fontFamily)}"`);
          if (st.letterSpacing !== n.letterSpacing) own.push(`letter-spacing="${st.letterSpacing}"`);
          const deco = [st.underline ? 'underline' : '', st.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ');
          if (deco) own.push(`text-decoration="${deco}"`);
          return `<tspan x="${r2(tx + x0 + seg.x)}" y="${r2(y)}"${own.length ? ` ${own.join(' ')}` : ''}>${esc(n.text.slice(seg.start, seg.end))}</tspan>`;
        }).join('');
      }).join('');
      const spacing = n.letterSpacing ? ` letter-spacing="${n.letterSpacing}"` : '';
      return `<text font-family="${esc(n.fontFamily)}" font-size="${n.fontSize}" font-weight="${n.fontWeight}"${spacing} font-kerning="none" xml:space="preserve" ${paint}${attrs}>${lines}</text>`;
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
  }
}
