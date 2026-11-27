import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname } from 'node:path';
import { jsonLines, type Channel, type Message } from '@archa/protocol';
import { runtimeFile, socketPath, type RuntimeInfo } from '@archa/protocol/node';
import type { Connection } from './context';
import type { Host } from './host';

export type LocalServer = { info: RuntimeInfo; close(): void };

/**
 * Local socket for `archa` CLI and `archa mcp` (blueprint ARCHITECTURE/02): a named pipe / unix
 * socket under ARCHA_HOME, token-checked, announced in `runtime/core.json`. Resolves once listening.
 */
export function listenLocal(host: Host, kind: 'app' | 'headless'): Promise<LocalServer> {
  const path = socketPath();
  const token = randomBytes(24).toString('hex');
  if (process.platform !== 'win32') rmSync(path, { force: true });
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    let authed = false;
    const subs: Array<(m: Message) => void> = [];
    const channel = jsonLines((s) => socket.write(s), (cb) => socket.on('data', cb));
    const proxied: Channel = { send: channel.send, onMessage: (cb) => subs.push(cb) };
    let conn: Connection | null = null;
    channel.onMessage((m) => {
      if (!authed) {
        if (m.t === 'hello' && m.token === token) {
          try {
            conn = host.attach(proxied, m.client);
            authed = true;
          } catch {
            socket.destroy(); // malformed client info
          }
        } else socket.destroy();
        return;
      }
      for (const s of subs) s(m);
    });
    socket.on('close', () => { if (conn) host.detach(conn); });
    socket.on('error', () => socket.destroy());
  });
  const info: RuntimeInfo = { pid: process.pid, socket: path, token, startedAt: Date.now(), kind };
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => {
      server.off('error', reject);
      server.on('error', (e) => console.error('[core] socket error', e));
      mkdirSync(dirname(runtimeFile()), { recursive: true });
      writeFileSync(runtimeFile(), JSON.stringify(info, null, 2), { mode: 0o600 });
      resolve({
        info,
        close() {
          // Only our own announcement: another core may have taken over the file since.
          try {
            const current = JSON.parse(readFileSync(runtimeFile(), 'utf8')) as RuntimeInfo;
            if (current.token === token) rmSync(runtimeFile(), { force: true });
          } catch { /* already gone */ }
          server.close();
        },
      });
    });
  });
}
