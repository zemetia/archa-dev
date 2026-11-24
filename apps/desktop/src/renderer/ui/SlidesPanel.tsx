import { Frame, Presentation } from 'lucide-react';
import { componentMeta, instanceOf } from '@archa/core';
import { select, useStore } from '../lib/store';
import { pageRoot } from '../lib/geometry';
import { revealNode, useNodeThumb } from '../lib/thumbs';
import { closeSlidesView, openSlidesView, scrollToSlide } from './SlidesView';
import { cn } from './controls';
import { slideFrames } from '../lib/slides';

const THUMB = 268;

/* Every top-level frame of the page as a picture, at its own aspect ratio — a visual alternative to Layers. The button opens the full slide view (ui/SlidesView.tsx). */
export function SlidesPanel() {
  const doc = useStore((s) => s.doc);
  const viewOpen = useStore((s) => s.slidesView);
  useStore((s) => s.rev);
  if (!doc) return null;
  const frames = slideFrames(doc, pageRoot(doc));

  return (
    <>
      <div className="shrink-0 px-3 pb-2">
        <button onClick={() => (viewOpen ? closeSlidesView() : openSlidesView())}
          title={viewOpen ? 'Back to the canvas (Esc)' : 'Show every slide stacked, one under another'}
          className={cn('flex h-8 w-full items-center justify-center gap-2 rounded-lg border transition-colors',
            viewOpen ? 'border-accent bg-accent-soft' : 'border-line bg-panel-2 hover:border-fg-subtle')}>
          <span className={cn('flex items-center gap-2 text-[12px] font-medium', viewOpen ? 'text-accent-fg' : 'text-fg')}>
            <Presentation size={14} />{viewOpen ? 'Back to canvas' : 'Slide view'}
          </span>
        </button>
      </div>
      {frames.length ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 pt-1">
          {frames.map((f, i) => <Slide key={f.id} id={f.id} index={i + 1} />)}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-fg-subtle">
          <Frame size={20} />
          No frames yet. Open the slide view to add one, draw one with F, or ask your agent to design a screen.
        </div>
      )}
    </>
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
    <button onClick={() => { if (useStore.getState().slidesView) { select([id]); scrollToSlide(id, 'smooth'); } else revealNode(id); }} className="group block w-full text-left">
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
