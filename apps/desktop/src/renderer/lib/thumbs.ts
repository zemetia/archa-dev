import { useEffect, useState } from 'react';
import { subtreeHash } from '@archa/core';
import { renderNodePng } from '@archa/render';
import { select, useStore } from './store';

/*
 * Node thumbnails for the Slides / Components panels. Keyed by subtree hash, so a thumbnail
 * re-renders only when that node's content changes (a derivable cache: losing it costs a repaint).
 */

const cache = new Map<string, string>();
const MAX_ENTRIES = 300;

export function useNodeThumb(nodeId: string, box: number): string | null {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const hash = doc?.get(nodeId) ? subtreeHash(doc, nodeId) : null;
  const key = hash ? `${nodeId}:${hash}:${box}` : null;
  const [url, setUrl] = useState<string | null>(() => (key ? cache.get(key) ?? null : null));

  useEffect(() => {
    if (!doc || !key) return;
    const hit = cache.get(key);
    if (hit) { setUrl(hit); return; }
    let live = true;
    // Debounced so a drag or an agent burst does not repaint every thumbnail per op.
    const t = setTimeout(() => {
      const n = doc.get(nodeId);
      if (!n) return;
      const scale = Math.min(2, (box * 2) / Math.max(1, n.width, n.height));
      void renderNodePng(doc, nodeId, scale).then((png) => {
        const data = `data:image/png;base64,${png}`;
        cache.set(key, data);
        if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
        if (live) setUrl(data);
      }).catch(() => { /* a node deleted mid-render just keeps the old thumbnail */ });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [doc, key, nodeId, box]);

  return url;
}

/** Select a node and zoom the canvas so it fills the view with some margin. */
export function revealNode(id: string) {
  const { doc } = useStore.getState();
  const el = document.querySelector('[data-canvas-host]');
  if (!doc?.get(id) || !el) return;
  select([id]);
  const b = doc.worldBounds(id);
  const pad = 80;
  const zoom = Math.min(4, Math.max(0.02, Math.min((el.clientWidth - pad * 2) / Math.max(1, b.width), (el.clientHeight - pad * 2) / Math.max(1, b.height))));
  useStore.setState({ camera: { zoom, x: el.clientWidth / 2 - (b.x + b.width / 2) * zoom, y: el.clientHeight / 2 - (b.y + b.height / 2) * zoom } });
}
