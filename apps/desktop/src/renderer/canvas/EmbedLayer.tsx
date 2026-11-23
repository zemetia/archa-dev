import { createElement, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Monitor, MousePointerClick, RotateCw, Smartphone, Tablet } from 'lucide-react';
import type { EmbedNode } from '@archa/schema';
import { commit, toast, useStore } from '../lib/store';
import { pageRoot, toScreen } from '../lib/geometry';
import { cn } from '../ui/controls';

/** Electron's <webview> element (methods we use). */
type WebviewEl = HTMLElement & {
  goBack(): void; goForward(): void; reload(): void; canGoBack(): boolean; canGoForward(): boolean; getURL(): string;
  getWebContentsId(): number; insertCSS(css: string): Promise<string>;
  sendInputEvent(e: { type: 'mouseWheel'; x: number; y: number; deltaX: number; deltaY: number; canScroll: boolean; hasPreciseScrollingDeltas: boolean }): void;
};

/** Device sizes a web page snaps to; a new page starts as a phone. */
export const EMBED_DEVICES = [
  { label: 'Phone', width: 390, height: 844, Icon: Smartphone },
  { label: 'Tablet', width: 834, height: 1112, Icon: Tablet },
  { label: 'Desktop', width: 1440, height: 900, Icon: Monitor },
] as const;

/** Below this on-screen width the live page is hidden and the drawn placeholder shows instead. */
const MIN_LIVE_WIDTH = 120;

/** The node is the component itself, so the page's own scrollbars are hidden (it still scrolls). */
const HIDE_SCROLLBARS = 'html,body{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}';

const views = new Map<string, WebviewEl>();

/**
 * Scrolls a live page without entering it: the canvas calls this for a wheel over the selected web page.
 * `x`, `y` are page CSS px. Returns false when the page is not live.
 */
export function scrollEmbed(id: string, x: number, y: number, dx: number, dy: number): boolean {
  const el = views.get(id);
  if (!el || !el.isConnected || el.parentElement?.style.visibility === 'hidden') return false;
  // Chromium wheel deltas point the other way from DOM WheelEvent deltas.
  el.sendInputEvent({ type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: -dx, deltaY: -dy, canScroll: true, hasPreciseScrollingDeltas: true });
  return true;
}

/**
 * Live web pages over embed nodes (blueprint RENDERING/01 → Embeds). Each page is a sandboxed <webview>
 * laid out at the node's size and scaled with the camera. A wheel over the selected page scrolls it; a
 * double-click enters it (interactEmbed) so it clicks and types like a browser.
 */
export function EmbedLayer() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  if (!doc) return null;
  const embeds = doc.children(pageRoot(doc)).filter((n): n is EmbedNode => n.type === 'embed' && n.visible);
  return <>{embeds.map((n) => <Embed key={n.id} node={n} />)}</>;
}

function Embed({ node: n }: { node: EmbedNode }) {
  const camera = useStore((s) => s.camera);
  const interacting = useStore((s) => s.interactEmbed === n.id);
  const selected = useStore((s) => s.selection.length === 1 && s.selection[0] === n.id);
  const view = useRef<WebviewEl | null>(null);
  const [nav, setNav] = useState({ back: false, forward: false });
  const host = document.querySelector('[data-canvas-host]');
  const p = toScreen(camera, n.x, n.y);
  const w = n.width * camera.zoom, h = n.height * camera.zoom;
  const onScreen = p.x < (host?.clientWidth ?? 4000) && p.y < (host?.clientHeight ?? 4000) && p.x + w > 0 && p.y + h > 0;
  const hasUrl = /^https?:\/\//i.test(n.url);
  const live = onScreen && w >= MIN_LIVE_WIDTH && hasUrl;

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    views.set(n.id, el);
    const update = () => setNav({ back: el.canGoBack(), forward: el.canGoForward() });
    // A followed link becomes the node's URL, so the page reopens where the person left it.
    const navigated = (e: Event) => {
      update();
      const url = (e as Event & { url?: string }).url;
      const cur = useStore.getState().doc?.get(n.id);
      if (url && cur?.type === 'embed' && cur.url !== url) void commit('Navigate web page', [{ op: 'update', id: n.id, patch: { url } }]);
    };
    const ready = () => { void el.insertCSS(HIDE_SCROLLBARS).catch(() => {}); };
    el.addEventListener('did-navigate', navigated);
    el.addEventListener('did-navigate-in-page', update);
    el.addEventListener('dom-ready', ready);
    return () => {
      if (views.get(n.id) === el) views.delete(n.id);
      el.removeEventListener('did-navigate', navigated);
      el.removeEventListener('did-navigate-in-page', update);
      el.removeEventListener('dom-ready', ready);
    };
  }, [n.id, hasUrl]);

  // Escape inside the page never reaches the window; clicking the canvas or pressing Escape there leaves interaction.
  return (
    <>
      {(selected || interacting) && <EmbedBar node={n} left={p.x} top={p.y - 40} live={live} nav={nav} interacting={interacting} view={view} />}
      <div
        className={cn('absolute origin-top-left overflow-hidden', interacting && 'outline outline-2 outline-accent')}
        style={{
          left: p.x, top: p.y, width: n.width, height: n.height, transform: `scale(${camera.zoom})`,
          borderRadius: n.cornerRadius, visibility: live ? 'visible' : 'hidden', pointerEvents: interacting ? 'auto' : 'none',
          opacity: n.opacity,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => { if (interacting) e.stopPropagation(); }}>
        {hasUrl && createElement('webview', {
          ref: view, src: n.url, partition: 'persist:archa-embed', style: { width: '100%', height: '100%', background: '#fff' },
        })}
      </div>
    </>
  );
}

