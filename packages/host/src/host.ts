import { z } from 'zod';
import { newId, type Author } from '@archa/schema';
import type { Channel, ClientInfo, CoreMethods, Message, MethodName } from '@archa/protocol';
import { sweepShots } from '@archa/protocol/node';
import { AccountManager, ChatRunner, McpServerManager, MemoryStore, randomPersona, SkillManager, type McpCommand } from '@archa/agents';
import { AgentExecutor } from '@archa/mcp';
import { HostContext, type Connection } from './context';
import { createRouter, type Router } from './router';
import { documentRoutes } from './domains/documents';
import { exportRoutes } from './domains/export';
import { agentToolRoutes } from './domains/agent-tools';
import { browserRoutes, type BrowserBridge } from './domains/browser';
import { chatRoutes } from './domains/chat';
import { libraryRoutes } from './domains/library';
import { accountRoutes, mcpServerRoutes, memoryRoutes, skillRoutes } from './domains/settings';
import { appRoutes } from './domains/app';

export type HostOptions = {
  /** The app's main-process browser; omitted when headless (browser tools then report that they need the app). */
  browser?: BrowserBridge;
  /** How a launched agent starts `archa mcp` (the CLI bundle, run by node or by Electron as node). */
  mcpCommand: () => McpCommand;
  /** The `archa` CLI bundle, for Settings → Connect. */
  cliPath: string;
  version?: string;
};

const clientInfoSchema = z.object({
  kind: z.enum(['renderer', 'cli', 'mcp']), name: z.string().min(1).max(200), agentId: z.string().max(200).optional(),
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});

type Invoke = { [M in MethodName]: (params: CoreMethods[M]['params'], conn: Connection) => CoreMethods[M]['result'] | Promise<CoreMethods[M]['result']> };

/**
 * The core host (blueprint ARCHITECTURE/01): every open document and every connected client. The
 * composition root that wires the domain modules to the shared HostContext and the agent stores.
 * Runs in the app's utility process or in-process in the CLI (headless); no Electron.
 */
export class Host {
  readonly ctx = new HostContext();
  readonly accounts = new AccountManager((accountId) => this.ctx.broadcast('accounts.changed', accountId ? { accountId } : {}));
  readonly skills = new SkillManager(() => this.ctx.broadcast('skills.changed', {}));
  /** Agent memory: global plus the document's own (blueprint AGENT_BRIDGE/07). */
  readonly memory = new MemoryStore((docId) => this.ctx.activeDataDir(docId), () => this.ctx.broadcast('memory.changed', {}));
  readonly mcpServers = new McpServerManager(() => this.ctx.broadcast('mcp.changed', {}));
  readonly chat: ChatRunner;
  readonly router: Router;
  /** Every RPC method, callable directly (tests, in-process callers); requests from clients take the same path. */
  readonly handlers: Invoke;
  private executors = new Map<string, AgentExecutor>();

  constructor(opts: HostOptions) {
    const { ctx } = this;
    this.chat = new ChatRunner(ctx, { accounts: this.accounts, skills: this.skills, memory: this.memory, mcpServers: this.mcpServers }, opts.mcpCommand);
    const executor = (conn: Connection) => this.executor(conn);
    this.router = createRouter([
      ['documents', documentRoutes(ctx, this.chat)],
      ['export', exportRoutes(ctx)],
      ['agent-tools', agentToolRoutes(ctx, this.skills, executor)],
      ['browser', browserRoutes(ctx, executor, opts.browser)],
      ['chat', chatRoutes(ctx, this.chat)],
      ['library', libraryRoutes(ctx)],
      ['accounts', accountRoutes(this.accounts)],
      ['skills', skillRoutes(ctx, this.skills)],
      ['memory', memoryRoutes(this.memory)],
      ['mcp-servers', mcpServerRoutes(this.mcpServers)],
      ['app', appRoutes(ctx, { version: opts.version ?? '1.7.3', cliPath: opts.cliPath, mcpCommand: opts.mcpCommand })],
    ]);
    this.handlers = Object.fromEntries(Object.keys(this.router.routes).map((m) => [m, (p: unknown, c: Connection) => this.router.call(m, p, c)])) as Invoke;
    ctx.newDoc('Untitled');
    sweepShots();
  }

  attach(channel: Channel, raw: ClientInfo): Connection {
    const { ctx } = this;
    const id = newId();
    const client = clientInfoSchema.parse(raw);
    // Agents work under a session name, never the CLI id: a launched run takes its thread's name,
    // a terminal (listen-mode) agent gets one per connection (blueprint AGENT_BRIDGE/03 → Sessions).
    const run = client.runId ? this.chat.identity(client.runId) : null;
    const taken = [...ctx.connections.values()].map((c) => c.author.name ?? '');
    const author: Author = client.kind === 'renderer'
      ? { kind: 'user', id: `window-${id}`, name: 'You' }
      : run
        ? { kind: 'agent', id: `${run.agent}:${run.threadId}`, name: run.persona }
        : { kind: 'agent', id: `${client.agentId ?? client.name}:${id}`, name: randomPersona([], [...taken, ...this.chat.active().map((r) => r.persona)]) };
    const conn: Connection = { id, channel, client, author, connectedAt: Date.now(), ...(run ? { threadId: run.threadId } : {}) };
    ctx.connections.set(id, conn);
    channel.onMessage((msg) => void this.onMessage(conn, msg));
    if (client.kind !== 'renderer') ctx.broadcast('agents.changed', ctx.agents());
    return conn;
  }

  detach(conn: Connection) {
    this.ctx.connections.delete(conn.id);
    this.executors.delete(conn.id);
    if (conn.client.kind !== 'renderer') this.ctx.broadcast('agents.changed', this.ctx.agents());
  }

  /** Stops agent logins and runs; call before the process exits. */
  async shutdown() {
    this.accounts.shutdown();
    await this.chat.shutdown();
  }

  private async onMessage(conn: Connection, msg: Message) {
    if (msg.t !== 'req') return;
    try {
      const result = await this.router.call(msg.method, msg.params, conn);
      conn.channel.send({ t: 'res', id: msg.id, ok: true, result });
    } catch (e) {
      const err = e as Error & { code?: string };
      conn.channel.send({ t: 'res', id: msg.id, ok: false, error: { code: err.code ?? 'INTERNAL', message: err.message } });
    }
  }

  private executor(conn: Connection) {
    let ex = this.executors.get(conn.id);
    if (!ex) { ex = new AgentExecutor(this.ctx, conn); this.executors.set(conn.id, ex); }
    return ex;
  }
}
