import { RpcClient, type Channel, type ClientInfo } from '@archa/protocol';
import type { Connection } from './context';
import { Host, type HostOptions } from './host';
import { channelPair } from './in-process';
import { listenLocal, type LocalServer } from './socket';

export type CoreHost = {
  host: Host;
  attach(channel: Channel, client: ClientInfo): Connection;
  detach(conn: Connection): void;
  /** A client of this host in the same process (headless CLI, tests). */
  connect(client: ClientInfo): RpcClient;
  /** Opens the local socket and writes `runtime/core.json` (`kind` says who owns it). */
  listen(kind?: 'app' | 'headless'): Promise<LocalServer>;
  /** Unsaved work goes to its file or a backup (app windows only; see HostOptions.windows). */
  flush(): Promise<void>;
  /** Stops agent runs and logins, closes the socket and removes the runtime file. */
  close(): Promise<void>;
};

/** Boots a core host (blueprint ARCHITECTURE/01, /03): the desktop utility process and headless `archa` both start here. */
export function createHost(opts: HostOptions): CoreHost {
  const host = new Host(opts);
  let server: LocalServer | null = null;
  return {
    host,
    attach: (channel, client) => host.attach(channel, client),
    detach: (conn) => host.detach(conn),
    connect(client) {
      const [mine, theirs] = channelPair();
      host.attach(mine, client);
      return new RpcClient(theirs);
    },
    async listen(kind = 'app') {
      server = await listenLocal(host, kind);
      return server;
    },
    flush: () => host.files.flush(),
    async close() {
      server?.close();
      server = null;
      await host.shutdown();
    },
  };
}
