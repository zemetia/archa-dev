# Code Map — 02: Core Host

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [← 01](./01-main-cli-build.md) | [03 — Renderer →](./03-renderer.md)

The core host **owns every open document** (the single writer). It is `@archa/host` (`packages/host/src/`, no Electron), started by the desktop app's `utilityProcess` (`apps/desktop/src/core-host/`, only Electron glue) or in-process by headless `archa mcp` ([01](./01-main-cli-build.md)). Agent tools and chat runs it wires up live in [07](./07-agents-mcp.md).

---

## Desktop adapter — `apps/desktop/src/core-host/`

| File | Does | Governed by |
|---|---|---|
| [`core-host/index.ts`](../../../apps/desktop/src/core-host/index.ts) | Electron glue only: `createHost({ browser: callBrowser, cliPath, mcpCommand, windows: true })`, a `MessagePort` channel per window from `parentPort`, `listen('app')`, cleanup on `shutdown` / SIGTERM (`flush()` first, at most 4 s); `ARCHA_CLI` override of the CLI path | [ARCHITECTURE/01](../ARCHITECTURE/01-processes.md), [ARCHITECTURE/03](../ARCHITECTURE/03-startup-lifecycle.md) |
| [`core-host/main-bridge.ts`](../../../apps/desktop/src/core-host/main-bridge.ts) | `callBrowser`: forwards agent `browser` calls to main over `parentPort` and awaits the reply | [BROWSER](../BROWSER.md), [ARCHITECTURE/01](../ARCHITECTURE/01-processes.md) |

## `@archa/host` — `packages/host/src/`

