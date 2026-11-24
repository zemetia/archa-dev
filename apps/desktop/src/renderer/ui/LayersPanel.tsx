import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Circle, Component, Copy, Eye, EyeOff, Frame, Globe, Group, Image, Lock, PenTool, Square, StickyNote, Triangle, Type, Unlock, Workflow } from 'lucide-react';
import { acceptsLayers, componentMeta, instanceOf, layerMoveOps, layerOrder, type LayerDrop } from '@archa/core';
import { isContainer, type Node } from '@archa/schema';
import { commit, select, toast, useStore } from '../lib/store';
import { pageRoot } from '../lib/geometry';
import { cn } from './controls';

/** The drop under the pointer; `end` draws the line under the whole list (drop at the bottom of the page). */
type DropHint = LayerDrop & { end?: boolean };
type Dnd = {
  hint: DropHint | null;
  start: (e: React.DragEvent, id: string) => void;
  over: (e: React.DragEvent, id: string, firstKid: string | undefined) => void;
  drop: (e: React.DragEvent) => void;
  end: () => void;
};
const DRAG_TYPE = 'application/x-archa-layers';

const ICON: Record<string, typeof Square> = { frame: Frame, rect: Square, ellipse: Circle, text: Type, group: Group, polygon: Triangle, path: PenTool, image: Image, sticky: StickyNote, embed: Globe, connector: Workflow };

export function LayersPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragging = useRef<string[] | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);

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
  const top = layerOrder(doc, root.id);

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Drag & drop: rows describe the drop (above / below / into a row); the core turns it into one undoable transaction.
  const accept = (e: React.DragEvent, next: DropHint | null) => {
    const ids = dragging.current;
    if (!ids) return;
    e.preventDefault();
    e.stopPropagation();
    const ok = next && !ids.some((m) => m === next.targetId || doc.isAncestor(m, next.targetId));
    e.dataTransfer.dropEffect = ok ? 'move' : 'none';
    const h = ok ? next : null;
    setHint((p) => (p?.targetId === h?.targetId && p?.position === h?.position && p?.end === h?.end ? p : h));
  };
  const dnd: Dnd = {
    hint,
    start: (e, id) => {
      const sel = useStore.getState().selection;
      const ids = sel.includes(id) ? sel.filter((s) => doc.get(s)) : [id];
      if (!sel.includes(id)) select([id]);
      dragging.current = ids;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(DRAG_TYPE, ids.join(','));
    },
    over: (e, id, firstKid) => {
      const n = doc.get(id);
      if (!n) return;
      const r = e.currentTarget.getBoundingClientRect();
      const f = (e.clientY - r.top) / r.height;
      const into = acceptsLayers(n);
      let next: DropHint = { targetId: id, position: f < (into ? 0.25 : 0.5) ? 'before' : into && f <= 0.75 ? 'inside' : 'after' };
      // Below an open container the next row is its first child, so "after" there means the top of its list.
      if (next.position === 'after' && firstKid) next = { targetId: firstKid, position: 'before' };
      accept(e, next);
    },
    drop: (e) => {
      const ids = dragging.current;
      const h = hint;
      dnd.end();
      if (!ids || !h) return;
      e.preventDefault();
      const r = layerMoveOps(doc, ids, h);
      for (const note of r.notes) toast(note);
      if (r.ops.length) void commit(r.label, r.ops);
    },
    end: () => { dragging.current = null; setHint(null); },
  };
  const last = top[top.length - 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-2 pt-3 text-[12px] font-semibold text-fg">Layers</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
        onDragOver={(e) => accept(e, last ? { targetId: last, position: 'after', end: true } : null)}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setHint(null); }}
        onDrop={dnd.drop}>
        {top.length === 0 && <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-fg-subtle">Nothing here yet. Press F to draw a frame, or ask your agent in Chat.</p>}
        {top.map((id) => <Row key={id} id={id} depth={0} expanded={expanded} toggle={toggle} dnd={dnd} />)}
        {hint?.end && <div className="pointer-events-none mx-1.5 mt-0.5 h-0.5 rounded-full bg-accent" />}
      </div>
    </div>
  );
}

function Row({ id, depth, expanded, toggle, dnd }: { id: string; depth: number; expanded: Set<string>; toggle: (id: string) => void; dnd: Dnd }) {
  const doc = useStore((s) => s.doc)!;
  const selected = useStore((s) => s.selection.includes(id));
  const hovered = useStore((s) => s.hover === id);
  const [renaming, setRenaming] = useState(false);
  const n = doc.get(id);
  if (!n) return null;
  const kids = isContainer(n) ? layerOrder(doc, id) : [];
  const open = expanded.has(id);
  const hint = dnd.hint && !dnd.hint.end && dnd.hint.targetId === id ? dnd.hint.position : null;
  const kind = componentMeta(n) ? 'main' : instanceOf(n) ? 'instance' : null;
  const Icon = kind === 'main' ? Component : kind === 'instance' ? Copy : ICON[n.type] ?? Square;
  const autoLayout = n.type === 'frame' && n.layout !== 'none';

  const onClick = (e: React.MouseEvent) => {
    const sel = useStore.getState().selection;
    if (e.shiftKey || e.ctrlKey || e.metaKey) select(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
    else select([id]);
  };
  // Right-click opens the canvas menu (Group, Ungroup, …) for this row; "Paste here" lands on the layer.
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!useStore.getState().selection.includes(id)) select([id]);
    const b = doc.worldBounds(id);
    useStore.setState({ contextMenu: { x: e.clientX, y: e.clientY, world: { x: b.x, y: b.y } } });
  };

  return (
    <>
      <div onClick={onClick} onDoubleClick={() => setRenaming(true)} onContextMenu={onContextMenu}
        draggable={!renaming} onDragStart={(e) => dnd.start(e, id)} onDragEnd={dnd.end}
        onDragOver={(e) => dnd.over(e, id, open ? kids[0] : undefined)} onDrop={dnd.drop}
        onMouseEnter={() => useStore.setState({ hover: id })} onMouseLeave={() => useStore.setState({ hover: null })}
        className={cn('group relative flex h-8 cursor-default items-center gap-1.5 rounded-lg pr-1.5 text-[12.5px]',
          selected ? 'bg-accent-soft text-accent-fg' : hovered ? 'bg-panel-2 text-fg' : 'text-fg-muted hover:bg-panel-2', !n.visible && 'opacity-50',
          hint === 'inside' && 'bg-accent-soft text-fg ring-1 ring-inset ring-accent')}
        style={{ paddingLeft: 6 + depth * 14 }}>
        {(hint === 'before' || hint === 'after') && (
          <span className={cn('pointer-events-none absolute right-1 z-10 h-0.5 rounded-full bg-accent', hint === 'before' ? '-top-px' : '-bottom-px')} style={{ left: 6 + depth * 14 }}>
            <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full border-2 border-accent bg-panel" />
          </span>
        )}
        <button onClick={(e) => { e.stopPropagation(); toggle(id); }} className={cn('flex h-4 w-4 items-center justify-center', !kids.length && 'invisible')}>
          <ChevronRight size={12} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <Icon size={13} className={cn('shrink-0', n.type === 'frame' && depth === 0 && 'text-fg', kind && 'text-accent-fg')} />
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
      {open && kids.map((c) => <Row key={c} id={c} depth={depth + 1} expanded={expanded} toggle={toggle} dnd={dnd} />)}
    </>
  );
}

export type { Node };
