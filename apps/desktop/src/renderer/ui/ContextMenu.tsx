import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { exportPdf, openSettings, readingOrder, togglePixelGrid, useStore } from '../lib/store';
import {
  arrange, canMakeComponent, copy, createComponent, deleteSelection, duplicate, group, hasCopiedLayers, pasteAt, removeLayout, selectAll, ungroup, wrapInFrame,
} from '../lib/commands';
import { canUngroup } from '@archa/core';
import { cn } from './controls';
import { canRemoveBackground, removeBackground } from '../lib/removeBackground';

/*
 * Canvas right-click menu (blueprint APP_UI/01 → Context menu). The canvas sets `contextMenu` after
 * picking what is under the pointer; the items act on that selection through the shared commands.
 */

type Entry =
  | { kind: 'item'; label: string; keys?: string; run: () => unknown; danger?: boolean; disabled?: boolean }
  | { kind: 'toggle'; label: string; on: boolean; run: () => unknown }
  | { kind: 'sub'; label: string; items: Entry[] }
  | { kind: 'sep' };

const SEP: Entry = { kind: 'sep' };
const SUB_WIDTH = 220;
/** Gap kept between a menu and the window edge. */
const EDGE = 8;

export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  if (!menu) return null;
  return <Menu key={`${menu.x},${menu.y}`} x={menu.x} y={menu.y} world={menu.world} />;
}

function Menu({ x, y, world }: { x: number; y: number; world: { x: number; y: number } }) {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const pixelGrid = useStore((s) => s.pixelGrid);
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSub, setOpenSub] = useState<number | null>(null);
  const close = () => useStore.setState({ contextMenu: null });

  useLayoutEffect(() => {
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y]);

  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    // Capture + stop: Escape closes the menu without also clearing the selection.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    const wheel = (e: WheelEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    window.addEventListener('wheel', wheel, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('wheel', wheel, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, []);

  if (!doc) return null;
  const ids = selection.filter((id) => doc.get(id));
  const settings: Entry = { kind: 'sub', label: 'Settings', items: [
    { kind: 'toggle', label: 'Show pixel grid', on: pixelGrid, run: togglePixelGrid },
    SEP,
    { kind: 'item', label: 'Open settings…', keys: 'Ctrl+,', run: () => openSettings() },
  ] };
  const paste: Entry = { kind: 'item', label: 'Paste here', run: () => pasteAt(world), disabled: !hasCopiedLayers() };

  const entries: Entry[] = !ids.length
    ? [
      paste,
      { kind: 'item', label: 'Select all', keys: 'Ctrl+A', run: selectAll },
      { kind: 'item', label: 'Zoom to fit', keys: 'Shift+1', run: () => useStore.setState((s) => ({ fitRequest: s.fitRequest + 1 })) },
      SEP,
      settings,
    ]
    : [
      { kind: 'item', label: 'Copy', keys: 'Ctrl+C', run: copy },
      paste,
      { kind: 'item', label: 'Duplicate', keys: 'Ctrl+D', run: duplicate },
      ...(ids.length === 1 && doc.get(ids[0]!)?.type === 'image'
        ? [SEP, { kind: 'item', label: 'Remove background', run: () => removeBackground(ids[0]!), disabled: !canRemoveBackground(ids[0]) } as const] : []),
      SEP,
      { kind: 'item', label: 'Bring to front', keys: 'Ctrl+]', run: () => arrange('front') },
      { kind: 'item', label: 'Send to back', keys: 'Ctrl+[', run: () => arrange('back') },
      SEP,
      { kind: 'item', label: 'Group selection', keys: 'Ctrl+G', run: group },
      { kind: 'item', label: 'Frame selection', keys: 'Ctrl+Alt+G', run: () => wrapInFrame(false) },
      ...(canUngroup(doc, ids) ? [{ kind: 'item', label: 'Ungroup', keys: 'Ctrl+Shift+G', run: ungroup } as const] : []),
      { kind: 'item', label: 'Add auto layout', keys: 'Shift+A', run: () => wrapInFrame(true) },
      ...(ids.some((id) => { const n = doc.get(id); return n?.type === 'frame' && n.layout !== 'none'; })
        ? [{ kind: 'item', label: 'Remove auto layout', keys: 'Shift+Alt+A', run: removeLayout } as const] : []),
      SEP,
      { kind: 'item', label: readingOrder(doc, ids).length > 1 ? `Export as PDF · ${readingOrder(doc, ids).length} pages` : 'Export as PDF', run: () => exportPdf(ids) },
      ...(ids.length === 1 && canMakeComponent(doc, ids[0]!)
        ? [SEP, { kind: 'item', label: 'Create component', keys: 'Ctrl+Alt+K', run: createComponent } as const] : []),
      SEP,
      { kind: 'item', label: 'Delete', keys: 'Del', run: deleteSelection, danger: true },
      SEP,
      settings,
    ];

  const subLeft = pos.x + (root.current?.offsetWidth ?? 240) + SUB_WIDTH + 8 > window.innerWidth;
  return (
    <div ref={root} role="menu" style={{ left: pos.x, top: pos.y, maxHeight: `calc(100vh - ${EDGE * 2}px)` }} onContextMenu={(e) => e.preventDefault()}
      onScroll={() => setOpenSub(null)}
      className="fixed z-50 min-w-[230px] overflow-y-auto rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/50">
      <Rows entries={entries} openSub={openSub} setOpenSub={setOpenSub} subLeft={subLeft} close={close} />
    </div>
  );
}

