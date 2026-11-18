# 03 — Local skill

← [AGENTS_AND_MCP](../AGENTS_AND_MCP.md) · [Plan INDEX](../INDEX.md)

The skill is what turns a general coding agent into a good designer inside ArchaDev. It ships with the app in `skills/archadev/` and is installed per agent.

## Contents

```
skills/archadev/
├── SKILL.md                 when to use, the loop, hard rules, tool overview
└── references/
    ├── api.md               generated from @archa/schema (execute API + node properties)
    ├── process.md           orient → tokens first → components before screens → pilot then sweep → verify per section → final sweep
    ├── taste.md             anti-generic rules, written by us
    ├── layout.md            the layout vocabulary with WRONG/RIGHT pairs
    ├── design-system.md     tokens, components, slots, instance overrides
    ├── review.md            comments, rounds, ask/variants etiquette
    └── guides/              landing, web-app, mobile, slides, tables, code-export
```

`SKILL.md` stays short; references load on demand (`read_guide` serves the same files over MCP for agents without skill support).

## The loop it teaches

1. `get_state` (or use the pre-injected one).
2. Pick or confirm a style profile and tokens before drawing.
3. Build one section per `execute`, ending in a screenshot.
4. Read lint + screenshot; fix in place with a patch, never delete and redo.
5. Name every node; reuse components; mark unfinished frames.
6. `say` a one-line status between sections.
7. When unsure between options, `ask` or `variants` instead of guessing.
8. Final sweep: whole-document visitor for leftovers, then summary.

## Install per agent

`archa skill install [--agent claude|agy|codex|hermes|all] [--scope project|user]`

| Agent | Skill goes to | MCP registered in |
|---|---|---|
| Claude Code | `.claude/skills/archadev/` (project) or `~/.claude/skills/` (user); optionally as a Claude Code plugin with the MCP bundled | `.mcp.json` |
| agy | `.agent/skills/archadev/` or user equivalent | agy MCP config |
| Codex | Skills dir / `AGENTS.md` section pointing to the references | `~/.codex/config.toml` `[mcp_servers.archadev]` |
| Hermes | Hermes skills dir | Hermes MCP config |

Exact paths are resolved by each adapter's `mcpConfig()` and checked by `archa doctor`; the installer shows every file it will write before writing.

## Designer profiles

A designer profile bundles: which skill references are emphasised, default style profile, enabled plugins/tools, and taste overrides. Selected per project or per run (Accent roadmap item 6).

## Clean-room

All skill text is written by us. Nothing is copied from pen.dev's shipped docs (see [FILES_AND_PROJECTS/04-pen-import.md](../FILES_AND_PROJECTS/04-pen-import.md)).
