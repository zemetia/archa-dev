import { useEffect, useState } from 'react';
import { ChevronRight, Circle, Eye, EyeOff, Frame, Group, Lock, Square, Type, Unlock } from 'lucide-react';
import { isContainer, type Node } from '@archa/schema';
import { commit, select, useStore } from '../lib/store';
import { pageRoot } from '../lib/geometry';
import { cn } from './controls';

const ICON: Record<string, typeof Square> = { frame: Frame, rect: Square, ellipse: Circle, text: Type, group: Group };

export function LayersPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Reveal the selection: expand its ancestors.
  useEffect(() => {
    if (!doc || !selection.length) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of selection) {
        let p = doc.get(id)?.parentId;
        while (p && doc.get(p)?.type !== 'page') { next.add(p); p = doc.get(p)?.parentId; }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [doc, selection]);

  if (!doc) return null;
  const root = doc.require(pageRoot(doc));
  const top = isContainer(root) ? [...root.children].reverse() : [];

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-2 pt-3 text-[12px] font-semibold text-fg">Layers</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {top.length === 0 && <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-fg-subtle">Nothing here yet. Press F to draw a frame, or ask your agent in Chat.</p>}
        {top.map((id) => <Row key={id} id={id} depth={0} expanded={expanded} toggle={toggle} />)}
      </div>
    </div>
  );
}

function Row({ id, depth, expanded, toggle }: { id: string; depth: number; expanded: Set<string>; toggle: (id: string) => void }) {
  const doc = useStore((s) => s.doc)!;
  const selected = useStore((s) => s.selection.includes(id));
  const hovered = useStore((s) => s.hover === id);
  const [renaming, setRenaming] = useState(false);
  const n = doc.get(id);
  if (!n) return null;
  const kids = isContainer(n) ? [...n.children].reverse() : [];
  const open = expanded.has(id);
  const Icon = ICON[n.type] ?? Square;
  const autoLayout = n.type === 'frame' && n.layout !== 'none';

  const onClick = (e: React.MouseEvent) => {
    const sel = useStore.getState().selection;
    if (e.shiftKey || e.ctrlKey || e.metaKey) select(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
    else select([id]);
  };

  return (
    <>
      <div onClick={onClick} onDoubleClick={() => setRenaming(true)}
        onMouseEnter={() => useStore.setState({ hover: id })} onMouseLeave={() => useStore.setState({ hover: null })}
        className={cn('group flex h-8 cursor-default items-center gap-1.5 rounded-lg pr-1.5 text-[12.5px]',
          selected ? 'bg-accent-soft text-accent-fg' : hovered ? 'bg-panel-2 text-fg' : 'text-fg-muted hover:bg-panel-2', !n.visible && 'opacity-50')}
        style={{ paddingLeft: 6 + depth * 14 }}>
        <button onClick={(e) => { e.stopPropagation(); toggle(id); }} className={cn('flex h-4 w-4 items-center justify-center', !kids.length && 'invisible')}>
          <ChevronRight size={12} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <Icon size={13} className={cn('shrink-0', n.type === 'frame' && depth === 0 && 'text-fg')} />
        {autoLayout && <span className="text-[10px] text-fg-subtle" title={`Auto layout ${n.type === 'frame' ? n.layout : ''}`}>{n.type === 'frame' && n.layout === 'row' ? '⇥' : '⤓'}</span>}
        {renaming ? (
          <input autoFocus defaultValue={n.name} onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { setRenaming(false); if (e.target.value && e.target.value !== n.name) void commit('Rename', [{ op: 'update', id, patch: { name: e.target.value } }]); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }}
            className="h-6 min-w-0 flex-1 rounded bg-panel-3 px-1 text-fg" />
        ) : <span className={cn('min-w-0 flex-1 truncate', depth === 0 && 'font-medium text-fg')}>{n.name}</span>}
        <button title={n.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); void commit(n.locked ? 'Unlock' : 'Lock', [{ op: 'update', id, patch: { locked: !n.locked } }]); }}
          className={cn('h-5 w-5 items-center justify-center rounded hover:bg-panel-3', n.locked ? 'flex' : 'hidden group-hover:flex')}>
          {n.locked ? <Lock size={11} /> : <Unlock size={11} />}
        </button>
        <button title={n.visible ? 'Hide' : 'Show'} onClick={(e) => { e.stopPropagation(); void commit(n.visible ? 'Hide' : 'Show', [{ op: 'update', id, patch: { visible: !n.visible } }]); }}
          className={cn('h-5 w-5 items-center justify-center rounded hover:bg-panel-3', n.visible ? 'hidden group-hover:flex' : 'flex')}>
          {n.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>
      {open && kids.map((c) => <Row key={c} id={c} depth={depth + 1} expanded={expanded} toggle={toggle} />)}
    </>
  );
}

export type { Node };
