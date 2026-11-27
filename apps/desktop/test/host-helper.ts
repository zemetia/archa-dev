import { resolve } from 'node:path';
import { Host, nodeMcpCommand, type HostOptions } from '@archa/host';

/** The CLI bundle a launched run would start (the monorepo build). */
export const CLI = resolve(__dirname, '../../../apps/cli/dist/archa.cjs');
export const newHost = (opts: Partial<HostOptions> = {}) => new Host({ cliPath: CLI, mcpCommand: nodeMcpCommand(CLI), ...opts });
