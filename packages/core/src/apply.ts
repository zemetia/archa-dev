import { isContainer, nodeSchema, type Node, type Op, type InsertOp } from '@archa/schema';
import { ArchaDocument, DocumentError } from './document';
import { runLayout } from './layout';

const IMMUTABLE_KEYS = new Set(['id', 'type', 'parentId', 'children']);

export type ApplyResult = { inverse: Op[]; touched: Set<string> };

/**
 * Applies ops atomically: either every op applies or the document is restored.
 * Returns inverse ops (in apply order) for undo. Layout runs once at the end.
 */
export function applyOps(doc: ArchaDocument, ops: Op[]): ApplyResult {
  const inverse: Op[] = [];
  const touched = new Set<string>();
  try {
    ops.forEach((op, i) => {
      try {
        inverse.unshift(...applyOne(doc, op, touched));
      } catch (e) {
        if (e instanceof DocumentError) throw new DocumentError(e.code, `op[${i}] ${op.op}: ${e.message}`, { opIndex: i, ...(e.details as object) });
        throw e;
      }
    });
    runLayout(doc);
    return { inverse, touched };
  } catch (e) {
    for (const inv of inverse) applyOne(doc, inv, new Set());
    runLayout(doc);
    throw e;
  }
}

function parseNode(raw: unknown): Node {
  const r = nodeSchema.safeParse(raw);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const path = issue?.path.join('.') || '(root)';
  const name = (raw as { name?: string })?.name ?? '?';
  throw new DocumentError('VALIDATION', `"${name}".${path} — ${issue?.message ?? 'invalid'}`, { path, issues: r.error.issues });
}

function applyOne(doc: ArchaDocument, op: Op, touched: Set<string>): Op[] {
  switch (op.op) {
    case 'insert': {
      const raw = { ...op.node, parentId: op.parentId, children: isContainerType(op.node.type) ? [] : undefined };
      const node = parseNode(raw);
      if (doc.nodes.has(node.id)) throw new DocumentError('VALIDATION', `id "${node.id}" already exists`);
      if (node.type === 'page') throw new DocumentError('VALIDATION', 'pages cannot be inserted as nodes');
      const parent = doc.container(op.parentId);
      const index = clampIndex(op.index, parent.children.length);
      parent.children.splice(index, 0, node.id);
      doc.nodes.set(node.id, node);
      touched.add(node.id).add(parent.id);
      return [{ op: 'delete', id: node.id }];
    }
    case 'update': {
      const prev = doc.require(op.id);
      const bad = Object.keys(op.patch).find((k) => IMMUTABLE_KEYS.has(k));
      if (bad) throw new DocumentError('VALIDATION', `"${prev.name}".${bad} cannot be changed with update${bad === 'parentId' || bad === 'children' ? ' — use move' : ''}`);
      const next = parseNode({ ...prev, ...op.patch });
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(op.patch)) before[k] = structuredClone((prev as Record<string, unknown>)[k]);
      doc.nodes.set(op.id, next);
      touched.add(op.id);
      return [{ op: 'update', id: op.id, patch: before }];
    }
    case 'move': {
      const node = doc.require(op.id);
      if (node.type === 'page') throw new DocumentError('VALIDATION', 'pages cannot be moved');
      if (op.id === op.parentId || doc.isAncestor(op.id, op.parentId)) throw new DocumentError('VALIDATION', `cannot move "${node.name}" into itself`);
      const oldParent = doc.container(node.parentId!);
      const oldIndex = oldParent.children.indexOf(op.id);
      const parent = doc.container(op.parentId);
      oldParent.children.splice(oldIndex, 1);
      parent.children.splice(clampIndex(op.index, parent.children.length), 0, op.id);
      doc.nodes.set(op.id, { ...node, parentId: parent.id });
      touched.add(op.id).add(oldParent.id).add(parent.id);
      return [{ op: 'move', id: op.id, parentId: oldParent.id, index: oldIndex }];
    }
    case 'delete': {
      const node = doc.require(op.id);
      if (node.type === 'page') throw new DocumentError('VALIDATION', 'pages cannot be deleted as nodes');
      const parent = doc.container(node.parentId!);
      const index = parent.children.indexOf(op.id);
      const subtree = [...doc.walk(op.id)];
      const restore: InsertOp[] = subtree.map((n) => {
        const p = doc.require(n.parentId!);
        const at = n.id === op.id ? index : (isContainer(p) ? p.children.indexOf(n.id) : 0);
        return { op: 'insert', node: structuredClone(n), parentId: n.parentId!, index: at };
      });
      parent.children.splice(index, 1);
      for (const n of subtree) doc.nodes.delete(n.id);
      touched.add(parent.id);
      // Inverse ops are applied in order: parents first, then children at their original index.
      return restore;
    }
  }
}

const isContainerType = (t: unknown) => t === 'frame' || t === 'group' || t === 'page';
const clampIndex = (i: number | undefined, len: number) => (i === undefined ? len : Math.max(0, Math.min(len, i)));
