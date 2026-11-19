import { createElement, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MousePointerClick, RotateCw } from 'lucide-react';
import type { EmbedNode } from '@archa/schema';
import { commit, useStore } from '../lib/store';
import { pageRoot, toScreen } from '../lib/geometry';
import { cn } from '../ui/controls';

/** Electron's <webview> element (methods we use). */
type WebviewEl = HTMLElement & { goBack(): void; goForward(): void; reload(): void; canGoBack(): boolean; canGoForward(): boolean; getURL(): string };

/** Below this on-screen width the live page is hidden and the drawn placeholder shows instead. */
const MIN_LIVE_WIDTH = 160;

/**
 * Live web pages over embed nodes (blueprint RENDERING/01 → Embeds). Each page is a sandboxed <webview>
 * laid out at the node's size and scaled with the camera. It ignores the pointer until the person
 * double-clicks it (interactEmbed); then it scrolls and clicks like a browser.
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
  const live = onScreen && w >= MIN_LIVE_WIDTH && /^https?:\/\//i.test(n.url);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const update = () => setNav({ back: el.canGoBack(), forward: el.canGoForward() });
    // A followed link becomes the node's URL, so the page reopens where the person left it.
    const navigated = (e: Event) => {
      update();
      const url = (e as Event & { url?: string }).url;
      const cur = useStore.getState().doc?.get(n.id);
      if (url && cur?.type === 'embed' && cur.url !== url) void commit('Navigate web page', [{ op: 'update', id: n.id, patch: { url } }]);
    };
    el.addEventListener('did-navigate', navigated);
    el.addEventListener('did-navigate-in-page', update);
    return () => { el.removeEventListener('did-navigate', navigated); el.removeEventListener('did-navigate-in-page', update); };
  }, [n.id, live]);

  // Escape inside the page never reaches the window; clicking the canvas or pressing Escape there leaves interaction.
  return (
    <>
      {(selected || interacting) && (
        <EmbedBar node={n} left={p.x} top={p.y - 40} width={Math.max(260, Math.min(w, 560))} nav={nav} interacting={interacting} view={view} />
      )}
      <div
        className={cn('absolute origin-top-left overflow-hidden', interacting && 'outline outline-2 outline-accent')}
        style={{
          left: p.x, top: p.y, width: n.width, height: n.height, transform: `scale(${camera.zoom})`,
          borderRadius: n.cornerRadius, visibility: live ? 'visible' : 'hidden', pointerEvents: interacting ? 'auto' : 'none',
          opacity: n.opacity,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => { if (interacting) e.stopPropagation(); }}>
        {/^https?:\/\//i.test(n.url) && createElement('webview', {
          ref: view, src: n.url, partition: 'persist:archa-embed', style: { width: '100%', height: '100%', background: '#fff' },
        })}
      </div>
    </>
  );
}

function EmbedBar({ node: n, left, top, width, nav, interacting, view }: {
  node: EmbedNode; left: number; top: number; width: number; nav: { back: boolean; forward: boolean }; interacting: boolean; view: React.RefObject<WebviewEl | null>;
}) {
  const [url, setUrl] = useState(n.url);
  useEffect(() => { setUrl(n.url); }, [n.url]);
  const go = () => {
    let next = url.trim();
    if (!next) return;
    if (!/^https?:\/\//i.test(next)) next = /^localhost|^\d+\.\d+\.\d+\.\d+/.test(next) ? `http://${next}` : `https://${next}`;
    if (next !== n.url) void commit('Set web page URL', [{ op: 'update', id: n.id, patch: { url: next } }]);
  };
  const btn = 'flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-panel-3 hover:text-fg disabled:opacity-30';
  return (
    <div onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      className="absolute z-10 flex h-8 items-center gap-1 rounded-lg border border-line bg-panel px-1 shadow-lg shadow-black/30"
      style={{ left, top, width }}>
      <button title="Back" className={btn} disabled={!nav.back} onClick={() => view.current?.goBack()}><ArrowLeft size={13} /></button>
      <button title="Forward" className={btn} disabled={!nav.forward} onClick={() => view.current?.goForward()}><ArrowRight size={13} /></button>
      <button title="Reload" className={btn} onClick={() => view.current?.reload()}><RotateCw size={12} /></button>
      <input value={url} spellCheck={false} aria-label="Web page URL" onChange={(e) => setUrl(e.target.value)} onBlur={go}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setUrl(n.url); }}
        className="h-6 min-w-0 flex-1 rounded-md bg-panel-2 px-2 font-mono text-[11px] text-fg" />
      <button title={interacting ? 'Stop interacting (Esc)' : 'Interact with the page (double-click)'}
        onClick={() => useStore.setState({ interactEmbed: interacting ? null : n.id })}
        className={cn(btn, interacting && 'bg-accent-soft text-accent-fg')}><MousePointerClick size={13} /></button>
    </div>
  );
}
