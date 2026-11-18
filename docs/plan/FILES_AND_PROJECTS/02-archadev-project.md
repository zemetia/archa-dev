# 02 — The `.archadev/` project space

← [FILES_AND_PROJECTS](../FILES_AND_PROJECTS.md) · [Plan INDEX](../INDEX.md)

Created the first time a folder is opened with ArchaDev through the CLI, the Explorer/Finder menu, or "Open folder" in the app (with a confirmation — the app never creates `.archadev/` silently in a folder it was not asked to manage).

## Layout

```
<project>/
├── .archadev/
│   ├── project.json        id, name, formatVersion, default design, linked code targets (dev URL, src dir), designer profile
│   ├── designs/
│   │   └── <name>/         unpacked .archa (see 01-archa-format)
│   ├── assets/             content-addressed store shared by all designs
│   ├── tokens/             tokens.json (DTCG) + generated tokens.css — the project's design system
│   ├── libraries/          local component libraries (and links to global ones)
│   ├── comments/           threads per design
│   ├── rounds/             review rounds: request, attachments, agent summary, before/after
│   ├── decisions/          pending and answered `ask` / `variants` decisions
│   ├── activity.jsonl      every tool call and agent event (append-only)
│   ├── agents.json         which agents are enabled here, default agent, per-agent model, run isolation
│   ├── plugins.json        plugins enabled for this project + their granted capabilities
│   ├── mcp.json            generated MCP client snippets for each agent
│   ├── journal/            op journal for crash recovery          (gitignored)
│   ├── cache/              all derivable caches                   (gitignored)
│   ├── runtime/            lock file, socket path                  (gitignored)
│   └── .gitignore          generated: journal/, cache/, runtime/
└── (the person's own files)
```

## What goes in git

Committed: `project.json`, `designs/`, `assets/`, `tokens/`, `libraries/`, `comments/`, `decisions/`, `agents.json`, `plugins.json`. Optional (setting): `rounds/` and `activity.jsonl` — useful history, but can be large.

Never committed: `journal/`, `cache/`, `runtime/`, any credential. Agent login profiles live only in `~/.archadev/`.

## Agent integration on init

`archa init` (or the first open) offers, one question at a time:

1. Install the ArchaDev skill for the agents found on this machine (Claude Code, agy, Codex, Hermes).
2. Add the MCP server to the project's agent config (`.mcp.json` for Claude Code, the equivalents for others) — shows the diff first.
3. Link a code target: dev server URL and source folder, if this is an app repo (for code frames and design-to-code).

## Global `~/.archadev/`

```
~/.archadev/
├── config.json          preferences, telemetry choice, accepted terms
├── recent.json          recent files and projects
├── profiles/            agent login profiles (per agent, per account) — see AGENTS_AND_MCP/02
├── plugins/             installed plugins (versioned)
├── libraries/           global libraries, style profiles
├── cache/               global cache (fonts, plugin bundles, standalone assets)
├── journal/             standalone-file journals
├── runtime/             running app's socket + token
└── logs/
```
