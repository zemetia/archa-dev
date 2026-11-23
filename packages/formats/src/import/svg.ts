import { rgbToOklch, type Color, type NodeInput } from '@archa/schema';

/*
 * SVG markup → nodes, with no DOM (blueprint FILE_FORMATS/04). Shared by the canvas importers
 * (file, paste, drop, chat) and the agent `svg()` call, so every surface places SVG the same way.
 *
 * Vector mode keeps every shape as an editable `path` node (transforms, arcs and <style> class rules
 * are baked in). What vectors cannot hold — gradients, text, images, filters, masks, clip paths,
 * dashes, <use> — makes `auto` fall back to one `image` node that shows the SVG exactly.
 */

export type SvgImportMode = 'auto' | 'vector' | 'image';
export type SvgImportOptions = {
  name?: string;
  mode?: SvgImportMode;
  /** Target size; one side alone keeps the aspect ratio. Default: the SVG's own size. */
  width?: number;
  height?: number;
};
export type SvgImport = {
  node: NodeInput;
  mode: 'vector' | 'image';
  /** Why auto mode used an image (the first thing vectors cannot keep). */
  reason?: string;
  /** Number of vector layers (0 for an image). */
  shapes: number;
};

export class SvgImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgImportError';
  }
}

/** True when text looks like SVG markup (optionally after an XML declaration / comments). */
export function isSvgMarkup(text: string): boolean {
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text);
}

/** The first `<svg>…</svg>` in a text (an agent reply, a code fence), or null. */
export function extractSvg(text: string): string | null {
  const start = text.search(/<svg[\s>]/i);
  if (start < 0) return null;
  const end = text.toLowerCase().lastIndexOf('</svg>');
  return end > start ? text.slice(start, end + 6) : null;
}

export function importSvg(markup: string, opts: SvgImportOptions = {}): SvgImport {
  const root = parseXml(markup);
  if (!root || root.tag !== 'svg') throw new SvgImportError('Not SVG markup: it must start with <svg …>');
  const name = opts.name || root.attrs.id || 'SVG';
  const box = rootBox(root, opts);
  const image = (): SvgImport => ({
    node: { type: 'image', name, src: svgDataUrl(markup), fit: 'fill', width: box.width, height: box.height } as NodeInput,
    mode: 'image', shapes: 0,
  });
  if (opts.mode === 'image') return image();
  const conv = new Converter(root);
  const children = conv.run(box.matrix);
  const reason = conv.unsupported ?? (children.length ? undefined : 'it has no shapes to convert');
  if (reason) {
    if (opts.mode === 'vector') throw new SvgImportError(`Cannot keep this SVG as vectors: ${reason}. Use mode "auto" or "image" to place it as an image.`);
    return { ...image(), reason };
  }
  return {
    node: { type: 'frame', name, width: box.width, height: box.height, fills: [], clip: false, children } as NodeInput,
    mode: 'vector', shapes: children.length,
  };
}

/** data: URL of the markup (scripts and event handlers removed) for an image node. */
export function svgDataUrl(markup: string): string {
  let clean = markup.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  // An image needs the namespace to decode.
  if (!/<svg[^>]*\sxmlns\s*=/i.test(clean)) clean = clean.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const bytes = new TextEncoder().encode(clean);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/* --------------------------------- XML ---------------------------------- */

type El = { tag: string; attrs: Record<string, string>; children: El[]; text: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m));

/** A small, forgiving XML reader: elements, attributes and text (CDATA kept as text). */
function parseXml(src: string): El | null {
  const doc: El = { tag: '#doc', attrs: {}, children: [], text: '' };
  const stack = [doc];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[?!][^>]*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>/]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack.at(-1)!;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      const tag = m[2].replace(/^\w+:/, '').toLowerCase();
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
    } else if (m[3]) {
      const el: El = { tag: m[3].replace(/^svg:/i, '').toLowerCase(), attrs: {}, children: [], text: '' };
      for (const a of (m[4] ?? '').matchAll(/([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g)) el.attrs[a[1]!.toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6]) top.text += decode(m[6]);
  }
  const find = (e: El): El | null => (e.tag === 'svg' ? e : e.children.reduce<El | null>((f, c) => f ?? find(c), null));
  return find(doc);
}

