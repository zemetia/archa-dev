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
| `ARCHA_RUN_ID` / `--run <runId>` (launched by the app) | That run's thread session: author name = the thread's random name, id `<agent>:<threadId>` |
| No run | Listen-mode agent: its own random session name per connection |

Identity is the transaction `author` and appears on every activity entry and `agent.trail` event. The CLI name ("claude", "agy") is never shown as the author → [AGENT_BRIDGE/03 → Sessions](../AGENT_BRIDGE/03-runs-steering.md).

---

## Tool List

| Tool | Input (summary) | Purpose |
|---|---|---|
| `get_state` | `{ doc? }` | Active doc/page, selection, top-level frames (max 30 + "N more"), components id→name, variables summary, pending comments/decisions, issues count |
| `execute` | `{ code, doc? } \| { editId, edits: [{find, replace}], doc? }` | Run a snippet as one transaction → [02](./02-execute-api.md) |
| `screenshot` | `{ node, scale?, slices?, doc? }` | Full-size PNG (no cap) + its temporary file path; tall nodes inline as labelled JPEG slices; or `unchanged` → [RENDERING/03](../RENDERING/03-export.md) |
| `reference` | `{ path, page?, images?, doc? }` | **Built:** read a PDF page / image mockup into numbers → [05](./05-reference-compare.md) |
| `compare` | `{ node, reference, page?, scale?, doc? }` | **Built:** visual diff + worst regions with the nodes under them → [05](./05-reference-compare.md) |
| `list_documents` / `open_document` / `new_document` / `save_document` | `{}` / `{ path }` / `{ name? }` / `{ doc?, path? }` | **Built:** open documents with id, file and asset folder; open, create, save (Save As copies the asset folder) |
| `export` | `{ nodeId?, format, options? }` | png/jpeg/webp/svg/pdf/html/react/tokens; returns path or content |
| `get_style` | `{ name?, params? }` | Style profiles, two-step load → [DESIGN_SYSTEM/03](../DESIGN_SYSTEM/03-style-profiles.md) |
| `read_guide` | `{ topic }` | **Built:** compiled-in guides (`@archa/protocol` `design-guides.ts`: process, layout, taste, type-color, components, icons, landing, web-app, mobile). Chat runs also get the matching guides on their first turn. Target: `skills/archadev/references/**` |
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
| 1 | A tool acts on the document named by its `doc` argument (id, `.archa` path or unique name — `Workspace.session(ref)`); without it, on `--doc` / `ARCHA_DOC_ID`, else the active document. An unknown `doc` fails with the list of open documents. **Built:** `get_state`, `execute`, `screenshot`, `export_svg`, `say`, `reference`, `compare`, `save_document` |
| 6 | A reply stays under 6 MB of inline data (`INLINE_BUDGET`): MCP stdio clients drop messages over 10 MB and close the connection. Slices that do not fit are counted, never silently dropped |
| 2 | Inputs validated by zod; validation errors follow the reply contract (they steer, not just fail) |
| 3 | Pre-injection: launched runs receive `get_state` output in the first prompt, marked fresh |
| 4 | Blocking tools (`review_wait`, `ask`, `variants`) send MCP progress notifications every 30 s so clients do not time out |
| 5 | Every call → `activity.jsonl` with author, tool, duration, node ids touched |
