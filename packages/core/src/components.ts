import { isContainer, type Node, type NodeInput, type Op } from '@archa/schema';
import { DocumentError, type ArchaDocument } from './document';
import { insertOpsFor } from './factory';

/*
 * Components, linked v1 (blueprint DESIGN_SYSTEM/02 → "v1"). No format change: a component is a
 * frame with `meta.component`, an instance is a copy with `meta.instanceOf = <component id>`.
 * Editing the main does not touch instances until they are synced (syncInstanceOps).
 * Full instance nodes with per-property overrides are Phase 7.
 */

export type ComponentMeta = { description: string };
export type ComponentInfo = { id: string; name: string; description: string; width: number; height: number; instances: number };

export const componentMeta = (n: Node | undefined): ComponentMeta | null => {
  const c = n?.meta?.component as Partial<ComponentMeta> | undefined;
  return c && typeof c === 'object' ? { description: typeof c.description === 'string' ? c.description : '' } : null;
};
export const instanceOf = (n: Node | undefined): string | null => {
  const v = n?.meta?.instanceOf;
  return typeof v === 'string' ? v : null;
};

function allNodes(doc: ArchaDocument): Node[] {
  return doc.pages.flatMap((p) => [...doc.walk(p.rootId)]);
}

/** Every component in the document, in page order. */
export function listComponents(doc: ArchaDocument): ComponentInfo[] {
  const nodes = allNodes(doc);
  const count = new Map<string, number>();
  for (const n of nodes) { const c = instanceOf(n); if (c) count.set(c, (count.get(c) ?? 0) + 1); }
  return nodes.filter((n) => componentMeta(n)).map((n) => ({
    id: n.id, name: n.name, description: componentMeta(n)!.description, width: n.width, height: n.height, instances: count.get(n.id) ?? 0,
  }));
}

