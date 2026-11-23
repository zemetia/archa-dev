import { hexToColor, newId, rgbToOklch, type Color, type Node, type NodeInput, type InsertOp } from '@archa/schema';

/**
 * Turns friendly input into insert ops: assigns ids, converts hex colours,
 * and flattens inline `children` into ordered inserts (parent first).
 */
export function insertOpsFor(input: NodeInput, parentId: string, index?: number): { ops: InsertOp[]; rootId: string; created: Array<{ id: string; name: string }> } {
  const ops: InsertOp[] = [];
  const created: Array<{ id: string; name: string }> = [];
  const visit = (inp: NodeInput, parent: string, at?: number): string => {
    const { children, ...rest } = inp;
    const id = newId();
    const node = normaliseInput({ ...rest, id }) as Node;
    ops.push({ op: 'insert', node, parentId: parent, ...(at === undefined ? {} : { index: at }) });
    created.push({ id, name: String(node.name) });
    children?.forEach((c) => visit(c, id));
    return id;
  };
  const rootId = visit(input, parentId, index);
  return { ops, rootId, created };
}

const DEFAULT_NAMES: Record<string, string> = { frame: 'Frame', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', group: 'Group', polygon: 'Polygon', path: 'Vector', image: 'Image', sticky: 'Sticky note', embed: 'Web page' };

/** Colour fields accept `"#ff0000"` strings; paints accept a bare colour string. */
export function normaliseInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  if (!out.name && typeof out.type === 'string') out.name = (out.type === 'text' && typeof out.text === 'string' && out.text.slice(0, 24)) || DEFAULT_NAMES[out.type] || out.type;
  for (const key of ['fills', 'strokes', 'effects'] as const) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map((p) => normalisePaint(p, key));
  }
  if (typeof out.fill === 'string') { out.fills = [normalisePaint(out.fill, 'fills')]; delete out.fill; }
  if (typeof out.padding === 'number') { const p = out.padding; out.padding = { top: p, right: p, bottom: p, left: p }; }
  if (Array.isArray(out.padding) && out.padding.every((v) => typeof v === 'number')) {
    const [t = 0, r = t, b = t, l = r] = out.padding as number[];
    out.padding = { top: t, right: r, bottom: b, left: l };
  }
  if (typeof out.sizing === 'string') out.sizing = { horizontal: out.sizing, vertical: out.sizing };
  if (out.sizing && typeof out.sizing === 'object') {
    const s = out.sizing as Record<string, unknown>;
    // A missing axis stays fixed (updates merge with the node's own sizing first, in execute).
    out.sizing = { horizontal: alias(SIZING, s.horizontal ?? 'fixed'), vertical: alias(SIZING, s.vertical ?? 'fixed') };
  }
  if (out.padding && typeof out.padding === 'object' && !Array.isArray(out.padding)) {
    const p = out.padding as Record<string, number | undefined>;
    out.padding = { top: p.top ?? p.y ?? 0, right: p.right ?? p.x ?? 0, bottom: p.bottom ?? p.y ?? 0, left: p.left ?? p.x ?? 0 };
  }
  if (out.align !== undefined) out.align = alias(ALIGN, out.align);
  if (out.justify !== undefined) out.justify = alias(JUSTIFY, out.justify);
  if (out.layout !== undefined) out.layout = alias(LAYOUT, out.layout);
  if (out.textAlign !== undefined) out.textAlign = alias(TEXT_ALIGN, out.textAlign);
  if (out.textSizing !== undefined) out.textSizing = alias(TEXT_SIZING, out.textSizing);
  if (typeof out.fontWeight === 'string') out.fontWeight = WEIGHT[out.fontWeight.toLowerCase()] ?? (Number(out.fontWeight) || out.fontWeight);
  // Text content under the names other tools use.
  if ((out.type === 'text' || out.type === 'sticky') && out.text === undefined) {
    for (const k of ['content', 'characters', 'value', 'label']) if (typeof out[k] === 'string') { out.text = out[k]; delete out[k]; break; }
  }
  // Rich text as runs: ["Ink part ", { text: "muted part", fill: "#8c9196" }] → text + spans.
  if (out.type === 'text' && Array.isArray(out.runs)) {
    let text = '';
    const spans: Array<Record<string, unknown>> = [];
    for (const r of out.runs as unknown[]) {
      const run = typeof r === 'string' ? { text: r } : (r as Record<string, unknown>);
      const t = String(run.text ?? '');
      const { text: _t, fill, ...style } = run;
      if (fill !== undefined) style.fills = [fill];
      if (Object.keys(style).length) spans.push({ start: text.length, end: text.length + t.length, ...style });
      text += t;
    }
    out.text = text;
    if (spans.length) out.spans = spans;
    delete out.runs;
  }
  if (Array.isArray(out.spans)) {
    out.spans = (out.spans as Array<Record<string, unknown>>).map((sp) => {
      const o = { ...sp };
      if (o.fill !== undefined && o.fills === undefined) { o.fills = [o.fill]; delete o.fill; }
      if (Array.isArray(o.fills)) o.fills = o.fills.map((p) => normalisePaint(p, 'fills'));
      if (typeof o.fontWeight === 'string') o.fontWeight = WEIGHT[o.fontWeight.toLowerCase()] ?? Number(o.fontWeight);
      return o;
    });
  }
  return out;
}

