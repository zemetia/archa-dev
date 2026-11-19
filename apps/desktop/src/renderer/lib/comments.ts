import { newId, type Comment } from '@archa/schema';
import { commit, togglePanel, toast, useStore } from './store';

/*
 * Review comments (blueprint AGENT_BRIDGE/04, v1): pins stored in the document, answered by people,
 * and "Apply" hands them to the chat agent. A comment resolves itself when that run finishes.
 */

/** Runs started by Apply → the comments they address. */
const applying = new Map<string, string[]>();

export const userName = () => useStore.getState().info?.user || 'You';

export function commentPoint(c: Comment): { x: number; y: number } {
  const doc = useStore.getState().doc;
  const n = c.nodeId ? doc?.get(c.nodeId) : undefined;
  if (!doc || !n) return { x: c.x, y: c.y };
  const b = doc.worldBounds(n.id);
  return { x: b.x + c.x, y: b.y + c.y };
}

export async function addComment(text: string) {
  const { commentDraft } = useStore.getState();
  if (!commentDraft || !text.trim()) return;
  const comment: Comment = { id: newId(), ...commentDraft, resolved: false, messages: [{ id: newId(), author: userName(), text: text.trim(), ts: Date.now() }] };
  if (await commit('Comment', [{ op: 'setComment', comment }])) useStore.setState({ openComment: comment.id, commentDraft: null });
}

export async function reply(c: Comment, text: string) {
  if (!text.trim()) return;
  await commit('Reply', [{ op: 'setComment', comment: { ...c, messages: [...c.messages, { id: newId(), author: userName(), text: text.trim(), ts: Date.now() }] } }]);
}

export const setResolved = (c: Comment, resolved: boolean) => commit(resolved ? 'Resolve comment' : 'Reopen comment', [{ op: 'setComment', comment: { ...c, resolved } }]);
export const deleteComment = (c: Comment) => commit('Delete comment', [{ op: 'deleteComment', id: c.id }]);

function remembered(key: string) {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

/** Sends comments to the agent picked in the chat composer, in the current conversation. */
export async function applyComments(comments: Comment[]) {
  const { client, activeDocId, doc, chatThread, runningRun, info } = useStore.getState();
  if (!client || !activeDocId || !doc || !comments.length) return;
  if (runningRun) { toast('The agent is still working — apply when it finishes', 'error'); return; }
  const agent = remembered('archa.chatAgent') || info?.agents.find((a) => a.available)?.id || 'claude';
  const model = remembered(`archa.chatModel.${agent}`) || undefined;
  const lines = comments.map((c, i) => {
    const n = c.nodeId ? doc.get(c.nodeId) : undefined;
    const where = n ? `on "${n.name}" (id ${n.id})` : `at page position ${Math.round(c.x)},${Math.round(c.y)}`;
    const thread = c.messages.map((m) => `   ${m.author}: ${m.text}`).join('\n');
    return `${i + 1}. Comment ${c.id} ${where}:\n${thread}`;
  });
  const prompt = `Apply these review comments to the design. Change only what they ask for, check each result with a screenshot, then reply with one line per comment saying what you changed.\n\n${lines.join('\n\n')}`;
  try {
    const r = await client.call('chat.send', { docId: activeDocId, agent, model, prompt, threadId: chatThread ?? undefined });
    applying.set(r.runId, comments.map((c) => c.id));
    useStore.setState({ chatThread: r.threadId, leftTab: 'chat' });
    togglePanel('left', true);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

/** Called for every chat.run event: a finished Apply run resolves its comments. */
export function onChatRun(runId: string, status: string) {
  const ids = applying.get(runId);
  if (!ids || status === 'running') return;
  applying.delete(runId);
  if (status !== 'finished') return;
  const doc = useStore.getState().doc;
  const ops = ids.map((id) => doc?.comments.get(id)).filter((c): c is Comment => !!c && !c.resolved)
    .map((c) => ({ op: 'setComment' as const, comment: { ...c, resolved: true } }));
  if (ops.length) void commit('Resolve applied comments', ops);
}

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'Now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ts).toLocaleDateString();
}

export const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
