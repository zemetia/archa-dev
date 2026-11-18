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

const DEFAULT_NAMES: Record<string, string> = { frame: 'Frame', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', group: 'Group' };

/** Colour fields accept `"#ff0000"` strings; paints accept a bare colour string. */
export function normaliseInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  if (!out.name && typeof out.type === 'string') out.name = (out.type === 'text' && typeof out.text === 'string' && out.text.slice(0, 24)) || DEFAULT_NAMES[out.type] || out.type;
  for (const key of ['fills', 'strokes', 'effects'] as const) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map((p) => normalisePaint(p, key));
  }
  if (typeof out.fill === 'string') { out.fills = [normalisePaint(out.fill, 'fills')]; delete out.fill; }
  if (typeof out.padding === 'number') { const p = out.padding; out.padding = { top: p, right: p, bottom: p, left: p }; }
  if (typeof out.sizing === 'string') out.sizing = { horizontal: out.sizing, vertical: out.sizing };
  return out;
}

function normalisePaint(p: unknown, key: 'fills' | 'strokes' | 'effects'): unknown {
  if (typeof p === 'string') {
    const color = hexToColor(p);
    return key === 'strokes' ? { color, width: 1, align: 'inside', visible: true } : { type: 'solid', color, visible: true };
  }
  if (p && typeof p === 'object') {
    const o = { ...(p as Record<string, unknown>) };
    if (typeof o.color === 'string') o.color = hexToColor(o.color);
    if (key === 'fills' && !o.type) o.type = 'solid';
    if (key === 'effects' && !o.type) o.type = 'drop-shadow';
    return o;
  }
  return p;
}
