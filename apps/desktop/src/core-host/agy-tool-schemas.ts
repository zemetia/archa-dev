import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { geminiSchemaIssues } from '@archa/protocol';

/*
 * agy loads EVERY server in its own global MCP config (~/.gemini/config/mcp_config.json) into each run —
 * ArchaDev cannot narrow that (no per-run flag; `--settings` refuses mcpServers). One server whose tool
 * schema Gemini refuses then fails every turn with an opaque
 * "INVALID_ARGUMENT … function_declarations[45].parameters.properties[questions].items: missing field".
 * agy keeps a copy of each tool's schema in <dir>/<server>/<tool>.json; reading them names the culprit.
 * Blueprint AGENT_BRIDGE/02.
 */

export const agyToolSchemaDir = () => join(homedir(), '.gemini', 'antigravity-cli', 'mcp');

export type BadAgyTool = { server: string; tool: string; path: string; problem: string };

/** Every tool agy has loaded whose parameters Gemini would refuse. */
export function badAgyTools(dir = agyToolSchemaDir()): BadAgyTool[] {
  const out: BadAgyTool[] = [];
  let servers: string[];
  try { servers = readdirSync(dir); } catch { return out; }
  for (const server of servers) {
    let files: string[];
    try { files = readdirSync(join(dir, server)).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      try {
        const j = JSON.parse(readFileSync(join(dir, server, f), 'utf8')) as { name?: string; parameters?: unknown; inputSchema?: unknown };
        const tool = typeof j.name === 'string' ? j.name : f.slice(0, -5);
        for (const i of geminiSchemaIssues(j.parameters ?? j.inputSchema ?? {})) out.push({ server, tool, ...i });
      } catch { /* not a schema file */ }
    }
  }
  return out;
}

/** For an agy error caused by a bad tool schema: which server and tool, and what to do. '' for other errors. */
export function agyErrorHint(error: string, dir = agyToolSchemaDir()): string {
  const decl = /function_declarations\[\d+\]\.parameters\.(\S+?):/.exec(error);
  const named = /tool "mcp_(.+?)" advertises an invalid parameter schema/.exec(error);
  if (!decl && !named) return '';
  const bad = badAgyTools(dir).filter((b) => (decl ? b.path === decl[1] : `${b.server}_${b.tool}` === named![1]));
  const servers = [...new Set(bad.map((b) => b.server))];
  const where = 'agy loads every server in its own MCP config (~/.gemini/config/mcp_config.json) into ArchaDev runs, so one bad tool fails them all.';
  if (!bad.length) return `\n\nAn MCP tool schema was refused — not one of ArchaDev's tools. ${where} Check \`agy mcp list\` and disable or fix the server that is not needed.`;
  const list = bad.map((b) => `"${b.server}" → ${b.tool} (${b.path}: ${b.problem})`).join('; ');
  return `\n\nCaused by ${list} — not one of ArchaDev's tools. ${where} Fix that server's schema, or run ${servers.map((s) => `\`agy mcp disable ${s}\``).join(' / ')} and send again.`;
}
