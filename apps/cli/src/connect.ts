import { readFileSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { jsonLines, RpcClient, type ClientInfo } from '@archa/protocol';
import { runtimeFile, type RuntimeInfo } from '@archa/protocol/node';

export class CoreUnavailable extends Error {}

/** Connects to the running ArchaDev core host (blueprint CLI/01 `connect`). */
export async function connectCore(client: ClientInfo): Promise<RpcClient> {
  let info: RuntimeInfo;
  try {
    info = JSON.parse(readFileSync(runtimeFile(), 'utf8')) as RuntimeInfo;
  } catch {
    throw new CoreUnavailable('ArchaDev is not running. Open the app first (headless mode is not built yet).');
  }
  return new Promise((resolve, reject) => {
    const socket = netConnect(info.socket);
    socket.setEncoding('utf8');
    socket.once('error', () => reject(new CoreUnavailable(`Could not reach ArchaDev at ${info.socket}. Is the app still open?`)));
    socket.once('connect', () => {
      const channel = jsonLines((s) => socket.write(s), (cb) => socket.on('data', cb));
      channel.send({ t: 'hello', client, token: info.token });
      resolve(new RpcClient(channel));
    });
  });
}