function Rows({ entries, openSub, setOpenSub, subLeft, close }: {
  entries: Entry[]; openSub: number | null; setOpenSub: (i: number | null) => void; subLeft: boolean; close: () => void;
}) {
  return entries.map((e, i) => {
    if (e.kind === 'sep') return <div key={i} className="mx-1 my-1 h-px bg-line" />;
    const row = 'flex h-8 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[12.5px]';
    if (e.kind === 'sub') {
      return (
        <SubRow key={i} label={e.label} open={openSub === i} onOpen={() => setOpenSub(i)} subLeft={subLeft} rowClass={row}>
          <Rows entries={e.items} openSub={null} setOpenSub={() => {}} subLeft={subLeft} close={close} />
        </SubRow>
      );
    }
    if (e.kind === 'toggle') {
      return (
        <button key={i} type="button" role="menuitemcheckbox" aria-checked={e.on} onMouseEnter={() => setOpenSub(null)}
          onClick={() => void e.run()} className={cn(row, 'text-fg hover:bg-panel-3')}>
          <span className="flex-1">{e.label}</span>
          <span className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', e.on ? 'bg-accent' : 'bg-line')}>
            <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-fg transition-all', e.on ? 'left-3.5' : 'left-0.5')} />
          </span>
        </button>
      );
    }
    return (
      <button key={i} type="button" role="menuitem" disabled={e.disabled} onMouseEnter={() => setOpenSub(null)}
        onClick={() => { close(); void e.run(); }}
        className={cn(row, e.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-panel-3', e.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent')}>
        <span className="flex-1">{e.label}</span>
        {e.keys && <span className="text-[11px] text-fg-subtle">{e.keys}</span>}
      </button>
    );
  });
}

/** A row that opens a submenu beside it, placed with fixed coordinates and kept inside the window. */
function SubRow({ label, open, onOpen, subLeft, rowClass, children }: {
  label: string; open: boolean; onOpen: () => void; subLeft: boolean; rowClass: string; children: React.ReactNode;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const sub = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const h = sub.current?.offsetHeight ?? 0;
    setTop(Math.max(EDGE, Math.min(anchor.top - 4, window.innerHeight - h - EDGE)));
  }, [open, anchor]);
  return (
    <div onMouseEnter={(ev) => { setAnchor(ev.currentTarget.getBoundingClientRect()); onOpen(); }}>
      <div className={cn(rowClass, 'cursor-default text-fg', open && 'bg-panel-3')}>
        <span className="flex-1">{label}</span><ChevronRight size={13} className="text-fg-subtle" />
      </div>
      {open && anchor && (
        <div ref={sub} role="menu"
          style={{ width: SUB_WIDTH, top, left: subLeft ? anchor.left - SUB_WIDTH - 6 : anchor.right + 6, maxHeight: `calc(100vh - ${EDGE * 2}px)` }}
          className="fixed z-50 overflow-y-auto rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/50">
          {children}
        </div>
      )}
    </div>
  );
}
