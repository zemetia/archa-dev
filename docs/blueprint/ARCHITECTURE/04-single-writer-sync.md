# Architecture — 04: Single Writer and Sync

← [ARCHITECTURE.md](../ARCHITECTURE.md) | [Blueprint INDEX](../INDEX.md)

**Phase:** 1 (revisions), 2 (broadcast), 4 (lock).

---

## The Rule

Only the core host applies ops and writes a document to disk. This exists because Accent lost canvas markup when two browser tabs each autosaved their own copy (last writer won).

---

## Revision Flow

```
client                         core host                          other clients
  │ applyTransaction(base=41)    │                                     │
  ├─────────────────────────────►│ doc.revision == 41 → apply          │
  │                              │ revision = 42, journal, hashes      │
  │◄──── { revision: 42 } ───────┤──── ops.applied(rev 42) ───────────►│
```

If `baseRevision < doc.revision`:

| Case | Action |
|---|---|
| Ops touch nodes/properties not changed since `baseRevision` | **Rebase**: apply as-is, return new revision |
| Ops conflict (same node+property changed, or target node deleted) | Reject with `STALE_REVISION` + the ops the client missed; client folds them in and retries |
| `execute` transaction from an agent | Re-run the snippet against the new state once; if it fails, normal error reply |

Rebase check uses the op log index `(nodeId, property) → lastRevision`.

---

## Optimistic UI

The renderer applies its own ops to a **view model** immediately for latency, tagged `pending`. On the core's ack it confirms; on reject it rolls back and applies the core's ops. The view model is never persisted.

---

## Multiple Windows / Clients

- Every subscriber gets `ops.applied` in revision order; a gap triggers `document.sync(fromRevision)`.
- Undo is per author (see [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md)), so one window's undo never reverts another author's work.

---

## Core Lock

| File | Content | Purpose |
|---|---|---|
| `<project>/.archadev/runtime/core.lock` | `{ pid, socket, startedAt, kind: 'app' \| 'headless' }` | One writer per project |
| `~/.archadev/runtime/core.json` | `{ pid, socket, token }` | Clients find the running app |

Second core on the same project → becomes a client of the first (or requests handover if the first is headless and the second is the app).

---

## Future: multiplayer

Ops are per-node, per-property last-writer-wins with fractional indexing for child order — compatible with a CRDT transport (Yjs / Loro) later. Do not add features that need a global lock on the whole document.
