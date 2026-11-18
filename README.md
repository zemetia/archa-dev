# ArchaDev

An agent-first design canvas: a TypeScript Electron app, an `archa` CLI and an MCP server so the agents already on your machine (Claude Code today; agy, Codex, Hermes next) design on the canvas while you watch and edit alongside.

## Run

```bash
corepack enable            # or: corepack pnpm@9.15.0 <cmd>
pnpm install
pnpm cli                   # builds apps/cli/dist/archa.cjs (needed for agents)
pnpm dev                   # starts the desktop app (electron-vite)
pnpm test                  # core + format tests
```

## Design with an agent

**From the app (launch mode):** open the **Chat** tab, describe a screen, press Enter. ArchaDev runs `claude -p` headless with only the ArchaDev MCP tools. It builds on the canvas, takes screenshots of its own work and fixes what the checks report.

**From your terminal (listen mode):** register the MCP server once, then ask Claude Code to design in ArchaDev while the app is open:

```bash
claude mcp add archadev -- node /path/to/archa-dev/apps/cli/dist/archa.cjs mcp
```

Tools: `get_state`, `execute` (a JavaScript snippet run as one transaction in a QuickJS sandbox), `screenshot`, `export_svg`, `say`.

## What works now (MVP)

| Area | State |
|---|---|
| Canvas | Frames, rectangles, ellipses, text; select, marquee, move, resize, reparent by drop, reorder inside auto-layout; pan and zoom; double-click text to edit |
| Layout | Auto-layout row/column with gap, padding, align, justify, and hug/fill/fixed sizing |
| Panels | Layers (rename, hide, lock); Design (position, size, auto layout, appearance, fill, stroke, shadow, text, align, export) |
| Files | `.archa` (zip of JSON), several documents in tabs, Save / Open, PNG and SVG export |
| Core | A single-writer core host, per-author undo, Merkle content hashes, a frame bitmap cache |
| Agents | MCP over the running app, a QuickJS `execute` with rollback and `editId` patch retry, lint in every reply, screenshot dedup, agent activity on the canvas |
| CLI | `archa mcp`, `archa status`, `archa open` |

Not built yet: `.archadev/` project mode and the Explorer menu, components, variables, plugins, `.pen` import, CanvasKit renderer, adapters for agy, Codex and Hermes. See [docs/plan/ROADMAP.md](docs/plan/ROADMAP.md).

Docs for contributors and agents: [CLAUDE.md](CLAUDE.md) → [docs/blueprint/INDEX.md](docs/blueprint/INDEX.md).
