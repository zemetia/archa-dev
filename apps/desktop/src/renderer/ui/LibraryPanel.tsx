import { useEffect, useState } from 'react';
import { Library, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { LibraryItem } from '@archa/protocol';
import { loadLibrary, toast, useStore } from '../lib/store';
import { revealNode } from '../lib/thumbs';
import { cn } from './controls';

/*
 * Global libraries (blueprint DESIGN_SYSTEM/02): components published from any document,
 * stored in ~/.archadev/libraries. Inserting brings in a local main once, then instances.
 */
export function LibraryPanel() {
  const items = useStore((s) => s.library);
  const [q, setQ] = useState('');
  useEffect(() => { if (items === null) void loadLibrary(); }, [items]);

  const shown = (items ?? []).filter((i) => !q.trim() || `${i.name} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = [...new Set(shown.map((i) => i.library))];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-3 pb-2.5">
        <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-panel-2 px-2 ring-1 ring-transparent focus-within:ring-accent">
          <Search size={13} className="shrink-0 text-fg-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search library"
            className="min-w-0 flex-1 bg-transparent text-[12px] placeholder:text-fg-subtle" />
        </div>
        <button title="Reload" onClick={() => void loadLibrary()} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg"><RefreshCw size={13} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items === null && <div className="h-24 animate-pulse rounded-xl bg-panel-2" />}
        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 pt-8 text-center text-[12px] leading-relaxed text-fg-subtle">
            <Library size={20} />
            Your library is empty. Publish a component from the Components tab to reuse it in every document — and let your agent reuse it too.
          </div>
        )}
        {groups.map((g) => (
          <div key={g} className="mb-4">
            <div className="mb-2 px-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">{g}</div>
            <div className="grid grid-cols-2 gap-2">
              {shown.filter((i) => i.library === g).map((i) => <LibraryCard key={i.ref} item={i} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryCard({ item }: { item: LibraryItem }) {
  const client = useStore((s) => s.client);
  const docId = useStore((s) => s.activeDocId);
  const [confirm, setConfirm] = useState(false);

  const insert = async () => {
    if (!client || !docId) return;
    try {
      const r = await client.call('library.insert', { docId, library: item.library, id: item.id });
      toast(r.placed === 'main' ? `Added ${item.name} as a component` : `Inserted ${item.name}`);
      // The doc.applied echo may land just after the reply.
      setTimeout(() => revealNode(r.nodeId), 60);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async () => {
    if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 2500); return; }
    try {
      await client?.call('library.remove', { library: item.library, id: item.id });
      void loadLibrary();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-panel-2/40 transition-colors hover:border-accent/50">
      <button onClick={() => void insert()} title={item.description || `Insert ${item.name}`} className="block w-full text-left">
        <div className="flex h-[92px] items-center justify-center bg-canvas p-2">
          {item.thumb ? <img src={item.thumb} alt="" draggable={false} className="max-h-full max-w-full object-contain" /> : <Library size={18} className="text-fg-subtle" />}
        </div>
        <div className="px-2 py-1.5">
          <div className="truncate text-[11.5px] font-medium">{item.name}</div>
          <div className="truncate text-[10.5px] text-fg-subtle">{item.description || `${Math.round(item.width)}×${Math.round(item.height)}`}</div>
        </div>
      </button>
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button title="Insert" onClick={() => void insert()} className="flex h-6 w-6 items-center justify-center rounded-md bg-panel text-fg-muted shadow hover:text-fg"><Plus size={12} /></button>
        <button title={confirm ? 'Click again to remove from library' : 'Remove from library'} onClick={() => void remove()}
          className={cn('flex h-6 items-center justify-center rounded-md bg-panel px-1.5 shadow', confirm ? 'text-[10.5px] text-danger' : 'w-6 text-fg-muted hover:text-danger')}>
          {confirm ? 'Remove?' : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  );
}
