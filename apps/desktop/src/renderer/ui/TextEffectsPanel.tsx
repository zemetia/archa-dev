import { useEffect, useRef, useState } from 'react';
import { Ban, X } from 'lucide-react';
import { paintColor, hexToColor, textEffectSchema, textNodeSchema, type Color, type TextEffect, type TextEffectType, type TextNode } from '@archa/schema';
import { drawText } from '@archa/render';
import { useStore } from '../lib/store';
import { commitPatch, previewPatch } from '../lib/livePatch';
import { cn, ColorField } from './controls';

/*
 * Canva-like Effects panel for text (blueprint APP_UI/01): one look at a time from a grid of live
 * previews, its sliders below, then the Shape section (curve). Opens from the text toolbar.
 */

type Param = 'offset' | 'direction' | 'blur' | 'transparency' | 'thickness' | 'roundness' | 'spread' | 'intensity';

const EFFECTS: Array<{ type: TextEffectType; label: string; start: Partial<TextEffect>; params: Param[]; color: string | null }> = [
  { type: 'drop', label: 'Drop', start: { offset: 50, direction: 45, blur: 0, transparency: 60 }, params: ['offset', 'direction', 'blur', 'transparency'], color: '#000000' },
  { type: 'glow', label: 'Glow', start: { spread: 50, transparency: 40 }, params: ['spread', 'transparency'], color: null },
  { type: 'echo', label: 'Echo', start: { offset: 50, direction: 45 }, params: ['offset', 'direction'], color: null },
  { type: 'outline', label: 'Outline', start: { thickness: 50 }, params: ['thickness'], color: '#000000' },
  { type: 'background', label: 'Background', start: { roundness: 50, spread: 50, transparency: 0 }, params: ['roundness', 'spread', 'transparency'], color: '#fde047' },
  { type: 'splice', label: 'Splice', start: { thickness: 50, offset: 50, direction: 45 }, params: ['thickness', 'offset', 'direction'], color: null },
  { type: 'hollow', label: 'Hollow', start: { thickness: 50 }, params: ['thickness'], color: null },
  { type: 'neon', label: 'Neon', start: { intensity: 50 }, params: ['intensity'], color: null },
  { type: 'glitch', label: 'Glitch', start: { offset: 30, direction: 0 }, params: ['offset', 'direction'], color: '#ff2bd6' },
];

const PARAMS: Record<Param, { label: string; min: number; max: number }> = {
  offset: { label: 'Offset', min: 0, max: 100 }, direction: { label: 'Direction', min: -180, max: 180 }, blur: { label: 'Blur', min: 0, max: 100 },
  transparency: { label: 'Transparency', min: 0, max: 100 }, thickness: { label: 'Thickness', min: 0, max: 100 }, roundness: { label: 'Roundness', min: 0, max: 100 },
  spread: { label: 'Spread', min: 0, max: 100 }, intensity: { label: 'Intensity', min: 0, max: 100 },
};

const effectFor = (type: TextEffectType): TextEffect => {
  const e = EFFECTS.find((x) => x.type === type)!;
  return textEffectSchema.parse({ type, ...e.start, ...(e.color ? { color: hexToColor(e.color) } : {}) });
};

export function TextEffectsPanel() {
  const open = useStore((s) => s.textEffectsOpen);
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const n = selection.length === 1 ? doc?.get(selection[0]!) : undefined;
  if (!open || n?.type !== 'text') return null;
  const close = () => useStore.setState({ textEffectsOpen: false });
  const fx = n.textEffect;
  const set = (textEffect: TextEffect | null, label: string) => commitPatch(n.id, { textEffect }, label);

  return (
    <aside className="pointer-events-auto absolute bottom-3 left-[68px] top-3 z-30 flex w-[288px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-xl shadow-black/30">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <span className="text-[14px] font-semibold text-fg">Effects</span>
        <button title="Close" aria-label="Close effects" onClick={close} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-panel-3 hover:text-fg"><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="None" active={!fx} onClick={() => fx && set(null, 'No text effect')}><Ban size={22} className="text-fg-subtle" /></Tile>
          {EFFECTS.map((e) => (
            <Tile key={e.type} label={e.label} active={fx?.type === e.type} onClick={() => fx?.type !== e.type && set(effectFor(e.type), `Text effect: ${e.label}`)}>
              <Preview effect={effectFor(e.type)} />
            </Tile>
          ))}
        </div>
        {fx && <EffectControls node={n} fx={fx} />}

        <div className="mt-5 mb-2 text-[14px] font-semibold text-fg">Shape</div>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="None" active={!n.curve} onClick={() => n.curve && commitPatch(n.id, { curve: 0 }, 'Straight text')}><Ban size={22} className="text-fg-subtle" /></Tile>
          <Tile label="Curve" active={!!n.curve} onClick={() => !n.curve && commitPatch(n.id, { curve: 50 }, 'Curve text')}><Preview curve={60} /></Tile>
        </div>
        {!!n.curve && (
          <div className="mt-3">
            <Slider label="Curve" value={n.curve} min={-100} max={100}
              onPreview={(curve) => previewPatch(n.id, { curve })} onCommit={(curve) => commitPatch(n.id, { curve }, 'Curve text')} />
          </div>
        )}
      </div>
    </aside>
  );
}

