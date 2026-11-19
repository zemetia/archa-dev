# 02 — Agent bridge (Gungnir flow)

← [AGENTS_AND_MCP](../AGENTS_AND_MCP.md) · [Plan INDEX](../INDEX.md)

How ArchaDev launches, watches and steers the coding agents already installed on the machine. Ported in TypeScript from Gungnir's `remediate/` package (Go), which runs this in production for Claude Code, agy, Codex and Hermes.

## Adapter interface

```ts
interface AgentAdapter {
  id: 'claude' | 'agy' | 'codex' | 'hermes' | string; // plugins can add more
  label: string;
  defaultBin: string;
  resolveBin(): Promise<string>;                 // setting → env ARCHA_AGENT_<ID> → PATH
  build(run: RunSpec): Command;                  // argv + stdin + env; prompt never via shell
  buildResume(run: RunSpec, sessionId: string, prompt: string): Command;
  maxArgPrompt: number;                          // e.g. 28_000 on Windows; 0 = always stdin
  parser(): StreamParser;                        // line → normalised events
  isolationEnv(profileDir: string): Record<string, string>;
  loginCommands(profileDir: string): Record<string, string>;
  listModels(): Promise<ModelOption[]>;          // from what the installed CLI reports
  mcpConfig(project: Project): ConfigPatch;      // how to register `archa mcp` for this agent
  isRateLimited(output: string): boolean;
}
```

Normalised events: `session_started(model)`, `text`, `tool_call(name, args)`, `tool_result`, `final(text)`, `session_id(id)`, `error`, `rate_limited`. The app's timeline, the agent cursor, and the activity log all consume these, never raw output.

## Roster (v1)

| Agent | Headless mode | Resume | Notes from Gungnir |
|---|---|---|---|
| Claude Code | `claude -p --output-format stream-json` | `--resume <id>` | Own config dir per profile; isolate settings so the person's hooks/memory are not injected into design runs (Accent observed this) |
| Antigravity (agy) | `agy --output-format stream-json`, prompt via stdin (`--input-format stream-json`) | `--conversation <id>` | Login lives in the OS keyring: profile swap with lease + crash-safe restore; 503 "No capacity" looks like a hang → per-turn timeout |
| Codex | `codex exec --json` | `codex exec resume <id>` | JSON events parser |
| Hermes | `hermes chat -q` (plain output) | `--resume <id> --no-restore-cwd` | Plain-line parser; session id sniffed from output |

Unknown agents can still connect in **listen mode** through MCP; launch mode needs an adapter (built-in or from a plugin).

## Profiles and models

- An agent profile = one signed-in account, stored under `~/.archadev/profiles/<agent>/<profileId>/`. Claude: a separate config dir signed in through `claude auth login` run by the app (the CLI opens its own browser sign-in; a pasted code is the fallback). agy: a saved copy of the keyring credential, swapped in for a run and restored after.
- Settings → Agents page: detected CLIs and versions, signed-in accounts, profiles, default model per agent (picked from `listModels()` or typed), "test connection" (Accent's `accent status [agent]` deep check).
- Failover: if a run hits a rate limit, offer (or auto-pick, per setting) the next profile/agent.

## Runs

A **run** = one task given to one agent with one profile.

| Aspect | Behaviour |
|---|---|
| Prompt | Built from the request + pre-fetched `get_state` + selection + attached comments/sketch; the skill tells the agent how to use the tools |
| Workdir | Project mode, git repo: own **git worktree** on branch `archadev/run-<id>`; changes to code and to `.archadev/designs` committed there, merged on accept. Not a repo: in place, one run at a time. Standalone file: temp dir, document access via MCP only |
| Parallelism | Up to N runs per agent (setting, default 3) |
| Timeout | Per turn (default 30 min), not per run |
| Live view | Timeline of normalised events; agent cursor on the canvas following the node ids it touches |
| Steering | Message box: queued for when the turn ends, or **Send now** (stop turn, deliver). **Interrupt** pauses; then **Continue**, new instruction, or **Finish**. Follow-ups resume the CLI's own session so context is kept |
| Paused runs | Free their slot; auto-finish after 30 min idle |
| Result | Summary, diff (design ops + code diff), screenshots before/after; Accept / Reject / Continue |

## Multi-agent jobs (later phase)

Gungnir's planner/worker pattern for big design jobs (e.g. "design the whole app, 20 screens"): a planner run keeps a **shared todolist** across stateless wakeups and dispatches one screen per worker run as prerequisites (tokens, components) are done; workers can read each other's activity traces. Cost-aware routing: bulk screens to a cheap agent (agy), hard parts and review to a strong one (Claude).

## Security

- argv or stdin only; never a shell string.
- Agent runs get only the MCP server for their project and the worktree as cwd.
- Credentials never enter `.archadev/`, logs, or prompts.