| File | Does | Governed by |
|---|---|---|
| [`host/src/create.ts`](../../../packages/host/src/create.ts) | `createHost(opts)` → `{ host, attach, detach, connect, listen, close }`; `connect(client)` = in-process `RpcClient` (headless CLI, tests) | [ARCHITECTURE/01](../ARCHITECTURE/01-processes.md), [ARCHITECTURE/03](../ARCHITECTURE/03-startup-lifecycle.md) |
| [`host/src/host.ts`](../../../packages/host/src/host.ts) | `Host`: composition root — `HostContext`, agent stores (accounts, skills, memory, MCP servers), `ChatRunner(ctx, stores, mcpCommand)`, one `AgentExecutor` per connection, the router; `attach` (zod client info, session name per agent), `detach`, request → `router.call` → `res`; `handlers` (every method callable directly) | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`host/src/context.ts`](../../../packages/host/src/context.ts) | `HostContext` (implements `ToolHost` + `ChatHost`): sessions (`session` throws, `findSession` / `activeDataDir` return null — given doc → last-used doc → none), connections, window context per document (`projectOf`, `inContext`, `forget` keeps one doc per window), selection, activity log, `broadcast` (+ `afterBroadcast` hook), `agent.trail`, `askRenderer` / `requestRender` / `resolveRender`, `describe` (= `get_state`), library + icon stores | [ARCHITECTURE/04](../ARCHITECTURE/04-single-writer-sync.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`host/src/router.ts`](../../../packages/host/src/router.ts) | `createRouter(modules)`: merges domain `Routes`, **throws at startup on a duplicate method**; every request is checked against the `RPC` registry (`parseParams` → `INVALID_PARAMS`, unknown → `NOT_FOUND`) before the handler | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md) |
| [`host/src/domains/documents.ts`](../../../packages/host/src/domains/documents.ts) | `workspace.list`, `workspace.restore`, `project.files`, `doc.*` (open / save via `DocumentFiles`, apply as ops, undo / redo), `selection.set`, `settings.get` / `settings.set` | [ARCHITECTURE/04](../ARCHITECTURE/04-single-writer-sync.md), [FILE_FORMATS/01](../FILE_FORMATS/01-archa.md) |
| [`host/src/files.ts`](../../../packages/host/src/files.ts) | `DocumentFiles`: open / save `.archa` (one write at a time, project `.design/` target for untitled); with `windows` on: `restore` per window context, `runtime/open-files.json`, backups of unsaved work, auto-save on a timer and after `agent.done` / a chat turn, `flush` on quit | [FILE_FORMATS/05](../FILE_FORMATS/05-design-folder-projects.md), [ENTRY_POINTS/01](../ENTRY_POINTS/01-cli-single-instance.md) |
| [`host/src/projects.ts`](../../../packages/host/src/projects.ts) | `.design/` projects (`projectRoot`, `contextKey`, `projectFiles`, `freeDesignPath`), open-file state + backup cleanup, `settings.json` read / write | [FILE_FORMATS/05](../FILE_FORMATS/05-design-folder-projects.md) |
| [`host/src/domains/export.ts`](../../../packages/host/src/domains/export.ts) | `export.save` / `export.page` / `export.code` (assets inlined) | [RENDERING/03](../RENDERING/03-export.md) |
| [`host/src/domains/agent-tools.ts`](../../../packages/host/src/domains/agent-tools.ts) | `agent.state` / `execute` / `screenshot` / `reference` / `compare` / `exportSvg` / `outline` / `readSkill` / `say` / `done` | [MCP/01](../MCP/01-transports-tools.md), [MCP/03](../MCP/03-response-contract-lint.md) |
| [`host/src/domains/browser.ts`](../../../packages/host/src/domains/browser.ts) | `BrowserBridge` type; `agent.browser`, `agent.placeImage` (headless: no bridge → clear error) | [BROWSER](../BROWSER.md) |
| [`host/src/domains/chat.ts`](../../../packages/host/src/domains/chat.ts) | `chat.*`, `orchestra.*`, `agents.models` with their zod schemas | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md), [AGENT_BRIDGE/06](../AGENT_BRIDGE/06-orchestrate.md) |
| [`host/src/domains/library.ts`](../../../packages/host/src/domains/library.ts) | `library.*`, `icons.custom.*` | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md) |
| [`host/src/domains/settings.ts`](../../../packages/host/src/domains/settings.ts) | `accounts.*`, `skills.*`, `memory.*`, `mcp.*` (each store validates its own params) | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md), [AGENT_BRIDGE/07](../AGENT_BRIDGE/07-memory.md) |
| [`host/src/domains/app.ts`](../../../packages/host/src/domains/app.ts) | `app.info` (version, user, CLI path, mcp command, agent availability), `agents.list`, `activity.list`, `render.respond` | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md) |
| [`host/src/screenshot.ts`](../../../packages/host/src/screenshot.ts) | Full-size screenshot through a window, unchanged-hash skip, slices for tall pages, inline preview under the vision / reply budget | [RENDERING/03](../RENDERING/03-export.md), [MCP/03](../MCP/03-response-contract-lint.md) |
| [`host/src/socket.ts`](../../../packages/host/src/socket.ts) | `listenLocal(host, kind)`: token-checked socket (`socketPath()`), writes `runtime/core.json` `{ …, kind: 'app' | 'headless' }`, removes only its own file on close | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [ARCHITECTURE/03](../ARCHITECTURE/03-startup-lifecycle.md) |
| [`host/src/in-process.ts`](../../../packages/host/src/in-process.ts) | `channelPair()`: two `Channel`s in one process (structured clone, async delivery) | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md) |
| [`host/src/mcp-command.ts`](../../../packages/host/src/mcp-command.ts) | `nodeMcpCommand(cliPath)`: how launched agents start `archa mcp` (node, else Electron as node) | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`host/src/index.ts`](../../../packages/host/src/index.ts) | Public API re-exports | [STRUCTURE/02](../STRUCTURE/02-packages.md) |
| [`host/src/stores/icons.ts`](../../../packages/host/src/stores/icons.ts) | `IconStore`: uploaded icons in `ARCHA_HOME/icons/custom.json` (`icons.custom.*`) | [DESIGN_SYSTEM/05](../DESIGN_SYSTEM/05-icons-assets.md), [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md) |
| [`host/src/stores/library.ts`](../../../packages/host/src/stores/library.ts) | `LibraryStore`: global component libraries `ARCHA_HOME/libraries/<name>/` (`library.json`, `components/<id>.json` + thumbnail) | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md), [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md) |

---

## Flow Cheatsheet

| Question | Path |
|---|---|
| Where is an RPC method handled? | `host/src/domains/*.ts` (one `Routes` object per domain, merged by `router.ts`); params schema + result type in `packages/protocol/src/rpc.ts` `RPC`, checked by `router.ts` (`parseParams`) before the handler runs |
| What happens on an agent `execute`? | `mcp/src/server.ts` → RPC `agent.execute` → `domains/agent-tools.ts` → `mcp/src/execute.ts` `AgentExecutor.run` → `DocumentSession.apply` → `doc.applied` + `agent.trail` events |
| How does a chat message reach an agent? | renderer `chat.send` → `domains/chat.ts` → `agents/src/agents.ts` `ChatRunner.send` → adapter argv / warm stdin → parser events → `chat.delta` / `chat.message` / `chat.run` |
| Who is the core when no app runs? | `archa mcp` → `cli/src/connect.ts` fails → `cli/src/headless.ts` `createHost` in-process + `listen('headless')` |
| Where do browser actions run? | `agent.browser` → `domains/browser.ts` → `BrowserBridge` = `core-host/main-bridge.ts` → main `browser.ts` (CDP) |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** — (only its hub and the indexes)
<!-- backlinks:end -->
