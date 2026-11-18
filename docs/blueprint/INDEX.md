# Blueprint Index

Cross-linked reference for AI agents building ArchaDev. Read this file first; navigate via the table below.

> **Status: pre-code.** The blueprint is the **build contract**: where code goes, which contracts it follows, which rules it obeys. Each doc names the roadmap phase that implements it. When code lands, update the doc to match what *is* built — the blueprint must never disagree with the repo. Intent and history live in [docs/plan/](../plan/INDEX.md).

---

## Document Map

| File | Coverage | Use When |
|---|---|---|
| [STRUCTURE.md](./STRUCTURE.md) | Repo tree, packages, runtime dirs (`.archadev/`, `~/.archadev/`) | Finding where something lives |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Processes, IPC, RPC protocol, startup, single writer | Anything crossing a process boundary |
| [DOCUMENT_MODEL.md](./DOCUMENT_MODEL.md) | Nodes, properties, ops, transactions, undo, layout, hashing | Touching document data |
| [CACHE.md](./CACHE.md) | Cache layers, keys, tiles, disk stores, eviction, budgets | Performance work, anything memoised |
| [RENDERING.md](./RENDERING.md) | CanvasKit pipeline, render layers, layer tree, hit testing, export | Canvas or export work |
| [FILE_FORMATS.md](./FILE_FORMATS.md) | `.archa`, `.archadev/`, migrations, importers, `.pen` rules | Reading or writing disk |
| [ENTRY_POINTS.md](./ENTRY_POINTS.md) | CLI open, Explorer/Finder menu, file association, single instance | How the app gets opened |
| [MCP.md](./MCP.md) | MCP transports, tools, `execute` API, response contract, lint | Agent-facing tools |
| [AGENT_BRIDGE.md](./AGENT_BRIDGE.md) | Agent adapters, roster, profiles, runs, steering, review loop | Launching or talking to agents |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Variables, themes, components, libraries, style profiles, code export | Design-system features |
| [APP_UI.md](./APP_UI.md) | App shell, panels, CVA components, Zustand, UI tokens | Renderer UI work |
| [PLUGINS.md](./PLUGINS.md) | Manifest, capabilities, sandbox, permissions, distribution | Extensibility |
| [CLI.md](./CLI.md) | `archa` commands, parity, exit codes | CLI work |
| [BEST_PRACTICE.md](./BEST_PRACTICE.md) | TypeScript, ESLint, tests, git, changelog, anti-patterns | All code changes |
| [KNOWLEDGE.md](./KNOWLEDGE.md) | Rules for THIS.md + LEARN.md — the learning system | Before every task; after every correction |
| [REFERENCE.md](./REFERENCE.md) | pen.dev desktop stack (comparison only) + clean-room boundary | Choosing libraries; never for copying |

---

## Stack Reference

| Concern | Choice | Config / Entry |
|---|---|---|
| Language | TypeScript strict | `tsconfig.base.json` |
| Workspace | pnpm workspaces + Turborepo | `pnpm-workspace.yaml`, `turbo.json` |
| Desktop | Electron + electron-vite | `apps/desktop/electron.vite.config.ts` |
| Packaging | electron-builder | `apps/desktop/electron-builder.yml` |
| Renderer UI | React 19, Zustand, Tailwind v4, CVA, Radix | `apps/desktop/src/renderer/` |
| Canvas | CanvasKit (Skia WASM) | `packages/render/` |
| Layout | Yoga (WASM) | `packages/core/src/layout/` |
| Spatial index | rbush | `packages/core/src/index/` |
| Schemas | zod | `packages/schema/` |
| MCP | `@modelcontextprotocol/sdk` | `packages/mcp/` |
| Sandbox | quickjs-emscripten | `packages/mcp/src/execute/` |
| Zip | fflate | `packages/formats/` |
| Cache index | better-sqlite3 | `packages/core/src/cache/` |
| CLI | commander | `apps/cli/` |
| Tests | Vitest, Playwright `_electron` | `vitest.config.ts` |
| Main-process utils | electron-store, chokidar, pino, electron-updater, Sentry (opt-in) | `apps/desktop/src/main/` → [REFERENCE](./REFERENCE.md) |
| Search / code view | @vscode/ripgrep, CodeMirror 6 | Phase 9+ |