/** "localhost:3000" → http, "example.com" → https. */
function toUrl(raw: string): string {
  const v = raw.trim();
  if (!v || /^https?:\/\//i.test(v)) return v;
  return /^localhost|^\d+\.\d+\.\d+\.\d+/.test(v) ? `http://${v}` : `https://${v}`;
}

function EmbedBar({ node: n, left, top, live, nav, interacting, view }: {
  node: EmbedNode; left: number; top: number; live: boolean; nav: { back: boolean; forward: boolean }; interacting: boolean; view: React.RefObject<WebviewEl | null>;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const btn = 'flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-1 text-fg-muted hover:bg-panel-3 hover:text-fg disabled:opacity-30';
  const bar = 'absolute z-10 flex h-8 w-max items-center gap-0.5 rounded-lg border border-line bg-panel px-1 shadow-lg shadow-black/30';
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation() };

  // The link is asked for once, when the page is new; after that the node is just the page.
  if (!n.url) {
    const go = () => { const next = toUrl(url); if (next) void commit('Set web page URL', [{ op: 'update', id: n.id, patch: { url: next } }]); };
    return (
      <form {...stop} className={bar} style={{ left, top, width: 320 }} onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input autoFocus value={url} spellCheck={false} placeholder="Paste a link — example.com, localhost:3000" aria-label="Web page URL"
          onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.stopPropagation()}
          className="h-6 min-w-0 flex-1 rounded-md bg-panel-2 px-2 font-mono text-[11px] text-fg" />
        <button type="submit" disabled={!url.trim()} className={cn(btn, 'px-2 text-[11px]')}>Open</button>
      </form>
    );
  }

  const shot = async (mode: 'wide' | 'object') => {
    const el = view.current;
    if (!el || busy) return;
    setBusy(true);
    try {
      const r = await window.archa.embedScreenshot(el.getWebContentsId(), mode);
      if (r.error) toast(r.error, 'error');
      else if (r.path) toast(`Saved ${r.path}`);
    } finally { setBusy(false); }
  };
  const sep = <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />;
  return (
    <div {...stop} className={bar} style={{ left, top }}>
      <button title="Back" className={btn} disabled={!nav.back} onClick={() => view.current?.goBack()}><ArrowLeft size={13} /></button>
      <button title="Forward" className={btn} disabled={!nav.forward} onClick={() => view.current?.goForward()}><ArrowRight size={13} /></button>
      <button title="Reload" className={btn} onClick={() => view.current?.reload()}><RotateCw size={12} /></button>
      {sep}
      {EMBED_DEVICES.map(({ label, width, height, Icon }) => (
        <button key={label} title={`${label} · ${width} × ${height}`}
          onClick={() => void commit('Resize web page', [{ op: 'update', id: n.id, patch: { width, height } }])}
          className={cn(btn, n.width === width && n.height === height && 'bg-accent-soft text-accent-fg')}><Icon size={13} /></button>
      ))}
      {sep}
      <button title="Screenshot at desktop width (JPG)" className={cn(btn, 'text-[11px]')} disabled={!live || busy} onClick={() => void shot('wide')}><Camera size={13} />Wide</button>
      <button title="Screenshot of this page as shown (JPG)" className={cn(btn, 'text-[11px]')} disabled={!live || busy} onClick={() => void shot('object')}><Camera size={13} />Object</button>
      {sep}
      <button title={interacting ? 'Stop interacting (Esc)' : 'Click and type inside the page (double-click)'}
        onClick={() => useStore.setState({ interactEmbed: interacting ? null : n.id })}
        className={cn(btn, interacting && 'bg-accent-soft text-accent-fg')}><MousePointerClick size={13} /></button>
    </div>
  );
}
