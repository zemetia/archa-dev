import type { ReactNode } from 'react';
import { Circle, CircleDashed, Eye, EyeOff, Minus, Plus, Square, SquareDashed, TextAlignCenter, TextAlignEnd, TextAlignStart } from 'lucide-react';
import { hexToColor, type Effect, type EffectType, type Node, type Paint, type Stroke } from '@archa/schema';
import { Check, ColorField, IconButton, MenuButton, NumberField, Section, Segmented, Select } from '../controls';

/* Style sections of the design panel: appearance, text, fill, stroke, effects and per-type extras. */

type SetProps = (patch: Record<string, unknown>, label?: string) => void;

export function AppearanceSection({ node: n, set }: { node: Node; set: SetProps }) {
  return (
    <Section title="Appearance" action={
      <IconButton title={n.visible ? 'Hide layer' : 'Show layer'} className="h-7 w-7" onClick={() => set({ visible: !n.visible }, n.visible ? 'Hide' : 'Show')}>
        {n.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </IconButton>
    }>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label={<span title="Opacity">Opacity</span>} value={Math.round(n.opacity * 100)} min={0} max={100} suffix="%" onCommit={(v) => set({ opacity: v / 100 }, 'Opacity')} />
        {'cornerRadius' in n && <NumberField label={<span title="Corner radius">Radius</span>} value={n.cornerRadius} min={0} onCommit={(cornerRadius) => set({ cornerRadius }, 'Corner radius')} />}
        {n.type === 'polygon' && <NumberField label="Sides" value={n.sides} min={3} max={64} onCommit={(sides) => set({ sides: Math.round(sides) }, 'Polygon sides')} />}
        {n.type === 'sticky' && <NumberField label="Text" value={n.fontSize} min={6} suffix="px" onCommit={(fontSize) => set({ fontSize }, 'Font size')} />}
      </div>
      {n.type === 'frame' && (
        <div className="mt-1.5">
          <Check label="Clip content" checked={n.clip} onChange={(clip) => set({ clip }, 'Clip content')} title="Hide children outside the frame" />
        </div>
      )}
    </Section>
  );
}

const FONTS = ['Inter', 'Segoe UI', 'Georgia', 'Times New Roman', 'Arial', 'Consolas', 'Courier New', 'Trebuchet MS', 'Verdana'];
const WEIGHTS: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

export function TextSection({ node: n, set }: { node: Extract<Node, { type: 'text' }>; set: SetProps }) {
  const fonts = FONTS.includes(n.fontFamily) ? FONTS : [n.fontFamily, ...FONTS];
  return (
    <Section title="Text">
      <div className="space-y-2">
        <textarea key={n.id + n.text} defaultValue={n.text} rows={2} aria-label="Text content"
          onBlur={(e) => { if (e.target.value !== n.text) set({ text: e.target.value }, 'Edit text'); }}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full resize-y rounded-lg bg-panel-2 px-2 py-1.5 text-[12px] ring-1 ring-transparent focus:ring-accent" />
        <Select title="Font" value={n.fontFamily} onChange={(fontFamily) => set({ fontFamily }, 'Font')} options={fonts.map((f) => ({ value: f, label: f }))} />
        <div className="grid grid-cols-2 gap-2">
          <Select title="Weight" value={String(n.fontWeight)} onChange={(w) => set({ fontWeight: Number(w) }, 'Font weight')}
            options={Object.entries(WEIGHTS).map(([w, label]) => ({ value: w, label }))} />
          <NumberField label="Size" value={n.fontSize} min={1} onCommit={(fontSize) => set({ fontSize }, 'Font size')} />
          <NumberField label={<span title="Line height (× font size)">Line</span>} value={n.lineHeight} min={0.5} step={0.05} onCommit={(lineHeight) => set({ lineHeight }, 'Line height')} />
          <NumberField label={<span title="Letter spacing (px)">Track</span>} value={n.letterSpacing} step={0.1} onCommit={(letterSpacing) => set({ letterSpacing }, 'Letter spacing')} />
        </div>
        <Segmented value={n.textAlign} onChange={(textAlign) => set({ textAlign }, 'Text align')} options={[
          { value: 'left', label: <TextAlignStart size={14} />, title: 'Align text left' },
          { value: 'center', label: <TextAlignCenter size={14} />, title: 'Align text centre' },
          { value: 'right', label: <TextAlignEnd size={14} />, title: 'Align text right' },
        ]} />
      </div>
    </Section>
  );
}

/** A list section (fills, strokes, effects): + adds, each row has show/hide and remove. */
function ListSection<T extends { visible: boolean }>({ title, items, onChange, add, render }: {
  title: string; items: T[]; onChange: (v: T[]) => void; add: ReactNode; render: (item: T, update: (p: Partial<T>) => void, i: number) => ReactNode;
}) {
  return (
    <Section title={title} action={add}>
      {items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((item, i) => (
            <div key={i} className={item.visible ? '' : 'opacity-55'}>
              {render(item, (p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x))), i)}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function RowTools<T extends { visible: boolean }>({ items, i, onChange }: { items: T[]; i: number; onChange: (v: T[]) => void }) {
  const item = items[i]!;
  return (
    <>
      <IconButton title={item.visible ? 'Hide' : 'Show'} className="h-7 w-7 shrink-0" onClick={() => onChange(items.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)))}>
        {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </IconButton>
      <IconButton title="Remove" className="h-7 w-7 shrink-0" onClick={() => onChange(items.filter((_, j) => j !== i))}><Minus size={13} /></IconButton>
    </>
  );
}

const addButton = (title: string, onClick: () => void) => <IconButton title={title} className="h-7 w-7" onClick={onClick}><Plus size={14} /></IconButton>;

export function FillSection({ node: n, set }: { node: Extract<Node, { fills: Paint[] }>; set: SetProps }) {
  const onChange = (fills: Paint[]) => set({ fills }, 'Fill');
  const fresh = (): Paint => ({ type: 'solid', color: hexToColor(n.type === 'text' ? '#111111' : n.type === 'sticky' ? '#fde68a' : n.fills.length ? '#000000' : '#d4d4d8'), visible: true });
  return (
    <ListSection title="Fill" items={n.fills} onChange={onChange} add={addButton('Add fill', () => onChange([...n.fills, fresh()]))}
      render={(p, u, i) => (
        <div className="flex items-center gap-1">
          <ColorField color={p.color} onCommit={(color) => u({ color })} />
          <RowTools items={n.fills} i={i} onChange={onChange} />
        </div>
      )} />
  );
}

export function StrokeSection({ node: n, set }: { node: Extract<Node, { strokes: Stroke[] }>; set: SetProps }) {
  const onChange = (strokes: Stroke[]) => set({ strokes }, 'Stroke');
  return (
    <ListSection title="Stroke" items={n.strokes} onChange={onChange}
      add={addButton('Add stroke', () => onChange([...n.strokes, { color: hexToColor('#18181b'), width: 1, align: 'inside', visible: true }]))}
      render={(s, u, i) => (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <ColorField color={s.color} onCommit={(color) => u({ color })} />
            <RowTools items={n.strokes} i={i} onChange={onChange} />
          </div>
          <div className="grid grid-cols-2 gap-2 pr-[60px]">
            {n.type === 'path'
              ? <div className="flex h-8 items-center px-1 text-[11px] text-fg-subtle">Centred on the path</div>
              : <Select title="Stroke position" value={s.align} onChange={(align) => u({ align })} options={[{ value: 'inside', label: 'Inside' }, { value: 'center', label: 'Center' }, { value: 'outside', label: 'Outside' }]} />}
            <NumberField label={<span title="Weight">W</span>} value={s.width} min={0} step={0.5} onCommit={(width) => u({ width })} />
          </div>
        </div>
      )} />
  );
}

const EFFECTS: Array<{ type: EffectType; label: string; icon: ReactNode }> = [
  { type: 'drop-shadow', label: 'Drop shadow', icon: <Square size={14} /> },
  { type: 'inner-shadow', label: 'Inner shadow', icon: <SquareDashed size={14} /> },
  { type: 'layer-blur', label: 'Layer blur', icon: <CircleDashed size={14} /> },
  { type: 'background-blur', label: 'Background blur', icon: <Circle size={14} /> },
];

function makeEffect(type: EffectType, from?: Effect): Effect {
  const color = from && 'color' in from ? from.color : { ...hexToColor('#000000'), a: type === 'inner-shadow' ? 0.25 : 0.15 };
  if (type === 'layer-blur' || type === 'background-blur') return { type, radius: from && 'radius' in from ? from.radius : from && 'blur' in from ? from.blur : type === 'layer-blur' ? 4 : 16, visible: from?.visible ?? true };
  const base = from && 'x' in from ? { x: from.x, y: from.y, blur: from.blur } : type === 'inner-shadow' ? { x: 0, y: 2, blur: 4 } : { x: 0, y: 4, blur: 16 };
  return { type, ...base, color, visible: from?.visible ?? true };
}

export function EffectsSection({ node: n, set }: { node: Extract<Node, { effects: Effect[] }>; set: SetProps }) {
  const onChange = (effects: Effect[]) => set({ effects }, 'Effects');
  return (
    <ListSection title="Effects" items={n.effects} onChange={onChange}
      add={<MenuButton title="Add effect" className="h-7 w-7" items={EFFECTS.map((e) => ({ label: e.label, icon: e.icon, onSelect: () => onChange([...n.effects, makeEffect(e.type)]) }))}><Plus size={14} /></MenuButton>}
      render={(fx, u, i) => (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Select title="Effect type" value={fx.type} onChange={(type) => onChange(n.effects.map((x, j) => (j === i ? makeEffect(type, x) : x)))}
              options={EFFECTS.map((e) => ({ value: e.type, label: e.label }))} />
            <RowTools items={n.effects} i={i} onChange={onChange} />
          </div>
          {fx.type === 'drop-shadow' || fx.type === 'inner-shadow' ? (
            <>
              <ColorField color={fx.color} onCommit={(color) => u({ color } as Partial<Effect>)} />
              <div className="grid grid-cols-3 gap-1.5">
                <NumberField label="X" value={fx.x} onCommit={(x) => u({ x } as Partial<Effect>)} />
                <NumberField label="Y" value={fx.y} onCommit={(y) => u({ y } as Partial<Effect>)} />
                <NumberField label={<span title="Blur">B</span>} value={fx.blur} min={0} onCommit={(blur) => u({ blur } as Partial<Effect>)} />
              </div>
            </>
          ) : (
            <NumberField label="Blur" value={fx.radius} min={0} suffix="px" onCommit={(radius) => u({ radius } as Partial<Effect>)} />
          )}
          {fx.type === 'background-blur' && !n.fills.some((f) => f.visible && f.color.a < 1) && (
            <p className="text-[11px] text-fg-subtle">Shows through a fill below 100% opacity.</p>
          )}
        </div>
      )} />
  );
}

export function TypeExtras({ node: n, set }: { node: Node; set: SetProps }) {
  if (n.type === 'embed') {
    return (
      <Section title="Web page">
        <input key={n.id + n.url} defaultValue={n.url} spellCheck={false} placeholder="https://" aria-label="Web page URL"
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== n.url) set({ url: /^https?:\/\//i.test(v) ? v : `https://${v}` }, 'Set web page URL'); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="h-8 w-full rounded-lg bg-panel-2 px-2 font-mono text-[11.5px] ring-1 ring-transparent focus:ring-accent" />
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {([['Desktop', 1440, 900], ['Tablet', 834, 1112], ['Phone', 390, 844]] as const).map(([label, width, height]) => (
            <button key={label} onClick={() => set({ width, height }, 'Resize web page')} className="h-7 rounded-lg bg-panel-2 text-[11.5px] text-fg-muted hover:bg-panel-3 hover:text-fg">{label}</button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-fg-subtle">Double-click the page to scroll and click inside it. Esc or a click on the canvas leaves it.</p>
      </Section>
    );
  }
  if (n.type === 'image') {
    return (
      <Section title="Image">
        <Select title="Fit" value={n.fit} onChange={(fit) => set({ fit }, 'Image fit')}
          options={[{ value: 'crop', label: 'Fill (crop)' }, { value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Stretch' }]} />
      </Section>
    );
  }
  if (n.type === 'path') {
    return (
      <Section title="Vector">
        <div className="grid grid-cols-2 gap-2">
          <Select title="Line cap" value={n.lineCap} onChange={(lineCap) => set({ lineCap }, 'Line cap')}
            options={[{ value: 'round', label: 'Round cap' }, { value: 'butt', label: 'Flat cap' }, { value: 'square', label: 'Square cap' }]} />
          <Select title="Line join" value={n.lineJoin} onChange={(lineJoin) => set({ lineJoin }, 'Line join')}
            options={[{ value: 'round', label: 'Round join' }, { value: 'miter', label: 'Miter join' }, { value: 'bevel', label: 'Bevel join' }]} />
          <Select title="Fill rule" value={n.fillRule} onChange={(fillRule) => set({ fillRule }, 'Fill rule')}
            options={[{ value: 'nonzero', label: 'Non-zero' }, { value: 'evenodd', label: 'Even-odd' }]} />
        </div>
      </Section>
    );
  }
  return null;
}
