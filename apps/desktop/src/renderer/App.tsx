import { useEffect } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { init, newDoc, openFile, redo, save, setTool, togglePanel, toggleRailPanel, undo, useStore } from './lib/store';
import { importImageOrSvg } from './lib/importers';
import {
  arrange, copy, createComponent, deleteSelection, duplicate, group, nudge, pasteFrom, removeLayout, reorder, selectAll, selectChildren, selectParent, ungroup, wrapInFrame,
} from './lib/commands';
import { ContextMenu } from './ui/ContextMenu';
import { Canvas } from './canvas/Canvas';
import { TitleBar } from './ui/TitleBar';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { ToolRail, TOOL_KEYS } from './ui/ToolRail';
import { RailPanels } from './ui/RailPanels';
import { ZoomBar } from './ui/ZoomBar';
import { cn } from './ui/controls';
import { SettingsDialog } from './ui/SettingsDialog';
import { OrchestraView } from './ui/OrchestraView';
import { BrowserPanel, toggleBrowser, useBrowserSync } from './ui/BrowserPanel';

export function App() {
  const ready = useStore((s) => !!s.doc);
  const toasts = useStore((s) => s.toasts);
  const browserOpen = useStore((s) => s.browserOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  useBrowserSync();

  useEffect(() => { void init(); }, []);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {/* Sidebars carry their own 8px gutter so they can collapse to zero width. */}
      <div className="flex min-h-0 flex-1 px-2 pb-2">
        <LeftPanel />
        <main data-canvas-host className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-line">
          {ready ? <Canvas /> : <div className="flex h-full items-center justify-center text-fg-subtle">Connecting to core…</div>}
          {/* Centred beside the canvas; on a short window the rail scrolls instead of running off the edges. */}
          <div className="pointer-events-none absolute inset-y-3 left-3 z-30 flex items-center"><ToolRail /></div>
          <RailPanels />
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"><ZoomBar /></div>
          {!rightOpen && (
            <button title="Show design panel (Ctrl+Shift+\)" onClick={() => togglePanel('right', true)}
              className="absolute right-3 top-3 flex h-9 items-center gap-1.5 rounded-xl border border-line bg-panel pl-2.5 pr-3 text-[12px] text-fg-muted shadow-xl shadow-black/30 hover:text-fg">
              <PanelRightOpen size={15} />Design
            </button>
          )}
        </main>
        {browserOpen && <div className="flex shrink-0 pl-2"><BrowserPanel /></div>}
        <RightPanel />
      </div>
      <OrchestraView />
      <SettingsDialog />
      <ContextMenu />
      <div className="pointer-events-none fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn('max-w-[560px] rounded-lg px-3 py-2 text-[12px] shadow-xl', t.kind === 'error' ? 'bg-danger text-white' : 'bg-fg text-app')}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}

function onPaste(e: ClipboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (useStore.getState().settingsOpen) return;
  e.preventDefault();
  void pasteFrom(e.clipboardData);
}

function onKey(e: KeyboardEvent) {
  // The browser toggle works from the address bar too.
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleBrowser(); return; }
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const run = (fn: () => unknown) => { e.preventDefault(); void fn(); };
  // The settings dialog handles its own keys; canvas shortcuts stay off underneath it.
  if (useStore.getState().settingsOpen) return;
  if (mod && k === ',') return run(() => useStore.setState({ settingsOpen: true }));
  // Physical key: Shift+\ reports '|' as e.key on most layouts.
  if (mod && e.code === 'Backslash') return run(() => togglePanel(e.shiftKey ? 'right' : 'left'));

  if (mod) {
    if (k === 'f') return run(() => toggleRailPanel('find'));
    if (k === 'k' && e.shiftKey) return run(importImageOrSvg);
    if (k === 'z' && e.shiftKey) return run(redo);
    if (k === 'z') return run(undo);
    if (k === 'y') return run(redo);
    if (k === 's') return run(() => save(e.shiftKey));
    if (k === 'o') return run(openFile);
    if (k === 'n') return run(newDoc);
    if (k === 'd') return run(duplicate);
    // Selected text (chat messages) copies as text, not as canvas nodes.
    if (k === 'c' && !window.getSelection()?.isCollapsed) return;
    if (k === 'c') return run(copy);
    // Ctrl+V is left to the browser: the paste event (onPaste) carries images from other apps.
    if (k === 'v') return;
    if (k === 'a') return run(selectAll);
    if (k === 'g' && e.altKey) return run(() => wrapInFrame(false));
    if (k === 'g' && e.shiftKey) return run(ungroup);
    if (k === 'g') return run(group);
    if (k === 'k' && e.altKey) return run(createComponent);
    if (k === ']') return run(() => arrange('front'));
    if (k === '[') return run(() => arrange('back'));
    if (k === '0') return run(() => zoomTo(1));
    if (k === '=' || k === '+') return run(() => zoomTo(useStore.getState().camera.zoom * 1.25));
    if (k === '-') return run(() => zoomTo(useStore.getState().camera.zoom / 1.25));
    return;
  }
  if (k === 'delete' || k === 'backspace') return run(deleteSelection);
  if (k === 'escape') {
    e.preventDefault();
    const st = useStore.getState();
    if (st.interactEmbed) useStore.setState({ interactEmbed: null });
    else if (st.openComment) useStore.setState({ openComment: null, commentDraft: null });
    else if (st.railPanel) useStore.setState({ railPanel: null });
    else if (st.tool !== 'select') setTool('select');
    else selectParent();
    return;
  }
  if (k === 'enter') return run(selectChildren);
  if (e.shiftKey && e.code === 'Digit1') return run(() => useStore.setState((s) => ({ fitRequest: s.fitRequest + 1 })));
  if (e.shiftKey && e.code === 'Digit0') return run(() => zoomTo(1));
  if (e.shiftKey && k === 'i') return run(() => toggleRailPanel('assets'));
  if (e.shiftKey && e.altKey && k === 'a') return run(removeLayout);
  if (e.shiftKey && k === 'a') return run(() => wrapInFrame(true));
  if (k === ']') return run(() => reorder(1));
  if (k === '[') return run(() => reorder(-1));
  const step = e.shiftKey ? 10 : 1;
  if (k === 'arrowleft') return run(() => nudge(-step, 0));
  if (k === 'arrowright') return run(() => nudge(step, 0));
  if (k === 'arrowup') return run(() => nudge(0, -step));
  if (k === 'arrowdown') return run(() => nudge(0, step));
  const tool = TOOL_KEYS[k];
  if (tool && !e.altKey && !e.shiftKey) { e.preventDefault(); setTool(tool); }
}

function zoomTo(z: number) {
  const el = document.querySelector('[data-canvas-host]');
  if (!el) return;
  const { camera } = useStore.getState();
  const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
  const wx = (cx - camera.x) / camera.zoom, wy = (cy - camera.y) / camera.zoom;
  const zoom = Math.min(64, Math.max(0.02, z));
  useStore.setState({ camera: { zoom, x: cx - wx * zoom, y: cy - wy * zoom } });
}
