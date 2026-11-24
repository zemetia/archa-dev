import { commentSchema, isContainer, nodeSchema, variableSchema, type Node, type Op, type InsertOp } from '@archa/schema';
import { ArchaDocument, DocumentError } from './document';
import { runLayout } from './layout';
import { boundTo, brokenBindings, resolveBindings } from './bindings';
import { remapSpans } from './text';
import { trackOverrides } from './components';
import { fitGroups } from './fit';

const IMMUTABLE_KEYS = new Set(['id', 'type', 'parentId', 'children']);

export type ApplyResult = { inverse: Op[]; touched: Set<string> };

/**
 * Applies ops atomically: either every op applies or the document is restored.
 * Returns inverse ops (in apply order) for undo. Layout runs at the end, then groups fit their
 * children (recorded in the inverse) and layout runs again for the parents of groups that changed.
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
    // A fitted group can resize a hugging parent, which can move an outer group's child: settle, bounded.
    for (let pass = 0; pass < 4; pass++) {
      const fitted = fitGroups(doc, touched);
      if (!fitted.length) break;
      inverse.unshift(...fitted);
      runLayout(doc);
    }
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
  // Say what was sent: the agent fixes the value in one patch instead of guessing.
  const got = issue?.path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<PropertyKey, unknown>)[k as PropertyKey] : undefined), raw);
  const sent = got === undefined ? '' : ` (got ${JSON.stringify(got)?.slice(0, 60)})`;
  throw new DocumentError('VALIDATION', `"${name}".${path} — ${issue?.message ?? 'invalid'}${sent}`, { path, issues: r.error.issues });
}

function applyOne(doc: ArchaDocument, op: Op, touched: Set<string>): Op[] {
  switch (op.op) {
    case 'insert': {
      const raw = { ...op.node, parentId: op.parentId, children: isContainerType(op.node.type) ? [] : undefined };
      let node = parseNode(raw);
      if (node.bindings) node = parseNode(resolveBindings(doc, node));
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
      const patch = { ...op.patch };
      // Rich text: spans stay on the same characters when only the text changes.
      if (prev.type === 'text' && typeof patch.text === 'string' && !('spans' in patch) && prev.spans.length) patch.spans = remapSpans(prev.text, patch.text, prev.spans);
      Object.assign(patch, trackOverrides(doc, prev, patch));
      let next = parseNode({ ...prev, ...patch });
      // A bound property edited to another value is an override: it leaves its token.
      if (!('bindings' in patch)) {
        const broken = brokenBindings(doc, next, Object.keys(patch));
        if (broken.length) {
          const b = { ...next.bindings };
          for (const path of broken) delete b[path];
          next = parseNode({ ...next, bindings: Object.keys(b).length ? b : undefined });
        }
      }
      if (next.bindings) next = parseNode(resolveBindings(doc, next));
      doc.nodes.set(op.id, next);
      touched.add(op.id);
      return [{ op: 'update', id: op.id, patch: changedKeys(prev, next) }];
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
    case 'setVariable': {
      const v = variableSchema.parse(op.variable);
      const clash = [...doc.variables.values()].find((x) => x.name === v.name && x.id !== v.id);
      if (clash) throw new DocumentError('VALIDATION', `variable "${v.name}" already exists`);
      const prev = doc.variables.get(v.id);
      doc.variables.set(v.id, v);
      touched.add(`variable:${v.id}`);
      // Every node bound to the token takes its new value in the same transaction.
      const restore: Op[] = [];
      for (const n of boundTo(doc, v.id)) {
        const next = parseNode(resolveBindings(doc, n));
        if (next === n) continue;
        restore.push({ op: 'update', id: n.id, patch: changedKeys(n, next) });
        doc.nodes.set(n.id, next);
        touched.add(n.id);
      }
      return [prev ? { op: 'setVariable', variable: prev } : { op: 'deleteVariable', id: v.id }, ...restore];
    }
    case 'deleteVariable': {
      const prev = doc.variables.get(op.id);
      if (!prev) throw new DocumentError('NOT_FOUND', `Variable "${op.id}" does not exist`);
      doc.variables.delete(op.id);
      touched.add(`variable:${op.id}`);
      return [{ op: 'setVariable', variable: prev }];
    }
    case 'setComment': {
      const c = commentSchema.parse(op.comment);
      const prev = doc.comments.get(c.id);
      doc.comments.set(c.id, c);
      touched.add(`comment:${c.id}`);
      return [prev ? { op: 'setComment', comment: prev } : { op: 'deleteComment', id: c.id }];
    }
    case 'deleteComment': {
      const prev = doc.comments.get(op.id);
      if (!prev) throw new DocumentError('NOT_FOUND', `Comment "${op.id}" does not exist`);
      doc.comments.delete(op.id);
      touched.add(`comment:${op.id}`);
      return [{ op: 'setComment', comment: prev }];
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

/** The previous values of every property that differs (the inverse patch of an update). */
function changedKeys(prev: Node, next: Node): Record<string, unknown> {
  const before: Record<string, unknown> = {};
  const a = prev as Record<string, unknown>, b = next as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] === b[k] || (typeof a[k] === 'object' && JSON.stringify(a[k]) === JSON.stringify(b[k]))) continue;
    before[k] = structuredClone(a[k]);
  }
  return before;
}

const isContainerType = (t: unknown) => t === 'frame' || t === 'group' || t === 'page';
const clampIndex = (i: number | undefined, len: number) => (i === undefined ? len : Math.max(0, Math.min(len, i)));
