import { insertOpsFor } from '@archa/core';
import { hexToColor, type NodeInput } from '@archa/schema';
import { commit, select, setTool, toast, useStore } from './store';
import { containerAt, originOf, toWorld } from './geometry';

/*
 * Image / SVG import and SVG → vector conversion (blueprint FILE_FORMATS/04, v1 subset).
 * Runs in the renderer because it needs the DOM (image decode, SVG geometry); the result is ordinary insert ops.
 */

const MAX_IMAGE_SIDE = 2048;

/** Opens a file picker and places the image or SVG at the centre of the view. */
export function importImageOrSvg(): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        try {
          await importFile(file);
        } catch (e) {
          toast(`Import failed: ${(e as Error).message}`, 'error');
        }
      }
      resolve();
    };
    input.click();
  });
}

export async function importFile(file: File, at?: { x: number; y: number }) {
  const name = file.name.replace(/\.[^.]+$/, '') || 'Image';
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const text = await file.text();
    const vector = svgToNodes(text, name);
    if (vector) return place(vector, at, `Import ${name}`);
    return place(await imageInput(`data:image/svg+xml;base64,${b64(text)}`, name), at, `Import ${name}`);
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`);
  return place(await imageInput(await readDataUrl(file), name), at, `Import ${name}`);
}

/** Inserts at `at` (page coordinates) or the centre of the view, inside whatever frame is there. */
export async function place(input: NodeInput, at: { x: number; y: number } | undefined, label: string) {
  const st = useStore.getState();
  const doc = st.doc;
  if (!doc) return;
  const host = document.querySelector('[data-canvas-host]');
  const c = at ?? toWorld(st.camera, (host?.clientWidth ?? 800) / 2, (host?.clientHeight ?? 600) / 2);
  const w = Number(input.width ?? 100), h = Number(input.height ?? 100);
  const parent = containerAt(doc, c.x, c.y);
  const o = originOf(doc, parent.id);
  // Icons are drawn in dark ink for light frames; straight on the dark page they get light ink to stay visible.
  if (input.type === 'path' && parent.type === 'page' && Array.isArray(input.strokes)) input = { ...input, strokes: (input.strokes as Array<Record<string, unknown>>).map((st) => ({ ...st, color: '#d4d4d8' })) };
  const { ops, rootId } = insertOpsFor({ ...input, x: Math.round(c.x - w / 2 - o.x), y: Math.round(c.y - h / 2 - o.y) }, parent.id);
  if (await commit(label, ops)) {
    select([rootId]);
    setTool('select');
  }
}

async function imageInput(src: string, name: string): Promise<NodeInput> {
  const img = new Image();
  img.src = src;
  await img.decode();
  let w = img.naturalWidth || 300, h = img.naturalHeight || 200;
  let data = src;
  // Big bitmaps are downscaled once on import: the document carries the pixels (no asset store yet).
  if (!src.startsWith('data:image/svg') && Math.max(w, h) > MAX_IMAGE_SIDE) {
    const s = MAX_IMAGE_SIDE / Math.max(w, h);
    w = Math.round(w * s); h = Math.round(h * s);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    data = canvas.toDataURL(src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', 0.9);
  }
  // Large images land at a comfortable size; the pixels stay full resolution.
  const fit = Math.min(1, 800 / Math.max(w, h));
  return { type: 'image', name, src: data, fit: 'crop', width: Math.round(w * fit), height: Math.round(h * fit) };
}

const readDataUrl = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error ?? new Error('read failed'));
  r.readAsDataURL(file);
});

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

/* ------------------------------- SVG → vectors ------------------------------ */

const SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon';

/** SVG path data for one basic shape, in its own user space. */
export function shapeToD(el: Element): string {
  const n = (a: string) => Number(el.getAttribute(a) ?? 0) || 0;
  switch (el.tagName.toLowerCase()) {
    case 'path': return el.getAttribute('d') ?? '';
    case 'line': return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      let d = '';
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`;
      return el.tagName.toLowerCase() === 'polygon' ? `${d}Z` : d;
    }
    case 'circle':
    case 'ellipse': {
      const cx = n('cx'), cy = n('cy');
      const rx = el.tagName.toLowerCase() === 'circle' ? n('r') : n('rx'), ry = el.tagName.toLowerCase() === 'circle' ? n('r') : n('ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      const rx = Math.min(w / 2, n('rx') || n('ry')), ry = Math.min(h / 2, n('ry') || n('rx'));
      if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
  }
  return '';
}

