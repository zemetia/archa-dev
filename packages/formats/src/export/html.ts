import { colorToHex, hexToColor, isContainer, paintColor, type Color, type Node, type Paint, type TextNode } from '@archa/schema';
import { baseStyle, styledParagraphs, type ArchaDocument, type RunStyle } from '@archa/core';
import { exportSvg } from '../svg';
import { tailwindClasses } from './tailwind';

/*
 * Component → static HTML (blueprint DESIGN_SYSTEM/04). One element tree, printed either with a
 * CSS file (class per node) or with Tailwind classes. Auto-layout becomes flexbox, hug becomes
 * `auto`, fill becomes `flex: 1 1 0` / `align-self: stretch`; everything else is absolutely placed.
 */

export type HtmlStyle = 'css' | 'tailwind';
export type ExportFile = { path: string; data: string | Uint8Array };
export type HtmlExportOptions = {
  style: HtmlStyle;
  /** File stem as the person typed it in the save dialog. Defaults to the node name, slugged. */
  name?: string;
  /** Keep images as data: URLs in the markup (for PDF) instead of writing them to `<stem>-assets/`. */
  inlineAssets?: boolean;
};

type Decl = [prop: string, value: string];
type El = { tag: string; cls: string; attrs: string; style: Decl[]; children: El[]; text?: string; raw?: string; html?: string };

const SYSTEM_FONTS = new Set(['segoe ui', 'georgia', 'times new roman', 'arial', 'consolas', 'courier new', 'trebuchet ms', 'verdana', 'system-ui', 'helvetica']);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (v: number) => `${Math.round(v * 100) / 100}px`;
const hex = (c: Color) => colorToHex(c, true);

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';