---

## Canonical Import Paths

```ts
import type { Node, NodeId, Op, Transaction } from '@archa/schema';
import { nodeSchema, opSchema, archaManifestSchema } from '@archa/schema';
import { createClient, type CoreApi } from '@archa/protocol';
import { openDocument, applyTransaction } from '@archa/core';
import { createRenderer, exportImage } from '@archa/render';
import { readArcha, writeArcha, openProject } from '@archa/formats';
import { resolveVariables, loadStyleProfile } from '@archa/design-system';
import { createMcpServer } from '@archa/mcp';
import { adapters, startRun } from '@archa/agents';
import { definePlugin } from '@archa/plugin-sdk';
import { Button, Panel, Tooltip } from '@archa/ui';
```

Never import a package's internals (`@archa/core/src/...`). Public API = the package's `src/index.ts`.

---

## Hard Constraints

| # | Rule | Violation |
|---|---|---|
| 1 | App, CLI and MCP call `@archa/core` — no duplicated logic | Surfaces drift apart |
| 2 | Only the core host writes a document; clients send ops with `baseRevision` | Lost work (Accent two-tabs bug) |
| 3 | `packages/core` imports no Electron, React or DOM | CLI/headless breaks |
| 4 | Every cross-process message is validated with its zod schema at the boundary | Silent corruption |
| 5 | Prompts to agent CLIs go as one argv element or stdin — never a shell string | Command injection |
| 6 | Every cache is derivable; deleting a cache dir loses no data | Unrecoverable cache bugs |
| 7 | No pen.dev reverse engineering; no copied pen docs, styles or libraries | Licence breach |
| 8 | Every `execute` reply follows the response contract | Agents stop self-correcting |
| 9 | App UI: tokens only, no raw colours | Theme breaks |
| 10 | `pnpm lint` exits 0 (`--max-warnings 0`); `pnpm typecheck` clean | CI red |
| 11 | Tests use an `ARCHA_HOME` temp dir, never the real `~/.archadev` | Tests wipe user data |
| 12 | Every `.archa` format change bumps `formatVersion` + ships a migration + fixture | Old files fail to open |

---

## File Creation Checklists

### New node type
- [ ] Schema `packages/schema/src/nodes/<type>.ts` + add to the `nodeSchema` union
- [ ] Draw `packages/render/src/draw/<type>.ts`
- [ ] Layout behaviour (if container) in `packages/core/src/layout/`
- [ ] Lint rules in `packages/mcp/src/lint/rules/`
- [ ] Round-trip fixture `packages/formats/test/fixtures/` + golden image `packages/render/test/golden/`
- [ ] `pnpm gen:api-docs` → skill `references/api.md` regenerates

### New MCP tool
- [ ] `packages/mcp/src/tools/<tool>.ts` with zod input schema
- [ ] Reply follows [MCP/03](./MCP/03-response-contract-lint.md)
- [ ] CLI equivalent or a row in the parity table ([CLI/02](./CLI/02-parity-exit-codes.md))
- [ ] Skill reference updated; activity logging wired

### New agent adapter
- [ ] `packages/agents/src/adapters/<id>/` implementing `AgentAdapter`
- [ ] Stream parser + recorded transcript fixtures
- [ ] Login/profile flow, `listModels`, `mcpConfig`, `status` deep check

### New RPC method
- [ ] Request/response schema in `packages/protocol/src/methods/`
- [ ] Handler in `packages/core/src/rpc/`; client typing comes from the schema
