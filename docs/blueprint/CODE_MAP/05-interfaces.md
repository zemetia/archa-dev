# Code Map — 05: Interfaces As Built

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [← 04](./04-packages.md) | [06 — Tests →](./06-tests.md)

What exists **today**. Targets and full contracts: [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [MCP/01](../MCP/01-transports-tools.md), [CLI/01](../CLI/01-commands.md), [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md). Types: [`packages/protocol/src/index.ts`](../../../packages/protocol/src/index.ts) (`CoreMethods`, `CoreEvents`); handlers: [`core-host/workspace.ts`](../../../apps/desktop/src/core-host/workspace.ts).

---

## RPC Methods (`CoreMethods`)

| Group | Methods | Used by |
|---|---|---|
| Workspace / documents | `workspace.list`, `doc.new`, `doc.open`, `doc.save`, `doc.close`, `doc.rename`, `doc.snapshot`, `doc.apply` (`baseRevision`, `ops`, `label`), `doc.undo`, `doc.redo`, `selection.set` | Renderer |
| Rendering | `render.respond` (renderer answers a `render.request` with a PNG) | Renderer |
| Presence | `agents.list`, `activity.list` | Renderer |
| Agent tools | `agent.state`, `agent.execute`, `agent.screenshot`, `agent.exportSvg`, `agent.outline`, `agent.say`, `agent.browser` | `archa mcp` |
| App | `app.info` | Renderer |
| Export | `export.save` (png / jpg / svg / pdf / html / tailwind), `export.page` (standalone HTML for PDF), `export.code` (clipboard code) | Renderer |
| Chat | `chat.send` (`now`, `focus`, `images`), `chat.warm`, `chat.stop`, `chat.runs`, `chat.list`, `chat.deleteThread`, `agents.models` | Renderer |
| Library | `library.list`, `library.publish`, `library.remove`, `library.insert` | Renderer |
| Accounts | `accounts.overview`, `.create`, `.update`, `.delete`, `.captureHost`, `.useOnHost`, `.login.start`, `.login.code`, `.login.cancel` | Settings |
| Skills | `skills.list`, `.create`, `.import`, `.update`, `.delete`, `.read` | Settings |
| MCP servers | `mcp.list`, `.save`, `.delete`, `.test`, `.importCandidates`, `.import` | Settings |

**Events (`CoreEvents`):** `doc.applied`, `workspace.changed`, `activity`, `agents.changed`, `selection.changed`, `render.request`, `chat.message`, `chat.delta`, `chat.run`, `agent.trail`, `accounts.changed`, `skills.changed`, `mcp.changed`.

**Framing:** JSON lines `{ t: 'req' | 'res' | 'evt' | 'hello' }`; a socket client sends `hello` with `ClientInfo` + the token from `runtime/core.json`. New method → [INDEX → New RPC method](../INDEX.md).

---

## MCP Tools (`archa mcp`, [`apps/cli/src/mcp.ts`](../../../apps/cli/src/mcp.ts))

| Tool | RPC | Doc |
|---|---|---|
| `get_state` | `agent.state` | [MCP/01](../MCP/01-transports-tools.md) |
| `execute` | `agent.execute` | [MCP/02](../MCP/02-execute-api.md), [MCP/03](../MCP/03-response-contract-lint.md) |
| `inspect` | `agent.outline` | [MCP/01](../MCP/01-transports-tools.md) |
| `read_guide` | — (compiled-in `design-guides.ts`) | [MCP/04](../MCP/04-local-skill.md) |
| `screenshot` | `agent.screenshot` | [RENDERING/03](../RENDERING/03-export.md) |
| `export_svg` | `agent.exportSvg` | [RENDERING/03](../RENDERING/03-export.md) |
| `say` | `agent.say` | [MCP/01](../MCP/01-transports-tools.md) |
| `browser` | `agent.browser` | [BROWSER](../BROWSER.md) |

Chat runs allow exactly these (`MCP_TOOLS` in `agent-adapters.ts`). Planned, not built: `export`, `get_style`, `comments`, `review_wait`, `review_done`, `ask`, `variants`, `library`, plugin tools.

---

## CLI Commands ([`apps/cli/src/index.ts`](../../../apps/cli/src/index.ts))

| Command | Does |
|---|---|
| `archa mcp [--doc <id>] [--agent <name>]` | stdio MCP server relaying to the running app |
| `archa status [--json]` | Connection check to the running core |
| `archa browser <action> [json] [--out file]` | Drive the in-app browser (`--out` writes a screenshot PNG) |
| `archa open <file>` | Open a `.archa` file in the app |

Everything else in [CLI/01](../CLI/01-commands.md) is the target. The app must be running (no headless core yet).

---

## Runtime Paths (`ARCHA_HOME`, default `~/.archadev`)

| Path | Written by | Holds |
|---|---|---|
| `runtime/core.json` | `core-host/index.ts` | Socket path + token of the running core |
| `runtime/core.sock` / `\\.\pipe\archadev-core-<user>[-<hash>]` | `protocol/node.ts` | Core socket; custom `ARCHA_HOME` gets its own pipe |
| `runtime/threads/<threadId>/` | `core-host/agents.ts` | Per-thread MCP config, mirrored skills, pasted images |
| `cache/models/birefnet-lite.onnx` | `main/models.ts` | Background removal model, downloaded on first use (derivable). IPC `ml:segment`, event `model:progress` |
| `chats/<docId>.jsonl`, `chats/sessions.json` | `core-host/agents.ts` | Chat history; agent CLI session ids for resume |
| `profiles/` | `core-host/accounts.ts` | Agent login profiles |
| `skills/`, `skills.json` | `core-host/skills.ts` | ArchaDev-owned skills; enabled state |
| `mcp.json` | `core-host/mcp-servers.ts` | External MCP servers (secrets stay here) |
| `libraries/<name>/` | `core-host/library.ts` | Global component libraries |

`<project>/.archadev/` is **not built** — documents save as standalone `.archa` files.

## Environment Variables Read by Code

| Var | Read in | Purpose |
|---|---|---|
| `ARCHA_HOME` | `protocol/node.ts` and tests | Global dir; tests **must** set a temp dir |
| `ARCHA_RUN_ID`, `ARCHA_DOC_ID` | set by `core-host/agents.ts`, read by `cli/src/mcp.ts` | Launched run → thread session + target document |
| `ARCHA_CLI` | `core-host/workspace.ts` | Override path of the `archa` CLI bundle |
| `ARCHA_BUILTIN_SKILLS` | set by `main/index.ts`, read by `core-host/skills.ts` | Folder of the built-in skills (`resources/skills`, or the repo `skills/` in dev) |
| `ARCHA_APP_PATH` | `cli/src/index.ts` | App binary for `archa open` |
| `ARCHA_AGENT_IT`, `ARCHA_AGENT_IT_AGENTS` | `test/agents-live.test.ts` | Enable live agent tests / pick agents |
| `CLAUDE_CONFIG_DIR`, `CODEX_HOME` | set per profile by `core-host/accounts.ts` | Point Claude / Codex at a profile dir; inherited values are **stripped** by main (the host login is the CLI default) |
| `ELECTRON_RENDERER_URL` | `main/index.ts` | electron-vite dev server URL |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [CLI](../CLI.md) · [INDEX](../INDEX.md) · [MCP](../MCP.md) · [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md)
<!-- backlinks:end -->
