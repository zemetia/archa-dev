import { hexToColor, newId, type Node, type NodeInput, type InsertOp } from '@archa/schema';

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

const DEFAULT_NAMES: Record<string, string> = { frame: 'Frame', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', group: 'Group', polygon: 'Polygon', path: 'Vector', image: 'Image', sticky: 'Sticky note', embed: 'Web page', connector: 'Connector' };

/** Colour fields accept `"#ff0000"` strings; paints accept a bare colour string. */
export function normaliseInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  // CSS / Figma property names → the schema's (only when the schema's own key is absent).
  for (const [from, to] of KEY_ALIASES) {
    if (out[from] !== undefined && out[to] === undefined) out[to] = out[from];
    if (from in out) delete out[from];
  }
  if (!out.name && typeof out.type === 'string') out.name = (out.type === 'text' && typeof out.text === 'string' && out.text.slice(0, 24)) || DEFAULT_NAMES[out.type] || out.type;
  for (const key of ['fills', 'strokes', 'effects'] as const) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map((p) => normalisePaint(p, key));
  }
  if (typeof out.fill === 'string' || (out.fill && typeof out.fill === 'object')) { out.fills = [normalisePaint(out.fill, 'fills')]; delete out.fill; }
  // Rich-text spans take the same colour shorthands as the node: color / fill / fills.
  if (Array.isArray(out.spans)) {
    out.spans = (out.spans as unknown[]).map((sp) => {
      if (!sp || typeof sp !== 'object') return sp;
      const o = { ...(sp as Record<string, unknown>) };
      const short = o.fills ?? o.fill ?? o.color;
      delete o.fill; delete o.color;
      if (short !== undefined) o.fills = (Array.isArray(short) ? short : [short]).map((p) => normalisePaint(p, 'fills'));
      if (typeof o.fontWeight === 'string') o.fontWeight = WEIGHT[o.fontWeight.toLowerCase()] ?? (Number(o.fontWeight) || o.fontWeight);
      if (o.italic === true) { o.fontStyle = 'italic'; delete o.italic; }
      if (o.bold === true) { o.fontWeight = 700; delete o.bold; }
      return o;
    });
  }
  // A note for agents on this layer (design panel → Context) lives in meta.
  if (typeof out.context === 'string') { out.meta = { ...(out.meta as object | undefined), context: out.context }; delete out.context; }
  if (typeof out.stroke === 'string') { out.strokes = [normalisePaint(out.stroke, 'strokes')]; delete out.stroke; }
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
  normaliseGrid(out);
  normaliseBlur(out);
  if (out.align !== undefined) out.align = alias(ALIGN, out.align);
  if (out.justify !== undefined) out.justify = alias(JUSTIFY, out.justify);
  if (out.layout !== undefined) out.layout = alias(LAYOUT, out.layout);
  if (out.textAlign !== undefined) out.textAlign = alias(TEXT_ALIGN, out.textAlign);
  if (out.textSizing !== undefined) out.textSizing = alias(TEXT_SIZING, out.textSizing);
  if (typeof out.fontWeight === 'string') out.fontWeight = WEIGHT[out.fontWeight.toLowerCase()] ?? (Number(out.fontWeight) || out.fontWeight);
  // Connector ends: `from`/`to` and a bare node id are accepted.
  if (out.type === 'connector') {
    if (out.start === undefined && out.from !== undefined) { out.start = out.from; delete out.from; }
    if (out.end === undefined && out.to !== undefined) { out.end = out.to; delete out.to; }
  }
  for (const k of ['start', 'end'] as const) if (typeof out[k] === 'string') out[k] = { nodeId: out[k] };
  // Text content under the names other tools use.
  if ((out.type === 'text' || out.type === 'sticky') && out.text === undefined) {
    for (const k of ['content', 'characters', 'value', 'label']) if (typeof out[k] === 'string') { out.text = out[k]; delete out[k]; break; }
  }
  return out;
}

