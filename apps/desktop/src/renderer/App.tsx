import { useEffect } from 'react';
import { init, newDoc, openFile, redo, save, undo, useStore } from './lib/store';
import { copy, deleteSelection, duplicate, nudge, paste, reorder, selectAll, selectChildren, selectParent, wrapInFrame } from './lib/commands';
import { Canvas } from './canvas/Canvas';
import { TitleBar } from './ui/TitleBar';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { ToolRail, TOOLS } from './ui/ToolRail';
import { ZoomBar } from './ui/ZoomBar';
import { cn } from './ui/controls';
import { SettingsDialog } from './ui/SettingsDialog';
import { BrowserPanel, toggleBrowser, useBrowserSync } from './ui/BrowserPanel';

export function App() {
  const ready = useStore((s) => !!s.doc);
  const toasts = useStore((s) => s.toasts);
  const browserOpen = useStore((s) => s.browserOpen);
  useBrowserSync();

  useEffect(() => { void init(); }, []);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <LeftPanel />
        <main data-canvas-host className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-line">
          {ready ? <Canvas /> : <div className="flex h-full items-center justify-center text-fg-subtle">Connecting to core…</div>}
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><ToolRail /></div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"><ZoomBar /></div>
        </main>
        {browserOpen && <BrowserPanel />}
        <RightPanel />
      </div>
      <SettingsDialog />
      <div className="pointer-events-none fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn('max-w-[560px] rounded-lg px-3 py-2 text-[12px] shadow-xl', t.kind === 'error' ? 'bg-danger text-white' : 'bg-fg text-app')}>{t.text}</div>
        ))}
      </div>
    </div>
  );
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

  if (mod) {
    if (k === 'z' && e.shiftKey) return run(redo);
    if (k === 'z') return run(undo);
    if (k === 'y') return run(redo);
    if (k === 's') return run(() => save(e.shiftKey));
    if (k === 'o') return run(openFile);
    if (k === 'n') return run(newDoc);
    if (k === 'd') return run(duplicate);
    if (k === 'c') return run(copy);
    if (k === 'v') return run(paste);
    if (k === 'a') return run(selectAll);
    if (k === 'g' && e.altKey) return run(() => wrapInFrame(false));
    if (k === '0') return run(() => zoomTo(1));
    if (k === '=' || k === '+') return run(() => zoomTo(useStore.getState().camera.zoom * 1.25));
    if (k === '-') return run(() => zoomTo(useStore.getState().camera.zoom / 1.25));
    return;
  }
  if (k === 'delete' || k === 'backspace') return run(deleteSelection);
  if (k === 'escape') { e.preventDefault(); if (useStore.getState().tool !== 'select') useStore.setState({ tool: 'select' }); else selectParent(); return; }
  if (k === 'enter') return run(selectChildren);
  if (e.shiftKey && e.code === 'Digit1') return run(() => useStore.setState((s) => ({ fitRequest: s.fitRequest + 1 })));
  if (e.shiftKey && e.code === 'Digit0') return run(() => zoomTo(1));
  if (e.shiftKey && k === 'a') return run(() => wrapInFrame(true));
  if (k === ']') return run(() => reorder(1));
  if (k === '[') return run(() => reorder(-1));
  const step = e.shiftKey ? 10 : 1;
  if (k === 'arrowleft') return run(() => nudge(-step, 0));
  if (k === 'arrowright') return run(() => nudge(step, 0));
  if (k === 'arrowup') return run(() => nudge(0, -step));
  if (k === 'arrowdown') return run(() => nudge(0, step));
  const tool = TOOLS.find((x) => x.key.toLowerCase() === k);
  if (tool && !e.altKey) { e.preventDefault(); useStore.setState({ tool: tool.id }); }
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