/* ------------------------------- geometry -------------------------------- */

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
const nums = (s: string) => (s.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
const round = (v: number) => Math.round(v * 1000) / 1000;

function parseTransform(s: string | undefined): M {
  let m = ID;
  for (const [, fn, args] of (s ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = nums(args!);
    const rad = ((a[0] ?? 0) * Math.PI) / 180;
    let t: M = ID;
    switch (fn!.toLowerCase()) {
      case 'matrix': if (a.length >= 6) t = a.slice(0, 6) as M; break;
      case 'translate': t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; break;
      case 'scale': t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const [cx = 0, cy = 0] = a.slice(1);
        t = mul(mul([1, 0, 0, 1, cx, cy], [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewx': t = [1, 0, Math.tan(rad), 1, 0, 0]; break;
      case 'skewy': t = [1, Math.tan(rad), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
  }
  return m;
}

/** Plain lengths only (px or unitless); anything else (%, em) is unknown. */
const length = (v: string | undefined): number | undefined => {
  const m = /^\s*([-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?)\s*(px)?\s*$/i.exec(v ?? '');
  return m ? Number(m[1]) : undefined;
};

/** Output size and the matrix from the root's user space (viewBox, preserveAspectRatio) to it. */
function rootBox(root: El, opts: SvgImportOptions) {
  const vb = nums(root.attrs.viewbox ?? '');
  const hasVb = vb.length === 4 && vb[2]! > 0 && vb[3]! > 0;
  let w = length(root.attrs.width) ?? (hasVb ? vb[2]! : 300);
  let h = length(root.attrs.height) ?? (hasVb ? vb[3]! : 150);
  if (!length(root.attrs.width) && length(root.attrs.height) && hasVb) w = (h * vb[2]!) / vb[3]!;
  if (length(root.attrs.width) && !length(root.attrs.height) && hasVb) h = (w * vb[3]!) / vb[2]!;
  let k = [1, 1];
  if (opts.width && opts.height) k = [opts.width / w, opts.height / h];
  else if (opts.width) k = [opts.width / w, opts.width / w];
  else if (opts.height) k = [opts.height / h, opts.height / h];
  const width = round(w * k[0]!), height = round(h * k[1]!);
  let matrix: M = [k[0]!, 0, 0, k[1]!, 0, 0];
  if (hasVb) {
    const [vx, vy, vw, vh] = vb as [number, number, number, number];
    const par = (root.attrs.preserveaspectratio ?? 'xMidYMid meet').trim();
    let sx = width / vw, sy = height / vh, tx = 0, ty = 0;
    if (!par.startsWith('none')) {
      const s = par.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy);
      const align = par.split(/\s+/)[0]!;
      tx = align.includes('xMid') ? (width - vw * s) / 2 : align.includes('xMax') ? width - vw * s : 0;
      ty = align.includes('YMid') ? (height - vh * s) / 2 : align.includes('YMax') ? height - vh * s : 0;
      sx = sy = s;
    }
    matrix = [sx, 0, 0, sy, tx - vx * sx, ty - vy * sy];
  }
  return { width, height, matrix };
}

/* --------------------------------- paths --------------------------------- */

type Seg = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Q', number, number, number, number] | ['Z'];

/** Path data → absolute M/L/C/Q/Z (arcs become cubics). */
function parsePath(d: string): Seg[] {
  const out: Seg[] = [];
  let i = 0;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i]!)) i++; };
  const num = (): number | null => {
    ws();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(d.slice(i, i + 40));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = (): number | null => { ws(); const c = d[i]; if (c === '0' || c === '1') { i++; return Number(c); } return null; };
  let cx = 0, cy = 0, sx = 0, sy = 0, cmd = '';
  let lastC: [number, number] | null = null, lastQ: [number, number] | null = null;
  for (;;) {
    ws();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i]!)) cmd = d[i++]!;
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') { out.push(['Z']); cx = sx; cy = sy; lastC = lastQ = null; cmd = ''; continue; }
    const start = i;
    let ok = true;
    const need = (n: number) => { const a: number[] = []; for (let k = 0; k < n; k++) { const v = num(); if (v === null) { ok = false; return a; } a.push(v); } return a; };
    let nextC: [number, number] | null = null, nextQ: [number, number] | null = null;
    switch (C) {
      case 'M': case 'L': case 'T': {
        const [x, y] = need(2);
        if (!ok) break;
        const px = x! + ox, py = y! + oy;
        if (C === 'M') { out.push(['M', px, py]); sx = px; sy = py; cmd = rel ? 'l' : 'L'; }
        else if (C === 'L') out.push(['L', px, py]);
        else { const q: [number, number] = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy]; out.push(['Q', q[0], q[1], px, py]); nextQ = q; }
        cx = px; cy = py;
        break;
      }
      case 'H': { const [x] = need(1); if (ok) { cx = x! + ox; out.push(['L', cx, cy]); } break; }
      case 'V': { const [y] = need(1); if (ok) { cy = y! + oy; out.push(['L', cx, cy]); } break; }
      case 'C': {
        const a = need(6);
        if (!ok) break;
        out.push(['C', a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy, a[4]! + ox, a[5]! + oy]);
        nextC = [a[2]! + ox, a[3]! + oy]; cx = a[4]! + ox; cy = a[5]! + oy;
        break;
      }
      case 'S': {
        const a = need(4);
        if (!ok) break;
        const c1: [number, number] = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy];
        out.push(['C', c1[0], c1[1], a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy]);
        nextC = [a[0]! + ox, a[1]! + oy]; cx = a[2]! + ox; cy = a[3]! + oy;
        break;
      }
      case 'Q': {
        const a = need(4);
        if (!ok) break;
        out.push(['Q', a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy]);
        nextQ = [a[0]! + ox, a[1]! + oy]; cx = a[2]! + ox; cy = a[3]! + oy;
        break;
      }
      case 'A': {
        const [rx, ry, rot] = need(3);
        const large = ok ? flag() : null, sweep = large !== null ? flag() : null;
        const [x, y] = sweep !== null ? need(2) : [];
        if (!ok || large === null || sweep === null) { ok = false; break; }
        const ex = x! + ox, ey = y! + oy;
        out.push(...arcToCubics(cx, cy, rx!, ry!, rot!, large, sweep, ex, ey));
        cx = ex; cy = ey;
        break;
      }
      default: ok = false;
    }
    if (!ok) { i = start; break; } // malformed data: keep what was read, like a browser
    lastC = nextC; lastQ = nextQ;
  }
  return out;
}