/* Spellings agents carry over from CSS, Figma or other tools → the schema's words. */
const SIZING: Record<string, string> = { 'auto-height': 'hug', 'auto-width': 'hug', auto: 'hug', content: 'hug', fit: 'hug', 'fit-content': 'hug', 'hug-contents': 'hug', wrap: 'hug', stretch: 'fill', full: 'fill', 'fill-container': 'fill', '100%': 'fill', expand: 'fill', fixed: 'fixed' };
const ALIGN: Record<string, string> = { 'flex-start': 'start', left: 'start', top: 'start', middle: 'center', 'flex-end': 'end', right: 'end', bottom: 'end', stretch: 'start', baseline: 'center' };
const JUSTIFY: Record<string, string> = { 'flex-start': 'start', left: 'start', top: 'start', middle: 'center', 'flex-end': 'end', right: 'end', bottom: 'end', between: 'space-between', 'space-around': 'space-between', 'space-evenly': 'space-between' };
const LAYOUT: Record<string, string> = { horizontal: 'row', vertical: 'column', col: 'column', flex: 'row', stack: 'column', vstack: 'column', hstack: 'row', absolute: 'none' };
const TEXT_ALIGN: Record<string, string> = { start: 'left', end: 'right', middle: 'center' };
const TEXT_SIZING: Record<string, string> = { auto: 'auto-width', hug: 'auto-width', 'width-auto': 'auto-width', autowidth: 'auto-width', wrap: 'auto-height', fill: 'auto-height', 'height-auto': 'auto-height', autoheight: 'auto-height', 'fixed-width': 'auto-height', none: 'fixed' };
const WEIGHT: Record<string, number> = { thin: 100, extralight: 200, light: 300, normal: 400, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const alias = (map: Record<string, string>, v: unknown) => (typeof v === 'string' ? map[v.toLowerCase()] ?? v : v);

function normalisePaint(p: unknown, key: 'fills' | 'strokes' | 'effects'): unknown {
  if (key === 'fills' && typeof p === 'string' && /^(linear|radial)-gradient\(/i.test(p.trim())) return parseCssGradient(p.trim());
  if (key === 'fills' && p && typeof p === 'object' && ((p as { type?: string }).type === 'linear' || (p as { type?: string }).type === 'radial' || Array.isArray((p as { gradient?: unknown }).gradient))) {
    return gradientInput(p as Record<string, unknown>);
  }
  if (typeof p === 'string') {
    const color = parseColor(p);
    return key === 'strokes' ? { color, width: 1, align: 'inside', visible: true } : { type: 'solid', color, visible: true };
  }
  if (p && typeof p === 'object') {
    const o = { ...(p as Record<string, unknown>) };
    if (typeof o.color === 'string') o.color = parseColor(o.color);
    if (key === 'fills' && !o.type) o.type = 'solid';
    if (key === 'effects' && !o.type) o.type = 'drop-shadow';
    return o;
  }
  return p;
}

/** Hex, rgb()/rgba(), or a few CSS names. */
export function parseColor(c: string): Color {
  const v = c.trim().toLowerCase();
  if (v === 'transparent') return { l: 0, c: 0, h: 0, a: 0 };
  if (v === 'white') return hexToColor('#ffffff');
  if (v === 'black') return hexToColor('#000000');
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return rgbToOklch(Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255, a);
  }
  return hexToColor(c);
}

const SIDE_ANGLE: Record<string, number> = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to right top': 45, 'to bottom right': 135, 'to right bottom': 135, 'to bottom left': 225, 'to left bottom': 225, 'to top left': 315, 'to left top': 315 };

/** Stops as ["#a", "#b"], [["#a", 0], ["#b", 1]] or [{ offset, color }] → evenly spread where no offset is given. */
function stopsInput(raw: unknown[]): Array<{ offset: number; color: Color }> {
  const parts = raw.map((s) => {
    if (typeof s === 'string') return { color: parseColor(s), offset: undefined as number | undefined };
    if (Array.isArray(s)) return { color: parseColor(String(s[0])), offset: s[1] === undefined ? undefined : Number(s[1]) };
    const o = s as { color: unknown; offset?: number; position?: number };
    return { color: typeof o.color === 'string' ? parseColor(o.color) : (o.color as Color), offset: o.offset ?? o.position };
  });
  return parts.map((p, i) => ({ color: p.color, offset: p.offset ?? (parts.length === 1 ? 0 : i / (parts.length - 1)) }));
}

function gradientInput(o: Record<string, unknown>): Record<string, unknown> {
  const type = o.type === 'radial' ? 'radial' : 'linear';
  const stops = stopsInput((o.stops ?? o.gradient ?? o.colors) as unknown[]);
  const base = { type, stops, visible: o.visible ?? true };
  return type === 'linear' ? { ...base, angle: Number(o.angle ?? 180) } : { ...base, cx: o.cx ?? 0.5, cy: o.cy ?? 0.5, radius: o.radius ?? 0.5 };
}

/** `linear-gradient(180deg, #000 0%, rgba(0,0,0,0) 100%)` / `radial-gradient(circle at 50% 30%, …)`. */
function parseCssGradient(css: string): Record<string, unknown> {
  const radial = /^radial/i.test(css);
  const body = css.slice(css.indexOf('(') + 1, css.lastIndexOf(')'));
  const args: string[] = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  let angle = 180, cx = 0.5, cy = 0.5;
  const first = args[0]!.toLowerCase();
  if (!radial && (/deg$/.test(first) || first.startsWith('to '))) { angle = first.startsWith('to ') ? SIDE_ANGLE[first] ?? 180 : Number(first.replace('deg', '')); args.shift(); }
  if (radial && !/^(#|rgb|transparent|white|black)/.test(first)) {
    const at = /at\s+([\d.]+)%\s+([\d.]+)%/.exec(first);
    if (at) { cx = Number(at[1]) / 100; cy = Number(at[2]) / 100; }
    args.shift();
  }
  const stops = args.map((a) => {
    const m = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(a)!;
    return m[2] === undefined ? m[1]!.trim() : [m[1]!.trim(), Number(m[2]) / 100];
  });
  return gradientInput({ type: radial ? 'radial' : 'linear', angle, cx, cy, stops });
}
