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
- [2026-11-19] Owner asked for `.pen` import (example files in `D:\Project\.design`) and export to HTML + CSS / HTML + Tailwind / PDF / PNG / JPG. Export built on `zemetia/pen-import-export` (worktree `archa-dev-pen`). `.pen` is encrypted: the only licence-safe reader is the person's own pen MCP server (`C:\Program Files\Pen\resources\app.asar.unpacked\out\mcp-server-windows-x64.exe`), which needs the Pen app running and counts against the owner's pen.dev plan (it was over its MCP limit on this date).
- [2026-11-19] Owner wants the built-in Chat tab to feel like pen.dev's composer: fast, fluent, better results "by good information and control via internal skill and tool calling". Built warm CLI sessions (Claude + agy keep one process per thread via stream-json stdin), compiled-in design guides (`read_guide`), `icon()`, auto-fix/auto-screenshot, selection chip, queue/Send now. agy stdin format: `{"event":"user","message":{"content":"…"}}` with `-p=` and `--input-format stream-json`; Claude interrupt = `control_request` `{subtype:"interrupt"}`.
- [2026-11-19] Live-test the chat with `ARCHA_HOME=<tmp>` + `npx electron-vite dev -- --user-data-dir=<tmp> --remote-debugging-port=9333` (outside the sandbox), drive the core with a small client (`chat.send`, listen to `doc.applied` / `chat.message`), and add a test Claude account in the temp home when the host `~/.claude` login has expired.
- [2026-11-20] Owner asked for: drag & drop photos, Canva-like background removal, `/skill` mentions in chat, layers draggable out of any frame, **minimal-by-default designs** (no extra info unless asked) and expandable agent steps in chat (see what inspect / execute did). Built on `zemetia/canvas-media` (worktree `archa-dev-media`). Background removal runs BiRefNet lite (MIT) on the CPU in an ML host utility process; model in `ARCHA_HOME/cache/models`.
- [2026-11-19] Owner dislikes the dashed trail behind agent cursors; wants the cursor itself to feel alive. The goal: agent cursors should feel like another human working alongside you, even though it is AI — judge motion by "would a person move a mouse like this" (pauses, quick strokes, clicks), not by smoothness alone. Also expects to paste images (Ctrl+V) both onto the canvas and into the chat composer.
- [2026-11-20] Owner wants canvas changes (add / change / remove) to animate, in the same spirit as the human-like cursors. Built as `canvas/changes.ts`: agents and discrete commands animate, the person's own drags and panel edits stay instant. The owner also works in the dev window agents launch (saves real files to OneDrive) — test in a second isolated instance, never in theirs.
- [2026-11-19] Design panel spec from the owner (pen.dev screenshots): name header, Create Component, Context box, Alignment, Position, Flex layout with 9-dot grid / gap / space between / space around / padding, Dimensions with Fill + Hug checkboxes, Appearance, Fill (hex + %), Stroke, Effects menu (drop/inner shadow, layer/background blur), Code (HTML + Tailwind, copy/export), Export. Owner wants agents to use the same capabilities — arrange logic lives in `@archa/core` `arrange.ts` and is exposed to `execute` and the `inspect` MCP tool. Rotation/flip and a shader effect were left out (need schema + renderer work) — propose before building.
- [2026-11-19] Driving the dev renderer over CDP: Vite's root is `src/renderer`, so modules import as `/lib/store.ts` and packages as `/@fs/D:/.../packages/core/src/index.ts` (same instances the app uses). The window usually lacks OS focus: `el.blur()` fires nothing, dispatch `focusout` to trigger React `onBlur`; `Page.captureScreenshot` sometimes stalls — wrap calls in `timeout`.
- [2026-11-20] Owner wants the blueprint complete and easy for AI to search. Navigation now: `docs/blueprint/TOPICS.md` (A–Z keyword → doc → code), `docs/blueprint/CODE_MAP/` (every source file → purpose → governing docs; RPC / MCP tools / CLI / runtime paths / env vars / tests as built), and a generated **Backlinks** footer on every blueprint doc (`node scripts/gen-backlinks.mjs`; `pnpm docs:check` = `--check`). Most blueprint docs describe the target; CODE_MAP says where code lives today (e.g. MCP + agents live in `apps/desktop/src/core-host/`, not `packages/mcp` / `packages/agents`).
- [2026-11-20] Owner wants workflow/flowchart/page-map lines: connectors that stick to layers, 90° (elbow) or straight, with corner radius and arrow caps. Built as the `connector` node (routing derived in `runLayout`), tool L.
- [2026-11-20] Live UI checks: port 9333 may already belong to another agent's dev app — pick another `--remote-debugging-port` and confirm the CDP target's URL is your Vite port. When the dev window is hidden/occluded, CDP mouse moves arrive late (drags end at wrong points) and rAF never draws; instead `await import('/lib/store.ts')` in the page (same module instance as the app), dispatch synthetic `PointerEvent`s on the canvas wrapper (stub `setPointerCapture`), and render with `drawPage`/`drawOverlay` onto your own canvas for screenshots.
- [2026-11-20] Owner wants an **Orchestrate mode** in chat: the agent you chat with leads and sends other agents to research or build different sections of the same page in parallel ("faster and more detailed because the task is split"). They asked for a team visualisation: circles joined by lines, showing which AI each agent is and what prompt it got; clicking an agent goes to its chat; the view fills the window until Back / clicking an agent. Built on `zemetia/orchestrate` (worktree `archa-dev-orchestrate`), blueprint AGENT_BRIDGE/06.
- [2026-11-20] Owner wants design skills that belong to ArchaDev itself (in the repo under `skills/`, not in `~/.agents`), each with real examples, references and the ArchaDev tools agents must call. Built `skills/design-website|pdf|slides|flows` on `zemetia/design-skills` (worktree `archa-dev-design-skills`). Canvas examples are checked by running them through `AgentExecutor` headless and exporting with `exportHtmlStandalone`; PPTX is checked by rendering through PowerPoint COM.
- [2026-11-20] Owner expects features to be complete, not a first slice: asked why the icon picker was lucide-only and wanted every common set, brand logos, own uploads and an Assets panel at once. When a feature has an obvious "full" version (all common icon sets, all states), build that or say clearly what is left out and why.
- [2026-11-20] Owner dislikes eyebrow labels (small uppercase text above headings) and finds Antigravity's designs over-decorated yet flat. design-website now opens with five hard rules (no eyebrows, decoration budget, three planes of depth with one overlap, layered product hero, alternating rhythm) plus a generic-vs-designed worked example; examples must obey them because agents copy examples over prose.
- [2026-11-20] Owner wants design output that is minimal but never boring, with good dimension, ratio and presentation, across web, A4 PDF, 16:9 slides and Instagram 4:5. Each design skill now opens with shared rules (no eyebrows, one hero at extreme scale, bleed, ground/raised/floating overlap, one motif, alternating grounds, content diet, budget) and has several distinct example concepts; `design-social` added for IG posts and carousels.
- [2026-11-21] Owner expects SVG that AI writes to show up as a real drawing — on the canvas and in chat — not as a text layer or a code block only. Built on `zemetia/svg-support` (worktree `archa-dev-svg`): DOM-free `importSvg` in `@archa/formats`, `svg()` + `place_svg`, chat `SvgBlock`, guide `svg`, skill `design-svg`.
- [2026-11-21] New brand mark: gold "A" (`renderer/assets/archa-logo.svg`, `ui/ArchaLogo.tsx`, app icon `apps/desktop/build/icon.ico`) replaces the violet Hexagon since 1.4.1. The violet accent stays for UI.
