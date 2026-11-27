# Agent Bridge — 05: Skills and MCP Servers

← [AGENT_BRIDGE.md](../AGENT_BRIDGE.md) | [Blueprint INDEX](../INDEX.md) | [← 04 — Review loop](./04-review-loop.md) | [06 — Orchestrate mode →](./06-orchestrate.md)

**Phase:** MVP. Code: `packages/agents/src/skills.ts`, `agents/src/mcp-servers.ts`, `renderer/ui/settings/`. Types: `packages/protocol/src/settings.ts`. Tests: `packages/agents/test/settings.test.ts`.

---

## Settings Dialog Map

`Ctrl+,` / title-bar gear. Shell + grouped nav in `renderer/ui/SettingsDialog.tsx`; one file per page in `renderer/ui/settings/`. The page shown is `settingsPage` in the Zustand store.

| Group | Page | File | Status |
|---|---|---|---|
| AI | AI providers | `ProvidersPage.tsx` — see [02](./02-roster-profiles.md) | Built |
| AI | Skills | `SkillsPage.tsx` | Built |
| AI | MCP servers | `McpPage.tsx` | Built |
| Connections | Connect an agent | `OtherPages.tsx` — Listen-mode commands for Claude Code, Codex, agy / any MCP client | Built |
| Connections | GitHub | `OtherPages.tsx` — planned features, disabled Connect button, link to GitHub MCP | Coming soon |
| Connections | Integrations | `OtherPages.tsx` — Figma, Vercel, Linear, Notion, Slack | Coming soon |
| ArchaDev | About | Version, data folder, CLI path, runners | Built |

Brand marks: `settings/Logo.tsx` + `renderer/assets/logos/` (simple-icons, CC0; Antigravity from antigravity.google). Monochrome SVGs render as a CSS mask filled by a token class — no raw colours.

---

## Skills

A skill is a folder with `SKILL.md` (frontmatter `name`, `description`, then Markdown).

| Source | Folder | ArchaDev may |
|---|---|---|
| `archadev` (library) | `~/.archadev/skills/<name>/` | create, import, enable/disable, delete |
| `document` | `<name>-data/skills/<name>/` of the open document — travels with the `.archa` | always on for that document's chats; listed as "This document"; "Add to ArchaDev" copies it into the library |
| `builtin` | `resources/skills` in the installed app; repo `skills/` in dev (main sets `ARCHA_BUILTIN_SKILLS`) | on by default, enable/disable; never deleted |
| `claude` | `~/.claude/skills` (host login, never an inherited `CLAUDE_CONFIG_DIR`) | list; "Add to ArchaDev" copies it in |
| `codex` | `$CODEX_HOME/skills` | same |
| `gemini` | `~/.gemini/skills` | same |
| `agents` | `~/.agents/skills` | same |

