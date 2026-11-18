# THIS — Project & Developer Knowledge

> Living document. Updated by AI whenever a new insight, pattern, or preference is discovered about this project or developer. Do not delete entries — mark outdated ones with `~~strikethrough~~`.

---

## Developer Profile

- GitHub `zemetia`. Works in Indonesian and English; replies in the language the request was written in.
- Builds several products in parallel with local agents (Claude Code, Antigravity/agy, Codex, Hermes) and Orca worktrees.
- Expects production-grade architecture and documentation written for AI agents (Zemetiash blueprint style).
- Prefers concise answers and plans with checkable "done when" criteria.

---

## Project Identity

- **ArchaDev**: local-first design tool like pen.dev — Electron app + `archa` CLI + local skill/MCP for local agents.
- Lineage: Accent design (`D:\Project\accent-design`) for the design harness and review board; Gungnir (`C:\Gungnir`) for driving coding-agent CLIs; Zemetiash (`D:\Project\zemetiash`) for the docs and knowledge system.
- Sibling repo `archa-dev-server` (`D:\Project\ArchaDev\archa-dev-server`) — future sync/registry; out of scope for v1.
- `docs/plan/` = intent and decisions; `docs/blueprint/` = build contract; `docs/knowledge/` = learned context.

---

## Do's

- Read the relevant blueprint section before planning any change.
- Keep every blueprint file under 150 lines; split into numbered sub-files.
- Route all document changes through the core host as ops.
- Keep `.pen` work clean-room: no reverse engineering, no copied pen text.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` before declaring work done.

---

## Don'ts

- Don't pass agent prompts through a shell.
- Don't let tests touch the real `~/.archadev`.
- Don't add features the owner did not ask for; propose them instead.

---

## Insights

- [2026-11-18] Repo initialised; plan written in `docs/plan/`, blueprint in `docs/blueprint/`.
- [2026-11-18] Owner wants the app to feel like pen.dev / Figma but **agent-first** (reference screenshot: tabs, Layers/Chat left, tool rail, canvas, Design panel right). MVP built on `zemetia/mvp-app`; departures from the blueprint are listed in `docs/plan/ROADMAP.md` → Status.
- [2026-11-18] pnpm is not installed globally on this machine — use `corepack pnpm@9.15.0 <cmd>`. Electron's binary must be fetched with `node node_modules/electron/install.js` after install.
- [2026-11-18] The owner tests the app while agents work; don't kill a running ArchaDev window without asking (unsaved docs).
- [2026-11-18] Settings → Agents (Ctrl+,) manages Claude Code / Antigravity / Codex login profiles, modelled on Gungnir's coding-agent accounts (`remediate/profiles.go`, `server/coding_agent_*.go`, `web/src/components/coding-agent-accounts.tsx`). The agy login lives in Windows Credential Manager as `gemini:antigravity`.
- [2026-11-18] Run `corepack pnpm@9.15.0 <cmd>` directly (e.g. `-r typecheck`, `--filter @archa/desktop dev`) — root scripts call bare `pnpm` and fail. `pnpm-lock.yaml` on main lists `electron-builder` that `apps/desktop/package.json` lacks, so `--frozen-lockfile` fails.
- [2026-11-18] Settings is a grouped dialog (AI providers / Skills / MCP servers / Connect / GitHub / Integrations / About), one file per page in `renderer/ui/settings/`. Owner wants real brand logos (fetched from simple-icons / vendor sites) rather than letter marks, and "coming soon" placeholders for planned integrations like GitHub.
- [2026-11-18] Other agents (and the owner) work in `D:\Project\ArchaDevrcha-dev` at the same time and switch its branch. Do branch work in a separate git worktree (e.g. `D:\Project\ArchaDevrcha-dev-<topic>`); the repo uses `node-linker=hoisted`, so a worktree needs its own `corepack pnpm@9.15.0 install` + `node node_modules/electron/install.js`.
