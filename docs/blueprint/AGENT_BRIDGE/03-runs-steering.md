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

---

## Accept / Reject

| Action | Design | Code |
|---|---|---|
| Accept | Keep transactions | Merge `archadev/run-<id>` (fast-forward or merge commit; conflicts shown) |
| Reject | Undo the run's transactions as one | Delete branch |
| Continue | New turn with a message | — |

Failover: `rate_limited` event → offer next profile/agent (auto if setting on), carrying the conversation summary.
