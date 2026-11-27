# Code Map — 07: Agents and MCP

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [← 06](./06-tests.md)

`@archa/mcp` and `@archa/agents` hold the agent side of the core host. Neither imports `@archa/host`: each defines the interface it needs (`ToolHost`, `ChatHost`) and the host implements it ([STRUCTURE/02](../STRUCTURE/02-packages.md)). Wiring → [02](./02-core-host.md).

---

## `@archa/mcp` — `packages/mcp/src/`

| File | Does | Governed by |
|---|---|---|
| [`mcp/src/server.ts`](../../../packages/mcp/src/server.ts) | `createMcpServer({ getCore, defaultDoc })`: every MCP tool (names, texts, zod inputs) relaying to an `agent.*` / `doc.*` RPC; reply shaping for `execute` (ids, issues, screenshots + verify line, `editId`); `serveStdio(server, { gemini })` keeps agy's tool list in Gemini's schema subset | [MCP/01](../MCP/01-transports-tools.md), [MCP/03](../MCP/03-response-contract-lint.md) |
| [`mcp/src/tool-host.ts`](../../../packages/mcp/src/tool-host.ts) | `ToolHost` (what execute / get_state / reference need from the host), `Caller`, `RenderReply`, `resolveRef`, `trailStep` | [STRUCTURE/02](../STRUCTURE/02-packages.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`mcp/src/execute.ts`](../../../packages/mcp/src/execute.ts) | `AgentExecutor`: runs an agent snippet in **QuickJS** against a copy of the doc as one transaction; sandbox globals (`insert`, `update`, `align`, `icon`, `find` …), `normaliseInput`, auto-fix, auto-screenshot, patch retry (`editId` + `edits`), lint in the reply; `describeState` = `get_state` text | [MCP/02](../MCP/02-execute-api.md), [MCP/03](../MCP/03-response-contract-lint.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`mcp/src/reference.ts`](../../../packages/mcp/src/reference.ts) | `readPdfPage`: a PDF page through pdf.js (legacy, in-process worker) → text lines, rect / rounded-rect / ellipse / path shapes, placed images (PNG into the asset folder); `summarizePage` | [MCP/05](../MCP/05-reference-compare.md) |
| [`mcp/src/reference-tools.ts`](../../../packages/mcp/src/reference-tools.ts) | RPC `agent.reference` / `agent.compare`: stage the file, ask the window for colours / the diff, write `<name>-asset/reference/*.json`, name the nodes under each differing region | [MCP/05](../MCP/05-reference-compare.md) |
| [`mcp/src/index.ts`](../../../packages/mcp/src/index.ts) | Public API re-exports | [STRUCTURE/02](../STRUCTURE/02-packages.md) |

## `@archa/agents` — `packages/agents/src/`

| File | Does | Governed by |
|---|---|---|
| [`agents/src/agent-adapters.ts`](../../../packages/agents/src/agent-adapters.ts) | `ADAPTERS` for Claude Code, agy, Codex: argv (prompt as one argv element or stdin), stream parsers → `AgentEvent`, warm mode, model listing, `MCP_TOOLS` allow-list, `CLAUDE_DESIGN_SYSTEM` prompt | [AGENT_BRIDGE/01](../AGENT_BRIDGE/01-adapter-interface.md), [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`agents/src/agents.ts`](../../../packages/agents/src/agents.ts) | `ChatRunner(host: ChatHost, stores, mcpCommand)` — `ChatHost` is its own interface (data dir, sessions, broadcast, `describe`), never the host class: one run per thread, parallel threads per doc, warm processes (`MAX_WARM` 6, idle 10 min), queue / send-now / stop, chat history `chats/<docId>.jsonl` + `chats/sessions.json`, per-thread dir `runtime/threads/<id>/` (MCP config, mirrored skills, pasted images) | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md), [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`agents/src/chat-store.ts`](../../../packages/agents/src/chat-store.ts) | `ChatStore`: one JSON file per conversation in `<name>-data/chats/`, attachments beside it, upsert by message id, migration of the old per-document `.jsonl` | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`agents/src/personas.ts`](../../../packages/agents/src/personas.ts) | `randomPersona`: two-word session name per thread (cursor tag, activity, undo author) | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`agents/src/agy-tool-schemas.ts`](../../../packages/agents/src/agy-tool-schemas.ts) | `badAgyTools` (MCP tools agy loaded whose schema Gemini refuses, from agy's schema copies), `agyErrorHint` (names the server/tool behind agy's 400, appended by the agy parser) | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`agents/src/accounts.ts`](../../../packages/agents/src/accounts.ts) | `AccountManager`: login profiles under `profiles/`, identity from each CLI's config, CLI-owned OAuth sign-in, use-on-host / capture-host, `resolveCli` | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`agents/src/keyring.ts`](../../../packages/agents/src/keyring.ts) | agy's single Google login in the OS keyring (`gemini:antigravity`) — read / write / delete; secrets via env/stdin, never argv | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`agents/src/skills.ts`](../../../packages/agents/src/skills.ts) | `SkillManager`: skill folders (`SKILL.md` frontmatter): editable ones in `ARCHA_HOME/skills`, read-only ones from `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`; enable state in `skills.json`; the document's own skills from `<name>-data/skills/` (`forRunSkills(docSkills)`) | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`agents/src/memory.ts`](../../../packages/agents/src/memory.ts) | `MemoryStore`: agent memory, one Markdown file per fact in `ARCHA_HOME/memory/` (global) and `<name>-data/memory/` (document); `remember` / `forget` / `list`, the capped first-turn block `forPrompt` | [AGENT_BRIDGE/07](../AGENT_BRIDGE/07-memory.md) |
| [`agents/src/mcp-servers.ts`](../../../packages/agents/src/mcp-servers.ts) | `McpServerManager`: external MCP servers in `mcp.json` (stdio / http / sse), test, import from other agents' configs; `archadev` name reserved; secrets never sent to clients | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`agents/src/index.ts`](../../../packages/agents/src/index.ts) | Public API re-exports | [STRUCTURE/02](../STRUCTURE/02-packages.md) |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [AGENT_BRIDGE](../AGENT_BRIDGE.md)
<!-- backlinks:end -->
