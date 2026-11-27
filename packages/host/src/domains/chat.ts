import { z } from 'zod';
import type { ChatRunner } from '@archa/agents';
import type { HostContext } from '../context';
import { validated, type Routes } from '../router';

/* Chat tab and orchestrate team (blueprint AGENT_BRIDGE/03, /06). */

const threadId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const agentId = z.enum(['claude', 'agy', 'codex']);
export const chatSendSchema = z.object({
  docId: z.string().min(1), agent: z.string().min(1), prompt: z.string().min(1).max(100_000),
  model: z.string().max(100).optional(), account: z.string().max(100).optional(), threadId: threadId.optional(),
  now: z.boolean().optional(), focus: z.array(z.string().min(1).max(100)).max(50).optional(), mode: z.enum(['chat', 'orchestrate']).optional(),
  images: z.array(z.object({
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    data: z.string().min(1).max(15_000_000).regex(/^[A-Za-z0-9+/]+=*$/),
    thumb: z.string().max(300_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
  })).max(6).optional(),
});
export const chatWarmSchema = z.object({
  docId: z.string().min(1), agent: z.string().min(1), model: z.string().max(100).optional(), account: z.string().max(100).optional(), threadId: threadId.optional(),
});
export const chatStopSchema = z.object({ runId: z.string().min(1).max(200) });
export const chatQueueSchema = z.object({ threadId, id: z.string().min(1).max(64) });
export const chatQueuedSchema = z.object({ threadId });
export const chatListSchema = z.object({ docId: z.string().min(1) });
export const chatThreadSchema = z.object({ docId: z.string().min(1), threadId: z.string().min(1).max(64) });
export const agentModelsSchema = z.object({ agent: agentId, account: z.string().max(100).optional() });
export const orchestraDelegateSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(120), prompt: z.string().min(1).max(40_000), kind: z.string().max(40).optional(),
    agent: agentId.optional(), model: z.string().max(100).optional(), frame: z.string().min(1).max(100).optional(),
  })).min(1).max(8),
});
export const orchestraWaitSchema = z.object({ workers: z.array(z.string().min(1).max(100)).max(8).optional(), timeoutSec: z.number().min(5).max(600).optional() });
export const orchestraTellSchema = z.object({ worker: z.string().min(1).max(100), message: z.string().min(1).max(40_000) });

export function chatRoutes(ctx: HostContext, chat: ChatRunner): Routes {
  return {
    'chat.send': validated(chatSendSchema, (p) =>
      chat.send(ctx.session(p.docId).id, p.agent, p.prompt, p.model, p.account, p.threadId, { now: p.now, focus: p.focus, images: p.images, mode: p.mode })),
    'chat.warm': validated(chatWarmSchema, (p) => chat.warmUp(ctx.session(p.docId).id, p.agent, p.model, p.account, p.threadId)),
    'chat.stop': validated(chatStopSchema, ({ runId }) => chat.stop(runId)),
    'chat.queued': validated(chatQueuedSchema, (p) => chat.queued(p.threadId)),
    'chat.sendQueued': validated(chatQueueSchema, (p) => { chat.sendQueued(p.threadId, p.id); }),
    'chat.unqueue': validated(chatQueueSchema, (p) => { chat.unqueue(p.threadId, p.id); }),
    'chat.runs': () => chat.active(),
    'chat.list': validated(chatListSchema, ({ docId }) => chat.list(ctx.session(docId).id)),
    'chat.deleteThread': validated(chatThreadSchema, (p) => { chat.deleteThread(ctx.session(p.docId).id, p.threadId); }),
    'agents.models': validated(agentModelsSchema, (p) => chat.models(p.agent, p.account)),
    // Team tools of an orchestrate lead; the connection's thread is the lead (blueprint AGENT_BRIDGE/06).
    'orchestra.delegate': validated(orchestraDelegateSchema, (p, conn) => chat.delegate(conn.threadId, p.tasks)),
    'orchestra.wait': validated(orchestraWaitSchema, (p, conn) => chat.wait(conn.threadId, p.workers, p.timeoutSec)),
    'orchestra.tell': validated(orchestraTellSchema, (p, conn) => chat.tell(conn.threadId, p.worker, p.message)),
  };
}
