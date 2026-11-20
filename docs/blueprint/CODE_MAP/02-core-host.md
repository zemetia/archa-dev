# Code Map — 02: Core Host

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [← 01](./01-main-cli-build.md) | [03 — Renderer →](./03-renderer.md)

`apps/desktop/src/core-host/` is the Electron `utilityProcess` that **owns every open document** (the single writer). Today it also holds what the target puts in `@archa/mcp` and `@archa/agents`. No Electron UI, no DOM here.

---

## Process and documents

| File | Does | Governed by |
|---|---|---|
| [`core-host/index.ts`](../../../apps/desktop/src/core-host/index.ts) | Boot: one `Workspace`, random token, `MessagePort` channel per window, local socket server (`socketPath()`), writes `runtime/core.json`, cleanup on exit | [ARCHITECTURE/01](../ARCHITECTURE/01-processes.md), [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [ARCHITECTURE/03](../ARCHITECTURE/03-startup-lifecycle.md) |
| [`core-host/workspace.ts`](../../../apps/desktop/src/core-host/workspace.ts) | `Workspace`: open `DocumentSession`s, connected clients (app / CLI / agent), **every RPC handler** with zod param schemas, activity log, `agent.trail` events, screenshot via `render.request` to a renderer, `cliPath()` / `mcpCommand()` | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [ARCHITECTURE/04](../ARCHITECTURE/04-single-writer-sync.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`core-host/main-bridge.ts`](../../../apps/desktop/src/core-host/main-bridge.ts) | `callBrowser`: forwards agent `browser` calls to main over `parentPort` and awaits the reply | [BROWSER](../BROWSER.md), [ARCHITECTURE/01](../ARCHITECTURE/01-processes.md) |

## Agent tools (target `@archa/mcp`)

| File | Does | Governed by |
|---|---|---|
| [`core-host/execute.ts`](../../../apps/desktop/src/core-host/execute.ts) | `AgentExecutor`: runs an agent snippet in **QuickJS** against a copy of the doc as one transaction; sandbox globals (`insert`, `update`, `align`, `icon`, `find` …), `normaliseInput`, auto-fix, auto-screenshot, patch retry (`editId` + `edits`), lint in the reply; `describeState` = `get_state` text | [MCP/02](../MCP/02-execute-api.md), [MCP/03](../MCP/03-response-contract-lint.md), [MCP/01](../MCP/01-transports-tools.md) |

## Chat agents (target `@archa/agents`)

| File | Does | Governed by |
|---|---|---|
| [`core-host/agent-adapters.ts`](../../../apps/desktop/src/core-host/agent-adapters.ts) | `ADAPTERS` for Claude Code, agy, Codex: argv (prompt as one argv element or stdin), stream parsers → `AgentEvent`, warm mode, model listing, `MCP_TOOLS` allow-list, `CLAUDE_DESIGN_SYSTEM` prompt | [AGENT_BRIDGE/01](../AGENT_BRIDGE/01-adapter-interface.md), [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`core-host/agents.ts`](../../../apps/desktop/src/core-host/agents.ts) | `ChatRunner`: one run per thread, parallel threads per doc, warm processes (`MAX_WARM` 6, idle 10 min), queue / send-now / stop, chat history `chats/<docId>.jsonl` + `chats/sessions.json`, per-thread dir `runtime/threads/<id>/` (MCP config, mirrored skills, pasted images) | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md), [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`core-host/personas.ts`](../../../apps/desktop/src/core-host/personas.ts) | `randomPersona`: two-word session name per thread (cursor tag, activity, undo author) | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`core-host/accounts.ts`](../../../apps/desktop/src/core-host/accounts.ts) | `AccountManager`: login profiles under `profiles/`, identity from each CLI's config, CLI-owned OAuth sign-in, use-on-host / capture-host, `resolveCli` | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`core-host/keyring.ts`](../../../apps/desktop/src/core-host/keyring.ts) | agy's single Google login in the OS keyring (`gemini:antigravity`) — read / write / delete; secrets via env/stdin, never argv | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |

## Settings data

| File | Does | Governed by |
|---|---|---|
| [`core-host/skills.ts`](../../../apps/desktop/src/core-host/skills.ts) | `SkillManager`: skill folders (`SKILL.md` frontmatter): editable ones in `ARCHA_HOME/skills`, read-only ones from `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`; enable state in `skills.json` | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`core-host/mcp-servers.ts`](../../../apps/desktop/src/core-host/mcp-servers.ts) | `McpServerManager`: external MCP servers in `mcp.json` (stdio / http / sse), test, import from other agents' configs; `archadev` name reserved; secrets never sent to clients | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`core-host/icons.ts`](../../../apps/desktop/src/core-host/icons.ts) | `IconStore`: uploaded icons in `ARCHA_HOME/icons/custom.json` (`icons.custom.*`) | [DESIGN_SYSTEM/05](../DESIGN_SYSTEM/05-icons-assets.md), [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md) |
| [`core-host/library.ts`](../../../apps/desktop/src/core-host/library.ts) | `LibraryStore`: global component libraries `ARCHA_HOME/libraries/<name>/` (`library.json`, `components/<id>.json` + thumbnail) | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md), [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md) |

---

## Flow Cheatsheet

| Question | Path |
|---|---|
| Where is an RPC method handled? | `workspace.ts` → `readonly handlers` object (one entry per method, zod-parsed params); types in `packages/protocol/src/index.ts` `CoreMethods` |
| What happens on an agent `execute`? | `cli/src/mcp.ts` → RPC `agent.execute` → `workspace.ts` → `execute.ts` `AgentExecutor.run` → `DocumentSession.apply` → `doc.applied` + `agent.trail` events |
| How does a chat message reach an agent? | renderer `chat.send` → `workspace.ts` → `agents.ts` `ChatRunner.send` → adapter argv / warm stdin → parser events → `chat.delta` / `chat.message` / `chat.run` |
| Where do browser actions run? | `agent.browser` → `main-bridge.ts` → main `browser.ts` (CDP) |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [AGENT_BRIDGE](../AGENT_BRIDGE.md)
<!-- backlinks:end -->
