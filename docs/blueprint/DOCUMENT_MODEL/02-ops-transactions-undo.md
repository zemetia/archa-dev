# Document Model — 02: Ops, Transactions, Undo

← [DOCUMENT_MODEL.md](../DOCUMENT_MODEL.md) | [Blueprint INDEX](../INDEX.md) | [03 — Layout →](./03-layout.md)

**Phase:** 1. Code: `packages/schema/src/ops.ts`, `packages/core/src/ops/`.

---

## Op Kinds

| Op | Shape | Inverse |
|---|---|---|
| `insert` | `{ node, parentId, index }` | `delete` |
| `update` | `{ id, patch: Partial<Props> }` | `update` with previous values |
| `move` | `{ id, parentId, index }` | `move` back |
| `delete` | `{ id }` (subtree) | `insert` of the saved subtree |
| `reorder` | `{ id, index }` | `reorder` back |
| `setVariable` / `deleteVariable` | `{ variable }` upsert by id / `{ id }`; names unique | previous variable / delete |
| `createComponent` | `{ fromId }` | `detachComponent` |
| `setOverride` | `{ instanceId, path, patch }` | previous override |
| `asset.add` | `{ hash, mime }` | no-op (assets are ref-counted) |
| `setComment` / `deleteComment` | `{ comment }` whole thread, upsert by id / `{ id }` | previous thread / delete |

Child order uses **fractional indexing** keys internally; `index` in ops is converted on apply.

---

## Transactions

```ts
type Transaction = {
  id: TxnId;
  author: Author;               // { kind: 'user' | 'agent' | 'plugin' | 'system', id, runId? }
  label: string;                // "Move 3 layers", shown in history/undo
  baseRevision: number;
  ops: Op[];
};
```

| Rule | Detail |
|---|---|
| Atomic | All ops validate and apply, or none do. Validation failure → `VALIDATION` error naming op index + property path |
| One bump | A transaction bumps `revision` by exactly one |
| Hooks | After apply: hashes → layout → indexes → lint (agents) → broadcast → journal |
| Size | No hard cap; > 10k ops logs a warning (likely a missing visitor) |
| Coalescing | Continuous gestures (drag, slider) coalesce into one transaction on pointer-up |

---

## Undo / Redo

- Stacks are **per author** (`user` per window, each agent run, each plugin). Ctrl+Z in a window only undoes that user's transactions.
- An undo is itself a new transaction (author = same user, label `Undo: <label>`) built from stored inverse ops.
- If an inverse conflicts with later ops by another author (node deleted, property changed since), the undo applies the parts that still make sense and reports the skipped parts in a toast.
- Accepting/rejecting an agent run uses the run's stack: **Reject** = undo all of the run's transactions as one.

---

## Op Log

| Store | Content | Lifetime |
|---|---|---|
| Memory | Last 1000 transactions per doc + inverse ops | Session |
| `journal/<docId>.jsonl` | Every transaction since last save | Until save |
| Index `(nodeId, prop) → lastRevision` | For rebase checks → [ARCHITECTURE/04](../ARCHITECTURE/04-single-writer-sync.md) | Session |
| `activity.jsonl` | Summary per transaction (author, label, node ids) | Persistent |
