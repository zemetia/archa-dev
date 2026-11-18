import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { DocumentError } from '@archa/core';
import { newId } from '@archa/schema';
import type { McpImportCandidate, McpImportSource, McpServer, McpTestResult, McpTransport, SecretEntry } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import { parse } from './accounts';

/*
 * Settings → MCP servers (blueprint AGENT_BRIDGE/05): external MCP servers that chat runs get next
 * to ArchaDev's own. Stored in ~/.archadev/mcp.json (0600); env values and headers stay in the core
 * host — the protocol only carries their keys.
 */

const file = () => join(archaHome(), 'mcp.json');
const TEST_TIMEOUT = 20_000;
export const RESERVED = 'archadev';

type Stored = {
  id: string; name: string; transport: McpTransport; command: string; args: string[]; url: string;
  env: Record<string, string>; headers: Record<string, string>; enabled: boolean; createdAt: number;
};
type StoreFile = { version: 1; servers: Stored[] };

const secrets = z.array(z.object({ key: z.string().trim().min(1).max(200).regex(/^[^\s=]+$/, 'Keys cannot contain spaces or "="'), value: z.string().max(8192).nullable() })).max(64);
export const mcpParams = {
  save: z.object({
    id: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(48).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, "-" and "_"').refine((n) => n.toLowerCase() !== RESERVED, `"${RESERVED}" is ArchaDev's own server`),
    transport: z.enum(['stdio', 'http', 'sse']),
    command: z.string().trim().max(1024).optional(),
    args: z.array(z.string().max(4096)).max(64).optional(),
    url: z.string().trim().max(2048).optional(),
    env: secrets.optional(),
    headers: secrets.optional(),
    enabled: z.boolean().optional(),
  }),
  byId: z.object({ id: z.string().min(1).max(64) }),
  import: z.object({ source: z.enum(['claude', 'antigravity', 'cursor']), names: z.array(z.string().min(1).max(200)).min(1).max(100) }),
};

export class McpServerManager {
  private tests = new Map<string, McpTestResult>();

  constructor(private changed: () => void) {}

  list(): McpServer[] {
    return this.load().servers.map((s) => this.view(s));
  }

  save(params: unknown): McpServer {
    const p = parse(mcpParams.save, params);
    const st = this.load();
    const prev = p.id ? st.servers.find((s) => s.id === p.id) : undefined;
    if (p.id && !prev) throw new DocumentError('NOT_FOUND', `No MCP server ${p.id}`);
    if (st.servers.some((s) => s.id !== p.id && s.name.toLowerCase() === p.name.toLowerCase())) throw new DocumentError('CONFLICT', `An MCP server named "${p.name}" already exists`);
    if (p.transport === 'stdio' && !p.command) throw new DocumentError('VALIDATION', 'command: A command is required');
    if (p.transport !== 'stdio') {
      try { if (!/^https?:$/.test(new URL(p.url ?? '').protocol)) throw new Error(); } catch { throw new DocumentError('VALIDATION', 'url: Enter an http(s) URL'); }
    }
    const next: Stored = {
      id: prev?.id ?? newId(),
      name: p.name,
      transport: p.transport,
      command: p.transport === 'stdio' ? p.command ?? '' : '',
      args: p.transport === 'stdio' ? p.args ?? [] : [],
      url: p.transport === 'stdio' ? '' : p.url ?? '',
      env: mergeSecrets(prev?.env, p.env),
      headers: mergeSecrets(prev?.headers, p.headers),
      enabled: p.enabled ?? prev?.enabled ?? true,
      createdAt: prev?.createdAt ?? Date.now(),
    };
    st.servers = prev ? st.servers.map((s) => (s.id === next.id ? next : s)) : [...st.servers, next];
    this.write(st);
    this.tests.delete(next.id);
    this.changed();
    return this.view(next);
  }

  delete(params: unknown) {
    const { id } = parse(mcpParams.byId, params);
    const st = this.load();
    st.servers = st.servers.filter((s) => s.id !== id);
    this.write(st);
    this.tests.delete(id);
    this.changed();
  }

  /** Connects, lists the tools, disconnects. */
  async test(params: unknown): Promise<McpTestResult> {
    const { id } = parse(mcpParams.byId, params);
    const s = this.load().servers.find((x) => x.id === id);
    if (!s) throw new DocumentError('NOT_FOUND', `No MCP server ${id}`);
    let result: McpTestResult;
    const client = new Client({ name: 'archadev-settings', version: '0.1.0' });
    let transport: Transport | null = null;
    try {
      transport = makeTransport(s);
      const run = (async () => {
        await client.connect(transport!);
        const tools = await client.listTools();
        const v = client.getServerVersion();
        return { tools: tools.tools.map((t) => ({ name: t.name, description: (t.description ?? '').split('\n')[0]!.slice(0, 200) })), serverName: v?.name, serverVersion: v?.version };
      })();
      const r = await Promise.race([run, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`No answer after ${TEST_TIMEOUT / 1000}s`)), TEST_TIMEOUT))]);
      result = { ok: true, at: Date.now(), ...r };
    } catch (e) {
      result = { ok: false, at: Date.now(), tools: [], error: (e as Error).message.slice(0, 1000) };
    } finally {
      await client.close().catch(() => undefined);
      await transport?.close().catch(() => undefined);
    }
    this.tests.set(id, result);
    this.changed();
    return result;
  }

  importCandidates(): McpImportCandidate[] {
    const have = new Set(this.load().servers.map((s) => s.name.toLowerCase()));
    return (['claude', 'antigravity', 'cursor'] as const).flatMap((source) => Object.entries(foreignServers(source)).map(([name, s]) => ({
      source, name, transport: s.transport, detail: s.transport === 'stdio' ? [s.command, ...s.args].join(' ') : s.url, exists: have.has(name.toLowerCase()),
    })));
  }

  import(params: unknown): McpServer[] {
    const p = parse(mcpParams.import, params);
    const found = foreignServers(p.source);
    const st = this.load();
    const added: Stored[] = [];
    for (const name of p.names) {
      const s = found[name];
      const clean = name.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 48);
      if (!s || clean.toLowerCase() === RESERVED || st.servers.some((x) => x.name.toLowerCase() === clean.toLowerCase())) continue;
      const next: Stored = { ...s, id: newId(), name: clean, enabled: true, createdAt: Date.now() };
      st.servers.push(next);
      added.push(next);
    }
    this.write(st);
    this.changed();
    return added.map((s) => this.view(s));
  }

  /** Enabled servers in Claude Code's `--mcp-config` shape, keyed by name. */
  forRun(): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const s of this.load().servers) {
      if (!s.enabled) continue;
      out[s.name] = s.transport === 'stdio'
        ? { command: s.command, args: s.args, env: s.env }
        : { type: s.transport, url: s.url, headers: s.headers };
    }
    return out;
  }

  private view(s: Stored): McpServer {
    return {
      id: s.id, name: s.name, transport: s.transport, command: s.command, args: s.args, url: s.url,
      envKeys: Object.keys(s.env), headerKeys: Object.keys(s.headers), enabled: s.enabled, createdAt: s.createdAt, test: this.tests.get(s.id) ?? null,
    };
  }

  private load(): StoreFile {
    try {
      const j = JSON.parse(readFileSync(file(), 'utf8')) as Partial<StoreFile>;
      return { version: 1, servers: Array.isArray(j.servers) ? j.servers : [] };
    } catch {
      return { version: 1, servers: [] };
    }
  }

  private write(st: StoreFile) {
    mkdirSync(archaHome(), { recursive: true });
    writeFileSync(file(), JSON.stringify(st, null, 2), { mode: 0o600 });
  }
}

function mergeSecrets(prev: Record<string, string> | undefined, next: SecretEntry[] | undefined): Record<string, string> {
  if (!next) return { ...prev };
  const out: Record<string, string> = {};
  for (const { key, value } of next) out[key] = value ?? prev?.[key] ?? '';
  return out;
}

function makeTransport(s: Stored): Transport {
  if (s.transport === 'stdio') {
    return new StdioClientTransport({ command: s.command, args: s.args, env: { ...getDefaultEnvironment(), ...s.env }, stderr: 'ignore' });
  }
  const url = new URL(s.url);
  const requestInit = { headers: s.headers };
  return s.transport === 'sse' ? new SSEClientTransport(url, { requestInit }) : new StreamableHTTPClientTransport(url, { requestInit });
}

type Foreign = Omit<Stored, 'id' | 'name' | 'enabled' | 'createdAt'>;

/** User-level servers from another client's config. Missing or malformed files give nothing. */
function foreignServers(source: McpImportSource): Record<string, Foreign> {
  // Same host login as accounts.ts: ~/.claude.json, never an inherited CLAUDE_CONFIG_DIR.
  const path = source === 'claude' ? join(homedir(), '.claude.json')
    : source === 'antigravity' ? join(homedir(), '.gemini', 'antigravity', 'mcp_config.json')
    : join(homedir(), '.cursor', 'mcp.json');
  if (!existsSync(path)) return {};
  let raw: unknown;
  try { raw = (JSON.parse(readFileSync(path, 'utf8')) as { mcpServers?: unknown }).mcpServers; } catch { return {}; }
  const out: Record<string, Foreign> = {};
  for (const [name, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const o = (v ?? {}) as Record<string, unknown>;
    const strs = (x: unknown) => (Array.isArray(x) ? x.filter((a): a is string => typeof a === 'string') : []);
    const map = (x: unknown) => Object.fromEntries(Object.entries(x && typeof x === 'object' ? x : {}).filter(([, val]) => typeof val === 'string')) as Record<string, string>;
    if (typeof o.command === 'string') out[name] = { transport: 'stdio', command: o.command, args: strs(o.args), url: '', env: map(o.env), headers: {} };
    else if (typeof (o.url ?? o.serverUrl) === 'string') out[name] = { transport: o.type === 'sse' ? 'sse' : 'http', command: '', args: [], url: String(o.url ?? o.serverUrl), env: {}, headers: map(o.headers) };
  }
  return out;
}
