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

---

## Models

`listModels(bin)` reads what the installed CLI reports (agy `models`, Claude aliases + account cache, Codex/Hermes caches). Settings → Agents shows them in a picker with a free-text fallback (validated `^[A-Za-z0-9][A-Za-z0-9._:/\[\]@+-]{0,127}$`). Every run passes the chosen model with the CLI's model flag.

---

## Settings → Agents Page

| Section | Content |
|---|---|
| Detected | Each CLI: path, version, signed-in account |
| Profiles | List, add (sign in), save host login, use on host, delete |
| Defaults | Default model, max parallel runs, per-turn timeout |
| Check | **Test connection** = `archa status <agent>`: binary runs → profile valid → MCP reachable from the agent → round-trip `say` |
