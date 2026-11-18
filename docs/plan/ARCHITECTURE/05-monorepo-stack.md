# 05 — Monorepo and stack

← [ARCHITECTURE](../ARCHITECTURE.md) · [Plan INDEX](../INDEX.md)

## Layout

```
archa-dev/
├── apps/
│   ├── desktop/          Electron app (main, preload, renderer)
│   └── cli/              `archa` binary (also hosts `archa mcp`)
├── packages/
│   ├── schema/           zod schemas for nodes, ops, files — source of truth
│   ├── protocol/         RPC contract between renderer / CLI / MCP / plugins and core
│   ├── core/             document, ops, transactions, undo, layout (Yoga), hashing, cache, file I/O
│   ├── render/           CanvasKit renderer, tiles, export rasteriser (browser + Node)
│   ├── mcp/              MCP server: tool definitions, execute sandbox, response shaping, lint
│   ├── agents/           agent adapters (claude, agy, codex, hermes), stream parsers, profiles, runs
│   ├── formats/          .archa read/write, .archadev layout, importers (.pen, svg, html), exporters
│   ├── design-system/    tokens, themes, style profiles, libraries, token export
│   ├── plugin-sdk/       public plugin API + types (published)
│   ├── plugin-host/      plugin loader, sandbox, capability broker
│   └── ui/               shared React components (CVA, Storybook) for the app shell
├── skills/
│   └── archadev/         the local skill (SKILL.md + references), shipped with the app
├── docs/
│   ├── plan/             this plan
│   ├── blueprint/        written as code lands (Zemetiash shape)
│   └── knowledge/        THIS.md, LEARN.md
├── CLAUDE.md · AGENTS.md · CHANGELOG.md
└── pnpm-workspace.yaml · turbo.json · tsconfig.base.json
```

Dependency direction: `schema` ← `protocol` ← `core` ← (`render`, `formats`, `design-system`) ← (`mcp`, `agents`, `plugin-host`) ← apps. `core` never imports Electron or React.

## Stack

| Concern | Choice | Note |
|---|---|---|
| Language | TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) | Same baseline as Zemetiash |
| Package manager / tasks | pnpm workspaces + Turborepo | |
| Desktop | Electron (current stable) + electron-vite | `utilityProcess` for core and plugin hosts |
| Packaging | electron-builder | NSIS (Windows), dmg, AppImage/deb; file associations; auto-update |
| Renderer UI | React 19, Zustand, Tailwind v4 (`@theme` tokens), CVA, Radix primitives | Zemetiash component rules |
| Canvas | CanvasKit (Skia WASM) | Same engine in app and Node |
| Layout | Yoga (WASM) | Flex auto-layout |
| Spatial index | rbush | |
| Validation | zod | One schema for format, RPC, MCP |
| MCP | `@modelcontextprotocol/sdk` | stdio + local streamable HTTP |
| `execute` sandbox | QuickJS (quickjs-emscripten) | No Node access, time and memory limits |
| Storage | Files + better-sqlite3 for cache index and activity search | |
| Zip | fflate | `.archa` container |
| CLI | commander + Node SEA or `pkg`-style single binary later | Ships inside the app too |
| Tests | Vitest (unit), Playwright (`_electron`) for app e2e, golden-image tests for render | |
| Lint | ESLint flat config, `--max-warnings 0`; Prettier | |
| Docs for agents | Generated from `schema` (API reference the skill and MCP serve) | |
