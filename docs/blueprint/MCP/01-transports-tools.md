# MCP — 01: Transports and Tools

← [MCP.md](../MCP.md) | [Blueprint INDEX](../INDEX.md) | [02 — execute API →](./02-execute-api.md)

**Phase:** 5. Code: `packages/mcp/src/server.ts`, `packages/mcp/src/tools/`, `apps/cli/src/commands/mcp.ts`.

---

## Transports

| Transport | Start | Scope |
|---|---|---|
| stdio | `archa mcp [--project <dir> \| --file <path>] [--run <runId>]` | Spawned by the agent; cwd project by default |
| Streamable HTTP | App setting or `ARCHA_MCP_HTTP_PORT`; binds `127.0.0.1` only; bearer token from `runtime/core.json` | Off by default |

`archa mcp` is a relay: running app → forwards to its core (the person sees the agent live); no app → headless core in-process → [ARCHITECTURE/03](../ARCHITECTURE/03-startup-lifecycle.md).

---

## Client Identity

| Source | Identity |
|---|---|
| `--run <runId>` (launched by the app) | That run's agent + profile; cursor colour from the agent |
| MCP `initialize.clientInfo.name` | Listen-mode agent ("claude-code", "codex"…) |
| Neither | `unknown-agent` |

Identity is the transaction `author` and appears on every activity entry.

---

## Tool List

| Tool | Input (summary) | Purpose |
|---|---|---|
| `get_state` | `{ docId? }` | Active doc/page, selection, top-level frames (max 30 + "N more"), components id→name, variables summary, pending comments/decisions, issues count |
| `execute` | `{ code } \| { editId, edits: [{find, replace}] }` | Run a snippet as one transaction → [02](./02-execute-api.md) |
| `screenshot` | `{ nodeId, scale? }` | Image or `unchanged` → [RENDERING/03](../RENDERING/03-export.md) |
| `export` | `{ nodeId?, format, options? }` | png/jpeg/webp/svg/pdf/html/react/tokens; returns path or content |
| `get_style` | `{ name?, params? }` | Style profiles, two-step load → [DESIGN_SYSTEM/03](../DESIGN_SYSTEM/03-style-profiles.md) |
| `read_guide` | `{ topic }` | Serves `skills/archadev/references/**` for agents without skill support |
| `comments` | `{ action: list\|reply\|resolve, … }` | Comment threads |
| `review_wait` | `{ timeoutSec? }` | Block until a round is sent → [AGENT_BRIDGE/04](../AGENT_BRIDGE/04-review-loop.md) |
| `review_done` | `{ roundId, summary }` | Close a round |
| `ask` | `{ question, options[] }` | Block until the person answers |
| `variants` | `{ nodeId, takes: [{ label, code }] }` | Build takes on forks; block until one is chosen |
| `say` | `{ text, nodeId? }` | One-line status in Activity, moves the agent cursor |
| `library` | `{ action: list\|import\|remove, … }` | Component libraries |
| `plugin_<id>_<tool>` | Plugin-defined | Added by enabled plugins → [PLUGINS/01](../PLUGINS/01-manifest-capabilities.md) |

---

## Rules

| # | Rule |
|---|---|
| 1 | A tool acts only on the project/file the server was started for |
| 2 | Inputs validated by zod; validation errors follow the reply contract (they steer, not just fail) |
| 3 | Pre-injection: launched runs receive `get_state` output in the first prompt, marked fresh |
| 4 | Blocking tools (`review_wait`, `ask`, `variants`) send MCP progress notifications every 30 s so clients do not time out |
| 5 | Every call → `activity.jsonl` with author, tool, duration, node ids touched |