function EffectControls({ node, fx }: { node: TextNode; fx: TextEffect }) {
  const meta = EFFECTS.find((e) => e.type === fx.type)!;
  const with_ = (p: Partial<TextEffect>) => ({ ...fx, ...p });
  const fallback = meta.color ? hexToColor(meta.color) : (node.fills.find((f) => f.visible) && paintColor(node.fills.find((f) => f.visible)!)) || hexToColor('#000000');
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-panel-2 p-3">
      {meta.params.map((p) => (
        <Slider key={p} label={PARAMS[p].label} value={fx[p]} min={PARAMS[p].min} max={PARAMS[p].max}
          onPreview={(v) => previewPatch(node.id, { textEffect: with_({ [p]: v }) })}
          onCommit={(v) => commitPatch(node.id, { textEffect: with_({ [p]: v }) }, `${meta.label}: ${PARAMS[p].label.toLowerCase()}`)} />
      ))}
      <div>
        <div className="mb-1.5 text-[12px] text-fg-muted">Colour</div>
        <ColorField color={fx.color ?? fallback} onCommit={(color: Color) => commitPatch(node.id, { textEffect: with_({ color }) }, `${meta.label}: colour`)} />
      </div>
    </div>
  );
}

function Tile({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-pressed={active} className="group flex flex-col items-center gap-1.5">
      <span className={cn('flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-panel-2 transition-colors group-hover:border-fg-subtle', active ? 'border-accent ring-2 ring-accent' : 'border-line')}>
        {children}
      </span>
      <span className={cn('text-[12px]', active ? 'text-fg' : 'text-fg-muted')}>{label}</span>
    </button>
  );
}

/** "Ag" drawn by the real text renderer with an effect (or a curve), in the accent colour. */
function Preview({ effect, curve }: { effect?: TextEffect; curve?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const size = 76, dpr = window.devicePixelRatio || 1;
    el.width = size * dpr; el.height = size * dpr;
    const ctx = el.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#8b5cf6';
    const node = textNodeSchema.parse({
      id: 'preview', name: 'Preview', parentId: null, type: 'text', text: curve ? 'ABCD' : 'Ag', fontWeight: 800, fontSize: curve ? 18 : 34,
      textAlign: 'center', textSizing: 'fixed', width: size, height: size, lineHeight: 1, curve: curve ?? 0,
      fills: [{ type: 'solid', color: hexToColor(accent) }], textEffect: effect ?? null,
    });
    // A straight preview sits in the middle; the curve is centred by the renderer itself.
    ctx.translate(0, curve ? 0 : size / 2 - node.fontSize / 2);
    drawText(ctx, curve ? { ...node, height: size } : node, dpr);
  }, [effect, curve]);
  return <canvas ref={ref} style={{ width: 76, height: 76 }} aria-hidden />;
}

/** Range slider with a number: the canvas previews while dragging, one undo step on release. */
export function Slider({ label, value, min, max, step = 1, onPreview, onCommit }: {
  label: string; value: number; min: number; max: number; step?: number; onPreview: (v: number) => void; onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setV(value); }, [value]);
  const release = () => { dragging.current = false; if (v !== value) onCommit(v); };
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-fg-muted">{label}</span>
        <input type="number" value={Math.round(v * 100) / 100} min={min} max={max} step={step} aria-label={label}
          onChange={(e) => { const x = Math.min(max, Math.max(min, Number(e.target.value) || 0)); setV(x); onPreview(x); }}
          onBlur={release} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="h-6 w-14 rounded-md bg-panel-3 px-1.5 text-right text-[12px] text-fg" />
      </div>
      <input type="range" value={v} min={min} max={max} step={step} aria-label={`${label} slider`}
        onPointerDown={() => { dragging.current = true; }}
        onChange={(e) => { const x = Number(e.target.value); setV(x); onPreview(x); }}
        onPointerUp={release} onKeyUp={release}
        className="w-full accent-accent" />
    </label>
  );
}
