import type { Node, Variable } from '@archa/schema';
import type { ArchaDocument } from './document';

/*
 * Token bindings (blueprint DESIGN_SYSTEM/01 → Bindings). `node.bindings` maps a property path
 * ("fills.0.color", "cornerRadius", "padding", "spans.1.fills.0.color") to a variable id. The core
 * writes the variable's value into the node whenever either changes, so render, export and hashing
 * keep reading plain values. Editing a bound property by hand to another value unbinds it.
 */

const isIndex = (k: string | undefined) => k !== undefined && /^\d+$/.test(k);

export function getPath(obj: unknown, path: string): unknown {
  let v: unknown = obj;
  for (const k of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

/** A copy of `obj` with `value` at `path`. A missing paint becomes a solid paint, so `fills.0.color` always lands. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root = structuredClone(obj) as Record<string, unknown>;
  let v: Record<string, unknown> = root;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    if (i === keys.length - 1) {
      v[k] = path === 'padding' && typeof value === 'number' ? { top: value, right: value, bottom: value, left: value } : structuredClone(value);
      break;
    }
    const nextKey = keys[i + 1];
    let next = v[k];
    if (next === null || typeof next !== 'object') {
      next = isIndex(nextKey) ? [] : {};
      v[k] = next;
    }
    if (Array.isArray(next) && isIndex(nextKey) && next[Number(nextKey)] === undefined) {
      if (k === 'fills') next[Number(nextKey)] = { type: 'solid', visible: true };
      else if (k === 'strokes') next[Number(nextKey)] = { width: 1, align: 'inside', visible: true };
    }
    v = next as Record<string, unknown>;
  }
  return root as T;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function matches(node: Node, path: string, v: Variable): boolean {
  const now = getPath(node, path);
  if (path === 'padding' && typeof v.value === 'number') {
    const p = now as Record<string, number> | undefined;
    return !!p && [p.top, p.right, p.bottom, p.left].every((x) => x === v.value);
  }
  return same(now, v.value);
}

/** The node with every binding's variable value written in. Bindings to deleted variables are left alone. */
export function resolveBindings(doc: ArchaDocument, node: Node): Node {
  const b = node.bindings;
  if (!b) return node;
  let out = node;
  for (const [path, varId] of Object.entries(b)) {
    const v = doc.variables.get(varId);
    if (v && !matches(out, path, v)) out = setPath(out, path, v.value);
  }
  return out;
}

/** Bindings of `next` whose property an edit moved away from its variable's value (an override by hand). */
export function brokenBindings(doc: ArchaDocument, next: Node, patchKeys: string[]): string[] {
  const b = next.bindings;
  if (!b) return [];
  const touched = new Set(patchKeys);
  return Object.entries(b).filter(([path, varId]) => {
    if (!touched.has(path.split('.')[0]!)) return false;
    const v = doc.variables.get(varId);
    return !!v && !matches(next, path, v);
  }).map(([path]) => path);
}

export function boundTo(doc: ArchaDocument, varId: string): Node[] {
  return [...doc.nodes.values()].filter((n) => n.bindings && Object.values(n.bindings).includes(varId));
}

/** Variable by id or name (a leading `$` is allowed: "$color/accent"). */
export function findVariable(doc: ArchaDocument, ref: string): Variable | undefined {
  return doc.variables.get(ref) ?? [...doc.variables.values()].find((v) => v.name === ref.replace(/^\$/, ''));
}

/**
 * Agent / script input → literal values + bindings: any string `"$<variable name>"` inside the input
 * (a fill, a stroke colour, `cornerRadius: "$radius/md"`, `padding: "$space/4"`) is replaced by the
 * variable's value and bound. Colours become hex so the usual input normalising applies.
 * Strings that name no variable are left as they are (a price like "$29" stays text).
 */
export function bindTokens(doc: ArchaDocument, input: Record<string, unknown>, hex: (v: Variable & { type: 'color' }) => string): Record<string, unknown> {
  const bindings: Record<string, string> = { ...(input.bindings as Record<string, string> | undefined) };
  // Bindings given by name resolve to ids.
  for (const [path, ref] of Object.entries(bindings)) {
    const v = findVariable(doc, String(ref));
    if (!v) throw new Error(`bindings.${path}: no variable "${String(ref)}" — create it with setVariable first`);
    bindings[path] = v.id;
  }
  const walk = (val: unknown, path: string): unknown => {
    if (typeof val === 'string' && val.startsWith('$')) {
      const v = findVariable(doc, val);
      if (!v) return val;
      // A bare colour in a paint list is the paint's colour; span colour shorthands become the span's first fill.
      const span = /^(spans\.\d+)\.(color|fill)$/.exec(path);
      const target = span ? `${span[1]}.fills.0.color`
        : /^(fills|strokes)\.\d+$/.test(path) || /^spans\.\d+\.fills\.\d+$/.test(path) ? `${path}.color` : path;
      bindings[target] = v.id;
      return v.type === 'color' ? hex(v) : v.value;
    }
    if (Array.isArray(val)) return val.map((x, i) => walk(x, `${path}.${i}`));
    if (val && typeof val === 'object') return Object.fromEntries(Object.entries(val).map(([k, x]) => [k, walk(x, `${path}.${k}`)]));
    return val;
  };
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(input)) {
    out[k] = k === 'children' || k === 'bindings' || k === 'meta' ? val : walk(val, k);
  }
  // Shorthands the input normaliser expands: `fill` → fills.0, `stroke` → strokes.0.
  for (const [short, long] of [['fill', 'fills.0.color'], ['stroke', 'strokes.0.color']] as const) {
    if (bindings[short]) { bindings[long] = bindings[short]!; delete bindings[short]; }
  }
  if (Object.keys(bindings).length) out.bindings = bindings;
  return out;
}
