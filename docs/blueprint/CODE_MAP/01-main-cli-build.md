# Code Map — 01: Main, Preload, CLI, Build

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [02 — Core host →](./02-core-host.md)

Each row: file → what it does → the blueprint docs that govern it. Links are relative to this file.

---

## Electron main process — `apps/desktop/src/main/`

| File | Does | Governed by |
|---|---|---|
| [`main/index.ts`](../../../apps/desktop/src/main/index.ts) | Windows, argv → open intent, single-instance lock, spawns the core host `utilityProcess` with a clean env (strips `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `ORCA_*`), relays core ↔ browser bridge, guards `<webview>` (embed nodes), dialogs | [ARCHITECTURE/01](../ARCHITECTURE/01-processes.md), [ARCHITECTURE/03](../ARCHITECTURE/03-startup-lifecycle.md), [ENTRY_POINTS/01](../ENTRY_POINTS/01-cli-single-instance.md), [BROWSER](../BROWSER.md) |
| [`main/browser.ts`](../../../apps/desktop/src/main/browser.ts) | `BrowserManager`: agent-driven browser tabs as `WebContentsView`s in their own session, driven over CDP | [BROWSER](../BROWSER.md) |
| [`main/browser-page.ts`](../../../apps/desktop/src/main/browser-page.ts) | `PAGE_LIB`: in-page helper (`window.__archa`) injected before each browser action | [BROWSER](../BROWSER.md) |
| [`main/browser-url.ts`](../../../apps/desktop/src/main/browser-url.ts) | `normalizeUrl` / `addressToUrl`: host → http(s), path → file://, refuses `javascript:` | [BROWSER](../BROWSER.md) |
| [`main/embed-shot.ts`](../../../apps/desktop/src/main/embed-shot.ts) | `embed:screenshot`: JPG of a canvas web page (`wide` at 1440 × 900 or `object` as shown) via the guest's CDP, then a save dialog | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) |
| [`main/pdf.ts`](../../../apps/desktop/src/main/pdf.ts) | `printHtmlToPdf`: hidden window prints the core's standalone HTML of a node, one page sized to it | [RENDERING/03](../RENDERING/03-export.md), [DESIGN_SYSTEM/04](../DESIGN_SYSTEM/04-code-export.md) |

## Preload — `apps/desktop/src/preload/`

| File | Does | Governed by |
|---|---|---|
| [`preload/index.ts`](../../../apps/desktop/src/preload/index.ts) | Forwards the core `MessagePort` via `window.postMessage` (ports cannot cross `contextBridge`); browser-pane bounds + tab state bridge | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [BROWSER](../BROWSER.md) |

---

## CLI — `apps/cli/`

| File | Does | Governed by |
|---|---|---|
| [`cli/src/index.ts`](../../../apps/cli/src/index.ts) | commander root: `mcp`, `status`, `browser`, `open` (full list → [05](./05-interfaces.md)) | [CLI/01](../CLI/01-commands.md), [CLI/02](../CLI/02-parity-exit-codes.md) |
| [`cli/src/connect.ts`](../../../apps/cli/src/connect.ts) | `connectCore`: reads `runtime/core.json`, connects to the core socket with the token; `CoreUnavailable` when the app is not running (no headless core yet) | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [CLI/01](../CLI/01-commands.md) |
| [`cli/src/mcp.ts`](../../../apps/cli/src/mcp.ts) | `archa mcp`: stdio MCP server; each tool relays to an `agent.*` RPC on the running core | [MCP/01](../MCP/01-transports-tools.md), [MCP/03](../MCP/03-response-contract-lint.md) |
| [`cli/tsup.config.ts`](../../../apps/cli/tsup.config.ts) | Bundles the CLI (workspace sources included) into one file the app spawns | [STRUCTURE/01](../STRUCTURE/01-root-apps.md) |

---

## Build and config

| File | Does | Governed by |
|---|---|---|
| [`desktop/electron.vite.config.ts`](../../../apps/desktop/electron.vite.config.ts) | main / preload / renderer / core-host builds; workspace packages bundled from TS source | [STRUCTURE/01](../STRUCTURE/01-root-apps.md) |
| [`desktop/electron-builder.yml`](../../../apps/desktop/electron-builder.yml) | Installer, `.archa` association, bundled CLI | [ENTRY_POINTS/02](../ENTRY_POINTS/02-os-integration.md), [BEST_PRACTICE/03](../BEST_PRACTICE/03-git-changelog-release.md) |
| [`package.json`](../../../package.json) | Root scripts: `dev`, `build`, `typecheck`, `test`, `cli`, `dist` | [CODE_MAP](../CODE_MAP.md) → Commands |
| [`tsconfig.base.json`](../../../tsconfig.base.json) | Strict compiler options for every package | [BEST_PRACTICE/01](../BEST_PRACTICE/01-typescript-eslint.md) |
| [`vitest.config.ts`](../../../vitest.config.ts) | One Vitest run over `apps/*/test` and `packages/*/test` | [BEST_PRACTICE/02](../BEST_PRACTICE/02-testing.md) |
| [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml), [`.npmrc`](../../../.npmrc) | Workspace globs; `node-linker=hoisted` (a worktree needs its own install) | [STRUCTURE/02](../STRUCTURE/02-packages.md) |
| [`CHANGELOG.md`](../../../CHANGELOG.md) | Keep a Changelog, one entry per user-visible change | [BEST_PRACTICE/03](../BEST_PRACTICE/03-git-changelog-release.md) |

## Scripts — `scripts/`

| File | Does | Governed by |
|---|---|---|
| [`scripts/gen-icon-sets.mjs`](../../../scripts/gen-icon-sets.mjs) | lucide, Tabler, Phosphor, Heroicons, Simple Icons → `packages/icons/data/*.json` (one path per icon) | [DESIGN_SYSTEM/05](../DESIGN_SYSTEM/05-icons-assets.md) |
| [`scripts/gen-backlinks.mjs`](../../../scripts/gen-backlinks.mjs) | Writes every blueprint doc's Backlinks block; `--check` also reports broken links, unmapped source files, dangling `blueprint X/NN` comments, files over 150 lines | [CODE_MAP](../CODE_MAP.md), [KNOWLEDGE](../KNOWLEDGE.md) |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** — (only its hub and the indexes)
<!-- backlinks:end -->
