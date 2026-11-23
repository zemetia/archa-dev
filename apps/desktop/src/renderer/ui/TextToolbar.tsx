import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ALargeSmall, Bold, Italic, List, ListOrdered, Minus, Plus, Strikethrough, TextAlignCenter, TextAlignEnd, TextAlignStart, Underline } from 'lucide-react';
import { paintColor, colorToHex, hexToColor, type TextNode } from '@archa/schema';
import { useStore } from '../lib/store';
import { commitPatch, previewPatch } from '../lib/livePatch';
import { cn, ColorField } from './controls';
import { FontPicker } from './inspector/FontPicker';
import { Slider } from './TextEffectsPanel';

/*
 * Canva-like text toolbar (blueprint APP_UI/01): floats over the top of the canvas while one text
 * layer is selected. Font, size, colour, B / I / U / S, case, alignment, list, spacing,
 * transparency, and the Effects panel.
 */

const CASES: Array<TextNode['textCase']> = ['none', 'upper', 'lower', 'title'];
const CASE_LABEL: Record<TextNode['textCase'], string> = { none: 'As typed', upper: 'UPPERCASE', lower: 'lowercase', title: 'Title Case' };
const ALIGNS: Array<TextNode['textAlign']> = ['left', 'center', 'right'];
const LISTS: Array<TextNode['list']> = ['none', 'bullet', 'number'];

export function TextToolbar() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const effectsOpen = useStore((s) => s.textEffectsOpen);
  const n = selection.length === 1 ? doc?.get(selection[0]!) : undefined;
  if (n?.type !== 'text' || n.locked) return null;
  const set = (patch: Record<string, unknown>, label: string) => commitPatch(n.id, patch, label);
  const next = <T,>(list: T[], v: T) => list[(list.indexOf(v) + 1) % list.length]!;
  const first = n.fills.find((f) => f.visible);
  const ink = (first && paintColor(first)) || hexToColor('#000000');
  const bold = n.fontWeight >= 600;

  return (
    <div className="pointer-events-auto flex h-11 items-center gap-1 rounded-xl border border-line bg-panel px-1.5 shadow-xl shadow-black/30" onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-40"><FontPicker value={n.fontFamily} onChange={(fontFamily) => set({ fontFamily }, 'Font')} /></div>
      <Divider />
      <SizeField value={n.fontSize} onCommit={(fontSize) => set({ fontSize }, 'Font size')} />
      <Divider />
      <Pop title="Text colour" trigger={
        <span className="flex flex-col items-center leading-none">
          <span className="text-[15px] font-semibold text-fg">A</span>
          <span className="mt-0.5 h-[3px] w-4 rounded-full" style={{ background: colorToHex(ink, true) }} />
        </span>
      }>
        <div className="w-60"><ColorField color={ink} onCommit={(color) => set({ fills: [{ type: 'solid', color, visible: true }] }, 'Text colour')} /></div>
      </Pop>
      <Toggle title="Bold" active={bold} onClick={() => set({ fontWeight: bold ? 400 : 700 }, bold ? 'Not bold' : 'Bold')}><Bold size={16} /></Toggle>
      <Toggle title="Italic" active={n.fontStyle === 'italic'} onClick={() => set({ fontStyle: n.fontStyle === 'italic' ? 'normal' : 'italic' }, 'Italic')}><Italic size={16} /></Toggle>
      <Toggle title="Underline" active={n.underline} onClick={() => set({ underline: !n.underline }, 'Underline')}><Underline size={16} /></Toggle>
      <Toggle title="Strikethrough" active={n.strikethrough} onClick={() => set({ strikethrough: !n.strikethrough }, 'Strikethrough')}><Strikethrough size={16} /></Toggle>
      <Toggle title={`Letter case: ${CASE_LABEL[n.textCase]} (click for ${CASE_LABEL[next(CASES, n.textCase)]})`} active={n.textCase !== 'none'}
        onClick={() => set({ textCase: next(CASES, n.textCase) }, 'Letter case')}><ALargeSmall size={17} /></Toggle>
      <Toggle title={`Align ${n.textAlign} (click for ${next(ALIGNS, n.textAlign)})`} onClick={() => set({ textAlign: next(ALIGNS, n.textAlign) }, 'Text align')}>
        {n.textAlign === 'center' ? <TextAlignCenter size={16} /> : n.textAlign === 'right' ? <TextAlignEnd size={16} /> : <TextAlignStart size={16} />}
      </Toggle>
      <Toggle title={n.list === 'none' ? 'Bulleted list' : n.list === 'bullet' ? 'Numbered list' : 'No list'} active={n.list !== 'none'}
        onClick={() => set({ list: next(LISTS, n.list) }, 'List')}>{n.list === 'number' ? <ListOrdered size={16} /> : <List size={16} />}</Toggle>
      <Pop title="Spacing" trigger={<SpacingIcon />}>
        <div className="w-60 space-y-3">
          <Slider label="Letter spacing" value={n.letterSpacing} min={-20} max={100} step={0.5}
            onPreview={(letterSpacing) => previewPatch(n.id, { letterSpacing })} onCommit={(letterSpacing) => set({ letterSpacing }, 'Letter spacing')} />
          <Slider label="Line spacing" value={n.lineHeight} min={0.5} max={3} step={0.05}
            onPreview={(lineHeight) => previewPatch(n.id, { lineHeight })} onCommit={(lineHeight) => set({ lineHeight }, 'Line spacing')} />
        </div>
      </Pop>
      <Pop title="Transparency" trigger={<CheckerIcon />}>
        <div className="w-60">
          <Slider label="Transparency" value={Math.round((1 - n.opacity) * 100)} min={0} max={100}
            onPreview={(t) => previewPatch(n.id, { opacity: 1 - t / 100 })} onCommit={(t) => set({ opacity: 1 - t / 100 }, 'Transparency')} />
        </div>
      </Pop>
      <Divider />
      <button onClick={() => useStore.setState({ textEffectsOpen: !effectsOpen })} aria-pressed={effectsOpen}
        className={cn('h-8 rounded-lg px-3 text-[13px] font-medium transition-colors', effectsOpen || n.textEffect || n.curve ? 'bg-accent-soft text-accent-fg' : 'text-fg hover:bg-panel-3')}>
        Effects
      </button>
    </div>
  );
}

