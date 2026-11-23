import { BINDABLE, type Node, type Variable } from '@archa/schema';
import type { ArchaDocument } from './document';
import { adjustSpans } from './text';

/*
 * Rules every update follows, in the core and in the renderer mirror alike (blueprint DESIGN_SYSTEM/01 →
 * Bindings, DESIGN_SYSTEM/02 → Overrides, DOCUMENT_MODEL/01 → Rich text):
 *  - rich text: when `text` changes and the patch does not set `spans`, the spans stay on the same characters;
 *  - bindings: a property set by hand drops its binding (Figma-like detach) unless the patch sets `bind` too;
 *  - instances: a node copied from a component main (`meta.src`) records the keys edited on it in
 *    `meta.overrides`, so syncing the main later keeps them. Patches that set `meta` are the core's own.
 */

/** Node properties each bindable key writes. */
const BIND_PROPS: Record<string, string[]> = { fill: ['fills'], stroke: ['strokes'] };
const propsOf = (key: string) => BIND_PROPS[key] ?? [key];

export function effectivePatch(prev: Node, patch: Record<string, unknown>): Record<string, unknown> {
  let p = patch;
  if (prev.type === 'text' && typeof p.text === 'string' && p.text !== prev.text && p.spans === undefined && prev.spans?.length) {
    p = { ...p, spans: adjustSpans(prev.text, p.text, prev.spans) };
  }
  if (prev.bind && !('bind' in p)) {
    const drop = Object.keys(prev.bind).filter((k) => propsOf(k).some((prop) => prop in p));
    if (drop.length) {
      const kept = { ...prev.bind };
      for (const k of drop) delete kept[k];
      p = { ...p, bind: Object.keys(kept).length ? kept : undefined };
    }
  }
  if (!('meta' in p) && typeof prev.meta.src === 'string') {
    const keys = Object.keys(p).filter((k) => k !== 'meta');
    const cur = Array.isArray(prev.meta.overrides) ? (prev.meta.overrides as string[]) : [];
    const next = [...new Set([...cur, ...keys])];
    if (next.length !== cur.length) p = { ...p, meta: { ...prev.meta, overrides: next } };
  }
  return p;
}

/** The variable a binding points at: by id, else by name. */
export function boundVariable(doc: ArchaDocument, ref: string): Variable | undefined {
  return doc.variables.get(ref) ?? [...doc.variables.values()].find((v) => v.name === ref);
}

/** What a node's bindings say its properties should be, where that differs from what it has. Null = in step. */
export function bindingPatch(doc: ArchaDocument, n: Node): Record<string, unknown> | null {
  if (!n.bind) return null;
  const patch: Record<string, unknown> = {};
  const node = n as unknown as Record<string, unknown>;
  for (const [key, ref] of Object.entries(n.bind)) {
    const v = boundVariable(doc, ref);
    const want = BINDABLE[key];
    if (!v || !want) continue;
    if (want !== v.type && !(want === 'string' && v.type === 'number')) continue;
    let value: unknown;
    if (key === 'fill') {
      if (!('fills' in n)) continue;
      const fills = [...n.fills];
      fills[0] = { type: 'solid', color: v.value as never, visible: true };
      value = fills;
    } else if (key === 'stroke') {
      if (!('strokes' in n)) continue;
      const strokes = [...n.strokes];
      strokes[0] = { width: 1, align: 'inside', visible: true, ...(strokes[0] ?? {}), color: v.value as never };
      value = strokes;
    } else if (key === 'padding') {
      if (n.type !== 'frame') continue;
      const x = v.value as number;
      value = { top: x, right: x, bottom: x, left: x };
    } else {
      if (!(key in node)) continue;
      value = key === 'text' ? String(v.value) : v.value;
    }
    const prop = propsOf(key)[0]!;
    if (JSON.stringify(node[prop]) !== JSON.stringify(value)) patch[prop] = value;
  }
  return Object.keys(patch).length ? patch : null;
}

/** Keys an instance copy may carry its own value for; everything else follows the main on sync. */
export const overriddenKeys = (n: Node): string[] => (Array.isArray(n.meta.overrides) ? (n.meta.overrides as string[]) : []);
