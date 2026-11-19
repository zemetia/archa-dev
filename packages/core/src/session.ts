import { newId, type Author, type DocumentData, type Op, type Transaction } from '@archa/schema';
import { applyOps } from './apply';
import { ArchaDocument, DocumentError } from './document';
import { runLayout } from './layout';

type HistoryEntry = { txnId: string; label: string; ops: Op[]; inverse: Op[] };

export type Applied = {
  docId: string;
  revision: number;
  txnId: string;
  author: Author;
  label: string;
  ops: Op[];
  touched: string[];
};

export type SessionListener = (applied: Applied) => void;

/**
 * Owns one document: revisions, per-author undo, change listeners.
 * Only the core host holds sessions that write to disk (blueprint ARCHITECTURE/04).
 */
export class DocumentSession {
  readonly doc: ArchaDocument;
  filePath: string | null;
  dirty = false;
  private undoStacks = new Map<string, HistoryEntry[]>();
  private redoStacks = new Map<string, HistoryEntry[]>();
  private listeners = new Set<SessionListener>();
  /** (nodeId) → revision of the last change, for rebasing stale transactions. */
  private lastChanged = new Map<string, number>();

  constructor(data: DocumentData | ArchaDocument, filePath: string | null = null) {
    this.doc = data instanceof ArchaDocument ? data : new ArchaDocument(data);
    runLayout(this.doc);
    this.filePath = filePath;
  }

  get id() { return this.doc.meta.id; }
  get revision() { return this.doc.revision; }

  onApplied(fn: SessionListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  apply(txn: Omit<Transaction, 'id'> & { id?: string }, opts: { recordUndo?: boolean } = {}): Applied {
    if (txn.baseRevision > this.doc.revision) throw new DocumentError('STALE_REVISION', `baseRevision ${txn.baseRevision} is ahead of ${this.doc.revision}`);
    if (txn.baseRevision < this.doc.revision) this.assertRebaseable(txn);
    const { inverse, touched } = applyOps(this.doc, txn.ops);
    const txnId = txn.id ?? newId();
    this.doc.revision += 1;
    for (const id of touched) this.lastChanged.set(id, this.doc.revision);
    if (opts.recordUndo !== false && txn.ops.length) {
      const key = authorKey(txn.author);
      const stack = this.undoStacks.get(key) ?? [];
      stack.push({ txnId, label: txn.label, ops: txn.ops, inverse });
      if (stack.length > 500) stack.shift();
      this.undoStacks.set(key, stack);
      this.redoStacks.delete(key);
    }
    this.dirty = true;
    const applied: Applied = { docId: this.id, revision: this.doc.revision, txnId, author: txn.author, label: txn.label, ops: txn.ops, touched: [...touched] };
    for (const l of this.listeners) l(applied);
    return applied;
  }

  canUndo(author: Author) { return (this.undoStacks.get(authorKey(author))?.length ?? 0) > 0; }
  canRedo(author: Author) { return (this.redoStacks.get(authorKey(author))?.length ?? 0) > 0; }

  undo(author: Author): Applied | null {
    const key = authorKey(author);
    const entry = this.undoStacks.get(key)?.pop();
    if (!entry) return null;
    const applied = this.apply({ author, label: `Undo: ${entry.label}`, baseRevision: this.doc.revision, ops: entry.inverse }, { recordUndo: false });
    (this.redoStacks.get(key) ?? this.redoStacks.set(key, []).get(key)!).push(entry);
    return applied;
  }

  redo(author: Author): Applied | null {
    const key = authorKey(author);
    const entry = this.redoStacks.get(key)?.pop();
    if (!entry) return null;
    const applied = this.apply({ author, label: `Redo: ${entry.label}`, baseRevision: this.doc.revision, ops: entry.ops }, { recordUndo: false });
    this.undoStacks.get(key)?.push(entry);
    return applied;
  }

  /** Undo every transaction of one author (e.g. rejecting an agent run). */
  undoAll(author: Author): void {
    while (this.canUndo(author)) this.undo(author);
  }

  /** Rebase rule: a stale transaction is accepted when none of the nodes it touches changed since its base. */
  private assertRebaseable(txn: Omit<Transaction, 'id'>) {
    for (const op of txn.ops) {
      const id = op.op === 'insert' ? op.parentId
        : op.op === 'setVariable' ? `variable:${op.variable.id}`
        : op.op === 'deleteVariable' ? `variable:${op.id}`
        : op.op === 'setComment' ? `comment:${op.comment.id}`
        : op.op === 'deleteComment' ? `comment:${op.id}`
        : op.id;
      const changed = this.lastChanged.get(id) ?? 0;
      if (changed > txn.baseRevision && op.op !== 'insert') {
        throw new DocumentError('STALE_REVISION', `"${id}" changed at revision ${changed}, after base ${txn.baseRevision}`);
      }
    }
  }
}

const authorKey = (a: Author) => `${a.kind}:${a.id}`;