/** A count from `5`, `"5"`, `"repeat(5, 1fr)"` or `"1fr 1fr 1fr"`. */
function trackCount(v: unknown): number | undefined {
  if (typeof v === 'number' && v >= 0) return Math.round(v);
  if (typeof v !== 'string') return undefined;
  const rep = /repeat\(\s*(\d+)/i.exec(v);
  if (rep) return Number(rep[1]);
  if (/^\d+$/.test(v.trim())) return Number(v.trim());
  const parts = v.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.length : undefined;
}

/**
 * Grid spellings → `wrap` (items per line) + `lineGap`: `columns: 5` / `gridTemplateColumns: "repeat(5, 1fr)"`
 * make a row grid of 5 columns; `rows: 3` / `gridTemplateRows` a column grid; `layout: "grid"` is a row
 * grid; `rowGap` / `columnGap` land on gap or lineGap by direction.
 */
function normaliseGrid(out: Record<string, unknown>) {
  for (const k of ['maxPerRow', 'itemsPerRow', 'perRow', 'perLine', 'maxItems', 'itemsPerLine']) {
    if (out[k] !== undefined) { if (out.wrap === undefined) out.wrap = out[k]; delete out[k]; }
  }
  const columns = trackCount(out.columns ?? out.gridTemplateColumns ?? out.gridColumns ?? out.cols);
  const rows = trackCount(out.rows ?? out.gridTemplateRows ?? out.gridRows);
  for (const k of ['columns', 'gridTemplateColumns', 'gridColumns', 'cols', 'rows', 'gridTemplateRows', 'gridRows']) delete out[k];
  if (typeof out.layout === 'string' && out.layout.toLowerCase() === 'grid') out.layout = rows && !columns ? 'column' : 'row';
  const flat = !out.layout || out.layout === 'none';
  if (columns) { out.wrap ??= columns; if (flat) out.layout = 'row'; }
  else if (rows) { out.wrap ??= rows; if (flat) out.layout = 'column'; }
  if (typeof out.wrap === 'boolean') out.wrap = out.wrap ? 2 : 0;
  if (typeof out.wrap === 'string') out.wrap = trackCount(out.wrap) ?? out.wrap;
  const column = out.layout === 'column' || out.layout === 'vertical';
  const rowGap = out.rowGap, columnGap = out.columnGap;
  delete out.rowGap; delete out.columnGap;
  // Row grid: rows stack vertically, so rowGap is the space between lines; column grid the other way round.
  if (rowGap !== undefined) { if (column) out.gap ??= rowGap; else out.lineGap ??= rowGap; }
  if (columnGap !== undefined) { if (column) out.lineGap ??= columnGap; else out.gap ??= columnGap; }
}

/** `px` number from `16`, `"16px"` or `"blur(16px)"`. */
const blurPx = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(/(-?\d+(\.\d+)?)/.exec(v)?.[1] ?? NaN) : NaN);

/**
 * Blur shorthands → effects: `backdropBlur: 16` / `backgroundBlur` / CSS `backdropFilter: "blur(16px)"`
 * (frosted glass) and `blur: 8` / `layerBlur` / `filter: "blur(8px)"` (blurs the layer itself).
 */
function normaliseBlur(out: Record<string, unknown>) {
  const add: Array<Record<string, unknown>> = [];
  for (const [keys, type] of [[['backdropBlur', 'backgroundBlur', 'backdropFilter', 'glass'], 'background-blur'], [['layerBlur', 'blur', 'filter'], 'layer-blur']] as const) {
    for (const k of keys) {
      if (out[k] === undefined) continue;
      const v = k === 'glass' && out[k] === true ? 16 : blurPx(out[k]);
      delete out[k];
      if (Number.isFinite(v) && v > 0) add.push({ type, radius: v, visible: true });
    }
  }
  if (!add.length) return;
  const kinds = new Set(add.map((e) => e.type));
  const kept = Array.isArray(out.effects) ? (out.effects as Array<Record<string, unknown>>).filter((e) => !kinds.has(e?.type as string)) : [];
  out.effects = [...kept, ...add];
}

