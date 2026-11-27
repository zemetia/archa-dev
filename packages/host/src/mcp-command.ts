import { findBin, type McpCommand } from '@archa/agents';

/** `archa mcp` for launched agents: the CLI bundle under node, else under this Electron/Node binary as node. */
export function nodeMcpCommand(cliPath: string): () => McpCommand {
  return (): McpCommand => {
    const node = findBin('node');
    if (node) return { command: node, args: [cliPath, 'mcp'], env: {} };
    return { command: process.execPath, args: [cliPath, 'mcp'], env: { ELECTRON_RUN_AS_NODE: '1' } };
  };
}