export function instancesOf(doc: ArchaDocument, componentId: string): Node[] {
  return allNodes(doc).filter((n) => instanceOf(n) === componentId);
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

export function makeComponentOps(doc: ArchaDocument, id: string, description = ''): Op[] {
  const n = doc.require(id);
  if (n.type !== 'frame') throw new DocumentError('VALIDATION', `"${n.name}" is a ${n.type} — only frames can become components (wrap it in a frame first)`);
  if (instanceOf(n)) throw new DocumentError('VALIDATION', `"${n.name}" is an instance — detach it first`);
  for (const d of doc.walk(id)) if (d.id !== id && componentMeta(d)) throw new DocumentError('VALIDATION', `"${n.name}" contains the component "${d.name}" — components cannot nest mains`);
  return [{ op: 'update', id, patch: { meta: { ...n.meta, component: { description } } } }];
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

/** Marks every node of a copied subtree with the main node it came from (`meta.src`), for syncing later. */
function withSources(doc: ArchaDocument, id: string, input: NodeInput): NodeInput {
  const n = doc.require(id);
  const meta: Record<string, unknown> = { ...(input.meta as Record<string, unknown> | undefined), src: id };
  delete meta.overrides;
  const kids = isContainer(n) && input.children ? input.children.map((c, i) => withSources(doc, n.children[i]!, c)) : undefined;
  return { ...input, meta, ...(kids ? { children: kids } : {}) } as NodeInput;
}

/** Insert a linked copy of a component. Position is relative to the parent. */
export function instanceOps(doc: ArchaDocument, componentId: string, parentId: string, at: { x?: number; y?: number; index?: number; name?: string } = {}) {
  const main = doc.require(componentId);
  if (!componentMeta(main)) throw new DocumentError('VALIDATION', `"${main.name}" is not a component`);
  const input = withSources(doc, componentId, stripMain(subtreeInput(doc, componentId)));
  const meta = { ...(input.meta as Record<string, unknown>), instanceOf: componentId };
  return insertOpsFor({ ...input, meta, name: at.name ?? main.name, x: at.x ?? main.x, y: at.y ?? main.y } as NodeInput, parentId, at.index);
}

/** Keys an instance root always keeps as its own. */
const ROOT_OWN = ['name', 'x', 'y', 'absolute', 'visible', 'locked'];
/** Before overrides were recorded, copies only ever changed their content; treat those keys as overrides. */
const LEGACY_OVERRIDES = ['text', 'src', 'visible'];

/** A main node's syncable properties, minus the keys the copy keeps. `bind` is always carried so a synced fill never detaches it. */
function syncProps(main: Node, keep: string[]): Record<string, unknown> {
  const all = structuredClone(main) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { bind: all.bind };
  for (const [k, v] of Object.entries(all)) if (!['id', 'type', 'parentId', 'children', 'meta'].includes(k)) out[k] = v;
  for (const k of keep) delete out[k];
  return out;
}

function overridesOf(copy: Node, main: Node, legacy: boolean): string[] {
  if (Array.isArray(copy.meta.overrides)) return copy.meta.overrides as string[];
  if (!legacy) return [];
  const a = copy as unknown as Record<string, unknown>, b = main as unknown as Record<string, unknown>;
  return LEGACY_OVERRIDES.filter((k) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/**
 * Make an instance match its main again while keeping what was changed on the copy (blueprint
 * DESIGN_SYSTEM/02 → Overrides). Nodes are matched by `meta.src` (copies made before that by name), updated in
 * place so their ids survive; nodes the main gained are added, nodes it lost are removed, order follows the main.
 */
export function syncInstanceOps(doc: ArchaDocument, instanceId: string): Op[] {
  const inst = doc.require(instanceId);
  const mainId = instanceOf(inst);
  if (!mainId) throw new DocumentError('VALIDATION', `"${inst.name}" is not an instance`);
  const main = doc.get(mainId);
  if (!main) throw new DocumentError('NOT_FOUND', `The main component of "${inst.name}" was deleted — detach the instance`);
  const ops: Op[] = [];
  const moves: Op[] = [];
  const deletes: Op[] = [];
  const bySrc = new Map<string, Node>();
  for (const d of doc.walk(instanceId)) if (d.id !== instanceId && typeof d.meta.src === 'string') bySrc.set(d.meta.src, d);
  const used = new Set<string>();

  const rootKeep = [...ROOT_OWN, ...overridesOf(inst, main, false)];
  ops.push({ op: 'update', id: instanceId, patch: { ...syncProps(main, rootKeep), meta: { ...inst.meta, src: mainId } } });

  const reconcile = (mainParent: Node, copyParent: Node) => {
    if (!isContainer(mainParent) || !isContainer(copyParent)) return;
    const want: string[] = [];
    mainParent.children.forEach((mcId, i) => {
      const mc = doc.require(mcId);
      let match = bySrc.get(mcId);
      let legacy = false;
      if (!match || used.has(match.id) || match.type !== mc.type) {
        // Older copies carry no `meta.src`: the same name and type under the matching parent, nearest position first.
        const cands = copyParent.children.map((id) => doc.require(id)).filter((c) => !used.has(c.id) && c.type === mc.type && c.name === mc.name && typeof c.meta.src !== 'string');
        match = cands.sort((a, b) => Math.abs(copyParent.children.indexOf(a.id) - i) - Math.abs(copyParent.children.indexOf(b.id) - i))[0];
        legacy = !!match;
      }
      if (match) {
        used.add(match.id);
        const meta: Record<string, unknown> = { ...match.meta, src: mcId };
        const keep = overridesOf(match, mc, legacy);
        if (legacy && keep.length) meta.overrides = keep;
        ops.push({ op: 'update', id: match.id, patch: { ...syncProps(mc, keep), meta } });
        if (match.parentId !== copyParent.id) moves.push({ op: 'move', id: match.id, parentId: copyParent.id, index: i });
        reconcile(mc, match);
        want.push(match.id);
      } else {
        const { ops: ins, rootId } = insertOpsFor(withSources(doc, mcId, stripMain(subtreeInput(doc, mcId))), copyParent.id);
        ops.push(...ins);
        want.push(rootId);
      }
    });
    for (const c of copyParent.children) if (!want.includes(c) && !used.has(c)) deletes.push({ op: 'delete', id: c });
    want.forEach((id, i) => moves.push({ op: 'move', id, parentId: copyParent.id, index: i }));
  };
  reconcile(main, inst);
  // Moves before deletes: a node the copy keeps may still sit inside one that goes.
  return [...ops, ...moves, ...deletes];
}

export function detachOps(doc: ArchaDocument, instanceId: string): Op[] {
  const n = doc.require(instanceId);
  const meta = { ...n.meta };
  delete meta.instanceOf;
  return [{ op: 'update', id: instanceId, patch: { meta } }];
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
