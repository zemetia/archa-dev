import { DocumentError, outline } from '@archa/core';
import { exportSvg } from '@archa/formats';
import type { SkillManager } from '@archa/agents';
import { compareReference, describeState, readReference, resolveRef, trailStep, type AgentExecutor } from '@archa/mcp';
import type { Connection, HostContext } from '../context';
import type { Routes } from '../router';

/* The calls behind the MCP tools agents use on the canvas (blueprint MCP/01). */


export function agentToolRoutes(ctx: HostContext, skills: SkillManager, executor: (conn: Connection) => AgentExecutor): Routes {
  return {
    'agent.state': ({ docId }) => describeState(ctx, ctx.session(docId)),
    'agent.execute': (params, conn) => executor(conn).run(ctx.session(params.docId), params),
    'agent.screenshot': async ({ docId, node, scale, slices }, conn) => {
      const s = ctx.session(docId);
      const id = resolveRef(s, node);
      const r = await ctx.screenshot(conn, s.id, id, scale ?? 1, { slices });
      if (r.error) throw new DocumentError('CONFLICT', r.error);
      ctx.log(s.id, conn.author, 'screenshot', `Screenshot "${r.name}"`, [id], conn.client.runId);
      ctx.trail(conn, s.id, [trailStep(s, 'look', id)]);
      return r;
    },
    'agent.reference': (p, conn) => readReference(ctx, p, conn),
    'agent.compare': (p, conn) => compareReference(ctx, p, conn),
    'agent.exportSvg': ({ docId, node }, conn) => {
      const s = ctx.session(docId);
      const id = resolveRef(s, node);
      ctx.trail(conn, s.id, [trailStep(s, 'read', id)]);
      return { svg: exportSvg(s.doc, id) };
    },
    'agent.outline': ({ docId, node, depth }, conn) => {
      const s = ctx.session(docId);
      const sel = (ctx.selection.get(s.id) ?? []).filter((id) => s.doc.get(id));
      const ids = node ? [resolveRef(s, node)] : sel.length ? sel : [s.doc.pages[0]!.rootId];
      const read = ids.filter((id) => id !== s.doc.pages[0]!.rootId).slice(0, 5);
      if (read.length) ctx.trail(conn, s.id, read.map((id) => trailStep(s, 'read', id)));
      const head = node ? '' : sel.length ? `Selection (${sel.length}):\n` : 'Nothing selected — the page:\n';
      return head + ids.map((id) => outline(s.doc, id, depth ?? (id === s.doc.pages[0]!.rootId ? 1 : 3))).join('\n');
    },
    'agent.readSkill': (p) => ({ text: skills.readForAgent(p, ctx.skillsDir(p?.docId)) }),
    'agent.say': ({ docId, text, nodeId }, conn) => {
      const s = ctx.session(docId);
      const id = nodeId ? resolveRef(s, nodeId) : null;
      ctx.log(s.id, conn.author, 'say', text, id ? [id] : [], conn.client.runId);
      if (id) ctx.trail(conn, s.id, [trailStep(s, 'focus', id)]);
    },
    'agent.done': ({ docId, summary }, conn) => {
      const s = ctx.session(docId);
      ctx.log(s.id, conn.author, 'done', summary?.trim() ? summary.trim().slice(0, 300) : 'Done', [], conn.client.runId);
      ctx.broadcast('agent.done', { docId: s.id, author: conn.author, ...(conn.client.runId ? { runId: conn.client.runId } : {}) });
    },
  };
}
