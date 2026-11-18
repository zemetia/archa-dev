# ArchaDev

Local-first design tool in the spirit of pen.dev: a TypeScript **Electron app**, an **`archa` CLI**, and a **local skill + MCP server** so local agents (Claude Code, Antigravity, Codex, Hermes) can design inside it. Projects get a `.archadev/` folder; standalone work saves as `.archa`; `.pen` can be imported (licence-safe paths only).

## CRITICAL — Read Before Anything Else

> These two files are the most important context in this project. Read them at the start of every task, before touching any blueprint section or code.

| File | Purpose |
|---|---|
| [docs/knowledge/THIS.md](docs/knowledge/THIS.md) | Owner's style, project identity, do's & don'ts, ongoing insights |
| [docs/knowledge/LEARN.md](docs/knowledge/LEARN.md) | Past mistakes and corrections — read to avoid repeating them |

**Writing rules:**
- After any task where a new insight or preference is discovered → append to `THIS.md`
- When the owner corrects the AI, or the AI self-identifies a mistake → append to `LEARN.md` immediately: `[YYYY-MM-DD] - [problem] - [solution] - [lesson]`

---

> **AI agents — before planning any fix or feature:** identify which blueprint sections cover the affected area, read them first, then plan. Do not guess at patterns — the blueprint is the source of truth. If code and blueprint disagree, stop and ask which one is right.

## Blueprint

| Section | File |
|---|---|
| Index + hard constraints + checklists | [docs/blueprint/INDEX.md](docs/blueprint/INDEX.md) |
| Repo, packages, runtime dirs | [docs/blueprint/STRUCTURE.md](docs/blueprint/STRUCTURE.md) |
| Processes, IPC, startup, single writer | [docs/blueprint/ARCHITECTURE.md](docs/blueprint/ARCHITECTURE.md) |
| Nodes, ops, undo, layout, hashing | [docs/blueprint/DOCUMENT_MODEL.md](docs/blueprint/DOCUMENT_MODEL.md) |
| **Cache system** | [docs/blueprint/CACHE.md](docs/blueprint/CACHE.md) |
| Canvas rendering, layers, export | [docs/blueprint/RENDERING.md](docs/blueprint/RENDERING.md) |
| `.archa`, `.archadev/`, migrations, importers | [docs/blueprint/FILE_FORMATS.md](docs/blueprint/FILE_FORMATS.md) |
| CLI open, Explorer menu, file association | [docs/blueprint/ENTRY_POINTS.md](docs/blueprint/ENTRY_POINTS.md) |
| **MCP server, `execute`, reply contract, skill** | [docs/blueprint/MCP.md](docs/blueprint/MCP.md) |
| **Agent adapters, runs, review loop** | [docs/blueprint/AGENT_BRIDGE.md](docs/blueprint/AGENT_BRIDGE.md) |
| Variables, components, style profiles, code export | [docs/blueprint/DESIGN_SYSTEM.md](docs/blueprint/DESIGN_SYSTEM.md) |
| App shell, UI components, state | [docs/blueprint/APP_UI.md](docs/blueprint/APP_UI.md) |
| Plugins | [docs/blueprint/PLUGINS.md](docs/blueprint/PLUGINS.md) |
| `archa` commands | [docs/blueprint/CLI.md](docs/blueprint/CLI.md) |
| TypeScript, tests, git, anti-patterns | [docs/blueprint/BEST_PRACTICE.md](docs/blueprint/BEST_PRACTICE.md) |
| Knowledge system rules | [docs/blueprint/KNOWLEDGE.md](docs/blueprint/KNOWLEDGE.md) |
| pen.dev stack comparison (clean-room) | [docs/blueprint/REFERENCE.md](docs/blueprint/REFERENCE.md) |

Plan, decisions and roadmap (intent, not contract): [docs/plan/INDEX.md](docs/plan/INDEX.md). Current phase: [docs/plan/ROADMAP.md](docs/plan/ROADMAP.md).

## Stack snapshot

TypeScript (strict) · pnpm + Turborepo · Electron + electron-vite · React 19 · Zustand · Tailwind v4 · CanvasKit (Skia WASM) · Yoga · zod · MCP SDK · QuickJS · fflate · better-sqlite3 · Vitest · Playwright

## Commands

```bash
pnpm install        # install workspace
pnpm dev            # run the desktop app in dev
pnpm lint           # must exit 0 (--max-warnings 0)
pnpm typecheck
pnpm test
pnpm bench
pnpm gen:api-docs   # regenerate skills/archadev/references/api.md from @archa/schema
```

## Non-negotiables

- One core, three surfaces: app, CLI and MCP all call `@archa/core` — no duplicated logic
- Only the core host writes documents; clients send ops with `baseRevision`
- `packages/core` never imports Electron, React or DOM
- Every cross-process message is validated with zod at the boundary
- Agent prompts go as one argv element or stdin — never through a shell
- Every cache is derivable; deleting a cache dir loses no data
- No pen.dev reverse engineering; no copied pen docs, styles or libraries
- Every `execute` reply follows the response contract (ids, issues, screenshot + verify, `editId` on failure)
- App UI uses design tokens only — no raw colours
- Tests set `ARCHA_HOME` to a temp dir — never touch the real `~/.archadev`
- `.archa` format changes bump `formatVersion` + migration + fixture
- Blueprint files stay under 150 lines; update the blueprint in the same change as the code
