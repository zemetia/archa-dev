# Agent Bridge — 02: Roster and Profiles

← [AGENT_BRIDGE.md](../AGENT_BRIDGE.md) | [Blueprint INDEX](../INDEX.md) | [03 — Runs →](./03-runs-steering.md)

**Phase:** 6. Code: `packages/agents/src/adapters/`, `packages/agents/src/profiles/`, `packages/agents/src/models.ts`.

---

## Roster (v1)

| Id | CLI | Headless | Resume | Prompt channel |
|---|---|---|---|---|
| `claude` | Claude Code | `claude -p --output-format stream-json --verbose` | `--resume <sessionId>` | argv (stdin above limit) |
| `agy` | Antigravity | `agy --output-format stream-json --input-format stream-json` | `--conversation <id>` | stdin (stream-json user event) |
| `codex` | Codex | `codex exec --json` | `codex exec resume <id>` | argv / stdin |
| `hermes` | Hermes | `hermes chat -q <prompt>` | `--resume <id> --no-restore-cwd` | argv |

Flags must be re-verified against each CLI's `--help` when implementing; Gungnir's `remediate/agents.go` is the reference for what worked on 2026-11.

### Known behaviours (from Gungnir)

| Agent | Behaviour | Handling |
|---|---|---|
| Claude Code | Loads the user's settings, hooks and memory into headless runs | Run with an isolated config dir / setting sources so design runs are clean |
| agy | Login in OS keyring; 503 "No capacity" retried silently → looks hung | Keyring profile lease; per-turn timeout |
| agy | Fails inside sandboxed shells ("not logged in") | Spawn outside any sandbox |
| All | Windows argv limit ~32 KiB | `maxArgPrompt = 28000` → stdin beyond |
| All | Rate-limit messages vary | Regex `rate limit\|usage limit\|quota\|429\|resource_exhausted\|credit balance` |

---

## Login Profiles

Stored in `~/.archadev/profiles/<agent>/<profileId>/` — never in a project, never logged.

| Agent | Profile is | Sign-in flow |
|---|---|---|
| Claude | A separate config dir (`CLAUDE_CONFIG_DIR`) | App runs `claude auth login` with that dir; the CLI opens the Claude sign-in page and finishes via its localhost callback (fallback: link + pasted code) |
| agy | A saved copy of the keyring credential | "Save current host login as profile"; swapped in for a run under a **lease**, refreshed token saved back, host login restored after — also after a crash (backup file checked on startup) |
| Codex | Separate `CODEX_HOME` | `codex login` in that home |
| Hermes | Separate home dir | Hermes login command |

Runs with the same agy profile may run in parallel (shared lease); different agy profiles serialise the swap.

### MVP implementation (2026-11-18)

Code: `packages/agents/src/accounts.ts` (+ `keyring.ts`), next to the adapters in `@archa/agents`.

| Item | Contract |
|---|---|
| Store | `~/.archadev/profiles/accounts.json` (0600): `{ accounts[], defaults{agent→id} }`. Managed folders `profiles/<agent>/<id>/`. New accounts are always managed; a **linked** folder saved by an older version keeps working and is never deleted |
| Identity | Read from files only, tokens never cross the protocol: Claude `.credentials.json` + `.claude.json`; Codex `auth.json` (id_token email/plan, or API key); agy keyring blob `id_token_email` |
| Sign-in | Claude: `claude auth login` with `CLAUDE_CONFIG_DIR`, the CLI opens the browser itself and finishes on its own; its printed fallback link's code can be pasted on stdin. Codex: `codex login` with `CODEX_HOME` (browser callback) or API key written to `auth.json`. agy: "Save current agy login" / "Use on this computer" (current login saved first) |
| Keyring | Windows Credential Manager via PowerShell P/Invoke (script constant, data in env); macOS `security`; Linux `secret-tool` |
| Protocol | `accounts.overview/create/update/delete/captureHost/useOnHost/login.start/login.code/login.cancel`, event `accounts.changed`; params zod-validated in the core host |
| Isolation | ArchaDev stands alone: main drops inherited `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ORCA_*` before forking the core host, and the host login is always `~/.claude` / `~/.codex`. Launching from another tool's terminal (e.g. Orca) never picks up that tool's profile |
| Runs | `chat.send.account`: id, `'host'`, or omitted = agent default → else host login. Claude gets `CLAUDE_CONFIG_DIR`; Codex `CODEX_HOME`. Disabled / signed-out account = error, no silent fallback |
| Not yet | agy run lease swap, rate-limit rotation across accounts, Hermes |

### Launch adapters — MVP (2026-11-19)

Code: `packages/agents/src/agent-adapters.ts` (argv, parsers, models) + `agents.ts` (`ChatRunner`). Tests: `packages/agents/test/agent-adapters.test.ts`; live `agents-live.test.ts` behind `ARCHA_AGENT_IT=1`.

| Agent | Invocation | MCP | Models |
|---|---|---|---|
| Claude | `-p --output-format stream-json --verbose --include-partial-messages --setting-sources project,local`; prompt on **stdin** | per-run `--mcp-config` + `--strict-mcp-config` | aliases + `additionalModelOptionsCache` in `.claude.json` |
| agy | `--dangerously-skip-permissions --disable-slash-commands --output-format stream-json --print-timeout 30m -p <prompt>` (argv; canvas state dropped past 28 000 chars) | no per-run flag: `agy mcp add archadev …` once per app start; doc from `ARCHA_DOC_ID` | `agy models`, cached 10 min |
| Codex | `exec --json --full-auto --skip-git-repo-check -c mcp_servers.archadev.*=… -`; prompt on stdin | `-c` overrides | `CODEX_HOME/models_cache.json` |

