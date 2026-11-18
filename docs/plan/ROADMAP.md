# Roadmap

← [Plan INDEX](./INDEX.md)

Phases are ordered by dependency. Each has a "done when" that can be checked, not claimed.

| # | Phase | Deliverables | Done when |
|---|---|---|---|
| 0 | **Foundations** | Monorepo skeleton (pnpm, turbo, tsconfig, eslint, vitest), `CLAUDE.md` + `AGENTS.md`, `docs/knowledge/THIS.md` + `LEARN.md`, `docs/blueprint/INDEX.md`, CHANGELOG, CI (lint, typecheck, test on Windows + macOS + Linux) | CI green on an empty package graph; an agent following CLAUDE.md finds every doc |
| 1 | **Document core** | `schema`, `protocol`, `core`: nodes, ops, transactions, undo, revisions, hashing, Yoga layout; `formats`: `.archa` read/write packed + unpacked; headless `archa export --to svg/png` | Round-trip tests pass; a script builds a 1k-node document and exports a correct PNG headless |
| 2 | **Editor shell** | Electron app, core host process, renderer with CanvasKit, tools: select, shape, text, frame, hand; layers panel; design panel basics; save/open/autosave | Person draws a screen, saves `.archa`, reopens it identical; e2e test covers it |
| 3 | **Cache & performance** | Tile cache, node bitmap cache, R-tree, thumbnails, asset store, cache index, benchmarks | Benchmarks meet the targets on the reference machine; deleting cache dirs changes nothing but speed |
| 4 | **Project mode & entry points** | `.archadev/` layout, `archa open/init`, single instance, Windows registry verbs + `.archa` association, macOS/Linux equivalents, standalone mode, pack/unpack/adopt | Right-click a folder → app opens it with `.archadev/`; `archa .` from a terminal does the same; double-click `.archa` opens standalone |
| 5 | **MCP + local skill (listen mode)** | MCP server (stdio), `get_state`, `execute` in QuickJS with response contract + lint + patch retry, `screenshot`, `export`; skill v1; `archa skill install`; activity log + agent cursor | Claude Code in a terminal, with only the skill and MCP, builds a 3-screen flow in an open project; the person watches it live; lint ends clean |
| 6 | **Agent bridge (launch mode)** | Adapters claude, agy, codex, hermes; profiles; model picker; runs with worktrees; timeline; steering; `archa run`, `archa status` | One task each through all four agents from the app; interrupt + steer + resume works on Claude and agy |
| 7 | **Design system** | Variables with theme axes, components/variants/slots, libraries (doc, project, global), style profiles (Accent's 7 ported), token export (DTCG, CSS, `@theme`) | Same prompt with two style profiles gives clearly different coherent results; tokens round-trip into a Zemetiash-style `globals.css` |
| 8 | **Review loop** | Comments, markup layer, rounds, `review_wait/done`, `ask`/`variants`, History, Ctrl+K, Ctrl+L | A full round: person comments → agent fixes → History shows before/after; a `variants` decision answered from the modal |
| 9 | **Import / export** | SVG + HTML/URL importer, PNG/PDF/SVG/HTML/React exporters, import report; `.pen` path A (via pen's own export) | A pen-exported page imports with a report; React export of a component set compiles and matches its screenshot |
| 9b | **`.pen` path B** | Only if the licence review allows | Review answer recorded in DECISIONS |
| 10 | **Plugins** | Plugin host, SDK, manifest, permissions, panels, generators (SVG, background removal, tracing), `archa plugin new/link` | A plugin scaffolded by an agent adds a generator and a panel without touching core |
| 11 | **Code frames & browser** | Code-frame node, in-app browser the agent drives, Inspect workspace, design-to-code guide | Agent builds a component in a linked repo and the code frame matches the design frame (audit clean) |
| 12 | **Release** | electron-builder installers, signing, auto-update, Windows 11 modern context menu (sparse MSIX), onboarding (`archa setup`) | Fresh machine install → open folder from Explorer → agent connected in under 5 minutes |
| 13 | **Multi-agent jobs** | Planner/worker runs with shared todolist, cost-aware routing (Gungnir) | A 20-screen job finishes with workers in parallel and no duplicated components |

## Status (2026-11-18)

MVP built on branch `zemetia/mvp-app`. Covers phase 0 except lint/CI, phase 1, most of phase 2, and phase 5 (listen mode), plus Claude launch mode from phase 6 and Settings → Agents login profiles (Claude, agy, Codex — blueprint AGENT_BRIDGE/02).

| Departure from the blueprint | Reason | Follow-up |
|---|---|---|
| Canvas2D renderer instead of CanvasKit | Ship a working canvas first; the `drawNode` contract is unchanged | Phase 3: CanvasKit backend |
| Own flex layout instead of Yoga | Synchronous, deterministic in core and mirror | Revisit if layout grows past the narrow vocabulary |
| Approximate text metrics in the core | The core host has no DOM | Renderer-reported metrics or CanvasKit paragraph in Node |
| No headless core for `archa mcp` | Needs the app open | Phase 5 follow-up |
| No ESLint / Turbo / CI yet | Time | Phase 0 completion |

## Suggested first milestone (MVP)

Phases 0 → 2 → 4 (entry points) → 5 (MCP listen mode). That gives the core promise end to end: open a folder from Explorer, draw, and let a local agent design in it — before investing in launch mode, plugins and imports.
