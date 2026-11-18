# Agent Bridge

← [Blueprint INDEX](./INDEX.md)

| Part | Coverage |
|---|---|
| [01 — Adapter interface](./AGENT_BRIDGE/01-adapter-interface.md) | `AgentAdapter`, `Command`, stream parsers, normalised events |
| [02 — Roster and profiles](./AGENT_BRIDGE/02-roster-profiles.md) | Claude Code, agy, Codex, Hermes specifics; login profiles; models |
| [03 — Runs and steering](./AGENT_BRIDGE/03-runs-steering.md) | Run lifecycle, worktrees, parallelism, steer/interrupt/resume, accept/reject |
| [04 — Review loop](./AGENT_BRIDGE/04-review-loop.md) | Comments, rounds, decisions, variants, activity, history |
| [05 — Skills and MCP servers](./AGENT_BRIDGE/05-skills-mcp.md) | Skill library, external MCP servers, how runs get them, the Settings dialog map |

---

## Two Modes

| Mode | Who starts the agent | Channel |
|---|---|---|
| **Listen** | The person, in their own terminal | Agent → `archa mcp` (stdio). Works with any MCP client |
| **Launch** | ArchaDev ("Send to agent", `archa run`) | Core spawns the CLI headless + reads its stream; agent → `archa mcp --run <id>` |

Ported from Gungnir's `remediate/` package (Go → TypeScript), which runs this flow with the same four agents. Code: `packages/agents/`.
