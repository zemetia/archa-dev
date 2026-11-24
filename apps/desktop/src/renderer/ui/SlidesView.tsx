import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Maximize2, Plus } from 'lucide-react';
import { commit, select, useStore } from '../lib/store';
import { pageRoot } from '../lib/geometry';
import { revealNode, useNodeThumb } from '../lib/thumbs';
import { SLIDE_PRESETS, defaultSizeAt, newSlideOps, parseSize, presetFor, resizeSlideOps, sizeLabel, slideFrames, type SlideSize } from '../lib/slides';
import { cn } from './controls';

/** Render size of a slide picture (long side); the card shows it at fit-width. */
const RENDER_BOX = 1100;

/*
 * Canva-like slide view (blueprint APP_UI/05): every slide stacked top to bottom at fit-width over
 * the canvas. Click selects (the Design panel edits it), double-click opens it on the canvas,
 * "+" adds a slide at that position through one insert op (undoable).
 */
export function SlidesView() {
  const open = useStore((s) => s.slidesView);
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);

  // Opening the view shows the selected slide, like switching views in Canva.
  useEffect(() => {
    if (!open) return;
    const id = useStore.getState().selection[0];
    if (id) scrollToSlide(id, 'instant');
  }, [open]);

  if (!open || !doc) return null;
  const slides = slideFrames(doc, pageRoot(doc));

  const add = async (at: number, size: SlideSize) => {
    const d = useStore.getState().doc;
    if (!d) return;
    const r = newSlideOps(d, pageRoot(d), at, size);
    if (await commit(`Add ${r.name}`, r.ops)) {
      select([r.rootId]);
      requestAnimationFrame(() => { scrollToSlide(r.rootId, 'smooth'); });
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-canvas">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <button onClick={() => closeSlidesView()} title="Back to canvas (Esc)"
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 hover:bg-panel-2">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-fg-muted"><ArrowLeft size={15} />Canvas</span>
        </button>
        <div className="h-5 w-px bg-line" />
        <div className="text-[13px] font-semibold text-fg">Slides</div>
        <div className="font-mono text-[11px] text-fg-subtle">{slides.length}</div>
        <div className="flex-1" />
        <AddButton label="Add slide" initial={defaultSizeAt(slides, slides.length)} onAdd={(size) => add(slides.length, size)} variant="bar" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto"
        onPointerDown={(e) => { if (e.target === e.currentTarget) select([]); }}>
        <div className="mx-auto flex w-full max-w-[1040px] flex-col items-stretch px-10 pb-24 pt-8">
          {slides.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-24 text-center text-[13px] text-fg-muted">
              No slides yet. Start with a size.
              <AddButton label="Add first slide" initial={defaultSizeAt(slides, 0)} onAdd={(size) => add(0, size)} variant="bar" />
            </div>
          )}
          {slides.map((s, i) => (
            <div key={s.id}>
              {i > 0 && <Gap initial={defaultSizeAt(slides, i)} onAdd={(size) => add(i, size)} />}
              <SlideCard id={s.id} index={i + 1} />
            </div>
          ))}
          {slides.length > 0 && (
            <div className="mt-6 flex justify-center">
              <AddButton label="Add slide" initial={defaultSizeAt(slides, slides.length)} onAdd={(size) => add(slides.length, size)} variant="tile" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function openSlidesView() {
  useStore.setState({ slidesView: true, contextMenu: null, editingText: null });
}

/** Back to the canvas, framed on the selected slide when there is one. */
export function closeSlidesView() {
  useStore.setState({ slidesView: false });
  const id = useStore.getState().selection[0];
  if (id) requestAnimationFrame(() => { revealNode(id); });
}

export function scrollToSlide(id: string, behavior: ScrollBehavior) {
  const el = document.querySelector(`[data-slide-id="${CSS.escape(id)}"]`);
  if (el) el.scrollIntoView({ block: 'center', behavior });
}

function SlideCard({ id, index }: { id: string; index: number }) {
  const node = useStore((s) => s.doc?.get(id));
  const selected = useStore((s) => s.selection.includes(id));
  const url = useNodeThumb(id, RENDER_BOX);
  if (!node) return null;
  const ratio = Math.max(1, node.width) / Math.max(1, node.height);
  const resize = async (size: SlideSize) => {
    const ops = resizeSlideOps(node, size);
    if (ops.length) await commit(`Resize ${node.name}`, ops);
  };
  return (
    <section data-slide-id={id} className="flex flex-col items-center">
      <div className="mb-2 flex w-full items-center gap-2 text-[12px]">
        <span className={cn('font-mono text-[12px]', selected ? 'text-accent-fg' : 'text-fg-subtle')}>{index}</span>
        <span className={cn('min-w-0 flex-1 truncate', selected ? 'text-fg' : 'text-fg-muted')}>{node.name}</span>
        <SizeMenu size={{ width: node.width, height: node.height }} onPick={resize} />
        <button title="Open on canvas" onClick={() => { select([id]); closeSlidesView(); }}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-panel-2">
          <span className="text-fg-subtle"><Maximize2 size={13} /></span>
        </button>
      </div>
      {/* Fit-width, but a tall slide (story, A4) is capped by the window height so it stays readable. */}
      <button onClick={() => select([id])} onDoubleClick={() => { select([id]); closeSlidesView(); }}
        style={{ aspectRatio: `${ratio}`, width: `min(100%, calc((100vh - 220px) * ${ratio}))` }}
        className={cn('block overflow-hidden rounded-md bg-panel-2 shadow-[0_1px_2px_rgb(0_0_0/0.3),0_18px_48px_-12px_rgb(0_0_0/0.55)] outline-none ring-offset-4 ring-offset-canvas transition-shadow',
          selected ? 'ring-2 ring-accent' : 'hover:ring-2 hover:ring-line')}>
        {url ? <img src={url} alt={node.name} draggable={false} className="h-full w-full object-contain" /> : <div className="h-full w-full animate-pulse bg-panel-2" />}
      </button>
    </section>
  );
}

/** The thin gap between two slides; its "+" adds a slide there. */
function Gap({ initial, onAdd }: { initial: SlideSize; onAdd: (s: SlideSize) => void }) {
  return (
    <div className="group relative flex h-12 items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line opacity-0 transition-opacity group-hover:opacity-100" />
      <AddButton label="Add slide here" initial={initial} onAdd={onAdd} variant="dot" />
    </div>
  );
}

function AddButton({ label, initial, onAdd, variant }: { label: string; initial: SlideSize; onAdd: (s: SlideSize) => void; variant: 'bar' | 'tile' | 'dot' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {variant === 'dot' ? (
        <button title={label} onClick={() => setOpen(!open)}
          className={cn('relative flex h-7 w-7 items-center justify-center rounded-full border border-line bg-panel shadow-lg shadow-black/30 transition-opacity hover:border-accent',
            open ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100')}>
          <span className="text-fg"><Plus size={14} /></span>
        </button>
      ) : variant === 'tile' ? (
        <button title={label} onClick={() => setOpen(!open)}
          className="flex h-14 w-[280px] items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-panel/60 hover:border-accent hover:bg-panel">
          <span className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted"><Plus size={16} />{label}</span>
        </button>
      ) : (
        <button title={label} onClick={() => setOpen(!open)} className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 hover:brightness-110">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-white"><Plus size={14} />{label}</span>
        </button>
      )}
      {open && <SizePicker initial={initial} action="Add" onPick={(s) => { setOpen(false); onAdd(s); }} onClose={() => setOpen(false)}
        align={variant === 'bar' ? 'right' : 'center'} />}
    </div>
  );
}

/** Per-slide quick resize: the current size, opening the same picker. */
function SizeMenu({ size, onPick }: { size: SlideSize; onPick: (s: SlideSize) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button title="Resize slide" onClick={() => setOpen(!open)} className="flex h-7 items-center gap-1 rounded-md px-2 hover:bg-panel-2">
        <span className="flex items-center gap-1 text-[11.5px] text-fg-muted">{sizeLabel(size)}<ChevronDown size={12} /></span>
      </button>
      {open && <SizePicker initial={{ width: Math.round(size.width), height: Math.round(size.height) }} action="Resize" align="right"
        onPick={(s) => { setOpen(false); onPick(s); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SizePicker({ initial, action, onPick, onClose, align }: {
  initial: SlideSize; action: string; onPick: (s: SlideSize) => void; onClose: () => void; align: 'right' | 'center';
}) {
  const root = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(String(initial.width));
  const [h, setH] = useState(String(initial.height));
  const custom = parseSize(w, h);
  const current = presetFor(initial);

  useEffect(() => {
    const close = (e: PointerEvent) => { if (!root.current?.parentElement?.contains(e.target as Node)) onClose(); };
    window.addEventListener('pointerdown', close, true);
    return () => { window.removeEventListener('pointerdown', close, true); };
  }, [onClose]);

  const groups = ['Presentation', 'Document', 'Social'] as const;
  return (
    <div ref={root} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      className={cn('absolute top-full z-50 mt-2 w-[280px] rounded-xl border border-line bg-panel p-1.5 text-left shadow-2xl shadow-black/50',
        align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2')}>
      <button autoFocus onClick={() => onPick(initial)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-panel-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{current ? current.label : 'Same size'}</span>
        <span className="font-mono text-[11px] text-fg-subtle">{initial.width}×{initial.height}</span>
      </button>
      {groups.map((g) => (
        <div key={g} className="mt-1 border-t border-line pt-1">
          <div className="px-2.5 py-1 text-[11px] text-fg-subtle">{g}</div>
          {SLIDE_PRESETS.filter((p) => p.group === g).map((p) => (
            <button key={p.id} onClick={() => onPick({ width: p.width, height: p.height })}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-panel-2">
              <Ratio w={p.width} h={p.height} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{p.label}</span>
              {current?.id === p.id ? <span className="text-accent-fg"><Check size={13} /></span>
                : <span className="font-mono text-[10.5px] text-fg-subtle">{p.width}×{p.height}</span>}
            </button>
          ))}
        </div>
      ))}
      <form className="mt-1 flex items-center gap-1.5 border-t border-line px-1 pb-0.5 pt-2"
        onSubmit={(e) => { e.preventDefault(); if (custom) onPick(custom); }}>
        <SizeInput label="Width" value={w} onChange={setW} />
        <span className="text-[11px] text-fg-subtle">×</span>
        <SizeInput label="Height" value={h} onChange={setH} />
        <button type="submit" disabled={!custom} className="h-7 shrink-0 rounded-md bg-accent px-2.5 disabled:opacity-40">
          <span className="text-[11.5px] font-medium text-white">{action}</span>
        </button>
      </form>
    </div>
  );
}

function SizeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input aria-label={label} title={`Custom ${label.toLowerCase()} (px)`} value={value} inputMode="numeric" spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-0 min-w-0 flex-1 rounded-md bg-panel-2 px-2 font-mono text-[11.5px] text-fg ring-1 ring-line focus:ring-accent" />
  );
}

/** Tiny outline at the preset's ratio, so sizes read at a glance. */
function Ratio({ w, h }: { w: number; h: number }) {
  const k = 14 / Math.max(w, h);
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
      <span style={{ width: Math.max(4, w * k), height: Math.max(4, h * k) }} className="rounded-[2px] border border-fg-subtle" />
    </span>
  );
}
