import { isContainer, newId, type InsertOp, type Node, type NodeInput, type Op } from '@archa/schema';
import { DocumentError, type ArchaDocument } from './document';
import { insertOpsFor } from './factory';

/*
 * Components, linked v2 (blueprint DESIGN_SYSTEM/02). Still `meta`-based, so no format change:
 *   main        a frame with `meta.component = { description, props?, set?, variant? }`
 *   instance    a copy with `meta.instanceOf = <main id>` and `meta.props` (its prop values)
 *   descendant  each copied layer keeps `meta.sourceId` (the main layer it came from) and
 *               `meta.overrides` (the properties edited on this copy; apply.ts records them)
 * Syncing rebuilds an instance from its main and puts the overrides and props back, so editing
 * an instance's text and then syncing keeps that text. Variants are mains sharing a `set` name.
 */

export type PropDef = { type: 'text'; node: string; default: string } | { type: 'boolean'; node: string; default: boolean };
export type ComponentMeta = { description: string; props: Record<string, PropDef>; set: string | null; variant: Record<string, string> };
export type ComponentInfo = {
  id: string; name: string; description: string; width: number; height: number; instances: number;
  props: Record<string, PropDef['type']>; set: string | null; variant: Record<string, string>;
};
export type PropValue = string | boolean;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const componentMeta = (n: Node | undefined): ComponentMeta | null => {
  const c = n?.meta?.component;
  if (!isRecord(c)) return null;
  return {
    description: typeof c.description === 'string' ? c.description : '',
    props: isRecord(c.props) ? (c.props as Record<string, PropDef>) : {},
    set: typeof c.set === 'string' && c.set ? c.set : null,
    variant: isRecord(c.variant) ? Object.fromEntries(Object.entries(c.variant).map(([k, v]) => [k, String(v)])) : {},
  };
};
export const instanceOf = (n: Node | undefined): string | null => {
  const v = n?.meta?.instanceOf;
  return typeof v === 'string' ? v : null;
};
export const sourceOf = (n: Node | undefined): string | null => {
  const v = n?.meta?.sourceId;
  return typeof v === 'string' ? v : null;
};
export const overridesOf = (n: Node | undefined): string[] => {
  const v = n?.meta?.overrides;
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
};
export const propsOf = (n: Node | undefined): Record<string, PropValue> => (isRecord(n?.meta?.props) ? (n!.meta.props as Record<string, PropValue>) : {});

/** Kept by the instance root on every sync: where it sits and how it is named. */
const ROOT_KEEPS = new Set(['id', 'type', 'parentId', 'name', 'x', 'y', 'meta', 'children', 'absolute', 'visible', 'locked']);
const NEVER_COPIED = new Set(['id', 'parentId', 'children', 'meta']);

/**
 * Override tracking, called by apply.ts for every update: a patch on an instance (root or copied layer)
 * adds the properties it changes to that node's `meta.overrides`. Patches that set `meta` themselves
 * (sync, detach, undo) manage it and are left alone.
 */
export function trackOverrides(_doc: ArchaDocument, prev: Node, patch: Record<string, unknown>): Record<string, unknown> {
  if ('meta' in patch) return {};
  const root = instanceOf(prev) !== null;
  if (!root && sourceOf(prev) === null) return {};
  const had = overridesOf(prev);
  const keys = Object.keys(patch).filter((k) => {
    if (k === 'meta' || had.includes(k) || (root && ROOT_KEEPS.has(k))) return false;
    return JSON.stringify((prev as Record<string, unknown>)[k]) !== JSON.stringify(patch[k]);
  });
  if (!keys.length) return {};
  return { meta: { ...prev.meta, overrides: [...had, ...keys] } };
}

function allNodes(doc: ArchaDocument): Node[] {
  return doc.pages.flatMap((p) => [...doc.walk(p.rootId)]);
}

/** Every component in the document, in page order. */
export function listComponents(doc: ArchaDocument): ComponentInfo[] {
  const nodes = allNodes(doc);
  const count = new Map<string, number>();
  for (const n of nodes) { const c = instanceOf(n); if (c) count.set(c, (count.get(c) ?? 0) + 1); }
  return nodes.flatMap((n) => {
    const m = componentMeta(n);
    if (!m) return [];
    return [{
      id: n.id, name: n.name, description: m.description, width: n.width, height: n.height, instances: count.get(n.id) ?? 0,
      props: Object.fromEntries(Object.entries(m.props).map(([k, p]) => [k, p.type])), set: m.set, variant: m.variant,
    }];
  });
}

export function instancesOf(doc: ArchaDocument, componentId: string): Node[] {
  return allNodes(doc).filter((n) => instanceOf(n) === componentId);
}

