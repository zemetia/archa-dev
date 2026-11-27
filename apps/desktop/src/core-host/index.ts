import { resolve } from 'node:path';
import type { MessagePortMain } from 'electron';
import type { Channel, Message } from '@archa/protocol';
import { createHost, nodeMcpCommand } from '@archa/host';
import { callBrowser } from './main-bridge';

/*
 * Core host: the utilityProcess that owns every document (blueprint ARCHITECTURE/01). The host
 * itself is @archa/host; this file only wires it to Electron's parentPort, window MessagePorts
 * and the main-process browser.
 */

/** The `archa` CLI bundle: ARCHA_CLI override, else the monorepo build next to the desktop app (dev). */
const cliPath = process.env.ARCHA_CLI ?? resolve(__dirname, '../../../cli/dist/archa.cjs');
const core = createHost({ browser: callBrowser, cliPath, mcpCommand: nodeMcpCommand(cliPath) });

function portChannel(port: MessagePortMain): Channel {
  const subs: Array<(m: Message) => void> = [];
  port.on('message', (e) => { for (const s of subs) s(e.data as Message); });
  port.start();
  return { send: (m) => port.postMessage(m), onMessage: (cb) => subs.push(cb) };
}

process.parentPort.on('message', (e) => {
  const msg = e.data as { type: string; windowId?: number };
  if (msg.type === 'connect' && e.ports[0]) {
    const port = e.ports[0];
    const conn = core.attach(portChannel(port), { kind: 'renderer', name: `window-${msg.windowId}` });
    port.on('close', () => core.detach(conn));
  } else if (msg.type === 'shutdown') {
    cleanup();
  }
});

// Local socket for `archa` CLI and `archa mcp` (blueprint ARCHITECTURE/02).
core.listen('app').catch((e) => console.error('[core] socket error', e));

function cleanup() {
  // Its synchronous part removes the runtime file, closes the socket and stops agent processes.
  void core.close();
  process.exit(0);
}
process.on('SIGTERM', cleanup);
