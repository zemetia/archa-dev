import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Sparkles, Trash2, Undo2 } from 'lucide-react';
import type { Comment } from '@archa/schema';
import { useStore } from '../lib/store';
import { toScreen } from '../lib/geometry';
import { addComment, applyComments, commentPoint, deleteComment, initial, reply, setResolved, timeAgo, userName } from '../lib/comments';
import { cn } from '../ui/controls';

/** Comment pins over the canvas and the open thread / new-comment card (blueprint AGENT_BRIDGE/04). */
export function CommentsLayer() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const camera = useStore((s) => s.camera);
  const show = useStore((s) => s.showComments);
  const open = useStore((s) => s.openComment);
  const draft = useStore((s) => s.commentDraft);
  if (!doc) return null;
  const comments = [...doc.comments.values()].filter((c) => !c.resolved || c.id === open);
  const draftPoint = open === 'new' && draft ? (() => {
    const n = draft.nodeId ? doc.get(draft.nodeId) : undefined;
    const b = n ? doc.worldBounds(n.id) : { x: 0, y: 0 };
    return toScreen(camera, b.x + draft.x, b.y + draft.y);
  })() : null;

  return (
    <>
      {show && comments.map((c) => {
        const p = toScreen(camera, commentPoint(c).x, commentPoint(c).y);
        return (
          <div key={c.id} className="absolute" style={{ left: p.x, top: p.y }}>
            <Pin name={c.messages[0]!.author} active={open === c.id} resolved={c.resolved}
              onClick={() => useStore.setState({ openComment: open === c.id ? null : c.id, commentDraft: null })} />
            {open === c.id && <Thread comment={c} />}
          </div>
        );
      })}
      {draftPoint && (
        <div className="absolute" style={{ left: draftPoint.x, top: draftPoint.y }}>
          <Pin name={userName()} active onClick={() => undefined} />
          <Card>
            <Composer placeholder="Leave feedback…" autoFocus onSend={(t) => void addComment(t)}
              onCancel={() => useStore.setState({ openComment: null, commentDraft: null })} />
          </Card>
        </div>
      )}
    </>
  );
}

/** Avatar pin; its bottom-left corner marks the commented point. */
function Pin({ name, active, resolved, onClick }: { name: string; active?: boolean; resolved?: boolean; onClick: () => void }) {
  return (
    <button title={name} onPointerDown={(e) => e.stopPropagation()} onClick={onClick}
      className={cn('absolute bottom-0 left-0 flex h-8 w-8 items-center justify-center rounded-full rounded-bl-none border-2 bg-panel text-[12px] font-semibold text-fg shadow-lg shadow-black/40 transition-transform hover:scale-110',
        active ? 'border-accent' : 'border-fg', resolved && 'opacity-60')}>
      {initial(name)}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
      className="absolute left-11 top-[-32px] z-20 w-[340px] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/50">
      {children}
    </div>
  );
}

function Thread({ comment: c }: { comment: Comment }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [c.messages.length]);
  const close = () => useStore.setState({ openComment: null });
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex-1 text-[12px] text-fg-muted">{c.messages.length} comment{c.messages.length === 1 ? '' : 's'}</span>
        {!c.resolved && (
          <button onClick={() => void applyComments([c])} title="Ask the chat agent to make this change"
            className="flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-medium text-fg hover:bg-panel-2">
            <Sparkles size={13} />Apply
          </button>
        )}
        <button title={c.resolved ? 'Reopen' : 'Resolve'} onClick={() => { void setResolved(c, !c.resolved); close(); }}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-fg-muted hover:bg-panel-2 hover:text-fg">
          {c.resolved ? <Undo2 size={13} /> : <Check size={13} />}
        </button>
        <button title="Delete thread" onClick={() => { void deleteComment(c); close(); }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-danger">
          <Trash2 size={13} />
        </button>
      </div>
      <div ref={list} className="max-h-[260px] overflow-y-auto">
        {c.messages.map((m) => (
          <div key={m.id} className="border-b border-line px-3 py-2.5 last:border-b-0">
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="font-semibold text-fg">{m.author}</span>
              <span className="text-fg-subtle">· {timeAgo(m.ts)}</span>
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-panel-3 text-[10px] font-semibold">{initial(m.author)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{m.text}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-line"><Composer placeholder="Reply…" onSend={(t) => void reply(c, t)} onCancel={close} /></div>
    </Card>
  );
}

export function Composer({ placeholder, onSend, onCancel, autoFocus }: { placeholder: string; onSend: (text: string) => void; onCancel: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const send = () => { if (!text.trim()) return; onSend(text); setText(''); };
  return (
    <div className="flex items-end gap-2 px-3 py-2.5">
      <textarea value={text} autoFocus={autoFocus} rows={autoFocus ? 2 : 1} placeholder={placeholder} spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="min-h-[24px] flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-fg placeholder:text-fg-subtle" />
      <button title="Send (Enter)" disabled={!text.trim()} onClick={send}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-3 text-fg-muted enabled:bg-accent enabled:text-white disabled:opacity-60">
        <ArrowUp size={14} />
      </button>
    </div>
  );
}
