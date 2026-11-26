import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Bot, Bug, Globe, Loader2, Plus, RotateCw, Smartphone, X } from 'lucide-react';
import { BROWSER_MIN_WIDTH, toast, useStore } from '../lib/store';
import type { BrowserUiAction } from '../env';
import { cn, IconButton } from './controls';

/*
 * In-app browser pane (blueprint BROWSER). The page itself is a WebContentsView owned by the
 * main process, laid over the placeholder below; this component only reports where it goes.
 */

/** Keeps the store in sync with main and opens the pane when an agent starts browsing. */
export function useBrowserSync() {
  useEffect(() => {
    const b = window.archa.browser;
    void b.getState().then((browser) => useStore.setState({ browser }));
    const offState = b.onState((browser) => useStore.setState({ browser }));
    const offReveal = b.onReveal(() => useStore.setState({ browserOpen: true }));
    const offToggle = b.onToggle(toggleBrowser);
    return () => { offState(); offReveal(); offToggle(); };
  }, []);
}

export function toggleBrowser() {
  useStore.setState((s) => ({ browserOpen: !s.browserOpen }));
}

const ui = async (action: BrowserUiAction, arg?: string) => {
  const err = await window.archa.browser.ui(action, arg);
  if (err) toast(err, 'error');
};

export function BrowserPanel() {
  const width = useStore((s) => s.browserWidth);
  const { tabs, activeId, agent, emulated } = useStore((s) => s.browser);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const tab = tabs.find((t) => t.id === activeId) ?? null;
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const agentLive = useAgentLive(agent?.ts ?? 0);

  useEffect(() => { if (!editing) setAddress(tab?.url && tab.url !== 'about:blank' ? tab.url : ''); }, [tab?.url, editing]);

  // Report the placeholder's rect so main can lay the page over it; hide it under dialogs. Checked every
  // frame, not only on resize: opening the Design / Layers panel slides this pane sideways without
  // changing its size, and a ResizeObserver never sees a move (the page then stayed behind until a resize).
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let sent = '';
    let raf = 0;
    const report = () => {
      const r = el.getBoundingClientRect();
      const b = settingsOpen ? null : { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      const key = JSON.stringify(b);
      if (key !== sent) { sent = key; window.archa.browser.setBounds(b); }
      raf = requestAnimationFrame(report);
    };
    report();
    return () => cancelAnimationFrame(raf);
  }, [settingsOpen]);
  useEffect(() => () => window.archa.browser.setBounds(null), []);

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = width;
    // Never narrower than it opens at; wider up to what leaves the canvas room.
    const move = (ev: PointerEvent) => useStore.setState({ browserWidth: Math.max(BROWSER_MIN_WIDTH, Math.min(start + startX - ev.clientX, window.innerWidth - 640)) });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside style={{ width, minWidth: BROWSER_MIN_WIDTH }} className="relative flex shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <div onPointerDown={startResize} className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-accent-soft" title="Drag to resize" />

      <div className="flex items-center gap-1 border-b border-line px-1.5 pt-1.5">
        <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <div key={t.id} onClick={() => void ui('switch', t.id)}
              className={cn('group flex h-7 min-w-0 max-w-[180px] cursor-default items-center gap-1.5 rounded-t-lg pl-2.5 pr-1 text-[12px] text-fg-muted hover:bg-panel-2', t.id === activeId && 'bg-panel-3 text-fg hover:bg-panel-3')}>
              {t.loading ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <Globe size={12} className="shrink-0" />}
              <span className="truncate">{t.title || t.url || 'New tab'}</span>
              <button onClick={(e) => { e.stopPropagation(); void ui('close', t.id); }} title="Close tab"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 hover:bg-panel-2 group-hover:opacity-100"><X size={11} /></button>
            </div>
          ))}
          <button onClick={() => void ui('new')} title="New tab" className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-panel-2 hover:text-fg"><Plus size={13} /></button>
        </div>
        <IconButton title="Close browser (Ctrl+Shift+B)" onClick={toggleBrowser} className="mb-0.5 h-7 w-7"><X size={14} /></IconButton>
      </div>

      <div className="flex items-center gap-1 border-b border-line p-1.5">
        <IconButton title="Back" onClick={() => void ui('back')} className={cn('h-7 w-7', !tab?.canGoBack && 'opacity-40')}><ArrowLeft size={14} /></IconButton>
        <IconButton title="Forward" onClick={() => void ui('forward')} className={cn('h-7 w-7', !tab?.canGoForward && 'opacity-40')}><ArrowRight size={14} /></IconButton>
        <IconButton title={tab?.loading ? 'Stop' : 'Reload'} onClick={() => void ui(tab?.loading ? 'stop' : 'reload')} className="h-7 w-7">
          {tab?.loading ? <X size={14} /> : <RotateCw size={13} />}
        </IconButton>
        <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); if (address.trim()) { void ui('navigate', address.trim()); setEditing(false); (document.activeElement as HTMLElement | null)?.blur(); } }}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} onFocus={(e) => { setEditing(true); e.target.select(); }} onBlur={() => setEditing(false)}
            placeholder="Search or enter a URL — localhost:3000, example.com" spellCheck={false}
            className="h-7 w-full rounded-lg border border-line bg-panel-2 px-2.5 font-mono text-[11.5px] text-fg placeholder:font-sans placeholder:text-fg-subtle focus:border-accent" />
        </form>
        {agentLive && agent && (
          <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-agent/15 px-2 text-[11px] font-medium text-agent" title="An agent is driving this browser">
            <Bot size={12} className="animate-pulse" />{agent.name} · {agent.action}
          </span>
        )}
        {emulated && (
          <span className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-panel-2 px-2 text-[11px] text-fg-muted" title="Viewport emulated by the agent">
            <Smartphone size={12} />{emulated.width}×{emulated.height}
          </span>
        )}
        <IconButton title="DevTools" onClick={() => void ui('devtools')} className="h-7 w-7"><Bug size={13} /></IconButton>
      </div>

      <div className={cn('relative min-h-0 flex-1 transition-shadow', agentLive && 'shadow-[inset_0_0_0_2px_var(--color-agent)]')}>
        <div ref={viewport} className={cn('absolute inset-0', agentLive && 'inset-[2px]')}>
          {!tab && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-fg-subtle">
              <Globe size={28} strokeWidth={1.5} />
              <div className="text-[13px] text-fg-muted">Open a page, or ask an agent to browse</div>
              <div className="max-w-[320px] text-[12px]">Agents connected to ArchaDev can open, read, click, type, scroll and screenshot pages here with the <span className="font-mono text-fg-muted">browser</span> tool.</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/** True for a few seconds after the last agent command. */
function useAgentLive(ts: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ts) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const stop = setTimeout(() => clearInterval(t), 6000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [ts]);
  return ts > 0 && now - ts < 5000;
}
