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
- [2026-11-18] Other agents (and the owner) work in `D:\Project\ArchaDev\archa-dev` at the same time and switch its branch. Do branch work in a separate git worktree (e.g. `D:\Project\ArchaDev\archa-dev-<topic>`); the repo uses `node-linker=hoisted`, so a worktree needs its own `corepack pnpm@9.15.0 install` + `node node_modules/electron/install.js`.
- [2026-11-18] UI direction (v0.2.1): owner likes pen.dev's floating-card shell (icon tabs, chat composer as its own card, sidebar toggles) but wants ArchaDev identity kept loud — violet accent, hexagon mark, agent-colour dots, orange agent-live state. Take layout ideas from screenshots only; write our own copy.
- [2026-11-18] Dev vs installed app: `productName` "ArchaDev" makes `electron-vite dev` share the installed app's single-instance lock (dev exits silently). Run dev with `npx electron-vite dev -- --user-data-dir=<tmp> --remote-debugging-port=9333` and a temp `ARCHA_HOME`.
- [2026-11-18] A freshly launched dev window takes OS focus; the owner may be typing elsewhere, so a stray Enter can send a focused chat composer. Don't leave the composer focused with a draft during automated UI checks.
- [2026-11-19] Left menu = Chat · History | Layers · Components · Slides · Library. "Slides" means every top-level frame as a thumbnail at its real ratio (a visual alternative to Layers), not a 16:9 deck. Components exist so agents reuse consistent pieces: v1 is `meta`-based (no format bump), the full instance model is Phase 7. Library is global (`~/.archadev/libraries`).
- [2026-11-19] Chat agents: owner wants every local agent in the picker (Claude Code, Antigravity, Codex now; Hermes etc. later) and models read from each CLI, not hardcoded. agy keeps MCP servers only in its global config (`~/.gemini/config/mcp_config.json`, `--settings` rejects `mcpServers`), so the app registers `archadev` with `agy mcp add`. agy runs are slow (~1-3 min even for a tiny prompt) — show streaming/progress, don't treat silence as a hang.
- [2026-11-19] Tool rail spec from the owner (pen.dev-style screenshots): pointer family Move/Scale/Hand; shape family Rectangle, Ellipse, Polygon, Icon, Script, Import image/SVG, Import Figma; then Pen, Text, Frame, Sticky, Web page ("browser like an iframe, scrollable, resizable, for looking at reference sites"), Comment (pins + Apply to agent, Open/Resolved panel), Variables table, Find layer. Script and Figma import are placeholders until the owner defines them. Built on `zemetia/tool-rail` (worktree `archa-dev-toolrail`).
- [2026-11-19] The Bash tool here mangles long heredocs that contain quotes/backticks ("unexpected EOF"); write patch scripts to the scratchpad with Write and run them with `python <file>`.
- [2026-11-19] Agent sessions: owner wants every chat to be its own session with a random name (never "claude"/"agy" on the canvas), running in parallel on the same document without mixing, and a visible cursor per session that follows the agent's work path (focus, copy, edit, create). Built as `agent.trail` events + `canvas/cursors.ts`.
- [2026-11-19] Several agent sessions may work in `archa-dev` main at once (seen: library/history work in parallel with chat work). Check `ListAgents` / recent mtimes before editing shared files and coordinate commits through one session.
- [2026-11-19] Claude / Codex sign-in in Settings must use the CLI's own OAuth: the CLI opens the provider login page in the browser and finishes via its localhost callback. Never spawn `claude auth login` with `BROWSER=none` — the paste-code link is only a fallback.
