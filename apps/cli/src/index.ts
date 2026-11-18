import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { connectCore, CoreUnavailable } from './connect';
import { runMcp } from './mcp';

const program = new Command('archa')
  .description('ArchaDev — design canvas for people and local agents')
  .version('0.1.0');

program
  .command('mcp')
  .description('MCP server on stdio for agents (Claude Code, Codex, agy, Hermes)')
  .option('--doc <id>', 'target document id (default: the active one)')
  .option('--agent <name>', 'agent name shown in ArchaDev')
  .action(async (opts: { doc?: string; agent?: string }) => runMcp(opts));

program
  .command('status')
  .description('Check the connection to the running app')
  .option('--json')
  .action(async (opts: { json?: boolean }) => {
    try {
      const core = await connectCore({ kind: 'cli', name: 'archa status' });
      const [docs, agents] = await Promise.all([core.call('workspace.list'), core.call('agents.list')]);
      if (opts.json) console.log(JSON.stringify({ running: true, docs, agents }, null, 2));
      else {
        console.log(`ArchaDev is running · ${docs.length} document(s) open`);
        for (const d of docs) console.log(`  ${d.name}  ${d.id}${d.filePath ? `  ${d.filePath}` : ''}${d.dirty ? '  (unsaved)' : ''}`);
        console.log(`Agents connected: ${agents.filter((a) => a.name !== 'archa status').map((a) => a.name).join(', ') || 'none'}`);
      }
      process.exit(0);
    } catch (e) {
      if (opts.json) console.log(JSON.stringify({ running: false, error: (e as Error).message }));
      else console.error(`error: ${(e as Error).message}`);
      process.exit(e instanceof CoreUnavailable ? 4 : 1);
    }
  });

program
  .command('open')
  .argument('[target]', 'a .archa file', '')
  .description('Open a .archa file in ArchaDev')
  .action(async (target: string) => {
    const path = target ? resolve(target) : '';
    if (path && !existsSync(path)) {
      console.error(`error: ${path} does not exist`);
      process.exit(3);
    }
    try {
      const core = await connectCore({ kind: 'cli', name: 'archa open' });
      if (path.endsWith('.archa')) await core.call('doc.open', { path });
      process.exit(0);
    } catch (e) {
      const app = process.env.ARCHA_APP_PATH;
      if (e instanceof CoreUnavailable && app) {
        spawn(app, path ? ['--file', path] : [], { detached: true, stdio: 'ignore' }).unref();
        process.exit(0);
      }
      console.error(`error: ${(e as Error).message}`);
      process.exit(4);
    }
  });

program.parseAsync(process.argv).catch((e: unknown) => {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
});