/** Mains of one variant set, and the values each variant axis takes. */
export function variantSet(doc: ArchaDocument, set: string): { members: Node[]; axes: Record<string, string[]> } {
  const members = allNodes(doc).filter((n) => componentMeta(n)?.set === set);
  const axes: Record<string, string[]> = {};
  for (const m of members) for (const [k, v] of Object.entries(componentMeta(m)!.variant)) if (!(axes[k] ??= []).includes(v)) axes[k]!.push(v);
  return { members, axes };
}

/** A node's subtree as insert input (no ids), so it can be re-inserted or stored in a library. */
export function subtreeInput(doc: ArchaDocument, id: string): NodeInput {
  const n = doc.require(id);
  const { id: _id, parentId: _p, ...rest } = structuredClone(n) as Node & { children?: string[] };
  const input = rest as unknown as NodeInput;
  delete (input as { children?: unknown }).children;
  if (isContainer(n)) input.children = n.children.map((c) => subtreeInput(doc, c));
  return input as NodeInput;
}

/** Copies never carry a `component` marker, so there is only ever one main. Nested instances stay linked. */
function stripMain(input: NodeInput): NodeInput {
  const meta = { ...(input.meta as Record<string, unknown> | undefined) };
  delete meta.component;
  return { ...input, meta, ...(input.children ? { children: input.children.map(stripMain) } : {}) } as NodeInput;
}

export type MakeComponentOptions = {
  /** Prop name → the layer it drives: text props set a text layer's text, boolean props show / hide a layer. */
  props?: Record<string, { type: 'text' | 'boolean'; node: string }>;
  /** Variant set name: mains with the same set are variants of one component (Button: size=sm|lg, …). */
  set?: string;
  variant?: Record<string, string>;
};

export function makeComponentOps(doc: ArchaDocument, id: string, description = '', opts: MakeComponentOptions = {}): Op[] {
  const n = doc.require(id);
  if (n.type !== 'frame') throw new DocumentError('VALIDATION', `"${n.name}" is a ${n.type} — only frames can become components (wrap it in a frame first)`);
  if (instanceOf(n)) throw new DocumentError('VALIDATION', `"${n.name}" is an instance — detach it first`);
  for (const d of doc.walk(id)) if (d.id !== id && componentMeta(d)) throw new DocumentError('VALIDATION', `"${n.name}" contains the component "${d.name}" — components cannot nest mains`);
  const props: Record<string, PropDef> = { ...componentMeta(n)?.props };
  for (const [name, p] of Object.entries(opts.props ?? {})) {
    const target = doc.require(p.node);
    if (target.id === id || !doc.isAncestor(id, target.id)) throw new DocumentError('VALIDATION', `prop "${name}": "${target.name}" is not a layer inside "${n.name}"`);
    if (p.type === 'text') {
      if (target.type !== 'text') throw new DocumentError('VALIDATION', `prop "${name}": a text prop needs a text layer, "${target.name}" is a ${target.type}`);
      props[name] = { type: 'text', node: target.id, default: target.text };
    } else if (p.type === 'boolean') props[name] = { type: 'boolean', node: target.id, default: target.visible };
    else throw new DocumentError('VALIDATION', `prop "${name}": type must be "text" or "boolean"`);
  }
  const prev = componentMeta(n);
  const set = opts.set ?? prev?.set ?? null;
  const variant = opts.variant ?? prev?.variant ?? {};
  if (set) {
    const clash = variantSet(doc, set).members.find((m) => m.id !== id && JSON.stringify(componentMeta(m)!.variant) === JSON.stringify(variant));
    if (clash) throw new DocumentError('VALIDATION', `"${clash.name}" is already the ${JSON.stringify(variant)} variant of "${set}"`);
  }
  const component = { description: description || prev?.description || '', ...(Object.keys(props).length ? { props } : {}), ...(set ? { set, variant } : {}) };
  return [{ op: 'update', id, patch: { meta: { ...n.meta, component } } }];
}

export function unmakeComponentOps(doc: ArchaDocument, id: string): Op[] {
  const n = doc.require(id);
  const meta = { ...n.meta };
  delete meta.component;
  // Instances keep their content but lose the link.
  const ops: Op[] = [{ op: 'update', id, patch: { meta } }];
  for (const inst of instancesOf(doc, id)) ops.push(...detachOps(doc, inst.id));
  return ops;
}

/** Name path of a layer below `root` ("Row/Icon"), to match layers across variants that have other ids. */
function namePath(doc: ArchaDocument, root: string, id: string): string {
  const parts: string[] = [];
  for (let n = doc.get(id); n && n.id !== root; n = n.parentId ? doc.get(n.parentId) : undefined) parts.unshift(n.name);
  return parts.join('/');
}