/** Returns the files to write, relative to one folder; the first is the page. */
export function exportHtml(doc: ArchaDocument, nodeId: string, opts: HtmlExportOptions): ExportFile[] {
  const root = doc.require(nodeId);
  const stem = opts.name ? opts.name.replace(/[\\/:*?"<>|]+/g, '-') : slug(root.name);
  const assets = new Map<string, ExportFile>();
  const fonts = new Map<string, Set<number>>();
  const used = new Map<string, number>();
  const tokens = new Map<string, string>();
  const ctx: Ctx = {
    doc,
    className: (name) => {
      const base = /^[a-z]/.test(slug(name)) ? slug(name) : `n-${slug(name)}`;
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      return n === 1 ? base : `${base}-${n}`;
    },
    asset: (src) => (opts.inlineAssets ? src : assetPath(src, `${stem}-assets`, assets)),
    font: (family, weight) => { if (!fonts.has(family)) fonts.set(family, new Set()); fonts.get(family)!.add(weight); },
    token: (n, path, literal) => {
      const v = n.bindings?.[path] ? doc.variables.get(n.bindings[path]!) : undefined;
      if (!v) return literal;
      const name = `--${slug(v.name)}`;
      tokens.set(name, literal);
      return `var(${name})`;
    },
  };
  const tree = build(ctx, root, null);
  if (!tree) throw new Error(`"${root.name}" is hidden — nothing to export`);

  // Bound tokens become CSS custom properties, so the exported code keeps the design system.
  const rootVars = tokens.size ? `:root {\n${[...tokens].map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}` : '';
  const fontLink = [...fonts].filter(([f]) => !SYSTEM_FONTS.has(f.toLowerCase()));
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(root.name)}</title>`,
    ...(fontLink.length ? [
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontLink.map(([f, w]) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${[...w].sort((a, b) => a - b).join(';')}`).join('&')}&display=swap">`,
    ] : []),
  ];

  if (opts.style === 'tailwind') {
    const body = print(tree, 1, (el) => tailwindClasses(el.style).join(' '));
    const html = `<!doctype html>\n<html lang="en">\n<head>\n  ${[...head, '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>', ...(rootVars ? [`<style>\n${rootVars}\n</style>`] : [])].join('\n  ')}\n</head>\n<body class="m-0">\n${body}\n</body>\n</html>\n`;
    return [{ path: `${stem}.html`, data: html }, ...assets.values()];
  }

  const rules: string[] = [...(rootVars ? [rootVars] : []), '*, *::before, *::after { box-sizing: border-box; }', 'body { margin: 0; }'];
  const collect = (el: El) => {
    if (el.style.length) rules.push(`.${el.cls} {\n${el.style.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`);
    el.children.forEach(collect);
  };
  collect(tree);
  const body = print(tree, 1, (el) => (el.style.length ? el.cls : ''));
  const html = `<!doctype html>\n<html lang="en">\n<head>\n  ${[...head, `<link rel="stylesheet" href="${stem}.css">`].join('\n  ')}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  return [{ path: `${stem}.html`, data: html }, { path: `${stem}.css`, data: `${rules.join('\n\n')}\n` }, ...assets.values()];
}

/** One self-contained page (CSS inlined, images as data URLs) — the PDF exporter prints this. */
export function exportHtmlStandalone(doc: ArchaDocument, nodeId: string): string {
  const [page, css] = exportHtml(doc, nodeId, { style: 'css', inlineAssets: true });
  return String(page!.data).replace(/<link rel="stylesheet" href="[^"]+\.css">/, `<style>\n${String(css!.data)}</style>`);
}

type Ctx = {
  doc: ArchaDocument; className: (name: string) => string; asset: (src: string) => string; font: (family: string, weight: number) => void;
  /** `literal`, or `var(--token)` when the node binds `path` to a variable (the token keeps the literal as its value). */
  token: (n: Node, path: string, literal: string) => string;
};

function build(ctx: Ctx, n: Node, parent: Node | null): El | null {
  if (!n.visible || n.type === 'page') return null;
  const el: El = { tag: 'div', cls: ctx.className(n.name), attrs: '', style: [], children: [] };
  const s = el.style;
  const flexParent = parent?.type === 'frame' && parent.layout !== 'none' && !n.absolute ? parent : null;
  const gridParent = flexParent && flexParent.wrap > 0 ? flexParent : null;

  if (!parent) s.push(['position', 'relative']);
  else if (!flexParent) s.push(['position', 'absolute'], ['left', px(n.x)], ['top', px(n.y)]);
  else if (isContainer(n)) s.push(['position', 'relative']); // contains its own absolutely placed children
  // CSS turns about the box centre by default, like the canvas. The exported root stays upright.
  if (parent && n.rotation && n.type !== 'connector') s.push(['rotate', `${Math.round(n.rotation * 100) / 100}deg`]);

  // Size per axis: auto (hug / auto text), fill (flex item), or fixed px.
  const autoW = (n.type === 'frame' && n.layout !== 'none' && n.sizing.horizontal === 'hug') || (n.type === 'text' && n.textSizing === 'auto-width');
  const autoH = (n.type === 'frame' && n.layout !== 'none' && n.sizing.vertical === 'hug') || (n.type === 'text' && n.textSizing !== 'fixed');
  for (const [axis, prop, auto] of [['horizontal', 'width', autoW], ['vertical', 'height', autoH]] as const) {
    const isMain = flexParent ? (flexParent.layout === 'row') === (axis === 'horizontal') : false;
    // Grid cell: fill stretches across its track (horizontal) or line (vertical); other sizes stay fixed.
    if (gridParent) {
      if (n.sizing[axis] === 'fill') s.push([axis === 'horizontal' ? 'justify-self' : 'align-self', 'stretch']);
      else if (!auto) s.push([prop, px(n[prop])]);
      continue;
    }
    if (flexParent && n.sizing[axis] === 'fill') {
      if (isMain) s.push(['flex', '1 1 0'], [`min-${prop}`, '0']);
      else s.push(['align-self', 'stretch']);
      continue;
    }
    if (!auto) s.push([prop, px(n[prop])]);
    if (isMain) s.push(['flex-shrink', '0']);
  }
  if (n.opacity < 1 && n.type !== 'polygon' && n.type !== 'path') s.push(['opacity', String(n.opacity)]);

  if ('fills' in n && n.type !== 'text' && n.type !== 'polygon' && n.type !== 'path') s.push(...backgroundCss(ctx, n, n.fills));
  const radius = 'cornerRadius' in n ? n.cornerRadius : n.type === 'ellipse' ? -1 : 0;
  if (radius === -1) s.push(['border-radius', '50%']);
  else if (radius > 0) s.push(['border-radius', ctx.token(n, 'cornerRadius', px(radius))]);
  if ('strokes' in n && 'effects' in n && n.type !== 'polygon' && n.type !== 'path' && n.type !== 'text') {
    const shadows: string[] = [];
    for (const st of n.strokes) {
      if (!st.visible || st.width <= 0) continue;
      const c = hex(st.color);
      if (st.align === 'inside') shadows.push(`inset 0 0 0 ${px(st.width)} ${c}`);
      else if (st.align === 'outside') shadows.push(`0 0 0 ${px(st.width)} ${c}`);
      else shadows.push(`inset 0 0 0 ${px(st.width / 2)} ${c}`, `0 0 0 ${px(st.width / 2)} ${c}`);
    }
    for (const fx of n.effects) {
      if (!fx.visible || (fx.type !== 'drop-shadow' && fx.type !== 'inner-shadow')) continue;
      shadows.push(`${fx.type === 'inner-shadow' ? 'inset ' : ''}${px(fx.x)} ${px(fx.y)} ${px(fx.blur)} ${hex(fx.color)}`);
    }
    if (shadows.length) s.push(['box-shadow', shadows.join(', ')]);
  }
  if ('effects' in n) {
    for (const fx of n.effects) {
      if (!fx.visible) continue;
      if (fx.type === 'layer-blur' && fx.radius > 0) s.push(['filter', `blur(${px(fx.radius)})`]);
      if (fx.type === 'background-blur' && fx.radius > 0) s.push(['backdrop-filter', `blur(${px(fx.radius)})`]);
    }
  }

  switch (n.type) {
    case 'frame':
      if (n.layout !== 'none' && n.wrap > 0) {
        // Grid: `wrap` tracks along the layout direction; equal shares unless the frame hugs.
        const row = n.layout === 'row';
        const hug = (row ? n.sizing.horizontal : n.sizing.vertical) === 'hug';
        const tracks = `repeat(${n.wrap}, ${hug ? 'auto' : 'minmax(0, 1fr)'})`;
        s.push(['display', 'grid'], [row ? 'grid-template-columns' : 'grid-template-rows', tracks]);
        if (!row) s.push(['grid-auto-flow', 'column']);
        const lineGap = n.lineGap ?? n.gap;
        if (n.gap || lineGap) s.push([row ? 'column-gap' : 'row-gap', ctx.token(n, 'gap', px(n.gap))], [row ? 'row-gap' : 'column-gap', px(lineGap)]);
        const p = n.padding;
        if (p.top || p.right || p.bottom || p.left) s.push(['padding', [p.top, p.right, p.bottom, p.left].map(px).join(' ')]);
        const place = (v: string) => (v === 'center' ? 'center' : v === 'end' ? 'end' : 'start');
        s.push([row ? 'justify-items' : 'align-items', place(n.justify)], [row ? 'align-items' : 'justify-items', place(n.align)]);
      } else if (n.layout !== 'none') {
        s.push(['display', 'flex'], ['flex-direction', n.layout]);
        if (n.gap) s.push(['gap', ctx.token(n, 'gap', px(n.gap))]);
        const p = n.padding;
        if (p.top || p.right || p.bottom || p.left) s.push(['padding', [p.top, p.right, p.bottom, p.left].map(px).join(' ')]);
        if (n.align !== 'start') s.push(['align-items', n.align === 'center' ? 'center' : 'flex-end']);
        else s.push(['align-items', 'flex-start']);
        if (n.justify !== 'start') s.push(['justify-content', n.justify === 'center' ? 'center' : n.justify === 'end' ? 'flex-end' : n.justify]);
      }
      if (n.clip) s.push(['overflow', 'hidden']);
      break;
    case 'text':
      textStyle(ctx, n, s);
      el.tag = 'p';
      el.html = richHtml(ctx, n);
      break;
    case 'sticky':
      ctx.font('Inter', 500);
      s.push(['padding', '16px'], ['border-radius', '4px'], ['font-family', "'Inter', sans-serif"], ['font-size', px(n.fontSize)], ['font-weight', '500'], ['line-height', '1.35'], ['color', '#1f1f23'], ['white-space', 'pre-wrap']);
      el.text = n.text;
      break;
    case 'image':
      el.tag = 'img';
      el.attrs = ` src="${esc(ctx.asset(n.src))}" alt="${esc(n.name)}"`;
      s.push(['display', 'block'], ['object-fit', n.fit === 'fill' ? 'fill' : n.fit === 'fit' ? 'contain' : 'cover']);
      break;
    case 'embed':
      el.tag = 'iframe';
      el.attrs = ` src="${esc(n.url)}" title="${esc(n.name)}"`;
      s.push(['display', 'block'], ['border', '0'], ['background-color', '#ffffff']);
      if (n.cornerRadius > 0) s.push(['border-radius', px(n.cornerRadius)]);
      break;
    case 'polygon':
    case 'path':
    case 'connector':
      el.tag = 'svg';
      // The node's own SVG minus its outer size attributes: the box comes from the class.
      el.raw = exportSvg(ctx.doc, n.id).replace(/^<svg xmlns="[^"]*" width="[^"]*" height="[^"]*"/, '');
      s.push(['display', 'block'], ['overflow', 'visible']);
      break;
  }
  if (isContainer(n)) el.children = ctx.doc.children(n.id).map((c) => build(ctx, c, n)).filter((c): c is El => !!c);
  return el;
}

function textStyle(ctx: Ctx, n: TextNode, s: Decl[]) {
  ctx.font(n.fontFamily, n.fontWeight);
  const fill = n.fills.filter((f) => f.visible).at(-1);
  const ink = fill ? paintColor(fill) : null;
  s.push(['margin', '0'], ['font-family', `'${n.fontFamily}', ${/mono|consolas|courier/i.test(n.fontFamily) ? 'monospace' : /georgia|times/i.test(n.fontFamily) ? 'serif' : 'sans-serif'}`], ['font-size', px(n.fontSize)]);
  if (n.fontWeight !== 400) s.push(['font-weight', String(n.fontWeight)]);
  s.push(['line-height', String(n.lineHeight)]);
  if (n.letterSpacing) s.push(['letter-spacing', px(n.letterSpacing)]);
  if (n.textAlign !== 'left') s.push(['text-align', n.textAlign]);
  if (fill) s.push(...inkCss(ctx, n, fill, `fills.${n.fills.lastIndexOf(fill)}`));
  s.push(['white-space', n.textSizing === 'auto-width' ? 'pre' : 'pre-wrap']);
  if (n.fontStyle === 'italic') s.push(['font-style', 'italic']);
  const lines = [n.underline && 'underline', n.strikethrough && 'line-through'].filter(Boolean);
  if (lines.length) s.push(['text-decoration', lines.join(' ')]);
  s.push(...textEffectCss(n, ink ?? hexToColor('#000000')));
}

/** Canva-style text effects as CSS (blueprint DOCUMENT_MODEL/01). Curves have no CSS form and stay straight. */
function textEffectCss(n: TextNode, ink: Color): Decl[] {
  const fx = n.textEffect;
  if (!fx) return [];
  const fs = n.fontSize;
  const a = (c: Color, k = 1) => hex({ ...c, a: c.a * k });
  const rad = (fx.direction * Math.PI) / 180, dist = (fx.offset / 100) * fs * 0.25;
  const dx = Math.cos(rad) * dist, dy = Math.sin(rad) * dist;
  const opaque = 1 - fx.transparency / 100;
  const width = Math.max(0.5, (fx.thickness / 100) * fs * 0.16);
  const shadow = (x: number, y: number, blur: number, c: string) => `${px(x)} ${px(y)} ${px(blur)} ${c}`;
  switch (fx.type) {
    case 'drop': return [['text-shadow', shadow(dx, dy, (fx.blur / 100) * fs * 0.8, a(fx.color ?? hexToColor('#000000'), opaque))]];
    case 'glow': { const r = fs * (0.12 + (fx.spread / 100) * 0.6); const c = a(fx.color ?? ink, opaque); return [['text-shadow', `${shadow(0, 0, r, c)}, ${shadow(0, 0, r / 2, c)}`]]; }
    case 'echo': { const c = fx.color ?? ink; return [['text-shadow', `${shadow(dx, dy, 0, a(c, 0.5))}, ${shadow(dx * 2, dy * 2, 0, a(c, 0.25))}`]]; }
    case 'outline': return [['-webkit-text-stroke', `${px(width * 2)} ${a(fx.color ?? hexToColor('#000000'))}`], ['paint-order', 'stroke fill']];
    case 'background': return [['background-color', a(fx.color ?? hexToColor('#fde047'), opaque)], ['padding', `0 ${px((fx.spread / 100) * fs * 0.5)}`], ['border-radius', px((fs * n.lineHeight) / 2 * (fx.roundness / 100))], ['box-decoration-break', 'clone']];
    case 'splice': return [['color', 'transparent'], ['-webkit-text-stroke', `${px(width)} ${a(ink)}`], ['text-shadow', shadow(dx, dy, 0, a(fx.color ?? ink, 0.45))]];
    case 'hollow': return [['color', 'transparent'], ['-webkit-text-stroke', `${px(width)} ${a(ink)}`]];
    case 'neon': { const c = fx.color ?? ink; const p = 0.4 + (fx.intensity / 100) * 0.8; return [['color', a({ ...c, l: Math.min(1, c.l + (1 - c.l) * 0.75), c: c.c * 0.5 })], ['text-shadow', `${shadow(0, 0, fs * 0.25 * p, a(c))}, ${shadow(0, 0, fs * 0.7 * p, a(c, 0.9))}`]]; }
    case 'glitch': return [['text-shadow', `${shadow(-dx, -dy, 0, '#00e5ffe6')}, ${shadow(dx, dy, 0, fx.color ? a(fx.color, 0.9) : '#ff2bd6e6')}`]];
  }
}

const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;
const stopsCss = (p: Extract<Paint, { stops: unknown }>) => [...p.stops].sort((a, b) => a.position - b.position).map((st) => `${hex(st.color)} ${pct(st.position)}`).join(', ');

/** One paint as a CSS background layer (`image` = an <image> value; `size` / `repeat` for pictures). */
function paintLayer(ctx: Ctx, p: Paint): { image: string; position: string; size: string; repeat: string } {
  const plain = { position: '0 0', size: 'auto', repeat: 'no-repeat' };
  switch (p.type) {
    case 'solid': return { image: `linear-gradient(${hex(p.color)}, ${hex(p.color)})`, ...plain };
    case 'linear-gradient': return { image: `linear-gradient(${Math.round(p.angle * 100) / 100}deg, ${stopsCss(p)})`, ...plain };
    case 'radial-gradient': return { image: `radial-gradient(ellipse ${pct(p.radius.x)} ${pct(p.radius.y)} at ${pct(p.center.x)} ${pct(p.center.y)}, ${stopsCss(p)})`, ...plain };
    case 'image': {
      const image = `url("${ctx.asset(p.src)}")`;
      if (p.fit === 'tile') return { image, position: '0 0', size: 'auto', repeat: 'repeat' };
      return { image, position: 'center', size: p.fit === 'fill' ? '100% 100%' : p.fit === 'fit' ? 'contain' : 'cover', repeat: 'no-repeat' };
    }
  }
}

/** Fills → background declarations. CSS lists the top layer first; fills list it last. */
function backgroundCss(ctx: Ctx, n: Node, fills: Paint[]): Decl[] {
  const shown = fills.map((f, i) => ({ f, i })).filter(({ f }) => f.visible).reverse();
  if (!shown.length) return [];
  if (shown.length === 1 && shown[0]!.f.type === 'solid') return [['background-color', ctx.token(n, `fills.${shown[0]!.i}.color`, hex(shown[0]!.f.color))]];
  const layers = shown.map(({ f, i }) => (f.type === 'solid' ? { ...paintLayer(ctx, f), image: `linear-gradient(${ctx.token(n, `fills.${i}.color`, hex(f.color))}, ${ctx.token(n, `fills.${i}.color`, hex(f.color))})` } : paintLayer(ctx, f)));
  const out: Decl[] = [['background-image', layers.map((l) => l.image).join(', ')]];
  if (layers.some((l) => l.position !== '0 0')) out.push(['background-position', layers.map((l) => l.position).join(', ')]);
  if (layers.some((l) => l.size !== 'auto')) out.push(['background-size', layers.map((l) => l.size).join(', ')]);
  out.push(['background-repeat', layers.map((l) => l.repeat).join(', ')]);
  return out;
}

/** Text colour: `color` for a solid, the paint clipped to the glyphs for a gradient or picture. */
function inkCss(ctx: Ctx, n: Node, fill: Paint, path: string): Decl[] {
  if (fill.type === 'solid') return [['color', ctx.token(n, `${path}.color`, hex(fill.color))]];
  const l = paintLayer(ctx, fill);
  return [['background-image', l.image], ['background-size', l.size === 'auto' ? '100% 100%' : l.size], ['background-position', l.position], ['-webkit-background-clip', 'text'], ['background-clip', 'text'], ['color', 'transparent']];
}

/** Rich text: pieces that differ from the node's own style become inline-styled spans. */
function richHtml(ctx: Ctx, n: TextNode): string {
  const base = baseStyle(n);
  const differs = (st: RunStyle) => {
    const d: string[] = [];
    if (st.fontFamily !== base.fontFamily) { ctx.font(st.fontFamily, st.fontWeight); d.push(`font-family: '${st.fontFamily}'`); }
    if (st.fontSize !== base.fontSize) d.push(`font-size: ${px(st.fontSize)}`);
    if (st.fontWeight !== base.fontWeight) { ctx.font(st.fontFamily, st.fontWeight); d.push(`font-weight: ${st.fontWeight}`); }
    if (st.fontStyle !== base.fontStyle) d.push(`font-style: ${st.fontStyle}`);
    if (st.letterSpacing !== base.letterSpacing) d.push(`letter-spacing: ${px(st.letterSpacing)}`);
    if (st.underline !== base.underline || st.strikethrough !== base.strikethrough) d.push(`text-decoration: ${[st.underline && 'underline', st.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none'}`);
    if (st.fills !== base.fills) {
      const fill = st.fills.filter((f) => f.visible).at(-1);
      // The span that gave this piece its colour, so a bound span colour exports as its token.
      const span = n.spans.findIndex((sp) => sp.fills === st.fills);
      d.push(...(fill ? inkCss(ctx, n, fill, `spans.${span}.fills.${st.fills.lastIndexOf(fill)}`) : [['color', 'transparent'] as Decl]).map(([p, v]) => `${p}: ${v}`));
    }
    return d.join('; ');
  };
  return styledParagraphs(n).map((pieces) => pieces.map((p) => {
    const style = differs(p.style);
    return style ? `<span style="${esc(style)}">${esc(p.text)}</span>` : esc(p.text);
  }).join('')).join('\n');
}

