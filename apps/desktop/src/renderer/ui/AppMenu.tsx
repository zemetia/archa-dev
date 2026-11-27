import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ArchaLogo } from './ArchaLogo';
import { EDGE, Rows, SEP, SUB_WIDTH, type Entry } from './ContextMenu';
import { toggleBrowser } from './BrowserPanel';
import { cn } from './controls';
import {
  closeDoc, EXPORT_KINDS, exportEach, exportNode, exportPdf, newDoc, openFile, openProject, openSettings, readingOrder, redo, save, togglePanel, togglePixelGrid, undo, useStore,
} from '../lib/store';
import { copy, deleteSelection, duplicate, hasCopiedLayers, paste, selectAll, zoomTo } from '../lib/commands';
import { importImageOrSvg } from '../lib/importers';

/*
 * Main menu on the ArchaDev mark (blueprint APP_UI/01 → App menu). Every item calls an action that
 * already exists (store, commands, importers); what has no backend yet is shown off with a tooltip.
 */

const NOT_BUILT = 'Not built yet';
const fit = () => useStore.setState((s) => ({ fitRequest: s.fitRequest + 1 }));

export function AppMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div ref={wrap} className="no-drag">
      <button type="button" aria-haspopup="menu" aria-expanded={open} title="Main menu" onClick={() => setOpen((o) => !o)}
        className={cn('flex h-7 items-center gap-1.5 rounded-lg pl-1 pr-1.5 text-[14px] font-semibold tracking-tight hover:bg-panel-2', open && 'bg-panel-3 hover:bg-panel-3')}>
        <ArchaLogo size={20} />
        ArchaDev
        <ChevronDown size={13} className={cn('text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && <MenuPanel anchor={wrap} close={close} />}
    </div>
  );
}