/* Spellings agents carry over from CSS, Figma or other tools → the schema's words. */
const SIZING: Record<string, string> = { 'auto-height': 'hug', 'auto-width': 'hug', auto: 'hug', content: 'hug', fit: 'hug', 'fit-content': 'hug', 'hug-contents': 'hug', wrap: 'hug', stretch: 'fill', full: 'fill', 'fill-container': 'fill', '100%': 'fill', expand: 'fill', fixed: 'fixed' };
const ALIGN: Record<string, string> = { 'flex-start': 'start', left: 'start', top: 'start', middle: 'center', 'flex-end': 'end', right: 'end', bottom: 'end', stretch: 'start', baseline: 'center' };
const JUSTIFY: Record<string, string> = { 'flex-start': 'start', left: 'start', top: 'start', middle: 'center', 'flex-end': 'end', right: 'end', bottom: 'end', between: 'space-between', around: 'space-around', 'space-evenly': 'space-around', evenly: 'space-around' };
const KEY_ALIASES: Array<[string, string]> = [
  ['alignItems', 'align'], ['counterAxisAlignItems', 'align'], ['justifyContent', 'justify'], ['primaryAxisAlignItems', 'justify'],
  ['flexDirection', 'layout'], ['direction', 'layout'], ['layoutMode', 'layout'], ['itemSpacing', 'gap'], ['spacing', 'gap'],
  ['radius', 'cornerRadius'], ['borderRadius', 'cornerRadius'], ['clipContent', 'clip'], ['clipsContent', 'clip'],
  ['shadows', 'effects'], ['rotate', 'rotation'], ['angle', 'rotation'],
];
const EFFECT_TYPES: Record<string, string> = {
  shadow: 'drop-shadow', 'box-shadow': 'drop-shadow', drop: 'drop-shadow', dropshadow: 'drop-shadow', 'drop_shadow': 'drop-shadow',
  inner: 'inner-shadow', inset: 'inner-shadow', 'inset-shadow': 'inner-shadow', innershadow: 'inner-shadow', 'inner_shadow': 'inner-shadow',
  blur: 'layer-blur', 'layer_blur': 'layer-blur', layerblur: 'layer-blur', filter: 'layer-blur',
  backdrop: 'background-blur', 'backdrop-blur': 'background-blur', 'backdrop-filter': 'background-blur', 'background_blur': 'background-blur', backgroundblur: 'background-blur', glass: 'background-blur',
};
const PAINT_TYPES: Record<string, string> = { linear: 'linear-gradient', gradient: 'linear-gradient', 'linear_gradient': 'linear-gradient', lineargradient: 'linear-gradient', radial: 'radial-gradient', 'radial_gradient': 'radial-gradient', radialgradient: 'radial-gradient', img: 'image', picture: 'image', photo: 'image', color: 'solid' };
const LAYOUT: Record<string, string> = { 'flex-wrap': 'row', wrap: 'row', horizontal: 'row', vertical: 'column', col: 'column', flex: 'row', stack: 'column', vstack: 'column', hstack: 'row', absolute: 'none' };
const TEXT_ALIGN: Record<string, string> = { start: 'left', end: 'right', middle: 'center' };
const TEXT_SIZING: Record<string, string> = { auto: 'auto-width', hug: 'auto-width', 'width-auto': 'auto-width', autowidth: 'auto-width', wrap: 'auto-height', fill: 'auto-height', 'height-auto': 'auto-height', autoheight: 'auto-height', 'fixed-width': 'auto-height', none: 'fixed' };
const WEIGHT: Record<string, number> = { thin: 100, extralight: 200, light: 300, normal: 400, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const alias = (map: Record<string, string>, v: unknown) => (typeof v === 'string' ? map[v.toLowerCase()] ?? v : v);

function normalisePaint(p: unknown, key: 'fills' | 'strokes' | 'effects'): unknown {
  if (typeof p === 'string') {
    const color = hexToColor(p);
    return key === 'strokes' ? { color, width: 1, align: 'inside', visible: true } : { type: 'solid', color, visible: true };
  }
  if (p && typeof p === 'object') {
    const o = { ...(p as Record<string, unknown>) };
    if (typeof o.color === 'string') o.color = hexToColor(o.color);
    if (key === 'fills') {
      o.type = typeof o.type === 'string' ? PAINT_TYPES[o.type.toLowerCase()] ?? o.type : o.stops ? 'linear-gradient' : o.src ? 'image' : 'solid';
      // Stops as bare colours spread evenly; stop colours as hex.
      if (Array.isArray(o.stops)) {
        const list = o.stops as unknown[];
        o.stops = list.map((st, i) => {
          const at = list.length > 1 ? i / (list.length - 1) : 0;
          if (typeof st === 'string') return { position: at, color: hexToColor(st) };
          const so = { ...(st as Record<string, unknown>) };
          if (typeof so.color === 'string') so.color = hexToColor(so.color);
          if (so.position === undefined) so.position = typeof so.offset === 'number' ? so.offset : at;
          if (typeof so.position === 'number' && so.position > 1) so.position = so.position / 100;
          delete so.offset;
          return so;
        });
      }
      if (o.type === 'radial-gradient') {
        if (typeof o.radius === 'number') o.radius = { x: o.radius, y: o.radius };
        if (Array.isArray(o.center)) o.center = { x: o.center[0], y: o.center[1] };
      }
      if (o.type === 'image' && typeof o.fit === 'string') o.fit = ({ cover: 'crop', contain: 'fit', stretch: 'fill', repeat: 'tile' } as Record<string, string>)[o.fit] ?? o.fit;
    }
    if (key === 'effects') {
      if (o.inset === true && !o.type) o.type = 'inner-shadow';
      delete o.inset;
      o.type = typeof o.type === 'string' ? EFFECT_TYPES[o.type.toLowerCase()] ?? o.type : 'drop-shadow';
      // Blurs take `radius`; agents often write `blur` for it.
      if ((o.type === 'layer-blur' || o.type === 'background-blur') && o.radius === undefined && typeof o.blur === 'number') { o.radius = o.blur; delete o.blur; }
      if ((o.type === 'drop-shadow' || o.type === 'inner-shadow') && o.color === undefined) o.color = hexToColor('#00000026');
      if (o.type === 'layer-blur' || o.type === 'background-blur') { delete o.color; delete o.x; delete o.y; }
    }
    return o;
  }
  return p;
}
