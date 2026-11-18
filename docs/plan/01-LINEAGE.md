# Lineage — what we take from where

← [Plan INDEX](./INDEX.md)

ArchaDev is built from three existing bodies of work. This file records what each contributes so decisions can be traced back.

---

## 1. Accent design (`D:\Project\accent-design`)

Accent ("Accent by Axen") is a Claude Code plugin + MCP server + review board that replaced pen.dev in the owner's workflow with "code is the canvas". Sources: `plan/roadmap.md`, `docs/research/pen-cli-harness.md`, `plugin/README.md`.

| Accent idea | Where it lands in ArchaDev |
|---|---|
| MCP and CLI as two equal doors to one tool | Core rule 1; [CLI.md](./CLI.md) |
| Works from Claude Code, agy, Codex, Hermes; `status [agent]` | [AGENTS_AND_MCP/02-agent-bridge.md](./AGENTS_AND_MCP/02-agent-bridge.md) |
| Design harness loop: build → render → audit → screenshot → fix | [AGENTS_AND_MCP/01-mcp-server.md](./AGENTS_AND_MCP/01-mcp-server.md) feedback contract |
| pen.dev research: one `execute` tool, transactions, patch retry by `editId`, name→id map, lint in every response, tiered verify | Same file; we reimplement the mechanisms, not the text |
| In-app browser the agent and person both drive | [EDITOR_UI.md](./EDITOR_UI.md) "Browser" tool, phase 10 |
| Design per project (`.accent/`) | `.archadev/` — [FILES_AND_PROJECTS/02-archadev-project.md](./FILES_AND_PROJECTS/02-archadev-project.md) |
| Designer profiles (skill, plugin, tools, style) | Designer profiles in [PLUGINS.md](./PLUGINS.md) and [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| Vertical toolbar (select, shape, pen, text, frame, sticky, browser, hand, comment, component, search, more) | [EDITOR_UI.md](./EDITOR_UI.md) |
| Asset tools: SVG, background removal, tracing, HTML animation | Plugin-provided generators, [PLUGINS.md](./PLUGINS.md) |
| Style profiles: brief about structure, values apart, two-step load, measured contrast, `clamp()` type scale | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| Review rounds, decisions (`ask`, `variants`), history, activity log with agent cursor | [AGENTS_AND_MCP/04-review-loop.md](./AGENTS_AND_MCP/04-review-loop.md) |
| Revision-checked saves after the two-tabs bug | Single-writer rule, [ARCHITECTURE/01-process-model.md](./ARCHITECTURE/01-process-model.md) |
| Clean-room rule on pen.dev | [FILES_AND_PROJECTS/04-pen-import.md](./FILES_AND_PROJECTS/04-pen-import.md) |

**Where ArchaDev differs from Accent:** Accent chose *code as the canvas* (no design file). ArchaDev is a real node canvas like pen.dev, because the owner wants layers, `.archa` files and `.pen` import. We keep Accent's code path as **code frames** — a frame that renders a live URL or HTML — so both work on one board. See decision D-01 in [DECISIONS.md](./DECISIONS.md).

---

## 2. Gungnir flow (`C:\Gungnir`)

Gungnir is a Go + Next.js multi-agent system. The relevant part is how it drives local coding-agent CLIs (`remediate/agents.go`, `remediate/stream.go`, `remediate/profiles.go`, `remediate/models.go`, CHANGELOG "AI Coding Agents" and "Remediation").

| Gungnir mechanism | Where it lands |
|---|---|
| Fixed agent roster; each agent = bin, headless args, resume args, max argv prompt size | Agent adapter interface, [AGENTS_AND_MCP/02-agent-bridge.md](./AGENTS_AND_MCP/02-agent-bridge.md) |
| Per-agent stream parser → normalised events (session started, tool call, text, final, session id) | Same |
| Prompt never through a shell; stdin when it would exceed ~28 KB on Windows | Hard constraint 5 |
| Own login profiles per agent (Claude config dir, agy keyring swap with crash-safe restore) | Agent profiles |
| Model picker from what each installed CLI reports | Agent settings UI |
| Parallel runs per agent, each in its own git worktree, committed to a branch | Agent runs in project mode |
| Steering: message queued for next turn, "send now", interrupt, continue, finish; resume via CLI session id | Agent run controls |
| Rate-limit detection by output pattern | Adapter failover |
| Planner + workers, event-driven wakeups, shared todolist across stateless sessions | Multi-agent design jobs (later phase) |
| Keep a Changelog, `zemetia/<topic>` branches, isolated test data | [CONVENTIONS.md](./CONVENTIONS.md) |

---

## 3. Zemetiash Blueprint (`D:\Project\zemetiash\docs\blueprint`)

A cross-linked documentation system written for AI agents.

| Blueprint idea | Where it lands |
|---|---|
| `INDEX.md` first, document map table, every file backlinks to the index | This plan's shape; future `docs/blueprint/` |
| Topic file + numbered sub-files (`ARCHITECTURE/01-…md`) | Same |
| Hard constraints table with "violation" column | INDEX hard constraints |
| File-creation checklists | [CONVENTIONS.md](./CONVENTIONS.md) |
| Knowledge system: `docs/knowledge/THIS.md` (identity, style, insights) and `LEARN.md` (one-line mistake log) read before every task | [CONVENTIONS.md](./CONVENTIONS.md), phase 0 |
| `CLAUDE.md` that points to knowledge files, blueprint table, stack snapshot, non-negotiables | Phase 0 deliverable |
| Design tokens only, no raw colours; `@theme` in Tailwind v4; oklch | App UI rules + token export target |
| TS strict, `import type`, `displayName`, CVA components, Storybook + tests per component | App renderer conventions |