agy reads MCP tool descriptions from schema files instead of its context, so its prompt carries the tool list + `EXECUTE_API_DOC` (`AGY_TOOLS_NOTE`). Launched runs tag their `archa mcp` connection with `ARCHA_RUN_ID` (`ClientInfo.runId`), and the chat hides that activity so it is not shown twice.

**Gemini tool schemas (agy).** agy hands every MCP tool to Gemini as a function declaration, and Gemini refuses the *whole* request over one schema outside its OpenAPI subset (`INVALID_ARGUMENT … function_declarations[N].parameters.properties[questions].items: missing field`). agy loads **every** server in its own `~/.gemini/config/mcp_config.json` into ArchaDev runs, and ArchaDev cannot narrow that (no per-run flag; `--settings` refuses `mcpServers`). So:

| Whose schema | Handling |
|---|---|
| Ours (`archa mcp --agent agy`) | Sent already inside the subset — [MCP/01 rule 7](../MCP/01-transports-tools.md) |
| Another server in agy's config (seen: a local `english-drill` server's `update_drill.questions` array without `items`; `zemetia-studio` e-mail patterns with lookaheads, not RE2) | Not ours to rewrite. `agy-tool-schemas.ts` reads agy's schema copies (`~/.gemini/antigravity-cli/mcp/<server>/<tool>.json`) when a run fails with such an error and appends which server and tool caused it, plus the fix: correct that server's schema or `agy mcp disable <server>` |

Rules: stdin is always closed (an open pipe makes `claude -p` wait); `chat.delta` streams in-progress text; one run per document; `agents.models` feeds the composer picker.

---

## Models

`listModels(bin)` reads what the installed CLI reports (agy `models`, Claude aliases + account cache, Codex/Hermes caches). Settings → Agents shows them in a picker with a free-text fallback (validated `^[A-Za-z0-9][A-Za-z0-9._:/\[\]@+-]{0,127}$`). Every run passes the chosen model with the CLI's model flag.

---

## Settings → AI Providers Page

Opened from the title bar gear, `Ctrl+,`, or "Accounts" under the chat composer. One page stacks every agent (Claude Code, Antigravity, Codex) with its brand mark; upcoming providers (Gemini CLI, Ollama, OpenRouter) show as "Coming soon". Code: `renderer/ui/settings/ProvidersPage.tsx`; the dialog shell and nav are in `renderer/ui/SettingsDialog.tsx` (other pages: [05 — Skills and MCP servers](./05-skills-mcp.md)).

| Section | Content | Built |
|---|---|---|
| Jump bar | One pill per agent: brand mark, label, dot (green ready · amber no signed-in account · grey CLI missing); nav badge `ready/total` | ✓ |
| Header | Label, `Installed · <version>` / `Not installed`, re-check button | ✓ |
| This computer | Host login (email, plan, saved?), whether runs use it; agy: "Save as account" | ✓ |
| Accounts | Row: avatar, name, email, plan, status chip, default ★, enable switch, sign in / use on this computer, open folder, remove (inline confirm) | ✓ |
| Sign-in panel | Claude: open link → sign in → paste code. Codex: browser finishes, panel closes itself. Errors stay with "Try again" | ✓ |
| Add account | No name field: an account is named after its login e-mail (API key → "OpenAI API key"; before sign-in "<CLI> account"). Claude: Add account starts the sign-in at once. Codex: ChatGPT or API key. agy: 3-step save flow | ✓ |
| Chat picker | Default · <account> / This computer's login / each enabled account | ✓ |
| Defaults | Default model, max parallel runs, per-turn timeout | — |
| Check | **Test connection** = `archa status <agent>`: binary runs → profile valid → MCP reachable from the agent → round-trip `say` | — |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [AGENT_BRIDGE/05](./05-skills-mcp.md) · [AGENT_BRIDGE/07](./07-memory.md) · [APP_UI/03](../APP_UI/03-state.md) · [MCP/01](../MCP/01-transports-tools.md)

**Code:** [`apps/desktop/src/renderer/ui/settings/ProvidersPage.tsx`](../../../apps/desktop/src/renderer/ui/settings/ProvidersPage.tsx) · [`packages/agents/src/accounts.ts`](../../../packages/agents/src/accounts.ts) · [`packages/agents/src/agent-adapters.ts`](../../../packages/agents/src/agent-adapters.ts) · [`packages/agents/src/agents.ts`](../../../packages/agents/src/agents.ts) · [`packages/agents/src/agy-tool-schemas.ts`](../../../packages/agents/src/agy-tool-schemas.ts) · [`packages/agents/src/keyring.ts`](../../../packages/agents/src/keyring.ts) · [`packages/agents/test/accounts.test.ts`](../../../packages/agents/test/accounts.test.ts) · [`packages/agents/test/agent-adapters.test.ts`](../../../packages/agents/test/agent-adapters.test.ts) · [`packages/agents/test/agy-tool-schemas.test.ts`](../../../packages/agents/test/agy-tool-schemas.test.ts) · [`packages/host/src/domains/settings.ts`](../../../packages/host/src/domains/settings.ts) · [`packages/protocol/src/gemini-schema.ts`](../../../packages/protocol/src/gemini-schema.ts) · [`packages/protocol/src/rpc.ts`](../../../packages/protocol/src/rpc.ts) · [`packages/protocol/test/gemini-schema.test.ts`](../../../packages/protocol/test/gemini-schema.test.ts)
<!-- backlinks:end -->
