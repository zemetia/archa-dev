# Vision

← [Plan INDEX](./INDEX.md)

## Product

ArchaDev is a design tool where people and local AI agents work on the same canvas. A person draws, arranges and reviews; an agent reads the document, builds screens through a small code-execution API, and gets back lint, geometry and screenshots that tell it what to fix next. Nothing needs a cloud account: the agents are the ones already installed and signed in on the machine.

## Three surfaces, one core

| Surface | Who uses it | What it is |
|---|---|---|
| **App** | People | Electron desktop editor: infinite canvas, layers, design system, comments, review rounds, agent activity |
| **CLI** (`archa`) | People, scripts, CI | Open a folder in the app, init a project, export, import, run the MCP server, check agent connections |
| **Local skill + MCP** | Agents | A skill file that teaches the design loop, and an MCP server exposing the document to Claude Code, agy, Codex, Hermes and anything else that speaks MCP |

All three call `@archa/core`. A feature is not done until it is reachable from the surfaces it belongs to (see [CLI.md](./CLI.md) for the parity table).

## Two ways to work

| Mode | How it starts | Where things are saved |
|---|---|---|
| **Project mode** | `archa .`, `archa open <dir>`, or right-click a folder → "Open with ArchaDev" | `<folder>/.archadev/` — designs, tokens, libraries, comments, agent config, cache |
| **Standalone mode** | Open the app directly, double-click a `.archa` file, or import a `.pen` | A single `.archa` file wherever the person saves it |

A standalone file can be moved into a project later (`archa adopt file.archa`), and a project design can be exported as a standalone `.archa`.

## Principles

1. **Local first.** Works offline. The server repo (`archa-dev-server`) is for later: sync, sharing, plugin registry. Nothing in this plan depends on it.
2. **Agent-native, agent-neutral.** No embedded model SDK owns the session. The app either launches an agent's own CLI or waits for an agent that connects (Accent's launch/listen split).
3. **Evidence over claims.** An agent's work is judged by lint, geometry reads and screenshots, never by its own report.
4. **Fast on big files.** The cache system is a feature, not an optimisation pass. Targets in [ARCHITECTURE/03-cache-system.md](./ARCHITECTURE/03-cache-system.md).
5. **Files people can read.** `.archa` is a zip of JSON; a project stores the same data unpacked so git diffs are meaningful.
6. **Extensible by plugins**, including by agents writing plugins.

## Non-goals (for v1)

- Real-time multiplayer between machines (the document model leaves room for it; see [DECISIONS.md](./DECISIONS.md)).
- A hosted model or bundled API keys.
- Pixel-for-pixel compatibility with Figma or pen.dev.
- Mobile apps.
