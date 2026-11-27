import type { ClientInfo, RpcClient } from '@archa/protocol';
import { createMcpServer, serveStdio } from '@archa/mcp';
import { connectCore, CoreUnavailable } from './connect';
import { startHeadless } from './headless';

/**
 * `archa mcp`: stdio MCP server relaying to the running app's core host, so the person watches the
 * agent work live (blueprint MCP/01). With no app running it starts a headless host in this process.
 */
export async function runMcp(opts: { doc?: string; agent?: string }) {
  const agentName = opts.agent ?? 'mcp-agent';
  const client: ClientInfo = { kind: 'mcp', name: agentName, agentId: agentName, runId: process.env.ARCHA_RUN_ID || undefined };
  // A running app always wins; headless only when no live core answers (blueprint ARCHITECTURE/03).
  const connect = () => connectCore(client).catch((e: unknown) => {
    if (e instanceof CoreUnavailable) return startHeadless(client);
    throw e;
  });
  // One connection for every tool call, even when the first calls arrive together.
  let pending: Promise<RpcClient> | null = null;
  const getCore = () => (pending ??= connect().catch((e: unknown) => { pending = null; throw e; }));
  // Launched runs pass --doc; agy's globally registered server falls back to the run's env.
  const server = createMcpServer({ getCore, defaultDoc: opts.doc ?? process.env.ARCHA_DOC_ID });
  await serveStdio(server, { gemini: agentName === 'agy' });
}
