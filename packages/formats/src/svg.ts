import { colorToCss, isContainer, paintColor, type Node, type Paint } from '@archa/schema';
import { baseStyle, connectorGeometry, connectorStroke, curveAngle, displayParagraphs, linearGradientLine, polygonPoints, styledParagraphs, viewBoxMatrix, type ArchaDocument } from '@archa/core';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Vector export of one node and its subtree. Text is kept as text. */
export function exportSvg(doc: ArchaDocument, nodeId: string): string {
  const root = doc.require(nodeId);
  const defs: string[] = [];
  const body = draw(doc, root, true, defs);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${root.width}" height="${root.height}" viewBox="0 0 ${root.width} ${root.height}"${root.type === 'connector' ? ' overflow="visible"' : ''}>${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A paint as an SVG fill value; gradients and pictures go into `defs`. Gradients use the element's
 * bounding box; a picture is laid out on the node box at (ox, oy) in the element's user space.
 */
function svgPaint(p: Paint | undefined, id: string, defs: string[], w: number, h: number, ox = 0, oy = 0): string {
  if (!p) return 'none';
  const stops = (list: Extract<Paint, { stops: unknown }>['stops']) => [...list].sort((a, b) => a.position - b.position)
    .map((st) => `<stop offset="${r2(st.position)}" stop-color="${colorToCss({ ...st.color, a: 1 })}"${st.color.a < 1 ? ` stop-opacity="${st.color.a}"` : ''}/>`).join('');
  switch (p.type) {
    case 'solid':
      return colorToCss(p.color);
    case 'linear-gradient': {
      const l = linearGradientLine(p.angle, w || 1, h || 1);
      defs.push(`<linearGradient id="${id}" x1="${r2(l.x0 / (w || 1))}" y1="${r2(l.y0 / (h || 1))}" x2="${r2(l.x1 / (w || 1))}" y2="${r2(l.y1 / (h || 1))}">${stops(p.stops)}</linearGradient>`);
      return `url(#${id})`;
    }
    case 'radial-gradient':
      defs.push(`<radialGradient id="${id}" cx="0" cy="0" r="1" gradientTransform="translate(${r2(p.center.x)} ${r2(p.center.y)}) scale(${r2(p.radius.x)} ${r2(p.radius.y)})">${stops(p.stops)}</radialGradient>`);
      return `url(#${id})`;
    case 'image': {
      const ratio = p.fit === 'fill' ? 'none' : p.fit === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice';
      defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" x="${r2(ox)}" y="${r2(oy)}" width="${r2(w)}" height="${r2(h)}"><image href="${esc(p.src)}" width="${r2(w)}" height="${r2(h)}" preserveAspectRatio="${ratio}"${p.opacity < 1 ? ` opacity="${p.opacity}"` : ''}/></pattern>`);
      return `url(#${id})`;
    }
  }
}

/** A node's markup, turned about its box centre when rotated (the exported root itself stays upright). */
function draw(doc: ArchaDocument, n: Node, isRoot: boolean, defs: string[]): string {
  const out = shape(doc, n, isRoot, defs);
  if (isRoot || !out || !n.rotation || n.type === 'connector') return out;
  return `<g transform="rotate(${r2(n.rotation)} ${r2(n.x + n.width / 2)} ${r2(n.y + n.height / 2)})">${out}</g>`;
}

function shape(doc: ArchaDocument, n: Node, isRoot: boolean, defs: string[]): string {
  if (!n.visible || n.type === 'page') return '';
  const tx = isRoot ? 0 : n.x, ty = isRoot ? 0 : n.y;
  const attrs = `${n.opacity < 1 ? ` opacity="${n.opacity}"` : ''}`;
  const fill = 'fills' in n ? n.fills.find((f) => f.visible) : undefined;
  const stroke = 'strokes' in n ? n.strokes.find((s) => s.visible) : undefined;
  // Pictures are placed on the node box: frames draw at their own origin, plain shapes at (tx, ty).
  const at = n.type === 'rect' || n.type === 'ellipse' || n.type === 'text' ? [tx, ty] as const : [0, 0] as const;
  const paint = `fill="${svgPaint(fill, `p-${n.id}`, defs, n.width, n.height, at[0], at[1])}"${stroke ? ` stroke="${colorToCss(stroke.color)}" stroke-width="${stroke.width}"` : ''}`;
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
      const shown = displayParagraphs(n);
      // Outline and hollow are strokes; the other effects have no plain SVG form and are left out.
      const fx = n.textEffect;
      const sw = fx ? Math.max(0.5, (fx.thickness / 100) * n.fontSize * 0.16) : 0;
      const inkColor = fill ? paintColor(fill) : null;
      const ink = inkColor ? colorToCss(inkColor) : '#000000';
      const textPaint = fx?.type === 'hollow' ? `fill="none" stroke="${ink}" stroke-width="${r2(sw)}"`
        : fx?.type === 'outline' ? `fill="${ink}" stroke="${fx.color ? colorToCss(fx.color) : '#000000'}" stroke-width="${r2(sw * 2)}" paint-order="stroke" stroke-linejoin="round"`
        : paint;
      const deco = [n.underline && 'underline', n.strikethrough && 'line-through'].filter(Boolean).join(' ');
      const font = `font-family="${esc(n.fontFamily)}" font-size="${n.fontSize}" font-weight="${n.fontWeight}"${n.fontStyle === 'italic' ? ' font-style="italic"' : ''}${deco ? ` text-decoration="${deco}"` : ''}`;
      if (n.curve) {
        // Curved text runs along the arc through the middle of its letters, rebuilt from the box layout gave it.
        const half = Math.abs(curveAngle(n.curve)) / 2;
        const r = Math.max(1, n.width / 2 / (half < Math.PI / 2 ? Math.sin(half) : 1) - lh / 2);
        const up = n.curve > 0;
        const cx = tx + n.width / 2, cy = ty + (up ? r + lh / 2 : n.height - r - lh / 2);
        const ey = cy + (up ? -1 : 1) * r * Math.cos(half);
        defs.push(`<path id="t-${n.id}" d="M${r2(cx - r * Math.sin(half))} ${r2(ey)} A${r2(r)} ${r2(r)} 0 ${half > Math.PI / 2 ? 1 : 0} ${up ? 1 : 0} ${r2(cx + r * Math.sin(half))} ${r2(ey)}"/>`);
        return `<text ${font} text-anchor="middle" dominant-baseline="central" ${textPaint}${attrs}><textPath href="#t-${n.id}" startOffset="50%">${esc(shown[0] ?? '')}</textPath></text>`;
      }
      // Rich text: each line is a tspan, its differently styled pieces nested tspans.
      const base = baseStyle(n);
      const lines = styledParagraphs(n).map((pieces, i) => {
        const inner = pieces.map((pc, j) => {
          const st = pc.style;
          const a: string[] = [];
          if (st.fontFamily !== base.fontFamily) a.push(`font-family="${esc(st.fontFamily)}"`);
          if (st.fontSize !== base.fontSize) a.push(`font-size="${st.fontSize}"`);
          if (st.fontWeight !== base.fontWeight) a.push(`font-weight="${st.fontWeight}"`);
          if (st.fontStyle !== base.fontStyle) a.push(`font-style="${st.fontStyle}"`);
          if (st.letterSpacing !== base.letterSpacing) a.push(`letter-spacing="${st.letterSpacing}"`);
          if (st.underline !== base.underline || st.strikethrough !== base.strikethrough) a.push(`text-decoration="${[st.underline && 'underline', st.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none'}"`);
          if (st.fills !== base.fills) a.push(`fill="${svgPaint(st.fills.find((f) => f.visible), `p-${n.id}-${i}-${j}`, defs, n.width, n.height, tx, ty)}"`);
          return a.length ? `<tspan ${a.join(' ')}>${esc(pc.text)}</tspan>` : esc(pc.text);
        }).join('');
        return `<tspan x="${tx + ax}" y="${ty + lh * i + (lh + n.fontSize * 0.7) / 2}">${inner}</tspan>`;
      }).join('');
      return `<text ${font} text-anchor="${anchor}" ${textPaint}${attrs}>${lines}</text>`;
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
