# Conventions

← [Plan INDEX](./INDEX.md)

## Knowledge system (Zemetiash)

| File | Purpose | Write when |
|---|---|---|
| `docs/knowledge/THIS.md` | Project identity, owner's style, do's and don'ts, dated insights | A new preference or insight is discovered |
| `docs/knowledge/LEARN.md` | One-line mistake log: `[YYYY-MM-DD] - [problem] - [solution] - [lesson]` | The owner corrects the agent, or the agent catches its own deviation |

Agents read both before every task. Outdated entries are struck through, never deleted.

`CLAUDE.md` (and `AGENTS.md` for Codex/agy with the same content) at the repo root: pointer to the knowledge files first, then the blueprint table, the stack snapshot and the non-negotiables. Created in phase 0.

## Blueprint

When a phase lands, its plan section becomes `docs/blueprint/<TOPIC>.md` + numbered sub-files describing what **is** built (paths, APIs, rules), with an `INDEX.md` holding the document map, hard constraints and file-creation checklists. Agents identify the blueprint sections covering an area before planning a change there.

## Code rules

| # | Rule |
|---|---|
| 1 | TypeScript strict, `noUncheckedIndexedAccess`, `import type` for type-only imports |
| 2 | ESLint flat config, `--max-warnings 0`; Prettier |
| 3 | `packages/core` imports nothing from Electron, React or Node-only modules that the CLI cannot load |
| 4 | Every cross-process message validated with its zod schema at the boundary |
| 5 | App UI: design tokens only, no raw colours; CVA variants; `displayName` on components; story + test per shared component |
| 6 | No `setState` in `useEffect` for derived data; Zustand for shared UI state; document state comes from the core, never duplicated |
| 7 | Never build a shell command string from user or agent input |
| 8 | Comments explain why, not what |

## File-creation checklists

**New node type**: schema in `packages/schema/nodes/` → render in `packages/render/` → layout behaviour in `core/layout` → lint rules → `execute` API docs regenerate → `.archa` round-trip fixture → golden image test.

**New MCP tool**: schema in `packages/mcp/tools/` → response follows the contract in [AGENTS_AND_MCP/01](./AGENTS_AND_MCP/01-mcp-server.md) → CLI equivalent or a parity-table note → skill reference updated → activity logging.

**New agent adapter**: adapter in `packages/agents/<id>/` → stream parser with recorded fixture transcripts → login/profile flow → `mcpConfig` → `status` deep check → docs.

## Git and releases (Gungnir)

- Branches `zemetia/<topic>`; PRs into `main`.
- Conventional commits: `feat(scope): …`, `fix(scope): …`, `chore(release): x.y.z`.
- `CHANGELOG.md` in Keep a Changelog format, grouped by area (Canvas, Files, Agents, MCP, Plugins, CLI).
- SemVer. `.archa` `formatVersion` is separate from the app version.
- Agent runs and parallel work use git worktrees.

## Tests

| Kind | Tool | Notes |
|---|---|---|
| Unit | Vitest | core, schema, formats, agents parsers |
| Render golden images | Vitest + CanvasKit in Node | Pixel diff with tolerance |
| Format round-trip | Vitest | Every fixture from every `formatVersion` |
| App e2e | Playwright `_electron` | Open project, draw, save, reopen |
| MCP contract | Vitest against headless core | Recorded `execute` sessions replayed |
| Agent integration | Opt-in, env-gated (`ARCHA_AGENT_IT=1`) | Live CLIs; never in default CI |
| Benchmarks | `core/bench` | Targets in [ARCHITECTURE/03](./ARCHITECTURE/03-cache-system.md) |

Tests use an isolated data dir (`ARCHA_HOME` → temp), never the person's `~/.archadev` (Gungnir lost live data to tests sharing a store).
