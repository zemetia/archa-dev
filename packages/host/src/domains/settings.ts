import type { AccountManager, McpServerManager, MemoryStore, SkillManager } from '@archa/agents';
import { memoryParams } from '@archa/agents';
import type { HostContext } from '../context';
import { validated, type Routes } from '../router';

/*
 * Settings → AI providers, Skills, MCP servers, and agent memory (blueprint AGENT_BRIDGE/02, /07).
 * Each store validates its own params (its zod schemas live next to it in @archa/agents).
 */

export function accountRoutes(accounts: AccountManager): Routes {
  return {
    'accounts.overview': () => accounts.overview(),
    'accounts.create': (p) => accounts.create(p),
    'accounts.update': (p) => accounts.update(p),
    'accounts.delete': (p) => accounts.delete(p),
    'accounts.captureHost': (p) => accounts.captureHost(p),
    'accounts.useOnHost': (p) => accounts.useOnHost(p),
    'accounts.login.start': (p) => accounts.startLogin(p),
    'accounts.login.code': (p) => accounts.submitCode(p),
    'accounts.login.cancel': (p) => accounts.cancelLogin(p),
  };
}

export function skillRoutes(ctx: HostContext, skills: SkillManager): Routes {
  return {
    'skills.list': (p) => skills.overview(ctx.skillsDir(p?.docId)),
    'skills.create': (p) => skills.create(p),
    'skills.import': (p) => skills.import(p),
    'skills.update': (p) => skills.update(p),
    'skills.delete': (p) => skills.delete(p),
    'skills.read': (p) => skills.read(p, ctx.skillsDir(p?.docId)),
  };
}

export function memoryRoutes(memory: MemoryStore): Routes {
  return {
    'memory.list': validated(memoryParams.list, (p) => memory.list(p.docId)),
    'memory.remember': (p) => memory.remember(p),
    'memory.forget': (p) => memory.forget(p),
  };
}

export function mcpServerRoutes(mcpServers: McpServerManager): Routes {
  return {
    'mcp.list': () => mcpServers.list(),
    'mcp.save': (p) => mcpServers.save(p),
    'mcp.delete': (p) => mcpServers.delete(p),
    'mcp.test': (p) => mcpServers.test(p),
    'mcp.importCandidates': () => mcpServers.importCandidates(),
    'mcp.import': (p) => mcpServers.import(p),
  };
}
