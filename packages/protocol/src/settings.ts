import type { z } from 'zod';
import type { mcpSaveParams } from './rpc';

/* ----------------------------------------------------------------------------
 * Settings → Skills and Settings → MCP servers (blueprint AGENT_BRIDGE/05).
 * Secrets (env values, headers) never cross the protocol — only their keys.
 * ------------------------------------------------------------------------- */

/** Where a skill folder was found. `archadev` skills live in ~/.archadev/skills and are the only ones ArchaDev edits. */
/** builtin: the design skills that ship with ArchaDev (repo `skills/`), on by default. */
/** document: the open document's own skills, in `<name>-data/skills/` — they travel with the file. */
export type SkillSource = 'archadev' | 'builtin' | 'document' | 'claude' | 'codex' | 'gemini' | 'agents';

export type Skill = {
  /** `<source>:<folder name>` */
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  dir: string;
  /** archadev and builtin skills: handed to chat runs when on. */
  enabled: boolean;
  /** SKILL.md frontmatter could not be read. */
  error?: string;
};

/** Agent memory (blueprint AGENT_BRIDGE/07): global = ARCHA_HOME/memory, document = `<name>-data/memory/`. */
export type MemoryScope = 'global' | 'document';
export type MemoryEntry = {
  /** `<scope>:<file name without .md>` */
  id: string;
  scope: MemoryScope;
  name: string;
  text: string;
  updatedAt: number;
  file: string;
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

/** The edit form's server (env / headers as SecretEntry). Derived from the `mcp.save` schema in ./rpc. */
export type McpServerInput = z.input<typeof mcpSaveParams>;

export type McpImportSource = 'claude' | 'antigravity' | 'cursor';
export type McpImportCandidate = { source: McpImportSource; name: string; transport: McpTransport; detail: string; exists: boolean };
