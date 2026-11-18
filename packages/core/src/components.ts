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

/** Insert a linked copy of a component. Position is relative to the parent. */
export function instanceOps(doc: ArchaDocument, componentId: string, parentId: string, at: { x?: number; y?: number; index?: number; name?: string } = {}) {
  const main = doc.require(componentId);
  if (!componentMeta(main)) throw new DocumentError('VALIDATION', `"${main.name}" is not a component`);
  const input = stripMain(subtreeInput(doc, componentId));
  const meta = { ...(input.meta as Record<string, unknown>), instanceOf: componentId };
  return insertOpsFor({ ...input, meta, name: at.name ?? main.name, x: at.x ?? main.x, y: at.y ?? main.y } as NodeInput, parentId, at.index);
}

/** Make an instance match its main again: same props and children; keeps its own name, position and parent sizing. */
export function syncInstanceOps(doc: ArchaDocument, instanceId: string): Op[] {
  const inst = doc.require(instanceId);
  const mainId = instanceOf(inst);
  if (!mainId) throw new DocumentError('VALIDATION', `"${inst.name}" is not an instance`);
  const main = doc.get(mainId);
  if (!main) throw new DocumentError('NOT_FOUND', `The main component of "${inst.name}" was deleted — detach the instance`);
  const ops: Op[] = [];
  if (isContainer(inst)) for (const c of inst.children) ops.push({ op: 'delete', id: c });
  const { id: _i, type: _t, parentId: _p, name: _n, x: _x, y: _y, meta: _m, children: _c, absolute: _a, visible: _v, locked: _l, ...props } = structuredClone(main) as Node & { children?: string[] };
  ops.push({ op: 'update', id: instanceId, patch: props });
  if (isContainer(main)) {
    for (const c of main.children) ops.push(...insertOpsFor(stripMain(subtreeInput(doc, c)), instanceId).ops);
  }
  return ops;
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
