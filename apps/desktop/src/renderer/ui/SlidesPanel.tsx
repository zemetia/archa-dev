import { Frame } from 'lucide-react';
import { componentMeta, instanceOf } from '@archa/core';
import { useStore } from '../lib/store';
import { pageRoot } from '../lib/geometry';
import { revealNode, useNodeThumb } from '../lib/thumbs';
import { cn } from './controls';

const THUMB = 268;

/* Every top-level frame of the page as a picture, at its own aspect ratio — a visual alternative to Layers. */
export function SlidesPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  if (!doc) return null;
  const frames = doc.children(pageRoot(doc)).filter((n) => n.type === 'frame' && n.visible);

  if (!frames.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-fg-subtle">
        <Frame size={20} />
        No frames yet. Draw one with F, or ask your agent to design a screen.
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 pt-1">
      {frames.map((f, i) => <Slide key={f.id} id={f.id} index={i + 1} />)}
    </div>
  );
}

function Slide({ id, index }: { id: string; index: number }) {
  const node = useStore((s) => s.doc?.get(id));
  const selected = useStore((s) => s.selection.includes(id));
  const url = useNodeThumb(id, THUMB);
  if (!node) return null;
  // Tall pages are capped so one long landing page does not push everything else out of view.
  const h = Math.min(420, Math.round((THUMB * node.height) / Math.max(1, node.width)));
  const tag = componentMeta(node) ? 'Component' : instanceOf(node) ? 'Instance' : null;
  return (
    <button onClick={() => revealNode(id)} className="group block w-full text-left">
      <div className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px]">
        <span className="font-mono text-fg-subtle">{String(index).padStart(2, '0')}</span>
        <span className={cn('min-w-0 flex-1 truncate', selected ? 'text-accent-fg' : 'text-fg-muted group-hover:text-fg')}>{node.name}</span>
        {tag && <span className="rounded bg-accent-soft px-1 text-[9.5px] font-medium text-accent-fg">{tag}</span>}
        <span className="font-mono text-[10px] text-fg-subtle">{Math.round(node.width)}×{Math.round(node.height)}</span>
      </div>
      <div style={{ height: h }}
        className={cn('flex items-start justify-center overflow-hidden rounded-lg border bg-canvas transition-colors',
          selected ? 'border-accent ring-2 ring-accent-soft' : 'border-line group-hover:border-fg-subtle')}>
        {url ? <img src={url} alt="" draggable={false} className="max-h-full w-full object-contain object-top" /> : <div className="h-full w-full animate-pulse bg-panel-2" />}
      </div>
    </button>
  );
}
