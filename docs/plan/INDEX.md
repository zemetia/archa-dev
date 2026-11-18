# ArchaDev Plan — Index

Cross-linked plan for building ArchaDev. Read this file first, then follow the table. Every file links back here.

This folder is the **plan**. Once code exists, each section graduates into `docs/blueprint/` (the Zemetiash blueprint shape: one index, one file per topic, numbered sub-files) and this folder stays as the record of intent.

---

## What ArchaDev is, in one paragraph

A local-first design tool in the spirit of pen.dev, built as **three surfaces over one core**: a TypeScript Electron **app** (canvas, layers, design system, review), an **`archa` CLI** (same capabilities, headless, scriptable), and a **local skill + MCP server** that lets the agents already on the machine — Claude Code, Antigravity (agy), Codex, Hermes — read and edit designs. A folder opened through the CLI or the Explorer menu "Open with ArchaDev" gets a `.archadev/` project space; anything can also be opened standalone and saved as a `.archa` file. `.pen` files can be imported. Plugins extend tools, panels, importers and styles.

---

## Document map

| File | Coverage | Read when |
|---|---|---|
| [00-VISION.md](./00-VISION.md) | Product, surfaces, principles, non-goals | First |
| [01-LINEAGE.md](./01-LINEAGE.md) | What we take from Accent, Gungnir and the Zemetiash blueprint | Before any design decision |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Processes, document model, cache, rendering & layers, stack | Building any core part |
| [FILES_AND_PROJECTS.md](./FILES_AND_PROJECTS.md) | `.archa`, `.archadev/`, entry points, `.pen` import | Anything touching disk |
| [AGENTS_AND_MCP.md](./AGENTS_AND_MCP.md) | MCP server, agent bridge, local skill, review loop | Anything an agent touches |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Tokens, themes, components, style profiles, libraries | Design-system features |
| [PLUGINS.md](./PLUGINS.md) | Plugin manifest, capabilities, sandbox, distribution | Extensibility |
| [CLI.md](./CLI.md) | `archa` command surface | CLI work |
| [EDITOR_UI.md](./EDITOR_UI.md) | App shell, toolbar, panels, shortcuts | App UI work |
| [CONVENTIONS.md](./CONVENTIONS.md) | Repo rules, knowledge system, changelog, branches, tests | All code changes |
| [ROADMAP.md](./ROADMAP.md) | Phases with "done when" | Planning work |
| [DECISIONS.md](./DECISIONS.md) | Decision log + open questions for the owner | Before reopening a decision |

---

## Reading order for an agent starting work

1. This file → [00-VISION.md](./00-VISION.md) → [CONVENTIONS.md](./CONVENTIONS.md)
2. [ROADMAP.md](./ROADMAP.md) — find the current phase
3. The topic files that phase names
4. [DECISIONS.md](./DECISIONS.md) — do not reopen a closed decision without a new reason

---

## Hard constraints (apply from day one)

| # | Rule | Why |
|---|---|---|
| 1 | One core, three surfaces. App, CLI and MCP call the same `@archa/core` API | Accent lesson: "one tool, two doors" kept MCP and CLI from drifting |
| 2 | The core host is the **single writer** of a document. Clients send ops with a base revision | Accent lost canvas markup to two tabs each saving its own copy |
| 3 | No reverse engineering of pen.dev. `.pen` is read only through tooling the user is licensed to run | pen licence forbids it; see [FILES_AND_PROJECTS/04-pen-import.md](./FILES_AND_PROJECTS/04-pen-import.md) |
| 4 | Every agent-facing tool response steers the next step (ids, lint, verify instruction) | The core of pen's quality, reproduced in Accent |
| 5 | The prompt to an agent CLI never passes through a shell | Gungnir: argv element or stdin only, no injection |
| 6 | Cache is always derivable. Deleting `.archadev/cache/` or `~/.archadev/cache/` loses nothing | Keeps cache bugs recoverable |
| 7 | TypeScript strict, `noUncheckedIndexedAccess`, lint at zero warnings | Zemetiash baseline |