function MenuPanel({ anchor, close }: { anchor: React.RefObject<HTMLDivElement | null>; close: () => void }) {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const activeDocId = useStore((s) => s.activeDocId);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const pixelGrid = useStore((s) => s.pixelGrid);
  const browserOpen = useStore((s) => s.browserOpen);
  const root = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: EDGE, y: 46 });

  // Fixed under the logo, kept inside the window.
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const w = root.current?.offsetWidth ?? 240;
    if (a) setPos({ x: Math.max(EDGE, Math.min(a.left, window.innerWidth - w - EDGE)), y: a.bottom + 6 });
  }, [anchor]);

  useEffect(() => {
    // The logo button counts as inside, so clicking it again toggles instead of closing and reopening.
    const outside = (e: PointerEvent) => { if (!anchor.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [anchor, close]);

  const ids = doc ? selection.filter((id) => doc.get(id)) : [];
  const none = ids.length === 0;
  const needSelection = none ? 'Select one or more layers first' : undefined;
  const pages = doc && ids.length ? readingOrder(doc, ids) : [];

  const exportItems: Entry[] = EXPORT_KINDS.map(({ value, label }): Entry => {
    const raster = value === 'png' || value === 'jpg';
    const name = value === 'pdf' && pages.length > 1 ? `PDF · ${pages.length} pages` : raster ? `${label} @2x` : label;
    if (none) return { kind: 'item', label: name, run: () => {}, disabled: true, hint: needSelection };
    if (value === 'pdf') return { kind: 'item', label: name, run: () => exportPdf(ids) };
    if (pages.length <= 1) return { kind: 'item', label: name, run: () => exportNode(pages[0] ?? ids[0]!, value) };
    if (value === 'html' || value === 'tailwind') return { kind: 'item', label: name, run: () => {}, disabled: true, hint: 'Code export takes one layer at a time' };
    return { kind: 'item', label: `${name} · ${pages.length} files`, run: () => exportEach(ids, value) };
  });

  const entries: Entry[] = [
    { kind: 'sub', label: 'File', items: [
      { kind: 'item', label: 'New file', keys: 'Ctrl+N', run: newDoc },
      { kind: 'item', label: 'Open…', keys: 'Ctrl+O', run: openFile },
      { kind: 'item', label: 'Open folder…', keys: 'Ctrl+Shift+O', run: () => openProject() },
      SEP,
      { kind: 'item', label: 'Save', keys: 'Ctrl+S', run: () => save(), disabled: !activeDocId },
      { kind: 'item', label: 'Save as…', keys: 'Ctrl+Shift+S', run: () => save(true), disabled: !activeDocId },
      SEP,
      { kind: 'item', label: 'Close file', run: () => activeDocId && closeDoc(activeDocId), disabled: !activeDocId },
    ] },
    { kind: 'sub', label: 'Edit', items: [
      { kind: 'item', label: 'Undo', keys: 'Ctrl+Z', run: undo },
      { kind: 'item', label: 'Redo', keys: 'Ctrl+Shift+Z', run: redo },
      SEP,
      { kind: 'item', label: 'Copy', keys: 'Ctrl+C', run: copy, disabled: none, hint: needSelection },
      { kind: 'item', label: 'Paste', keys: 'Ctrl+V', run: paste, disabled: !hasCopiedLayers(), hint: hasCopiedLayers() ? undefined : 'Copy layers first' },
      { kind: 'item', label: 'Duplicate', keys: 'Ctrl+D', run: duplicate, disabled: none, hint: needSelection },
      { kind: 'item', label: 'Delete', keys: 'Del', run: deleteSelection, disabled: none, hint: needSelection },
      SEP,
      { kind: 'item', label: 'Select all', keys: 'Ctrl+A', run: selectAll },
    ] },
    { kind: 'sub', label: 'View', items: [
      { kind: 'toggle', label: 'Sidebar', on: leftOpen, run: () => togglePanel('left') },
      { kind: 'toggle', label: 'Design panel', on: rightOpen, run: () => togglePanel('right') },
      { kind: 'toggle', label: 'Browser', on: browserOpen, run: toggleBrowser },
      { kind: 'toggle', label: 'Pixel grid', on: pixelGrid, run: togglePixelGrid },
      SEP,
      { kind: 'item', label: 'Zoom in', keys: 'Ctrl+=', run: () => zoomTo(useStore.getState().camera.zoom * 1.25) },
      { kind: 'item', label: 'Zoom out', keys: 'Ctrl+-', run: () => zoomTo(useStore.getState().camera.zoom / 1.25) },
      { kind: 'item', label: 'Zoom to 100%', keys: 'Shift+0', run: () => zoomTo(1) },
      { kind: 'item', label: 'Zoom to fit', keys: 'Shift+1', run: fit },
    ] },
    SEP,
    { kind: 'sub', label: 'Import', items: [
      { kind: 'item', label: 'Image or SVG…', keys: 'Ctrl+Shift+K', run: importImageOrSvg },
      SEP,
      { kind: 'item', label: 'Pen file (.pen)…', run: () => {}, disabled: true, hint: NOT_BUILT },
      { kind: 'item', label: 'Figma file…', run: () => {}, disabled: true, hint: NOT_BUILT },
    ] },
    { kind: 'sub', label: 'Export selection', items: exportItems },
    SEP,
    { kind: 'item', label: 'Settings…', keys: 'Ctrl+,', run: () => openSettings() },
    { kind: 'sub', label: 'Help', items: [
      { kind: 'item', label: 'About ArchaDev', run: () => openSettings('about') },
    ] },
  ];

  return (
    <div ref={root} role="menu" style={{ left: pos.x, top: pos.y, maxHeight: `calc(100vh - ${pos.y + EDGE}px)` }} onContextMenu={(e) => e.preventDefault()}
      onScroll={() => setOpenSub(null)}
      className="fixed z-50 min-w-[230px] overflow-y-auto rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/50">
      <Rows entries={entries} openSub={openSub} setOpenSub={setOpenSub}
        subLeft={pos.x + (root.current?.offsetWidth ?? 240) + SUB_WIDTH + EDGE > window.innerWidth} close={close} />
    </div>
  );
}
