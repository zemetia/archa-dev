# Agents and MCP

← [Plan INDEX](./INDEX.md)

| Part | Coverage |
|---|---|
| [01 — MCP server](./AGENTS_AND_MCP/01-mcp-server.md) | Transports, tool surface, `execute` API, response contract, lint |
| [02 — Agent bridge](./AGENTS_AND_MCP/02-agent-bridge.md) | Adapters for Claude Code / agy / Codex / Hermes, profiles, runs, steering, worktrees (Gungnir flow) |
| [03 — Local skill](./AGENTS_AND_MCP/03-local-skill.md) | The skill file, references, install per agent |
| [04 — Review loop](./AGENTS_AND_MCP/04-review-loop.md) | Comments, rounds, decisions, variants, activity (Accent flow) |

## Two directions, one server

```mermaid
flowchart LR
  subgraph LISTEN["Listen: the agent comes to ArchaDev"]
    T["Person's terminal\nclaude / agy / codex"] -->|"MCP stdio: archa mcp"| S
  end
  subgraph LAUNCH["Launch: ArchaDev starts the agent"]
    A["App: 'Send to agent'"] --> R["Agent run\n(adapter spawns CLI headless)"]
    R -->|"MCP: archa mcp --run <id>"| S
  end
  S["ArchaDev MCP server\n(core host)"] --> D[("Document")]
  R -->|"stream events"| UI["App: activity, cursor, timeline"]
```

The same MCP tools serve both. In launch mode the app also reads the agent's own output stream (Gungnir parsers) to show a live timeline and to steer it.
