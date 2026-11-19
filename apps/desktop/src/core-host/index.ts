import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import type { MessagePortMain } from 'electron';
import { jsonLines, type Channel, type Message } from '@archa/protocol';
import { runtimeFile, socketPath, type RuntimeInfo } from '@archa/protocol/node';
import { Workspace } from './workspace';

/* Core host: utilityProcess that owns every document (blueprint ARCHITECTURE/01). */

const ws = new Workspace();
const token = randomBytes(24).toString('hex');

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
    const conn = ws.attach(portChannel(port), { kind: 'renderer', name: `window-${msg.windowId}` });
    port.on('close', () => ws.detach(conn));
  } else if (msg.type === 'shutdown') {
    cleanup();
  }
});

/* Local socket for `archa` CLI and `archa mcp` (blueprint ARCHITECTURE/02). */
const path = socketPath();
if (process.platform !== 'win32') rmSync(path, { force: true });
const server = createServer((socket) => {
  socket.setEncoding('utf8');
  let authed = false;
  const subs: Array<(m: Message) => void> = [];
  const channel = jsonLines((s) => socket.write(s), (cb) => socket.on('data', cb));
  const proxied: Channel = { send: channel.send, onMessage: (cb) => subs.push(cb) };
  let conn: ReturnType<typeof ws.attach> | null = null;
  channel.onMessage((m) => {
    if (!authed) {
      if (m.t === 'hello' && m.token === token) {
        try {
          conn = ws.attach(proxied, m.client);
          authed = true;
        } catch {
          socket.destroy(); // malformed client info
        }
      } else socket.destroy();
      return;
    }
    for (const s of subs) s(m);
  });
  socket.on('close', () => { if (conn) ws.detach(conn); });
  socket.on('error', () => socket.destroy());
});
server.listen(path, () => {
  mkdirSync(dirname(runtimeFile()), { recursive: true });
  const info: RuntimeInfo = { pid: process.pid, socket: path, token, startedAt: Date.now() };
  writeFileSync(runtimeFile(), JSON.stringify(info, null, 2), { mode: 0o600 });
});
server.on('error', (e) => console.error('[core] socket error', e));

function cleanup() {
  ws.accounts.shutdown();
  void ws.chat.shutdown();
  try { rmSync(runtimeFile(), { force: true }); } catch { /* already gone */ }
  server.close();
  process.exit(0);
}
process.on('SIGTERM', cleanup);