const Divider = () => <span className="mx-0.5 h-6 w-px bg-line" />;

function Toggle({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button title={title} aria-label={title} aria-pressed={active} onClick={onClick}
      className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', active ? 'bg-accent-soft text-accent-fg' : 'text-fg hover:bg-panel-3')}>
      {children}
    </button>
  );
}

/** − size + like Canva: steps by 1, the field takes any value. */
function SizeField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 10) / 10)), [value]);
  const commit = (v: number) => { if (Number.isFinite(v) && v >= 1 && v !== value) onCommit(Math.round(v * 10) / 10); else setText(String(value)); };
  return (
    <div className="flex h-8 items-center rounded-lg ring-1 ring-line">
      <button title="Smaller" aria-label="Decrease font size" onClick={() => commit(Math.max(1, Math.ceil(value) - 1))} className="flex h-8 w-7 items-center justify-center rounded-l-lg text-fg hover:bg-panel-3"><Minus size={14} /></button>
      <input value={text} aria-label="Font size" onChange={(e) => setText(e.target.value)} onBlur={() => commit(Number(text))}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onFocus={(e) => e.target.select()} className="w-11 bg-transparent text-center text-[13px] text-fg" />
      <button title="Bigger" aria-label="Increase font size" onClick={() => commit(Math.floor(value) + 1)} className="flex h-8 w-7 items-center justify-center rounded-r-lg text-fg hover:bg-panel-3"><Plus size={14} /></button>
    </div>
  );
}

/** Toolbar button with a small panel below it; closes on an outside click or Escape. */
function Pop({ title, trigger, children }: { title: string; trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button title={title} aria-label={title} aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', open ? 'bg-panel-3' : 'hover:bg-panel-3')}>{trigger}</button>
      {open && <div className="absolute left-1/2 top-10 z-40 -translate-x-1/2 rounded-xl border border-line bg-panel p-3 shadow-xl shadow-black/40">{children}</div>}
    </div>
  );
}

function SpacingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-fg stroke-[1.8]" aria-hidden>
      <path d="M7 4h10M12 4v10M4 19h16M4 19l2.5-2.5M4 19l2.5 2.5M20 19l-2.5-2.5M20 19l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckerIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <rect x="1" y="1" width="14" height="14" rx="2" className="fill-none stroke-fg" strokeWidth="1.2" />
      {[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].filter((c) => (r + c) % 2 === 0).map((c) => <rect key={`${r}${c}`} x={1.5 + c * 3.25} y={1.5 + r * 3.25} width="3.25" height="3.25" className="fill-fg" />))}
    </svg>
  );
}
