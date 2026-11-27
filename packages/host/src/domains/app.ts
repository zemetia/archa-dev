import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { z } from 'zod';
import { ADAPTERS, resolveCli, type McpCommand } from '@archa/agents';
import type { HostContext } from '../context';
import { validated, type Routes } from '../router';

/* App info, connected agents, the activity feed and render answers from a window. */

export type AppOptions = { version: string; cliPath: string; mcpCommand: () => McpCommand };

export const activityListSchema = z.object({ docId: z.string().max(4096).optional(), limit: z.number().int().min(1).max(2000).optional() });

export function appRoutes(ctx: HostContext, app: AppOptions): Routes {
  return {
    'app.info': () => {
      const m = app.mcpCommand();
      return {
        version: app.version,
        user: userName(),
        cliPath: app.cliPath,
        mcpCommand: [m.command, ...m.args],
        agents: ADAPTERS.map((a) => ({ id: a.id, label: a.label, available: !!resolveCli(a.bin) && existsSync(app.cliPath) })),
      };
    },
    'agents.list': () => ctx.agents(),
    'activity.list': validated(activityListSchema, ({ docId, limit }) => ctx.activity.filter((a) => !docId || a.docId === docId).slice(-(limit ?? 200))),
    'render.respond': ({ requestId, ...reply }) => ctx.resolveRender(requestId, reply),
  };
}

let cachedUser: string | null = null;
/** Comment author name: git's user.name when set, else the OS account. */
function userName(): string {
  if (cachedUser !== null) return cachedUser;
  try {
    cachedUser = execFileSync('git', ['config', '--global', 'user.name'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    cachedUser = '';
  }
  if (!cachedUser) {
    try { cachedUser = userInfo().username; } catch { cachedUser = 'You'; }
  }
  return cachedUser;
}
