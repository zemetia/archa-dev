import type { ChatRunner } from '@archa/agents';
import type { HostContext } from '../context';
import type { Routes } from '../router';

/* Chat tab and orchestrate team (blueprint AGENT_BRIDGE/03, /06). */

export function chatRoutes(ctx: HostContext, chat: ChatRunner): Routes {
  return {
    'chat.send': (p) =>
      chat.send(ctx.session(p.docId).id, p.agent, p.prompt, p.model, p.account, p.threadId, { now: p.now, focus: p.focus, images: p.images, mode: p.mode }),
    'chat.warm': (p) => chat.warmUp(ctx.session(p.docId).id, p.agent, p.model, p.account, p.threadId),
    'chat.stop': ({ runId }) => chat.stop(runId),
    'chat.queued': (p) => chat.queued(p.threadId),
    'chat.sendQueued': (p) => { chat.sendQueued(p.threadId, p.id); },
    'chat.unqueue': (p) => { chat.unqueue(p.threadId, p.id); },
    'chat.runs': () => chat.active(),
    'chat.list': ({ docId }) => chat.list(ctx.session(docId).id),
    'chat.deleteThread': (p) => { chat.deleteThread(ctx.session(p.docId).id, p.threadId); },
    'agents.models': (p) => chat.models(p.agent, p.account),
    // Team tools of an orchestrate lead; the connection's thread is the lead (blueprint AGENT_BRIDGE/06).
    'orchestra.delegate': (p, conn) => chat.delegate(conn.threadId, p.tasks),
    'orchestra.wait': (p, conn) => chat.wait(conn.threadId, p.workers, p.timeoutSec),
    'orchestra.tell': (p, conn) => chat.tell(conn.threadId, p.worker, p.message),
  };
}
