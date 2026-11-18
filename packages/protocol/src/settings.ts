/* ----------------------------------------------------------------------------
 * Settings → Skills and Settings → MCP servers (blueprint AGENT_BRIDGE/05).
 * Secrets (env values, headers) never cross the protocol — only their keys.
 * ------------------------------------------------------------------------- */

/** Where a skill folder was found. `archadev` skills live in ~/.archadev/skills and are the only ones ArchaDev edits. */
export type SkillSource = 'archadev' | 'claude' | 'codex' | 'gemini' | 'agents';

export type Skill = {
  /** `<source>:<folder name>` */
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  dir: string;
  /** archadev skills only: handed to chat runs. */
  enabled: boolean;
  /** SKILL.md frontmatter could not be read. */
  error?: string;
};

export type SkillsOverview = { skills: Skill[]; libraryDir: string; sources: Array<{ source: SkillSource; label: string; dir: string; exists: boolean }> };

export type McpTransport = 'stdio' | 'http' | 'sse';

export type McpServer = {
  id: string;
  /** Tool prefix for agents: `mcp__<name>__<tool>`. Letters, digits, `-` and `_`. */
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  url: string;
  envKeys: string[];
  headerKeys: string[];
  enabled: boolean;
  createdAt: number;
  /** Last connection test, if any. */
  test: McpTestResult | null;
};

export type McpTestResult = { ok: boolean; at: number; tools: Array<{ name: string; description: string }>; serverName?: string; serverVersion?: string; error?: string };

/** A key/value pair from the edit form. `value: null` keeps the stored value. */
export type SecretEntry = { key: string; value: string | null };

export type McpServerInput = {
  id?: string;
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: SecretEntry[];
  headers?: SecretEntry[];
  enabled?: boolean;
};

export type McpImportSource = 'claude' | 'antigravity' | 'cursor';
export type McpImportCandidate = { source: McpImportSource; name: string; transport: McpTransport; detail: string; exists: boolean };
