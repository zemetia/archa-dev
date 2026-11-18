# Agent Bridge — 01: Adapter Interface

← [AGENT_BRIDGE.md](../AGENT_BRIDGE.md) | [Blueprint INDEX](../INDEX.md) | [02 — Roster →](./02-roster-profiles.md)

**Phase:** 6. Code: `packages/agents/src/adapter.ts`, `packages/agents/src/adapters/<id>/`.

---

## Interface

```ts
export interface AgentAdapter {
  readonly id: string;                       // 'claude' | 'agy' | 'codex' | 'hermes' | plugin ids
  readonly label: string;
  readonly defaultBin: string;
  readonly maxArgPrompt: number;             // bytes allowed on argv; 0 = always stdin

  resolveBin(settings: AgentSettings): Promise<string>;           // setting → ARCHA_AGENT_<ID> → PATH
  build(spec: RunSpec): Command;
  buildResume(spec: RunSpec, sessionId: string, prompt: string): Command;
  parser(): StreamParser;
  isolationEnv(profileDir: string): Record<string, string>;
  loginCommands(profileDir: string): Record<string, string[]>;   // argv arrays, never strings
  listModels(bin: string): Promise<ModelOption[]>;
  mcpConfig(target: McpTarget): ConfigPatch[];                    // files + merges for skill install
  isRateLimited(output: string): boolean;
}

export type Command = {
  bin: string;
  args: string[];          // the prompt is ONE element here, or absent
  stdin?: string;          // used when prompt > maxArgPrompt or the CLI prefers stdin
  env: Record<string, string>;
  cwd: string;
};
```

Spawn with `child_process.spawn(cmd.bin, cmd.args, { shell: false, cwd, env })`. A lint rule bans `shell: true` and `exec()` in `packages/agents`.

---

## Stream Parser

```ts
export interface StreamParser {
  line(line: string): AgentEvent[];   // called per stdout line
  final(): string;                    // final answer text
  sessionId(): string | undefined;    // for resume
}

export type AgentEvent =
  | { kind: 'session_started'; model?: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; name: string; summary: string; args?: unknown }
  | { kind: 'tool_result'; name: string; summary: string; isError?: boolean }
  | { kind: 'final'; text: string }
  | { kind: 'session_id'; id: string }
  | { kind: 'rate_limited'; detail: string }
  | { kind: 'error'; detail: string }
  | { kind: 'log'; text: string };
```

| Parser | For | Input |
|---|---|---|
| `claudeParser` | Claude Code | `--output-format stream-json` lines |
| `agyParser` | Antigravity | stream-json lines |
| `codexParser` | Codex | `exec --json` events |
| `plainParser` | Hermes, unknown | ANSI-stripped lines; session id sniffed by regex |

Detail fields clipped to 4000 chars; one-line summaries to 160.

---

## Tests

- `test/fixtures/<agent>/*.jsonl` — recorded real transcripts (scrubbed). Parser output snapshot-tested.
- `build()` tests assert: prompt is a single argv element or stdin; never contains shell metacharacter handling; Windows prompt > `maxArgPrompt` goes to stdin.
- Live tests behind `ARCHA_AGENT_IT=1`, one per agent, with a 10-minute timeout.