/**
 * Converts an SVG into a frame of vector nodes, one per shape, with their fills and strokes.
 * Returns null when the SVG uses something this converter cannot keep (rotation/skew, text, gradients,
 * images) — the caller then imports it as an image instead.
 */
export function svgToNodes(svgText: string, name: string): NodeInput | null {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.tagName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) return null;
  if (root.querySelector('text, image, foreignObject, linearGradient, radialGradient, pattern, filter, mask, use')) return null;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const vb = svg.viewBox.baseVal;
    const width = Number.parseFloat(svg.getAttribute('width') ?? '') || vb?.width || 100;
    const height = Number.parseFloat(svg.getAttribute('height') ?? '') || vb?.height || 100;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    const base = svg.getScreenCTM();
    if (!base) return null;
    const inv = base.inverse();
    const children: NodeInput[] = [];
    for (const el of svg.querySelectorAll<SVGGraphicsElement>(SHAPES)) {
      if (el.closest('defs, clipPath, symbol, marker')) continue;
      const d = shapeToD(el);
      if (!d) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      const t = inv.multiply(m);
      if (Math.abs(t.b) > 1e-6 || Math.abs(t.c) > 1e-6) return null;
      const bb = el.getBBox();
      const style = getComputedStyle(el);
      const fill = cssColor(style.fill), stroke = cssColor(style.stroke);
      const strokeWidth = (Number.parseFloat(style.strokeWidth) || 1) * Math.abs(t.a);
      children.push({
        type: 'path', name: el.getAttribute('id') ?? el.tagName.toLowerCase(), d,
        viewBox: { x: bb.x, y: bb.y, width: bb.width, height: bb.height },
        x: round(t.a * bb.x + t.e), y: round(t.d * bb.y + t.f), width: round(Math.max(0.01, bb.width * Math.abs(t.a))), height: round(Math.max(0.01, bb.height * Math.abs(t.d))),
        fills: fill ? [{ color: withAlpha(fill, Number(style.fillOpacity) * Number(style.opacity)) }] : [],
        strokes: stroke && strokeWidth > 0 ? [{ color: withAlpha(stroke, Number(style.strokeOpacity) * Number(style.opacity)), width: round(strokeWidth), align: 'center' }] : [],
        fillRule: style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
        lineCap: (['butt', 'round', 'square'].includes(style.strokeLinecap) ? style.strokeLinecap : 'butt') as never,
        lineJoin: (['miter', 'round', 'bevel'].includes(style.strokeLinejoin) ? style.strokeLinejoin : 'miter') as never,
      } as NodeInput);
    }
    if (!children.length) return null;
    return { type: 'frame', name, width: round(width), height: round(height), fills: [], clip: false, children };
  } finally {
    host.remove();
  }
}

/** One vector node from a rendered 24×24 stroke icon (lucide), keeping its stroke look. */
export function iconToNode(svg: SVGSVGElement, name: string, size = 24, color = '#18181b'): NodeInput {
  const d = [...svg.querySelectorAll(SHAPES)].map(shapeToD).filter(Boolean).join(' ');
  return {
    type: 'path', name, d, viewBox: { x: 0, y: 0, width: 24, height: 24 }, width: size, height: size,
    fills: [], strokes: [{ color, width: 2 * (size / 24), align: 'center' }], lineCap: 'round', lineJoin: 'round',
  } as NodeInput;
}

const round = (v: number) => Math.round(v * 100) / 100;

function cssColor(v: string): string | null {
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (!m) return null;
  const [r, g, b, a] = m[1]!.split(/[\s,/]+/).map(Number);
  if (a === 0) return null;
  const h = (x: number | undefined) => Math.round(x ?? 0).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function withAlpha(hex: string, a: number) {
  return { ...hexToColor(hex), a: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
}
