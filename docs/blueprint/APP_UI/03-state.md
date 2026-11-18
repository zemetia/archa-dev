# App UI — 03: State

← [APP_UI.md](../APP_UI.md) | [Blueprint INDEX](../INDEX.md)

**Phase:** 2. Code: `apps/desktop/src/renderer/stores/`, `apps/desktop/src/renderer/lib/core/`.

---

## Where State Lives

| State | Owner | Access in renderer |
|---|---|---|
| Document (nodes, variables, components, comments) | **Core host** | `useDoc(selector)` over the view model fed by `ops.applied` |
| Pending optimistic ops | Renderer view model | Internal to `lib/core/viewModel.ts` |
| Selection | Renderer, per window (shared to core for agents via `selection.set`) | `useSelection()` Zustand |
| Viewport (zoom, scroll), active tool, panel sizes, collapsed tree rows | Renderer Zustand | `useViewStore` |
| Agent runs, decisions, activity | Core host | `useRuns()`, `useDecisions()` (event-fed) |
| Settings | `~/.archadev/config.json` via core RPC | `useSettings()` |
| Agent accounts (login profiles) | **Core host** (`~/.archadev/profiles/`) | `accounts` in the store, re-read from `accounts.overview` on `accounts.changed` ([AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md)) |
| Settings dialog open | Renderer Zustand (`settingsOpen`) | — |
| Remembered UI (last tab, panel widths) | Zustand `persist` → localStorage | — |

---

## Decision Tree

```
Is it saved in a file or visible to agents/other windows?
 ├─ yes → core host. Read via hooks; change via RPC/ops. Never copy into Zustand.
 └─ no  → is it shared across components?
           ├─ yes → Zustand view store (stores/<domain>.store.ts)
           └─ no  → component state (useState)
```

---

## View Model

```ts
// lib/core/viewModel.ts
class ViewModel {
  apply(event: OpsApplied): void;            // confirmed ops in revision order
  applyPending(txn: Transaction): void;      // optimistic
  confirm(txnId: TxnId, revision: number): void;
  rollback(txnId: TxnId): void;
  subscribe(selector, listener): Unsubscribe;
}
```

`useDoc` uses `useSyncExternalStore` over the view model — no `setState` inside `useEffect` to mirror core state.

---

## Zustand Store Template

```ts
// stores/view.store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

type ViewState = { zoom: number; tool: ToolId; setTool: (t: ToolId) => void };

export const useViewStore = create<ViewState>()(
  devtools((set) => ({ zoom: 1, tool: 'select', setTool: (tool) => set({ tool }) }), { name: 'view' }),
);
```

Add to `stores/index.ts`. One store per domain; no store imports another store.

---

## Rules

| # | Rule |
|---|---|
| 1 | Never duplicate document data in Zustand |
| 2 | Hot paths (pointer move) do not go through React state — tools write to refs/overlay canvas |
| 3 | Selectors return stable references; use `shallow` for object picks |
| 4 | localStorage access wrapped in try/catch; app must work without it |