function print(el: El, depth: number, cls: (el: El) => string): string {
  const pad = '  '.repeat(depth);
  const c = cls(el);
  const open = `${el.tag}${c ? ` class="${c}"` : ''}${el.attrs}`;
  if (el.raw !== undefined) return `${pad}<${open}${el.raw}`;
  if (el.tag === 'img') return `${pad}<${open}>`;
  if (el.html !== undefined) return `${pad}<${open}>${el.html}</${el.tag}>`;
  if (el.text !== undefined) return `${pad}<${open}>${esc(el.text)}</${el.tag}>`;
  if (!el.children.length) return `${pad}<${open}></${el.tag}>`;
  return `${pad}<${open}>\n${el.children.map((k) => print(k, depth + 1, cls)).join('\n')}\n${pad}</${el.tag}>`;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

/** Writes a data: URL once into the asset folder and returns its relative path; other URLs pass through. */
function assetPath(src: string, dir: string, assets: Map<string, ExportFile>): string {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
  if (!m) return src;
  const hit = assets.get(src);
  if (hit) return hit.path;
  const [, mime, b64, payload] = m as unknown as [string, string, string | undefined, string];
  const data = b64 ? Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(payload));
  const file = { path: `${dir}/image-${assets.size + 1}.${EXT[mime] ?? 'bin'}`, data };
  assets.set(src, file);
  return file.path;
}