/** SVG arc (endpoint form) → cubic Béziers (SVG spec, implementation notes F.6). */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, angle: number, large: number, sweep: number, x2: number, y2: number): Seg[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [['L', x2, y2]];
  const phi = (angle * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dv = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const segs: Seg[] = [];
  for (let s = 0; s < n; s++) {
    const a = t1 + s * step, b = a + step;
    const [ax, ay] = pt(a), [bx, by] = s === n - 1 ? [x2, y2] : pt(b), [dax, day] = dv(a), [dbx, dby] = dv(b);
    segs.push(['C', ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return segs;
}

function transformSegs(segs: Seg[], m: M): Seg[] {
  const p = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  return segs.map((s): Seg => {
    switch (s[0]) {
      case 'M': case 'L': return [s[0], ...p(s[1], s[2])];
      case 'Q': return ['Q', ...p(s[1], s[2]), ...p(s[3], s[4])];
      case 'C': return ['C', ...p(s[1], s[2]), ...p(s[3], s[4]), ...p(s[5], s[6])];
      default: return s;
    }
  });
}

/** Tight bounds (curve extremes, not control points). */
function bounds(segs: Seg[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  let cx = 0, cy = 0;
  for (const s of segs) {
    if (s[0] === 'M' || s[0] === 'L') { add(s[1], s[2]); cx = s[1]; cy = s[2]; }
    else if (s[0] === 'Q') {
      for (const [p0, p1, p2, axis] of [[cx, s[1], s[3], 0], [cy, s[2], s[4], 1]] as const) {
        const den = p0 - 2 * p1 + p2;
        if (den) { const t = (p0 - p1) / den; if (t > 0 && t < 1) { const v = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2; if (axis) add(cx, v); else add(v, cy); } }
      }
      add(s[3], s[4]); cx = s[3]; cy = s[4];
    } else if (s[0] === 'C') {
      for (const [p0, p1, p2, p3, axis] of [[cx, s[1], s[3], s[5], 0], [cy, s[2], s[4], s[6], 1]] as const) {
        const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
        const roots = Math.abs(a) < 1e-12 ? (b ? [-c / b] : []) : ((disc) => (disc < 0 ? [] : [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)]))(b * b - 4 * a * c);
        for (const t of roots) if (t > 0 && t < 1) {
          const v = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
          if (axis) add(cx, v); else add(v, cy);
        }
      }
      add(s[5], s[6]); cx = s[5]; cy = s[6];
    }
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const fmt = (v: number) => String(round(v));
const serialise = (segs: Seg[]) => segs.map((s) => s[0] + s.slice(1).map((v) => fmt(v as number)).join(' ')).join('');

/** Path data for one basic shape in its own user space, or null when it has none / uses unknown units. */
function shapeD(el: El): string | null {
  const n = (a: string) => length(el.attrs[a] ?? '0');
  switch (el.tag) {
    case 'path': return el.attrs.d ?? null;
    case 'line': { const [a, b, c, d] = ['x1', 'y1', 'x2', 'y2'].map(n); return [a, b, c, d].some((v) => v === undefined) ? null : `M${a} ${b}L${c} ${d}`; }
    case 'polyline': case 'polygon': {
      const pts = nums(el.attrs.points ?? '');
      let d = '';
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`;
      return d ? (el.tag === 'polygon' ? `${d}Z` : d) : null;
    }
    case 'circle': case 'ellipse': {
      const cx = n('cx'), cy = n('cy');
      const rx = el.tag === 'circle' ? n('r') : length(el.attrs.rx ?? el.attrs.ry ?? '0'), ry = el.tag === 'circle' ? n('r') : length(el.attrs.ry ?? el.attrs.rx ?? '0');
      if (cx === undefined || cy === undefined || !rx || !ry) return null;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      if (x === undefined || y === undefined || !w || !h) return null;
      const rxa = length(el.attrs.rx), rya = length(el.attrs.ry);
      const rx = Math.min(w / 2, rxa ?? rya ?? 0), ry = Math.min(h / 2, rya ?? rxa ?? 0);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
  }
  return null;
}

/* --------------------------------- paint --------------------------------- */

const NAMED: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', orange: 'ffa500', purple: '800080',
  gray: '808080', grey: '808080', silver: 'c0c0c0', maroon: '800000', navy: '000080', teal: '008080', olive: '808000', lime: '00ff00',
  aqua: '00ffff', cyan: '00ffff', fuchsia: 'ff00ff', magenta: 'ff00ff', pink: 'ffc0cb', brown: 'a52a2a', gold: 'ffd700', indigo: '4b0082',
  violet: 'ee82ee', crimson: 'dc143c', coral: 'ff7f50', salmon: 'fa8072', tomato: 'ff6347', orchid: 'da70d6', khaki: 'f0e68c', beige: 'f5f5dc',
  ivory: 'fffff0', lavender: 'e6e6fa', turquoise: '40e0d0', tan: 'd2b48c', chocolate: 'd2691e', skyblue: '87ceeb', steelblue: '4682b4',
  slategray: '708090', darkgray: 'a9a9a9', darkgrey: 'a9a9a9', lightgray: 'd3d3d3', lightgrey: 'd3d3d3', dimgray: '696969', whitesmoke: 'f5f5f5',
  gainsboro: 'dcdcdc', darkblue: '00008b', darkgreen: '006400', darkred: '8b0000', forestgreen: '228b22', seagreen: '2e8b57', royalblue: '4169e1',
  dodgerblue: '1e90ff', deepskyblue: '00bfff', hotpink: 'ff69b4', deeppink: 'ff1493', firebrick: 'b22222', goldenrod: 'daa520', sienna: 'a0522d',
  midnightblue: '191970', slateblue: '6a5acd', mediumpurple: '9370db', limegreen: '32cd32', yellowgreen: '9acd32', lightblue: 'add8e6',
  lightgreen: '90ee90', lightyellow: 'ffffe0', lightpink: 'ffb6c1', darkorange: 'ff8c00', orangered: 'ff4500', wheat: 'f5deb3', snow: 'fffafa',
};

/** CSS colour → [r, g, b, a] in 0–1, 'none', or undefined when it is not a plain colour (url(), unknown). */
function cssColor(v: string, current: string): [number, number, number, number] | 'none' | undefined {
  const s = v.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return 'none';
  if (s === 'currentcolor') return current.toLowerCase() === 'currentcolor' ? [0, 0, 0, 1] : cssColor(current, '#000');
  let hex = s.startsWith('#') ? s.slice(1) : NAMED[s];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return undefined;
    const b = (i: number) => parseInt(hex!.slice(i, i + 2), 16) / 255;
    return [b(0), b(2), b(4), hex.length === 8 ? b(6) : 1];
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (!fn) return undefined;
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
  const val = (p: string | undefined, max: number) => (p === undefined ? 1 : p.endsWith('%') ? Number.parseFloat(p) / 100 : Number.parseFloat(p) / max);
  const a = parts[3] === undefined ? 1 : val(parts[3], 1);
  if (fn[1]!.startsWith('rgb')) return [val(parts[0], 255), val(parts[1], 255), val(parts[2], 255), a];
  const h = (((Number.parseFloat(parts[0] ?? '0') % 360) + 360) % 360) / 360, sat = val(parts[1], 100), l = val(parts[2], 100);
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
  const hue = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3), a];
}

const toColor = ([r, g, b, a]: [number, number, number, number], alpha: number): Color => rgbToOklch(r, g, b, Math.max(0, Math.min(1, a * alpha)));

/* ------------------------------- converter ------------------------------- */

/** Inherited presentation properties (SVG defaults). */
type Style = Record<string, string>;
const INHERITED: Style = {
  fill: 'black', stroke: 'none', 'stroke-width': '1', 'fill-opacity': '1', 'stroke-opacity': '1', 'fill-rule': 'nonzero',
  'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-dasharray': 'none', color: 'black', visibility: 'visible',
};
const PROPS = new Set([...Object.keys(INHERITED), 'opacity', 'display', 'filter', 'mask', 'clip-path', 'transform']);
const SKIP = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'script', 'symbol', 'clippath', 'mask', 'marker', 'pattern', 'lineargradient', 'radialgradient', 'filter']);
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const UNSUPPORTED: Record<string, string> = { text: 'text', image: 'embedded images', foreignobject: 'HTML content', use: '<use> references', switch: '<switch>' };

type Rule = { sel: string; decls: Style; spec: number };

class Converter {
  unsupported: string | undefined;
  private rules: Rule[] = [];
  private out: NodeInput[] = [];
  private count: Record<string, number> = {};

  constructor(private root: El) {
    const css = collect(root, 'style').map((s) => s.text).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, sels, body] of css.matchAll(/([^{}@]+)\{([^}]*)\}/g)) {
      const decls = declarations(body!);
      for (const sel of sels!.split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!/^(\*|[\w-]+)?(#[\w-]+)?(\.[\w-]+)*$/.test(sel)) { this.unsupported ??= `CSS selector "${sel}"`; continue; }
        this.rules.push({ sel, decls, spec: (sel.match(/#/g)?.length ?? 0) * 100 + (sel.match(/\./g)?.length ?? 0) * 10 + (/^[\w-]/.test(sel) ? 1 : 0) });
      }
    }
    this.rules.sort((a, b) => a.spec - b.spec);
  }

  run(base: M): NodeInput[] {
    this.walk(this.root, base, INHERITED, 1);
    return this.out;
  }

  private styleOf(el: El): Style {
    const s: Style = {};
    for (const [k, v] of Object.entries(el.attrs)) if (PROPS.has(k)) s[k] = v;
    const classes = (el.attrs.class ?? '').split(/\s+/).filter(Boolean);
    for (const r of this.rules) if (matches(r.sel, el, classes)) Object.assign(s, r.decls);
    Object.assign(s, declarations(el.attrs.style ?? ''));
    for (const [k, v] of Object.entries(s)) if (v.trim() === 'inherit') delete s[k];
    return s;
  }

  private walk(el: El, parentM: M, inherited: Style, opacity: number) {
    const own = this.styleOf(el);
    if (own.display?.trim() === 'none') return;
    const style = { ...inherited };
    for (const k of Object.keys(INHERITED)) if (own[k] !== undefined) style[k] = own[k]!;
    const alpha = opacity * unit(own.opacity);
    const m = el === this.root ? parentM : mul(parentM, parseTransform(own.transform ?? el.attrs.transform));
    for (const k of ['filter', 'mask', 'clip-path'] as const) if (own[k] && own[k]!.trim() !== 'none') { this.unsupported ??= `${k} effects`; return; }
    if (el !== this.root && el.tag === 'svg') { this.unsupported ??= 'nested <svg>'; return; }
    if (UNSUPPORTED[el.tag]) { this.unsupported ??= UNSUPPORTED[el.tag]; return; }
    if (SHAPES.has(el.tag)) { if (style.visibility !== 'hidden') this.shape(el, m, style, alpha); return; }
    if (SKIP.has(el.tag)) return;
    for (const c of el.children) this.walk(c, m, style, alpha);
  }

  private shape(el: El, m: M, style: Style, alpha: number) {
    const d = shapeD(el);
    if (!d) return;
    const segs = transformSegs(parsePath(d), m);
    if (!segs.some((s) => s[0] !== 'M')) return;
    const fill = cssColor(style.fill!, style.color!), stroke = cssColor(style.stroke!, style.color!);
    if (fill === undefined || stroke === undefined) { this.unsupported ??= /url\(/i.test(`${style.fill}${style.stroke}`) ? 'gradients or patterns' : `colour "${fill === undefined ? style.fill : style.stroke}"`; return; }
    if (stroke !== 'none' && style['stroke-dasharray']!.trim() !== 'none') { this.unsupported ??= 'dashed strokes'; return; }
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const sw = (length(style['stroke-width']) ?? 1) * scale;
    const b = bounds(segs);
    // A straight line has no extent across it: give that axis the stroke's thickness (centred), so the
    // layer has a real box; viewBox and size grow together, so the drawing does not move or stretch.
    const thin = Math.max(stroke === 'none' ? 0 : sw, 1);
    if (b.width < thin) { b.x -= (thin - b.width) / 2; b.width = thin; }
    if (b.height < thin) { b.y -= (thin - b.height) / 2; b.height = thin; }
    const w = b.width, h = b.height;
    const tag = el.tag;
    this.count[tag] = (this.count[tag] ?? 0) + 1;
    const op = (k: string) => unit(style[k]);
    this.out.push({
      type: 'path', name: el.attrs.id || el.attrs['data-name'] || `${tag} ${this.count[tag]}`,
      d: serialise(segs), viewBox: { x: round(b.x), y: round(b.y), width: round(w), height: round(h) },
      x: round(b.x), y: round(b.y), width: round(w), height: round(h),
      fills: fill === 'none' || tag === 'line' ? [] : [{ type: 'solid', color: toColor(fill, alpha * op('fill-opacity')) }],
      strokes: stroke === 'none' || sw <= 0 ? [] : [{ color: toColor(stroke, alpha * op('stroke-opacity')), width: round(sw), align: 'center' }],
      fillRule: style['fill-rule']!.trim() === 'evenodd' ? 'evenodd' : 'nonzero',
      lineCap: pick(style['stroke-linecap']!, ['butt', 'round', 'square'], 'butt'),
      lineJoin: pick(style['stroke-linejoin']!, ['miter', 'round', 'bevel'], 'miter'),
    } as unknown as NodeInput);
  }
}

/** An opacity value (number or percentage) clamped to 0–1; missing or invalid = 1. */
const unit = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, v!.trim().endsWith('%') ? n / 100 : n));
};

const pick = <T extends string>(v: string, allowed: T[], fallback: T): T => (allowed.includes(v.trim() as T) ? (v.trim() as T) : fallback);

function declarations(body: string): Style {
  const out: Style = {};
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const k = part.slice(0, at).trim().toLowerCase(), v = part.slice(at + 1).replace(/!important/i, '').trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function matches(sel: string, el: El, classes: string[]): boolean {
  const m = /^(\*|[\w-]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)$/.exec(sel);
  if (!m) return false;
  if (m[1] && m[1] !== '*' && m[1].toLowerCase() !== el.tag) return false;
  if (m[2] && el.attrs.id !== m[2]) return false;
  return (m[3] ?? '').split('.').filter(Boolean).every((c) => classes.includes(c));
}

function collect(el: El, tag: string, out: El[] = []): El[] {
  if (el.tag === tag) out.push(el);
  for (const c of el.children) collect(c, tag, out);
  return out;
}
