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
| In-app browser the agent drives | [docs/blueprint/BROWSER.md](docs/blueprint/BROWSER.md) |
| Knowledge system rules | [docs/blueprint/KNOWLEDGE.md](docs/blueprint/KNOWLEDGE.md) |
| pen.dev stack comparison (clean-room) | [docs/blueprint/REFERENCE.md](docs/blueprint/REFERENCE.md) |
| **Where code lives today** (file → purpose → docs; RPC, tools, paths, tests) | [docs/blueprint/CODE_MAP.md](docs/blueprint/CODE_MAP.md) |
| **A–Z topic index** (keyword → doc → code) | [docs/blueprint/TOPICS.md](docs/blueprint/TOPICS.md) |

**Finding things:** keyword → [TOPICS.md](docs/blueprint/TOPICS.md); source file → [CODE_MAP.md](docs/blueprint/CODE_MAP.md); every blueprint doc ends with a generated **Backlinks** block (docs linking to it + code implementing it). After adding, moving or deleting a source file or doc, update its CODE_MAP row and run `node scripts/gen-backlinks.mjs` (`--check` must exit 0).

Plan, decisions and roadmap (intent, not contract): [docs/plan/INDEX.md](docs/plan/INDEX.md). Current phase: [docs/plan/ROADMAP.md](docs/plan/ROADMAP.md).

## Stack snapshot

TypeScript (strict) · pnpm + Turborepo · Electron + electron-vite · React 19 · Zustand · Tailwind v4 · CanvasKit (Skia WASM) · Yoga · zod · MCP SDK · QuickJS · fflate · better-sqlite3 · Vitest · Playwright

## Commands

Scripts that exist today (on this machine prefix with `corepack pnpm@9.15.0` — see [CODE_MAP → Commands](docs/blueprint/CODE_MAP.md)):

```bash
pnpm install        # then: node node_modules/electron/install.js
pnpm dev            # run the desktop app in dev (isolate ARCHA_HOME + --user-data-dir)
pnpm typecheck      # pnpm -r typecheck (works via corepack too; real exit code)
pnpm lint           # Biome, zero warnings (biome.json; formatter off)
pnpm test           # vitest run
pnpm cli            # build the archa CLI bundle
pnpm dist           # CLI + installer
pnpm docs:check     # blueprint backlinks, code-map coverage, broken links, 150-line limit
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test and docs:check on every push and PR. Planned, not wired yet: `pnpm bench`, `pnpm gen:api-docs`.

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
