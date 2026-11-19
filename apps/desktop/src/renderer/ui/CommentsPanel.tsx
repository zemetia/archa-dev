import { useState } from 'react';
import { Check, Eye, EyeOff, MessageCircle, Sparkles, Undo2 } from 'lucide-react';
import type { Comment } from '@archa/schema';
import { useStore } from '../lib/store';
import { applyComments, commentPoint, initial, setResolved, timeAgo } from '../lib/comments';
import { cn } from './controls';

/** Right sidebar while the comment tool is active: every thread, Open / Resolved, Apply and Apply all. */
export function CommentsPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const show = useStore((s) => s.showComments);
  const running = useStore((s) => !!s.runningRun);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const all = doc ? [...doc.comments.values()] : [];
  const open = all.filter((c) => !c.resolved);
  const list = (tab === 'open' ? open : all.filter((c) => c.resolved)).slice().reverse();

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pl-4 pr-1.5">
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold">Comments</span>
        <button title={show ? 'Hide comment pins' : 'Show comment pins'} onClick={() => useStore.setState({ showComments: !show })}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg">
          {show ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>
      <div className="flex shrink-0 gap-1 p-3 pb-2">
        {(['open', 'resolved'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('h-8 flex-1 rounded-lg text-[12px] font-medium', tab === t ? 'bg-panel-3 text-fg' : 'text-fg-subtle hover:text-fg')}>
            {t === 'open' ? `Open ${open.length || ''}` : 'Resolved'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {list.length === 0 && (
          <p className="px-2 py-8 text-center text-[12px] leading-relaxed text-fg-subtle">
            <MessageCircle size={18} className="mx-auto mb-2" />
            {tab === 'open' ? 'No open comments. Click the canvas to leave one.' : 'Nothing resolved yet.'}
          </p>
        )}
        {list.map((c) => <Card key={c.id} comment={c} />)}
      </div>
      {tab === 'open' && open.length > 0 && (
        <div className="shrink-0 border-t border-line p-3">
          <button disabled={running} onClick={() => void applyComments(open)}
            title={running ? 'The agent is working' : 'Send every open comment to the chat agent'}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-fg text-[12.5px] font-semibold text-app hover:opacity-90 disabled:opacity-40">
            <Sparkles size={14} />Apply all ({open.length})
          </button>
        </div>
      )}
    </>
  );
}

function Card({ comment: c }: { comment: Comment }) {
  const active = useStore((s) => s.openComment === c.id);
  const first = c.messages[0]!;
  const focus = () => {
    const host = document.querySelector('[data-canvas-host]');
    const { camera } = useStore.getState();
    const p = commentPoint(c);
    useStore.setState({
      openComment: c.id, commentDraft: null, showComments: true,
      camera: { ...camera, x: (host?.clientWidth ?? 800) / 2 - 170 - p.x * camera.zoom, y: (host?.clientHeight ?? 600) / 2 - p.y * camera.zoom },
    });
  };
  return (
    <div onClick={focus} className={cn('cursor-pointer rounded-xl border bg-panel-2 p-3', active ? 'border-accent/70' : 'border-line hover:border-fg-subtle')}>
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="truncate font-semibold text-fg">{first.author}</span>
        <span className="shrink-0 text-fg-subtle">· {timeAgo(c.messages.at(-1)!.ts)}</span>
        <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-3 text-[10px] font-semibold">{initial(first.author)}</span>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-fg">{first.text}</p>
      {c.messages.length > 1 && <p className="mt-1 text-[11px] text-fg-subtle">{c.messages.length - 1} repl{c.messages.length === 2 ? 'y' : 'ies'}</p>}
      <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        {!c.resolved && (
          <button onClick={() => void applyComments([c])} className="flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-medium hover:bg-panel-3">
            <Sparkles size={13} />Apply
          </button>
        )}
        <button title={c.resolved ? 'Reopen' : 'Resolve'} onClick={() => void setResolved(c, !c.resolved)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-fg-muted hover:bg-panel-3 hover:text-fg">
          {c.resolved ? <Undo2 size={13} /> : <Check size={13} />}
        </button>
      </div>
    </div>
  );
}
