# MCP — 04: Local Skill

← [MCP.md](../MCP.md) | [Blueprint INDEX](../INDEX.md)

**Phase:** 5. Code: `skills/archadev/`, `apps/cli/src/commands/skill.ts`, `packages/agents/src/adapters/*/mcpConfig.ts`.

---

## Contents

| File | Content | Source |
|---|---|---|
| `SKILL.md` | Frontmatter (name `archadev`, description with triggers), when to use, the loop, hard rules, tool overview, guide table | Hand-written, < 150 lines |
| `references/api.md` | `execute` API + node properties | **Generated** (`pnpm gen:api-docs`) from `@archa/schema` `.describe()` texts |
| `references/process.md` | Orient → tokens first → components before screens → pilot then sweep → verify per section → final sweep | Hand-written |
| `references/taste.md` | Anti-generic rules | Hand-written by us |
| `references/layout.md` | Layout vocabulary with WRONG / RIGHT pairs | Hand-written |
| `references/design-system.md` | Variables, components, slots, overrides | Hand-written |
| `references/review.md` | Comments, rounds, `ask` / `variants` etiquette | Hand-written |
| `references/guides/*.md` | landing, web-app, mobile, slides, tables, code-export | Hand-written |

All text is ours. Nothing copied from pen.dev → [FILE_FORMATS/04](../FILE_FORMATS/04-importers.md).

---

## The Loop (what SKILL.md teaches)

1. Use the pre-injected state or call `get_state`.
2. Choose/confirm a style profile and tokens **before** drawing.
3. One section per `execute`, ending with `screenshot`.
4. Read issues + screenshot; fix in place with a patch — never delete and redo.
5. Name every node; reuse components; mark unfinished frames (`meta.archa.placeholder`).
6. `say` one line between sections.
7. Unsure between options → `ask` or `variants`, don't guess.
8. Final sweep with a visitor under each frame; then summarise.

---

## Install Matrix (`archa skill install`)

| Agent | Skill destination (project / user) | MCP registration |
|---|---|---|
| Claude Code | `.claude/skills/archadev/` / `~/.claude/skills/archadev/` | `.mcp.json` → `{ "mcpServers": { "archadev": { "command": "archa", "args": ["mcp"] } } }` |
| agy | `.agent/skills/archadev/` / user skills dir | agy MCP settings |
| Codex | `AGENTS.md` section linking `skills/archadev/references` / `~/.codex/` | `~/.codex/config.toml` `[mcp_servers.archadev]` |
| Hermes | Hermes skills dir | Hermes MCP config |

Paths and file shapes are owned by each adapter's `mcpConfig()` → [AGENT_BRIDGE/01](../AGENT_BRIDGE/01-adapter-interface.md). Exact locations must be verified against each CLI's current docs when implementing; `archa doctor` checks them.

---

## Rules

| # | Rule |
|---|---|
| 1 | Show every file to be written/changed (diff) and ask before writing |
| 2 | Merge into existing MCP configs; never overwrite other servers |
| 3 | `archa skill uninstall` removes exactly what install added (tracked in `~/.archadev/config.json`) |
| 4 | Skill version = app version; the app offers to update installed copies after an upgrade |