/**
 * Insert ops for the main's children under `parentId`. Layers that already exist on the instance
 * (same source layer, else same name path) keep their id and their overridden properties; prop
 * values are written last.
 */
function buildChildren(doc: ArchaDocument, main: Node, parentId: string, instRoot: Node | null, props: Map<string, Record<string, unknown>>, reset: boolean): InsertOp[] {
  const bySource = new Map<string, Node>(), byPath = new Map<string, Node>();
  if (instRoot) {
    for (const d of doc.walk(instRoot.id)) {
      if (d.id === instRoot.id) continue;
      const src = sourceOf(d);
      if (src && !bySource.has(src)) bySource.set(src, d);
      const path = namePath(doc, instRoot.id, d.id);
      if (!byPath.has(path)) byPath.set(path, d);
    }
  }
  const used = new Set<string>();
  const ops: InsertOp[] = [];
  const visit = (src: Node, parent: string) => {
    let match = bySource.get(src.id) ?? byPath.get(namePath(doc, main.id, src.id));
    if (match && used.has(match.id)) match = undefined;
    if (match) used.add(match.id);
    const node = structuredClone(src) as Record<string, unknown>;
    for (const k of NEVER_COPIED) delete node[k];
    const meta: Record<string, unknown> = { ...src.meta, sourceId: src.id };
    delete meta.component;
    delete meta.overrides;
    if (match && !reset) {
      const keep = overridesOf(match);
      for (const k of keep) node[k] = structuredClone((match as Record<string, unknown>)[k]);
      if (keep.length) meta.overrides = keep;
    }
    Object.assign(node, props.get(src.id));
    const id = match?.id ?? newId();
    ops.push({ op: 'insert', node: { ...node, id, meta } as Node, parentId: parent });
    if (isContainer(src)) for (const c of src.children) { const k = doc.get(c); if (k) visit(k, id); }
  };
  if (isContainer(main)) for (const c of main.children) { const k = doc.get(c); if (k) visit(k, parentId); }
  return ops;
}

/** Prop values → patches on the main's layers they drive (by main layer id). */
function propPatches(main: Node, values: Record<string, PropValue>): Map<string, Record<string, unknown>> {
  const defs = componentMeta(main)?.props ?? {};
  const out = new Map<string, Record<string, unknown>>();
  for (const [name, value] of Object.entries(values)) {
    const def = defs[name];
    if (!def) continue;
    out.set(def.node, { ...out.get(def.node), ...(def.type === 'text' ? { text: String(value) } : { visible: Boolean(value) }) });
  }
  return out;
}

/** Insert a linked copy of a component. Position is relative to the parent. */
export function instanceOps(doc: ArchaDocument, componentId: string, parentId: string, at: { x?: number; y?: number; index?: number; name?: string; props?: Record<string, PropValue> } = {}) {
  const main = doc.require(componentId);
  if (!componentMeta(main)) throw new DocumentError('VALIDATION', `"${main.name}" is not a component`);
  const root = structuredClone(main) as Record<string, unknown>;
  for (const k of NEVER_COPIED) delete root[k];
  const meta: Record<string, unknown> = { ...main.meta, instanceOf: componentId, ...(at.props ? { props: at.props } : {}) };
  delete meta.component;
  const rootId = newId();
  const name = at.name ?? main.name;
  const ops: InsertOp[] = [{ op: 'insert', node: { ...root, id: rootId, name, x: at.x ?? main.x, y: at.y ?? main.y, meta } as Node, parentId, ...(at.index === undefined ? {} : { index: at.index }) }];
  ops.push(...buildChildren(doc, main, rootId, null, propPatches(main, at.props ?? {}), true));
  return { ops, rootId, created: [{ id: rootId, name }] };
}

export type SyncOptions = {
  /** Drop the instance's overrides and prop values ("Reset to main"). */
  reset?: boolean;
  /** Switch to another main (a variant of the same set). */
  mainId?: string;
  /** New prop values, merged over the instance's own. */
  props?: Record<string, PropValue>;
};

/**
 * Make an instance match its main again: same props and children, with its own overrides and prop
 * values put back. Keeps its name, position and layer ids.
 */
