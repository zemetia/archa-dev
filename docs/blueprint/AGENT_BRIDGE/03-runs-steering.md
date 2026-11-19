# Agent Bridge — 03: Runs and Steering

← [AGENT_BRIDGE.md](../AGENT_BRIDGE.md) | [Blueprint INDEX](../INDEX.md) | [04 — Review loop →](./04-review-loop.md)

**Phase:** 6. Code: `packages/agents/src/runs/`.

---

## Run Record

```ts
type Run = {
  id: RunId; agent: string; profileId: string; model?: string;
  docId: DocId; projectDir?: string;
  status: 'queued' | 'running' | 'awaiting_operator' | 'paused' | 'finished' | 'failed' | 'cancelled';
  workdir: string; branch?: string; sessionId?: string;
  prompt: string; events: AgentEvent[]; turns: number;
  startedAt: number; endedAt?: number;
  result?: { summary: string; transactions: TxnId[]; codeDiffStat?: string; screenshots: AssetHash[] };
};
```

Persisted in `.archadev/runs/<id>.json` (gitignored) so runs survive an app restart.

---

## Lifecycle

```
queued → running ⇄ awaiting_operator → finished
            │  └─► paused (interrupt) ─► running (continue / new instruction) │ finished (finish)
            └─► failed / cancelled
```

| Step | Detail |
|---|---|
| Prompt | Request + pre-fetched `get_state` + selection + round attachments + instruction to use the ArchaDev MCP tools |
| Spawn | Adapter `build()`; `archa mcp --run <id>` registered for that process |
| Stream | Each stdout line → parser → `agent.event` broadcast + stored |
| Turn timeout | Default 30 min per turn (not per run) |
| End | Final text → summary; status `finished`; result shown for Accept / Reject / Continue |

---

## Workdir Isolation

| Situation | Workdir |
|---|---|
| Project is a git repo | `git worktree add <data>/worktrees/run-<id> -b archadev/run-<id>`; changes committed there on finish; worktree removed; no changes → no branch |
| Folder holds several git repos | Workspace dir with one worktree per repo side by side (Gungnir multi-repo) |
| Not a repo | In place; one run at a time per project |
| Standalone file | Empty temp dir; document access only through MCP |

Design changes are transactions in the live document (author = run), so they are visible immediately and undoable as a group. Code changes stay on the run branch until accepted.

---

## Parallelism

Per agent, up to `maxParallel` (default 3) concurrent runs. Paused runs free their slot. Queue is FIFO per agent.

**Built (0.2.5):** chat runs are parallel per **thread**, not per document — several sessions design on the same canvas at once; only a second turn in a thread that is still working is refused. Each thread works in `ARCHA_HOME/runtime/threads/<threadId>/` (its MCP config + mirrored skills), so runs never share files. `maxParallel` / queueing is not built yet.

---

## Sessions (built, 0.2.5)

| Rule | Detail |
|---|---|
| Name | Every thread gets a random two-word name (`personas.ts`, e.g. "Swift Heron") on its first turn and keeps it (stored as `persona` on each `ChatMessage`). Agents never appear as "claude" / "agy" on the canvas |
| Identity | The run's `archa mcp` sends `runId`; the core makes its author `{ kind: 'agent', id: '<agent>:<threadId>', name: <persona> }`. A terminal (listen-mode) agent gets its own name per connection |
| Colour | `personaColor(name)` → slot 0-7 → `--color-persona-N`. A new name prefers a slot no active session uses. Same colour for the cursor, chat label and History row |
| Trail | Every tool call that touches nodes broadcasts `agent.trail` `{ author, runId?, threadId?, steps: [{ action, nodeId, name, bounds }] }`. `execute` records each API call in order (`create`, `edit`, `move`, `delete`, `copy`, `read`, `focus`, `look`), bounds from the final layout, ≤ 40 steps |
| Cursor | The canvas plays each session's trail: the cursor glides step to step, outlines the target, tags "<name> · <Verb> <node>", and leaves a dashed path → [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| UI | Chat header shows the thread's session; other sessions working on the doc appear as chips that open their thread; History rows show name + "working" |

---

## Steering

| Control | Effect |
|---|---|
| Message (default) | Queued; delivered when the current turn ends via `buildResume(sessionId, message)` |
| **Send now** | Stop the current turn (kill process tree), deliver message by resume |
| **Interrupt** | Stop the turn → `paused` |
| **Continue** | Resume with "continue" |
| **Finish** | End the run; commit changes as usual |
| Idle pause | Auto-finish after 30 min in `paused` |

No session id seen yet → new session with the original task + previous output. On Windows, stopping kills the whole process tree (`taskkill /T /F` via argv).

**Built (0.3.x) — warm sessions** (`core-host/agents.ts`, plan [CHAT_AGENT](../../plan/CHAT_AGENT.md), D-11 A):

| Rule | Detail |
|---|---|
| Process | An adapter with `warm` (Claude, agy) keeps **one CLI process per thread**, fed one NDJSON message per turn (`--input-format stream-json`). Codex stays one process per turn (`exec resume`) |
| Turn end | Parser emits `{ kind: 'turn', ok, costUsd? }` (Claude `result`, agy `event: result`) → status `Done in N s · $x` |
| Pre-warm | `chat.warm` on composer focus spawns the process (no thread yet → a thread id is reserved and returned) |
| Identity | `ARCHA_RUN_ID` = the process id, so its `archa mcp` keeps the thread's session name across turns |
| Queue | A message to a working thread is queued (`queued: true`); `now: true` stops the turn first. The queue drains in order when a turn ends |
| Stop | Claude: `control_request` interrupt keeps the process; no answer in 5 s (or agy) → kill tree |
| Lifetime | Idle 10 min → closed; max 6 processes (least recently used idle first); settings change (model, account, MCP servers, skills) → new process resuming the session; app exit kills all |

---

## Accept / Reject

| Action | Design | Code |
|---|---|---|
| Accept | Keep transactions | Merge `archadev/run-<id>` (fast-forward or merge commit; conflicts shown) |
| Reject | Undo the run's transactions as one | Delete branch |
| Continue | New turn with a message | — |

Failover: `rate_limited` event → offer next profile/agent (auto if setting on), carrying the conversation summary.

---

## Chat History (built, 0.2.1)

| Rule | Detail |
|---|---|
| Thread | Every `chat.send` carries `threadId` (none = new thread, returned in the result). The CLI session resumes per `threadId:agent:login`, so New chat starts fresh |
| Storage | `ARCHA_HOME/chats/<docId>.jsonl` (one `ChatMessage` per line) + `chats/sessions.json` (session ids). Best-effort, derivable: deleting it loses history only |
| Reopen | Activating a document reopens its most recent thread |
| Delete | `chat.deleteThread` rewrites the file; refused while that thread runs |
