# 01 — MCP server

← [AGENTS_AND_MCP](../AGENTS_AND_MCP.md) · [Plan INDEX](../INDEX.md)

## Transports

| Transport | Started by | Used for |
|---|---|---|
| stdio | `archa mcp [--project <dir> \| --file <path>] [--run <id>]` | Agents that spawn MCP servers (Claude Code, Codex, agy, Hermes) |
| Streamable HTTP on `127.0.0.1:<port>` with a bearer token | The app (setting, off by default) | Agents/tools that prefer HTTP |

`archa mcp` is a thin client: if the app's core host is running it relays to it (so the person sees the agent work live); otherwise it starts a headless core in-process.

## Tool surface (kept small on purpose)

| Tool | Purpose |
|---|---|
| `get_state` | Active document, page, selection, top-level frames (truncated with "+N more"), components id→name, variables summary, pending comments/decisions. Pre-injected on launched runs |
| `execute` | Run a JS snippet against the document API in a sandbox, as one transaction |
| `screenshot` | Node / frame / viewport image at a scale; returns "unchanged" when the hash matches the last one sent |
| `export` | png, jpeg, webp, svg, pdf, html-css, react-tailwind, tokens |
| `get_style` | Style profile catalogue, two-step load (see DESIGN_SYSTEM) |
| `read_guide` | On-demand guides (landing page, web app, mobile, slides, tables, design system, components, code export) |
| `comments` | List / reply / resolve comment threads |
| `review_wait` / `review_done` | Block until the person sends a round; close it with a summary |
| `ask` / `variants` | Decisions that block until the person chooses |
| `say` | One-line status shown in the app's activity feed with the agent cursor |
| `library` | List / import / remove component libraries |
| Plugin tools | Added by enabled plugins, namespaced `plugin_<id>_<tool>` |

Accent showed a few tools plus one code tool beats many fine-grained tools: one call builds a whole section.

## The `execute` API

Runs in **QuickJS** (no fs, no network, 5 s CPU and 64 MB per call by default). Globals assigned in one call persist for the session (so ids carry over).

- Mutations: `insert`, `copy`, `update`, `replace`, `move`, `remove`, `setVariables`, `createComponent`, `instance`, `generate` (async asset generation via plugins).
- Reads: `get(id)`, `find(visitor, {under})`, `getVariables()`, `findEmptySpace()`, `print()`.
- Output: `screenshot(id)`, `export(id, opts)` — a building call should end with a screenshot.
- A whole-document read without a visitor is rejected with an error that says what to do instead.

The API reference the agent reads is **generated from `@archa/schema`**, so docs and runtime cannot disagree.

## Response contract (every `execute` reply, in order)

1. `OK` + reminder that globals persist.
2. Created/changed nodes as `name → id` (ids quoted), noting which globals hold them.
3. `print()` output.
4. Screenshots, followed by the verify instruction: check nothing is broken, collapsed, clipped or overflowing, and that it matches intent.
5. **Issues detected** (lint), one sentence each: node, problem, remedy; closed by "resolve these next call".
6. Pending async work (images generating) and "do not regenerate".

On failure: the whole transaction rolls back; reply quotes the failing statement, the property path, expected vs received, and an **`editId`**. The agent fixes by sending find/replace edits against that snippet (`execute({ editId, edits })`), not the whole snippet again.

## Lint (free, every call)

Our own checks, seeded from what Accent and the pen research found models get wrong: text without fill, fill sizing without layout parent, hug/fill cycles, x/y ignored inside auto-layout, unknown icon, unknown font, unknown variable reference, raw colour where a token exists, spacing off the scale, text overflowing a fixed box, child clipped by parent, contrast below AA, overlapping top-level frames, unnamed node. Each rule has an id so a person can disable it per project.

## Safety

- The MCP server only acts on the project/file it was started for.
- Plugin tools run in the plugin host, never in the MCP process.
- Every call is appended to `activity.jsonl` with the agent identity (from `--run` or the MCP client name).
