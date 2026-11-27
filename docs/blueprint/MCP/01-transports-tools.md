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
| `place_svg` | `{ svg, parent?, x?, y?, width?, height?, name?, mode? }` | **Built 1.4:** SVG the agent wrote, placed as a drawing. Runs `svg(…)` through `agent.execute` (same reply contract); the markup is a plain argument, no escaping in JS → [02](./02-execute-api.md) |
| `inspect` | `{ node?, depth? }` | **Built 0.5:** compact outline (core `outline.ts`) of a node, else the selection, else the page: sizes, sizing, auto layout, paints, effects, text, context notes. RPC `agent.outline` |
| `screenshot` | `{ node, scale?, slices?, doc? }` | Full-size PNG (no cap) + its temporary file path; tall nodes inline as labelled JPEG slices; or `unchanged` → [RENDERING/03](../RENDERING/03-export.md) |
| `export_svg` | `{ node, doc? }` | **Built:** SVG of a node subtree (`agent.exportSvg`, `packages/formats/src/svg.ts`) |
| `browser` | `{ action, … }` | **Built:** drive the in-app browser (incl. `search`, `images`, `download`) → [BROWSER](../BROWSER.md) |
| `place_image` | `{ url \| ref \| selector, capture?, parent?, x?, y?, width?, height?, fit?, cornerRadius?, name?, path? }` | **Built 1.5:** a real picture onto the canvas. RPC `agent.placeImage` downloads it through the browser bridge, then `AgentExecutor.placeImage` inserts an image node (same reply contract) → [BROWSER](../BROWSER.md#images) |
| `reference` | `{ path, page?, images?, doc? }` | **Built:** read a PDF page / image mockup into numbers → [05](./05-reference-compare.md) |
| `compare` | `{ node, reference, page?, scale?, doc? }` | **Built:** visual diff + worst regions with the nodes under them → [05](./05-reference-compare.md) |
| `read_skill` | `{ name, file?, doc? }` | **Built:** a skill's `SKILL.md` + file list, or one text file of it → [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| `remember` / `forget` / `recall` | `{ text, scope, name?, replaces?, doc? }` / `{ id, doc? }` / `{ doc? }` | **Built:** agent memory, global or per document → [AGENT_BRIDGE/07](../AGENT_BRIDGE/07-memory.md) |
| `list_documents` / `open_document` / `new_document` / `save_document` | `{}` / `{ path }` / `{ name? }` / `{ doc?, path? }` | **Built:** open documents with id, file and asset folder; open, create, save (Save As copies the asset folder) |
| `export` | `{ nodeId?, format, options? }` | png/jpeg/webp/svg/pdf/html/react/tokens; returns path or content |
| `get_style` | `{ name?, params? }` | Style profiles, two-step load → [DESIGN_SYSTEM/03](../DESIGN_SYSTEM/03-style-profiles.md) |
| `read_guide` | `{ topic }` | **Built:** compiled-in guides (`@archa/protocol` `design-guides.ts`: process, layout, taste, type-color, components, icons, svg, social, landing, web-app, mobile). Chat runs also get the matching guides on their first turn; a social request (Instagram, feed, carousel, 4:5…) gets `social` instead of landing / web-app / mobile. Target: `skills/archadev/references/**` |
| `comments` | `{ action: list\|reply\|resolve, … }` | Comment threads |
| `review_wait` | `{ timeoutSec? }` | Block until a round is sent → [AGENT_BRIDGE/04](../AGENT_BRIDGE/04-review-loop.md) |
| `review_done` | `{ roundId, summary }` | Close a round |
| `ask` | `{ question, options[] }` | Block until the person answers |
| `variants` | `{ nodeId, takes: [{ label, code }] }` | Build takes on forks; block until one is chosen |
| `say` | `{ text, nodeId? }` | One-line status in Activity, moves the agent cursor |
| `done` | `{ summary? }` | **Built 1.5:** call once when finished; RPC `agent.done` logs it and broadcasts `agent.done` so the canvas puts the agent's cursor away → [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| `library` | `{ action: list\|import\|remove, … }` | Component libraries |
| `delegate` / `wait_workers` / `tell_worker` | `{ tasks[] }` / `{ workers?, timeoutSec? }` / `{ worker, message }` | **Built:** orchestrate-mode team tools, lead threads only → [AGENT_BRIDGE/06](../AGENT_BRIDGE/06-orchestrate.md) |
| `plugin_<id>_<tool>` | Plugin-defined | Added by enabled plugins → [PLUGINS/01](../PLUGINS/01-manifest-capabilities.md) |

---

## Rules

| # | Rule |
|---|---|
| 1 | A tool acts on the document named by its `doc` argument (id, `.archa` path or unique name — `HostContext.session(ref)`); without it, on `--doc` / `ARCHA_DOC_ID`, else the active document. An unknown `doc` fails with the list of open documents. **Built:** `get_state`, `execute`, `screenshot`, `export_svg`, `say`, `reference`, `compare`, `save_document` |
| 6 | A reply stays under 6 MB of inline data (`INLINE_BUDGET`): MCP stdio clients drop messages over 10 MB and close the connection. Slices that do not fit are counted, never silently dropped |
| 2 | Inputs validated by zod; validation errors follow the reply contract (they steer, not just fail) |
| 3 | Pre-injection: launched runs receive `get_state` output in the first prompt, marked fresh |
| 4 | Blocking tools (`review_wait`, `ask`, `variants`) send MCP progress notifications every 30 s so clients do not time out |
| 5 | Every call → `activity.jsonl` with author, tool, duration, node ids touched |
| 7 | `archa mcp --agent agy` lists its tools inside Gemini's schema subset (`sanitizeGeminiSchema`, [`packages/protocol/src/gemini-schema.ts`](../../../packages/protocol/src/gemini-schema.ts)): no `$schema` / `additionalProperties` / `propertyNames`, `exclusiveMinimum` → `minimum`, arrays always typed `items`. Other agents get the full zod schemas; inputs are validated by zod either way → [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) · [CLI/01](../CLI/01-commands.md) · [PLUGINS/01](../PLUGINS/01-manifest-capabilities.md)

**Code:** [`apps/cli/src/mcp.ts`](../../../apps/cli/src/mcp.ts) · [`apps/desktop/src/renderer/ui/settings/OtherPages.tsx`](../../../apps/desktop/src/renderer/ui/settings/OtherPages.tsx) · [`apps/desktop/test/assets.test.ts`](../../../apps/desktop/test/assets.test.ts) · [`packages/agents/src/mcp-servers.ts`](../../../packages/agents/src/mcp-servers.ts) · [`packages/core/src/outline.ts`](../../../packages/core/src/outline.ts) · [`packages/host/src/context.ts`](../../../packages/host/src/context.ts) · [`packages/host/src/domains/agent-tools.ts`](../../../packages/host/src/domains/agent-tools.ts) · [`packages/mcp/src/execute.ts`](../../../packages/mcp/src/execute.ts) · [`packages/mcp/src/server.ts`](../../../packages/mcp/src/server.ts) · [`packages/mcp/src/tool-host.ts`](../../../packages/mcp/src/tool-host.ts) · [`packages/protocol/src/design-guides.ts`](../../../packages/protocol/src/design-guides.ts) · [`packages/protocol/src/gemini-schema.ts`](../../../packages/protocol/src/gemini-schema.ts) · [`packages/protocol/test/gemini-schema.test.ts`](../../../packages/protocol/test/gemini-schema.test.ts)
<!-- backlinks:end -->