export function syncInstanceOps(doc: ArchaDocument, instanceId: string, opts: SyncOptions = {}): Op[] {
  const inst = doc.require(instanceId);
  const linked = instanceOf(inst);
  if (!linked) throw new DocumentError('VALIDATION', `"${inst.name}" is not an instance`);
  const main = doc.get(opts.mainId ?? linked);
  if (!main) throw new DocumentError('NOT_FOUND', `The main component of "${inst.name}" was deleted — detach the instance`);
  const values = opts.reset ? {} : { ...propsOf(inst), ...opts.props };
  const ops: Op[] = [];
  if (isContainer(inst)) for (const c of inst.children) ops.push({ op: 'delete', id: c });
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(structuredClone(main))) if (!ROOT_KEEPS.has(k)) patch[k] = v;
  const keep = opts.reset ? [] : overridesOf(inst);
  for (const k of keep) patch[k] = structuredClone((inst as Record<string, unknown>)[k]);
  if (!('bindings' in patch)) patch.bindings = undefined;
  const meta: Record<string, unknown> = { ...inst.meta, instanceOf: main.id };
  if (keep.length) meta.overrides = keep; else delete meta.overrides;
  if (Object.keys(values).length) meta.props = values; else delete meta.props;
  patch.meta = meta;
  ops.push({ op: 'update', id: instanceId, patch });
  ops.push(...buildChildren(doc, main, instanceId, inst, propPatches(main, values), !!opts.reset));
  return ops;
}

/**
 * Set an instance's props: text and boolean props by name, variant axes ("size", "state") by value —
 * a variant change swaps the instance to that variant's main, keeping overrides that still fit.
 */
export function setPropsOps(doc: ArchaDocument, instanceId: string, values: Record<string, PropValue>): Op[] {
  const inst = doc.require(instanceId);
  const linked = instanceOf(inst);
  if (!linked) throw new DocumentError('VALIDATION', `"${inst.name}" is not an instance`);
  const main = doc.require(linked);
  const m = componentMeta(main);
  if (!m) throw new DocumentError('VALIDATION', `"${main.name}" is no longer a component`);
  const axes = m.set ? variantSet(doc, m.set).axes : {};
  const wanted = { ...m.variant };
  const props: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k in axes) wanted[k] = String(v);
    else if (k in m.props) props[k] = v;
    else {
      const known = [...Object.keys(m.props), ...Object.keys(axes)];
      throw new DocumentError('VALIDATION', `"${main.name}" has no prop "${k}"${known.length ? ` — props: ${known.join(', ')}` : ' — give it props with makeComponent(frame, description, { props })'}`);
    }
  }
  let target = main;
  if (m.set && JSON.stringify(wanted) !== JSON.stringify(m.variant)) {
    const hit = variantSet(doc, m.set).members.find((c) => Object.entries(wanted).every(([k, v]) => componentMeta(c)!.variant[k] === v));
    if (!hit) throw new DocumentError('VALIDATION', `"${m.set}" has no variant ${JSON.stringify(wanted)} — variants: ${Object.entries(axes).map(([k, v]) => `${k} ${v.join('|')}`).join(', ')}`);
    target = hit;
  }
  return syncInstanceOps(doc, instanceId, { mainId: target.id, props });
}

export function detachOps(doc: ArchaDocument, instanceId: string): Op[] {
  const n = doc.require(instanceId);
  const ops: Op[] = [];
  for (const d of doc.walk(instanceId)) {
    // Nested instances stay linked to their own main.
    if (d.id !== instanceId && instanceOf(d)) continue;
    const meta = { ...d.meta };
    if (d.id === instanceId) { delete meta.instanceOf; delete meta.props; }
    delete meta.overrides;
    delete meta.sourceId;
    if (Object.keys(meta).length !== Object.keys(d.meta).length) ops.push({ op: 'update', id: d.id, patch: { meta } });
  }
  return ops.length ? ops : [{ op: 'update', id: n.id, patch: { meta: { ...n.meta } } }];
}

/* ------------------------------ libraries ------------------------------ */

/** A published component as stored in a library (`components/<id>.json`). */
export type LibraryComponent = { id: string; name: string; description: string; width: number; height: number; node: NodeInput };

export const libraryRef = (n: Node | undefined): string | null => {
  const v = n?.meta?.libraryRef;
  return typeof v === 'string' ? v : null;
};

/**
 * Bring a library component into a document. The first use places a local main (linked to the
 * library by `meta.libraryRef`); later uses add instances of that main, so every copy stays consistent.
 */
export function libraryInsertOps(doc: ArchaDocument, ref: string, item: LibraryComponent, parentId: string, at: { x?: number; y?: number; index?: number } = {}) {
  const local = doc.pages.flatMap((p) => [...doc.walk(p.rootId)]).find((n) => libraryRef(n) === ref && componentMeta(n));
  if (local) return { ...instanceOps(doc, local.id, parentId, at), placed: 'instance' as const };
  const input = stripMain(item.node);
  const meta: Record<string, unknown> = { ...(input.meta as Record<string, unknown>), component: { description: item.description }, libraryRef: ref };
  delete meta.instanceOf;
  return { ...insertOpsFor({ ...input, meta, name: item.name, x: at.x ?? 0, y: at.y ?? 0 } as NodeInput, parentId, at.index), placed: 'main' as const };
}
