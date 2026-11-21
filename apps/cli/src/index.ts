import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { browserCommandSchema } from '@archa/protocol';
import { connectCore, CoreUnavailable } from './connect';
import { runMcp } from './mcp';

const program = new Command('archa')
  .description('ArchaDev — design canvas for people and local agents')
  .version('1.4.0');

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
  .command('browser')
  .argument('<action>', 'open, snapshot, screenshot, click, type, press, scroll, evaluate, … (same as the MCP browser tool)')
  .argument('[options]', 'JSON object with the action fields, e.g. {"url":"localhost:3000"}', '{}')
  .option('--out <file>', 'write a returned screenshot PNG here')
  .description('Drive the in-app browser of the running app')
  .action(async (action: string, options: string, opts: { out?: string }) => {
    let input: unknown;
    try { input = { ...(JSON.parse(options) as object), action }; } catch { console.error('error: options must be a JSON object'); process.exit(2); }
    const parsed = browserCommandSchema.safeParse(input);
    if (!parsed.success) {
      console.error(`error: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
      process.exit(2);
    }
    try {
      const core = await connectCore({ kind: 'cli', name: 'archa browser' });
      const r = await core.call('agent.browser', parsed.data);
      console.log(r.text);
      if (r.png && opts.out) { writeFileSync(opts.out, Buffer.from(r.png, 'base64')); console.log(`PNG written to ${resolve(opts.out)}`); }
      else if (r.png) console.log('(screenshot returned — pass --out file.png to save it)');
      process.exit(0);
    } catch (e) {
      console.error(`error: ${(e as Error).message}`);
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
