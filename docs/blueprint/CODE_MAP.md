# Code Map — Where Things Live Today

← [Blueprint INDEX](./INDEX.md)

The rest of the blueprint describes the **target**. This section maps the code that **exists now** (v0.4 / 0.5 work) file by file, so an agent can jump from a topic to a file and from a file to the rules that govern it. Keyword lookup → [TOPICS.md](./TOPICS.md).

| Part | Coverage |
|---|---|
| [01 — Main, preload, CLI, build](./CODE_MAP/01-main-cli-build.md) | `apps/desktop/src/main`, `preload`, `apps/cli`, root + build config, `scripts/` |
| [02 — Core host](./CODE_MAP/02-core-host.md) | `@archa/host` (context, router, domain modules, socket, headless entry) + the Electron glue in `apps/desktop/src/core-host` |
| [03 — Renderer](./CODE_MAP/03-renderer.md) | `apps/desktop/src/renderer` — app shell, canvas, lib, panels, inspector, settings |
| [04 — Packages](./CODE_MAP/04-packages.md) | `packages/schema`, `protocol`, `core`, `icons`, `render`, `formats` |
| [05 — Interfaces](./CODE_MAP/05-interfaces.md) | Every RPC method + event, MCP tools, CLI commands, runtime paths, env vars — as built |
| [06 — Tests](./CODE_MAP/06-tests.md) | Every test file, what it covers, how to run it |
| [07 — Agents and MCP](./CODE_MAP/07-agents-mcp.md) | `@archa/agents` (adapters, chat runs, accounts, skills, memory, MCP config) and `@archa/mcp` (MCP server, `execute`, reference tools) |

---

## Target Package → Where It Lives Now

| Blueprint target | Today | Notes |
|---|---|---|
| `@archa/mcp` (MCP server, tools) | **Built:** `packages/mcp/src/server.ts`, served by `apps/cli/src/mcp.ts` → RPC `agent.*` → `packages/host/src/domains/agent-tools.ts` | Tool texts in `packages/protocol/src/agent-docs.ts`, `browser.ts`, `design-guides.ts` |
| `@archa/mcp` `execute` sandbox | **Built:** `packages/mcp/src/execute.ts` | QuickJS; lint in `packages/core/src/lint.ts` |
| `@archa/agents` (adapters, runs) | **Built:** `packages/agents/src/` — `agent-adapters.ts`, `agents.ts` (`ChatRunner`), `accounts.ts`, `keyring.ts`, skills, memory | Wired by `@archa/host` → [CODE_MAP/07](./CODE_MAP/07-agents-mcp.md) |
| Core host (ARCHITECTURE/01) | **Built:** `@archa/host` (`packages/host/src/`); `apps/desktop/src/core-host/` is Electron glue; headless in `apps/cli/src/headless.ts` | No core.lock / handover yet |
| `@archa/design-system` | Variables in `packages/schema/src/variables.ts`; components `packages/core/src/components.ts`; library `host/src/stores/library.ts` | No style profiles / themes yet |
| Code export (`DESIGN_SYSTEM/04`) | `packages/formats/src/export/html.ts`, `tailwind.ts` | PDF: `apps/desktop/src/main/pdf.ts` |
| `@archa/ui` | `apps/desktop/src/renderer/ui/controls.tsx`, `ui/settings/kit.tsx` | No separate package yet |
| CanvasKit renderer | Canvas2D: `packages/render/src/draw.ts`, `scene.ts` | Same `drawNode` contract → [RENDERING/01](./RENDERING/01-canvaskit-pipeline.md) |
| Yoga layout | Own flexbox subset: `packages/core/src/layout.ts` | → [DOCUMENT_MODEL/03](./DOCUMENT_MODEL/03-layout.md) |
| `skills/archadev/` | Compiled-in guides `packages/protocol/src/design-guides.ts` (`read_guide`) | → [MCP/04](./MCP/04-local-skill.md) |
| `apps/cli/src/commands/*` | All commands in `apps/cli/src/index.ts` | → [05](./CODE_MAP/05-interfaces.md) |
| `@archa/plugin-*`, `.archadev/` projects, journal, `index.sqlite`, tiles, render worker | **Not built** | Read their blueprint docs as the plan |

---

## Commands That Exist Today

On this machine run every script as `corepack pnpm@9.15.0 <cmd>` ([THIS.md](../knowledge/THIS.md)). Root scripts that fan out go through `scripts/pnpm.mjs`, which re-runs the pnpm that started them, so they work without a global `pnpm` and fail with the real exit code.

| Command | Does |
|---|---|
| `corepack pnpm@9.15.0 install` then `node node_modules/electron/install.js` | Install workspace + fetch the Electron binary |
| `corepack pnpm@9.15.0 --filter @archa/desktop dev` | Run the app in dev (isolate it: temp `ARCHA_HOME` + `--user-data-dir`) |
| `corepack pnpm@9.15.0 typecheck` | Typecheck every package (`-r typecheck`) |
| `corepack pnpm@9.15.0 lint` | Biome lint (`biome.json`), zero warnings; formatter off |
| `corepack pnpm@9.15.0 test` | `vitest run` (root `vitest.config.ts`) |
| `corepack pnpm@9.15.0 cli` | Build `apps/cli` (tsup bundle the app spawns as `archa mcp`) |
| `corepack pnpm@9.15.0 dist` | CLI build + electron-builder installer |
| `node scripts/gen-icon-sets.mjs` | Regenerate `packages/icons/data/` from the icon packages |
| `node scripts/gen-backlinks.mjs [--check]` | Regenerate / verify blueprint backlinks, code-map coverage, broken links, 150-line limit |

CI: `.github/workflows/ci.yml` runs install → typecheck → lint → test → docs:check on ubuntu + windows for every push and PR.

Not wired yet (target in [BEST_PRACTICE](./BEST_PRACTICE.md)): `pnpm bench`, `pnpm gen:api-docs`, Turborepo, e2e / release workflows.

---

## Keeping It True

- New, moved or deleted source file → add / fix its row in the matching `CODE_MAP/0N` file in the same change.
- Run `node scripts/gen-backlinks.mjs`; `--check` must exit 0 before a docs or code PR is done.
- A source comment `blueprint X/NN` must name a real doc — the script reports dangling ones.

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [BEST_PRACTICE](./BEST_PRACTICE.md) · [CLAUDE.md](../../CLAUDE.md) · [STRUCTURE](./STRUCTURE.md)
<!-- backlinks:end -->
