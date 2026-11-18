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
| Claude | A separate config dir (`CLAUDE_CONFIG_DIR`) | App runs `claude auth login` with that dir, shows the link, user pastes the code back |
| agy | A saved copy of the keyring credential | "Save current host login as profile"; swapped in for a run under a **lease**, refreshed token saved back, host login restored after — also after a crash (backup file checked on startup) |
| Codex | Separate `CODEX_HOME` | `codex login` in that home |
| Hermes | Separate home dir | Hermes login command |

Runs with the same agy profile may run in parallel (shared lease); different agy profiles serialise the swap.

### MVP implementation (2026-11-18)

Code: `apps/desktop/src/core-host/accounts.ts` (+ `keyring.ts`); moves to `packages/agents/src/profiles/` with the adapters.

| Item | Contract |
|---|---|
| Store | `~/.archadev/profiles/accounts.json` (0600): `{ accounts[], defaults{agent→id} }`. Managed folders `profiles/<agent>/<id>/`; a **linked** existing folder (e.g. Orca's) is never deleted |
| Identity | Read from files only, tokens never cross the protocol: Claude `.credentials.json` + `.claude.json`; Codex `auth.json` (id_token email/plan, or API key); agy keyring blob `id_token_email` |
| Sign-in | Claude: `claude auth login [--email]` with `CLAUDE_CONFIG_DIR`, `BROWSER=none` → link + pasted code on stdin. Codex: `codex login` with `CODEX_HOME` (browser callback) or API key written to `auth.json`. agy: "Save current agy login" / "Use on this computer" (current login saved first) |
| Keyring | Windows Credential Manager via PowerShell P/Invoke (script constant, data in env); macOS `security`; Linux `secret-tool` |
| Protocol | `accounts.overview/create/update/delete/captureHost/useOnHost/login.start/login.code/login.cancel`, event `accounts.changed`; params zod-validated in the core host |
| Isolation | ArchaDev stands alone: main drops inherited `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ORCA_*` before forking the core host, and the host login is always `~/.claude` / `~/.codex`. Launching from another tool's terminal (e.g. Orca) never picks up that tool's profile |
| Runs | `chat.send.account`: id, `'host'`, or omitted = agent default → else host login. Claude gets `CLAUDE_CONFIG_DIR`; Codex `CODEX_HOME`. Disabled / signed-out account = error, no silent fallback |
| Not yet | agy run lease swap, rate-limit rotation across accounts, Hermes |

### Launch adapters — MVP (2026-11-19)

Code: `apps/desktop/src/core-host/agent-adapters.ts` (argv, parsers, models) + `agents.ts` (`ChatRunner`). Tests: `apps/desktop/test/agent-adapters.test.ts`; live `agents-live.test.ts` behind `ARCHA_AGENT_IT=1`.

| Agent | Invocation | MCP | Models |
|---|---|---|---|
| Claude | `-p --output-format stream-json --verbose --include-partial-messages --setting-sources project,local`; prompt on **stdin** | per-run `--mcp-config` + `--strict-mcp-config` | aliases + `additionalModelOptionsCache` in `.claude.json` |
| agy | `--dangerously-skip-permissions --disable-slash-commands --output-format stream-json --print-timeout 30m -p <prompt>` (argv; canvas state dropped past 28 000 chars) | no per-run flag: `agy mcp add archadev …` once per app start; doc from `ARCHA_DOC_ID` | `agy models`, cached 10 min |
| Codex | `exec --json --full-auto --skip-git-repo-check -c mcp_servers.archadev.*=… -`; prompt on stdin | `-c` overrides | `CODEX_HOME/models_cache.json` |

Rules: stdin is always closed (an open pipe makes `claude -p` wait); `chat.delta` streams in-progress text; one run per document; `agents.models` feeds the composer picker.

---

## Models

`listModels(bin)` reads what the installed CLI reports (agy `models`, Claude aliases + account cache, Codex/Hermes caches). Settings → Agents shows them in a picker with a free-text fallback (validated `^[A-Za-z0-9][A-Za-z0-9._:/\[\]@+-]{0,127}$`). Every run passes the chosen model with the CLI's model flag.

---

## Settings → Agents Page

Opened from the title bar gear, `Ctrl+,`, or "Accounts" under the chat composer. Code: `renderer/ui/SettingsDialog.tsx`.

| Section | Content | Built |
|---|---|---|
| Nav | One entry per agent: mark, label, account count, dot (green ready · amber no signed-in account · grey CLI missing) | ✓ |
| Header | Label, `Installed · <version>` / `Not installed`, re-check button | ✓ |
| This computer | Host login (email, plan, saved?), whether runs use it; agy: "Save as account" | ✓ |
| Accounts | Row: avatar, name, email, plan, status chip, default ★, enable switch, sign in / use on this computer, open folder, remove (inline confirm) | ✓ |
| Sign-in panel | Claude: open link → sign in → paste code. Codex: browser finishes, panel closes itself. Errors stay with "Try again" | ✓ |
| Add account | Claude: e-mail/name → sign in. Codex: ChatGPT or API key. Both: link an existing folder. agy: 3-step save flow | ✓ |
| Chat picker | Default · <account> / This computer's login / each enabled account | ✓ |
| Defaults | Default model, max parallel runs, per-turn timeout | — |
| Check | **Test connection** = `archa status <agent>`: binary runs → profile valid → MCP reachable from the agent → round-trip `say` | — |
