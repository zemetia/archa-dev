import { useMemo, useState } from 'react';
import { MessageSquare, Network, SquarePen, Trash2 } from 'lucide-react';
import { chatThreads, threadOf, type ChatMessage } from '@archa/protocol';
import { runOfThread, toast, useStore } from '../lib/store';
import { personaBg } from './persona';
import { cn } from './controls';

const AGENT_DOT: Record<string, string> = { claude: 'bg-claude', agy: 'bg-agy', codex: 'bg-codex' };

/* Past conversations on this document (stored in ~/.archadev/chats). Opening one resumes the agent's session. */
export function HistoryPanel() {
  const chat = useStore((s) => s.chat);
  const current = useStore((s) => s.chatThread);
  // Workers are reached through their lead (team view), so only the lead is listed.
  const threads = useMemo(() => chatThreads(chat).filter((t) => !(t.orchestra && 'parent' in t.orchestra)), [chat]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 pb-2.5">
        <button onClick={() => useStore.setState({ chatThread: null, leftTab: 'chat' })}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-[12px] font-medium text-fg shadow-lg shadow-accent/25 hover:opacity-90">
          <SquarePen size={13} />New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {threads.length === 0 && <p className="px-2 pt-6 text-center text-[12px] text-fg-subtle">No conversations on this document yet.</p>}
        {threads.map((t) => <ThreadRow key={t.id} id={t.id} title={t.title} agent={t.agent} persona={t.persona} updatedAt={t.updatedAt} messages={t.messages} active={t.id === current} team={!!t.orchestra} />)}
      </div>
    </div>
  );
}

function ThreadRow({ id, title, agent, persona, updatedAt, messages, active, team }: { id: string; title: string; agent: string; persona?: string; updatedAt: number; messages: number; active: boolean; team: boolean }) {
  const Icon = team ? Network : MessageSquare;
  const client = useStore((s) => s.client);
  const working = useStore((s) => !!runOfThread(s.runs, id));
  const docId = useStore((s) => s.activeDocId);
  const [confirm, setConfirm] = useState(false);

  const remove = async () => {
    if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 2500); return; }
    if (!client || !docId) return;
    try {
      await client.call('chat.deleteThread', { docId, threadId: id });
      // A lead's workers are deleted with it.
      const gone = (m: ChatMessage) => threadOf(m) === id || (!!m.orchestra && 'parent' in m.orchestra && m.orchestra.parent === id);
      useStore.setState((s) => ({ chat: s.chat.filter((m) => !gone(m)), chatThread: s.chat.some((m) => gone(m) && threadOf(m) === s.chatThread) ? null : s.chatThread }));
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className={cn('group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors', active ? 'bg-accent-soft' : 'hover:bg-panel-2')}>
      <button onClick={() => useStore.setState({ chatThread: id, leftTab: 'chat' })} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        <span title={team ? 'Orchestrated — this chat led a team' : undefined}><Icon size={13} className={cn('mt-0.5 shrink-0', active || team ? 'text-accent-fg' : 'text-fg-subtle')} /></span>
        <span className="min-w-0 flex-1">
          <span className={cn('line-clamp-2 text-[12px] leading-snug', active ? 'text-fg' : 'text-fg-muted')}>{title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fg-subtle">
            <span className={cn('h-1.5 w-1.5 rounded-full', persona ? personaBg(persona) : AGENT_DOT[agent] ?? 'bg-fg-subtle', working && 'animate-pulse')} />
            {persona && <span className="text-fg-muted">{persona}</span>}{persona && ' · '}
            {working ? 'working' : when(updatedAt)} · {messages} message{messages === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      <button title={confirm ? 'Click again to delete' : 'Delete conversation'} onClick={() => void remove()}
        className={cn('shrink-0 rounded-md px-1 py-0.5 text-[10.5px]', confirm ? 'text-danger' : 'text-fg-subtle opacity-0 hover:text-danger group-hover:opacity-100')}>
        {confirm ? 'Delete?' : <Trash2 size={12} />}
      </button>
    </div>
  );
}

function when(ts: number) {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