- Disabled library skills are listed in `~/.archadev/skills.json` (`{ version: 1, disabled: [...] }`, built-in ones as `builtin:<folder>`); new skills are on.
- Import copies the folder (skipping `node_modules`, `.git`); the folder name is the skill's slugged `name`. Never imports from inside the library.
- **Mentions:** typing `/` in the chat composer lists every readable skill (any source, enabled or not) and the built-in guides, matched by name and then by description ("/instagram" finds `design-social`), up to 12 in a scrolling list. A `/name` in a sent message makes the core add that skill's `SKILL.md` body (≤ 40k chars) and folder path — or the guide text — to that turn's prompt (`ChatRunner.mentions` → `SkillManager.mention`), so **every** agent CLI follows it. Unknown names stay plain text; at most 5 per message.
- **Runs:** `forRunSkills(docSkills)` = the document's skills + enabled library + built-in skills; a skill replaces a same-named one further down (document > library > built-in). Mentions search the document's skills first. Claude Code: mirrored into `<runtime>/.claude/skills/` (the run's cwd, so they load as project skills) and `Skill` is added to `--allowedTools`; the mirror is rebuilt every run — it is derivable. Antigravity / Codex (no Skill tool): the first turn lists each skill's name and description, to read with `read_skill` when the task fits.

- **`read_skill { name, file? }`** (MCP, every agent): the core serves a skill's `SKILL.md` plus the list of files in its folder, or one text file from it (`references/…`, `examples/…`), ≤ 120k chars (`SkillManager.readForAgent`, RPC `agent.readSkill`). Same lookup as mentions (document > library > built-in > CLI folders). Design runs have no file tools, so this is how every agent — Claude included — reaches a skill's references. Paths are resolved inside the skill folder only; dot folders and `node_modules` are not listed; binary files are refused.

RPC: `skills.list | create | import | update | delete | read` (`list` and `read` take an optional `docId` for document skills); event `skills.changed`.

Repo skills: `skills/design-*` (website, pdf, slides, flows) ship with the app as the `builtin` source (electron-builder `extraResources`) → [STRUCTURE/01](../STRUCTURE/01-root-apps.md). Settings → Skills shows them first, under "Built into ArchaDev".

---

## External MCP Servers

Stored in `~/.archadev/mcp.json` (mode 0600): `{ version: 1, servers: [{ id, name, transport, command, args, url, env, headers, enabled, createdAt }] }`.

| Rule | Detail |
|---|---|
| Name | `^[A-Za-z0-9_-]+$`, unique (case-insensitive), never `archadev` — tools appear as `mcp__<name>__<tool>` |
| Transport | `stdio` (command + args + env), `http` (Streamable HTTP, url + headers), `sse` (url + headers) |
| Secrets | Env values and header values stay in the core host. The protocol returns `envKeys` / `headerKeys` only; an edit sends `{ key, value: null }` to keep a stored value |
| Test | `mcp.test` connects with the MCP SDK client, lists tools, disconnects; 20 s timeout. Result kept in memory and shown on the row |
| Import | User-level servers from `~/.claude.json`, `~/.gemini/antigravity/mcp_config.json` (`url` or `serverUrl`), `~/.cursor/mcp.json` |
| Presets | GitHub, Figma Dev Mode, Context7, Playwright, Filesystem prefill the form; nothing is added until saved |
| **Runs** | Enabled servers are merged into the run's `--mcp-config` next to `archadev` (still `--strict-mcp-config`) and allowed whole as `mcp__<name>`. The per-run config file is written 0600 and deleted when the run exits |

RPC: `mcp.list | save | delete | test | importCandidates | import`; event `mcp.changed`. All params are zod-checked in the manager (`skillParams`, `mcpParams`).

---

## Not Yet

- MCP servers reach **Claude Code** runs only; agy / Codex get skills as a list to read, not as loaded skills (see [03](./03-runs-steering.md)).
- No per-document or per-project selection — the library and server list are global.
- GitHub sign-in (device flow, token in keyring) and the other integrations are UI placeholders.

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [AGENT_BRIDGE/02](./02-roster-profiles.md) · [FILE_FORMATS/01](../FILE_FORMATS/01-archa.md) · [MCP/01](../MCP/01-transports-tools.md) · [STRUCTURE/01](../STRUCTURE/01-root-apps.md) · [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md)

**Code:** [`apps/desktop/src/renderer/ui/ChatPanel.tsx`](../../../apps/desktop/src/renderer/ui/ChatPanel.tsx) · [`apps/desktop/src/renderer/ui/settings/McpPage.tsx`](../../../apps/desktop/src/renderer/ui/settings/McpPage.tsx) · [`apps/desktop/src/renderer/ui/settings/OtherPages.tsx`](../../../apps/desktop/src/renderer/ui/settings/OtherPages.tsx) · [`apps/desktop/src/renderer/ui/settings/SkillsPage.tsx`](../../../apps/desktop/src/renderer/ui/settings/SkillsPage.tsx) · [`apps/desktop/src/renderer/ui/SettingsDialog.tsx`](../../../apps/desktop/src/renderer/ui/SettingsDialog.tsx) · [`packages/agents/src/agents.ts`](../../../packages/agents/src/agents.ts) · [`packages/agents/src/mcp-servers.ts`](../../../packages/agents/src/mcp-servers.ts) · [`packages/agents/src/skills.ts`](../../../packages/agents/src/skills.ts) · [`packages/agents/test/settings.test.ts`](../../../packages/agents/test/settings.test.ts) · [`packages/host/src/domains/settings.ts`](../../../packages/host/src/domains/settings.ts) · [`packages/host/test/chat-details.test.ts`](../../../packages/host/test/chat-details.test.ts) · [`packages/host/test/memory.test.ts`](../../../packages/host/test/memory.test.ts) · [`packages/protocol/src/rpc.ts`](../../../packages/protocol/src/rpc.ts) · [`packages/protocol/src/settings.ts`](../../../packages/protocol/src/settings.ts)
<!-- backlinks:end -->
