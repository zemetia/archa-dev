import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClientInfo, RpcClient } from '@archa/protocol';
import { createHost, nodeMcpCommand } from '@archa/host';

/**
 * Headless core (blueprint ARCHITECTURE/03, "Boot Sequence (headless)"): @archa/host in this process,
 * reached over the in-process channel. It also listens on the local socket and writes
 * `runtime/core.json` with `kind: 'headless'`, so other `archa` clients share this one writer.
 * Not built yet: core.lock and handing over to an app that starts later (`core.handover`).
 */
export async function startHeadless(client: ClientInfo): Promise<RpcClient> {
  const cliPath = resolve(process.argv[1] ?? __filename);
  // Built-in design skills, as the app passes them to its own core: installed (resources/skills) or a checkout.
  const skills = [resolve(cliPath, '../../skills'), resolve(cliPath, '../../../../skills')].find((d) => existsSync(resolve(d, 'design-website')));
  if (!process.env.ARCHA_BUILTIN_SKILLS && skills) process.env.ARCHA_BUILTIN_SKILLS = skills;
  const core = createHost({ cliPath, mcpCommand: nodeMcpCommand(cliPath) });
  try {
    await core.listen('headless');
  } catch (e) {
    console.error(`[archa] headless core: no local socket (${(e as Error).message}); other clients cannot join`);
  }
  let closed = false;
  const stop = (code = 0) => {
    if (closed) return;
    closed = true;
    void core.close();
    process.exit(code);
  };
  // The socket keeps the process alive: leave when the agent closes our stdin.
  process.stdin.once('end', () => stop());
  process.stdin.once('close', () => stop());
  process.once('SIGINT', () => stop());
  process.once('SIGTERM', () => stop());
  process.once('exit', () => { if (!closed) { closed = true; void core.close(); } });
  console.error('[archa] no ArchaDev app running — started a headless core');
  return core.connect(client);
}
