import type { ReactNode } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowDown, ArrowRight, Eye, EyeOff, LayoutGrid, Minus, PanelRightClose, Plus, TextAlignCenter, TextAlignEnd, TextAlignStart,
} from 'lucide-react';
import { hexToColor, type Node, type Paint, type Shadow, type Stroke } from '@archa/schema';
import type { Op } from '@archa/schema';
import { commit, exportNode, togglePanel, useStore } from '../lib/store';
import { originOf, selectionBounds } from '../lib/geometry';
import { cn, ColorField, IconButton, NumberField, Section, Segmented, Select } from './controls';
import { CommentsPanel } from './CommentsPanel';

const patchAll = (ids: string[], patch: Record<string, unknown>, label: string) =>
  commit(label, ids.map((id) => ({ op: 'update' as const, id, patch })));

export const RIGHT_WIDTH = 280;

/* Right sidebar: collapses to zero width (Ctrl+Shift+\ or its header button); content keeps its width while animating. */
export function RightPanel() {
  const open = useStore((s) => s.rightOpen);
  const commenting = useStore((s) => s.tool === 'comment');
  return (
    <div aria-hidden={!open} style={{ width: open ? RIGHT_WIDTH + 8 : 0 }}
      className="flex shrink-0 justify-end overflow-hidden transition-[width] duration-200 ease-out">
      <aside style={{ width: RIGHT_WIDTH }} className={cn('flex shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-opacity duration-150', !open && 'opacity-0')}>
        {commenting ? <CommentsPanel /> : <DesignPanel />}
      </aside>
    </div>
  );
}

function DesignPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const docs = useStore((s) => s.docs);
  const activeDocId = useStore((s) => s.activeDocId);
  const client = useStore((s) => s.client);
  const nodes = doc ? selection.map((id) => doc.get(id)).filter((n): n is Node => !!n) : [];
  const summary = docs.find((d) => d.id === activeDocId);
  const title = nodes.length > 1 ? `${nodes.length} selected` : nodes.length === 1 ? nodes[0]!.name : 'Design';

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1.5">
        <span className="h-3 w-[3px] shrink-0 rounded-full bg-accent" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{title}</span>
        <button title="Hide design panel (Ctrl+Shift+\)" onClick={() => togglePanel('right', false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg">
          <PanelRightClose size={15} />
        </button>
      </div>
      {doc && <div className="min-h-0 flex-1 overflow-y-auto">
        {nodes.length === 0 && (
          <>
            <Section title="Document">
              <input defaultValue={summary?.name} key={summary?.id}
                onBlur={(e) => { if (activeDocId && e.target.value.trim()) void client?.call('doc.rename', { docId: activeDocId, name: e.target.value.trim() }); }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="h-8 w-full rounded-lg bg-panel-2 px-2 text-[12.5px]" />
              <p className="mt-2 truncate text-[11px] text-fg-subtle">{summary?.filePath ?? 'Not saved yet · Ctrl+S'}</p>
            </Section>
            <Section title="Shortcuts">
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[11.5px] text-fg-muted">
                {[['Frame / Rect / Ellipse / Text', 'F R O T'], ['Pen / Sticky / Web page / Comment', 'P S B C'], ['Move / Scale / Hand', 'V K H'], ['Find layer', 'Ctrl+F'], ['Wrap selection in auto-layout', 'Shift+A'], ['Group into frame', 'Ctrl+Alt+G'], ['Duplicate', 'Ctrl+D'], ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z'], ['Zoom to fit', 'Shift+1'], ['Pan', 'Space + drag'], ['Deep select', 'Ctrl+click'], ['Toggle left / right sidebar', 'Ctrl+\\ / Ctrl+Shift+\\']].map(([a, b]) => (
                  <div key={a} className="contents"><dt>{a}</dt><dd className="text-right font-mono text-[10.5px] text-fg-subtle">{b}</dd></div>
                ))}
              </dl>
            </Section>
          </>
        )}
        {nodes.length > 1 && <MultiSection ids={selection} />}
        {nodes.length === 1 && <NodeSections node={nodes[0]!} />}
      </div>}
    </>
  );
}

function AlignRow({ ids }: { ids: string[] }) {
  const doc = useStore((s) => s.doc)!;
  const align = (mode: 'l' | 'hc' | 'r' | 't' | 'vc' | 'b') => {
    const single = ids.length === 1;
    const parentId = doc.get(ids[0]!)?.parentId;
    const ref = single ? (parentId && doc.get(parentId)?.type !== 'page' ? doc.worldBounds(parentId) : null) : selectionBounds(doc, ids);
    if (!ref) return;
    const ops: Op[] = ids.map((id) => {
      const n = doc.require(id);
      const b = doc.worldBounds(id);
      const o = originOf(doc, n.parentId!);
      const x = mode === 'l' ? ref.x : mode === 'hc' ? ref.x + (ref.width - b.width) / 2 : mode === 'r' ? ref.x + ref.width - b.width : b.x;
      const y = mode === 't' ? ref.y : mode === 'vc' ? ref.y + (ref.height - b.height) / 2 : mode === 'b' ? ref.y + ref.height - b.height : b.y;
      return { op: 'update', id, patch: { x: Math.round(x - o.x), y: Math.round(y - o.y) } };
    });
    void commit('Align', ops);
  };
  const items: Array<[typeof AlignStartVertical, 'l' | 'hc' | 'r' | 't' | 'vc' | 'b', string]> = [
    [AlignStartVertical, 'l', 'Align left'], [AlignCenterVertical, 'hc', 'Align horizontal centers'], [AlignEndVertical, 'r', 'Align right'],
    [AlignStartHorizontal, 't', 'Align top'], [AlignCenterHorizontal, 'vc', 'Align vertical centers'], [AlignEndHorizontal, 'b', 'Align bottom'],
  ];
  return (
    <div className="flex justify-between rounded-lg bg-panel-2 p-0.5">
      {items.map(([Icon, m, t]) => <IconButton key={m} title={t} onClick={() => align(m)} className="h-7 w-7"><Icon size={14} /></IconButton>)}
    </div>
  );
}

function MultiSection({ ids }: { ids: string[] }) {
  return (
    <Section title={`${ids.length} layers selected`}>
      <AlignRow ids={ids} />
    </Section>
  );
}

function NodeSections({ node: n }: { node: Node }) {
  const doc = useStore((s) => s.doc)!;
  const set = (patch: Record<string, unknown>, label = 'Edit') => void patchAll([n.id], patch, label);
  const parent = n.parentId ? doc.get(n.parentId) : undefined;
  const inLayout = parent?.type === 'frame' && parent.layout !== 'none' && !n.absolute;
  const sizingOpts = [
    { value: 'fixed' as const, label: 'Fixed' }, { value: 'hug' as const, label: 'Hug' },
    ...(inLayout ? [{ value: 'fill' as const, label: 'Fill' }] : []),
  ];

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-accent-fg">{n.type}</span>
        <input key={n.id + n.name} defaultValue={n.name}
          onBlur={(e) => { if (e.target.value && e.target.value !== n.name) set({ name: e.target.value }, 'Rename'); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[13px] font-medium hover:bg-panel-2 focus:bg-panel-2" />
      </div>

      <Section title="Alignment"><AlignRow ids={[n.id]} /></Section>

      <Section title="Position">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={n.x} disabled={inLayout} onCommit={(x) => set({ x }, 'Move')} />
          <NumberField label="Y" value={n.y} disabled={inLayout} onCommit={(y) => set({ y }, 'Move')} />
        </div>
        {inLayout && <p className="mt-1.5 text-[11px] text-fg-subtle">Positioned by the parent's auto layout.</p>}
      </Section>

      <Section title="Dimensions">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="W" value={n.width} min={0} disabled={n.sizing.horizontal !== 'fixed'} onCommit={(width) => set({ width }, 'Resize')} />
          <NumberField label="H" value={n.height} min={0} disabled={n.sizing.vertical !== 'fixed'} onCommit={(height) => set({ height }, 'Resize')} />
          <Select title="Horizontal sizing" value={n.sizing.horizontal} options={sizingOpts} onChange={(v) => set({ sizing: { ...n.sizing, horizontal: v } }, 'Sizing')} />
          <Select title="Vertical sizing" value={n.sizing.vertical} options={sizingOpts} onChange={(v) => set({ sizing: { ...n.sizing, vertical: v } }, 'Sizing')} />
        </div>
      </Section>

      {n.type === 'frame' && (
        <Section title="Auto layout" action={
          n.layout === 'none'
            ? <IconButton title="Add auto layout (Shift+A)" className="h-6 w-6" onClick={() => set({ layout: 'column', sizing: { horizontal: 'hug', vertical: 'hug' } }, 'Add auto layout')}><Plus size={14} /></IconButton>
            : <IconButton title="Remove auto layout" className="h-6 w-6" onClick={() => set({ layout: 'none' }, 'Remove auto layout')}><Minus size={14} /></IconButton>
        }>
          {n.layout !== 'none' && (
            <div className="space-y-2">
              <Segmented value={n.layout} onChange={(layout) => set({ layout }, 'Layout direction')} options={[
                { value: 'column', label: <ArrowDown size={14} />, title: 'Vertical' },
                { value: 'row', label: <ArrowRight size={14} />, title: 'Horizontal' },
              ]} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Gap" value={n.gap} min={0} onCommit={(gap) => set({ gap }, 'Gap')} />
                <NumberField label="Pad" value={n.padding.top === n.padding.left && n.padding.left === n.padding.right && n.padding.right === n.padding.bottom ? n.padding.top : null}
                  min={0} onCommit={(p) => set({ padding: { top: p, right: p, bottom: p, left: p } }, 'Padding')} />
                <NumberField label="T" value={n.padding.top} min={0} onCommit={(top) => set({ padding: { ...n.padding, top } }, 'Padding')} />
                <NumberField label="B" value={n.padding.bottom} min={0} onCommit={(bottom) => set({ padding: { ...n.padding, bottom } }, 'Padding')} />
                <NumberField label="L" value={n.padding.left} min={0} onCommit={(left) => set({ padding: { ...n.padding, left } }, 'Padding')} />
                <NumberField label="R" value={n.padding.right} min={0} onCommit={(right) => set({ padding: { ...n.padding, right } }, 'Padding')} />
                <Select title="Cross-axis alignment" value={n.align} onChange={(align) => set({ align }, 'Align items')}
                  options={[{ value: 'start', label: 'Align start' }, { value: 'center', label: 'Align center' }, { value: 'end', label: 'Align end' }]} />
                <Select title="Main-axis distribution" value={n.justify} onChange={(justify) => set({ justify }, 'Justify')}
                  options={[{ value: 'start', label: 'Pack start' }, { value: 'center', label: 'Pack center' }, { value: 'end', label: 'Pack end' }, { value: 'space-between', label: 'Space between' }]} />
              </div>
            </div>
          )}
          {n.layout === 'none' && <p className="text-[11px] text-fg-subtle"><LayoutGrid size={11} className="mr-1 inline" />Children are positioned freely.</p>}
        </Section>
      )}

      <Section title="Appearance">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Opacity" value={Math.round(n.opacity * 100)} min={0} max={100} suffix="%" onCommit={(v) => set({ opacity: v / 100 }, 'Opacity')} />
          {'cornerRadius' in n && <NumberField label="Radius" value={n.cornerRadius} min={0} onCommit={(cornerRadius) => set({ cornerRadius }, 'Corner radius')} />}
          {n.type === 'polygon' && <NumberField label="Sides" value={n.sides} min={3} max={64} onCommit={(sides) => set({ sides: Math.round(sides) }, 'Polygon sides')} />}
          {n.type === 'sticky' && <NumberField label="Text" value={n.fontSize} min={6} suffix="px" onCommit={(fontSize) => set({ fontSize }, 'Font size')} />}
        </div>
        {n.type === 'frame' && (
          <label className="mt-2 flex items-center gap-2 text-[12px] text-fg-muted">
            <input type="checkbox" checked={n.clip} onChange={(e) => set({ clip: e.target.checked }, 'Clip content')} className="accent-accent" />Clip content
          </label>
        )}
      </Section>

      {n.type === 'text' && <TextSection node={n} set={set} />}
      {n.type === 'embed' && (
        <Section title="Web page">
          <input key={n.id + n.url} defaultValue={n.url} spellCheck={false} placeholder="https://"
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== n.url) set({ url: /^https?:\/\//i.test(v) ? v : `https://${v}` }, 'Set web page URL'); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="h-8 w-full rounded-lg bg-panel-2 px-2 font-mono text-[11.5px]" />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[['Desktop', 1440, 900], ['Tablet', 834, 1112], ['Phone', 390, 844]].map(([label, width, height]) => (
              <button key={label} onClick={() => set({ width, height }, 'Resize web page')} className="h-7 rounded-lg bg-panel-2 text-[11.5px] text-fg-muted hover:bg-panel-3 hover:text-fg">{label}</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-fg-subtle">Double-click the page to scroll and click inside it. Esc or a click on the canvas leaves it.</p>
        </Section>
      )}
      {n.type === 'image' && (
        <Section title="Image">
          <Select title="Fit" value={n.fit} onChange={(fit) => set({ fit }, 'Image fit')}
            options={[{ value: 'crop', label: 'Fill (crop)' }, { value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Stretch' }]} />
        </Section>
      )}
      {n.type === 'path' && (
        <Section title="Vector">
          <div className="grid grid-cols-2 gap-2">
            <Select title="Line cap" value={n.lineCap} onChange={(lineCap) => set({ lineCap }, 'Line cap')}
              options={[{ value: 'round', label: 'Round cap' }, { value: 'butt', label: 'Flat cap' }, { value: 'square', label: 'Square cap' }]} />
            <Select title="Fill rule" value={n.fillRule} onChange={(fillRule) => set({ fillRule }, 'Fill rule')}
              options={[{ value: 'nonzero', label: 'Non-zero' }, { value: 'evenodd', label: 'Even-odd' }]} />
          </div>
        </Section>
      )}
      {'fills' in n && <PaintList title="Fill" items={n.fills} onChange={(fills) => set({ fills }, 'Fill')} make={(): Paint => ({ type: 'solid', color: hexToColor(n.type === 'text' ? '#111111' : n.type === 'sticky' ? '#fde68a' : '#d4d4d8'), visible: true })} />}
      {'strokes' in n && <StrokeList items={n.strokes} onChange={(strokes) => set({ strokes }, 'Stroke')} />}
      {'effects' in n && <ShadowList items={n.effects} onChange={(effects) => set({ effects }, 'Effects')} />}

      <Section title="Export">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void exportNode(n.id, 'png')} className="h-8 rounded-lg bg-panel-2 text-[12px] hover:bg-panel-3">PNG @2x</button>
          <button onClick={() => void exportNode(n.id, 'svg')} className="h-8 rounded-lg bg-panel-2 text-[12px] hover:bg-panel-3">SVG</button>
        </div>
      </Section>
    </>
  );
}

function TextSection({ node: n, set }: { node: Extract<Node, { type: 'text' }>; set: (p: Record<string, unknown>, l?: string) => void }) {
  return (
    <Section title="Text">
      <div className="space-y-2">
        <Select title="Font" value={n.fontFamily} onChange={(fontFamily) => set({ fontFamily }, 'Font')}
          options={['Inter', 'Segoe UI', 'Georgia', 'Times New Roman', 'Arial', 'Consolas', 'Courier New', 'Trebuchet MS', 'Verdana'].map((f) => ({ value: f, label: f }))} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Size" value={n.fontSize} min={1} onCommit={(fontSize) => set({ fontSize }, 'Font size')} />
          <Select title="Weight" value={String(n.fontWeight)} onChange={(w) => set({ fontWeight: Number(w) }, 'Font weight')}
            options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }[w]! }))} />
          <NumberField label="Line" value={n.lineHeight} min={0.5} step={0.05} onCommit={(lineHeight) => set({ lineHeight }, 'Line height')} />
          <NumberField label="Track" value={n.letterSpacing} step={0.1} onCommit={(letterSpacing) => set({ letterSpacing }, 'Letter spacing')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Segmented value={n.textAlign} onChange={(textAlign) => set({ textAlign }, 'Text align')} options={[
            { value: 'left', label: <TextAlignStart size={14} />, title: 'Left' },
            { value: 'center', label: <TextAlignCenter size={14} />, title: 'Center' },
            { value: 'right', label: <TextAlignEnd size={14} />, title: 'Right' },
          ]} />
          <Select title="Text sizing" value={n.textSizing} onChange={(textSizing) => set({ textSizing }, 'Text sizing')}
            options={[{ value: 'auto-width', label: 'Auto width' }, { value: 'auto-height', label: 'Auto height' }, { value: 'fixed', label: 'Fixed' }]} />
        </div>
        <textarea key={n.id + n.text} defaultValue={n.text} rows={2}
          onBlur={(e) => { if (e.target.value !== n.text) set({ text: e.target.value }, 'Edit text'); }}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full resize-y rounded-lg bg-panel-2 px-2 py-1.5 text-[12px]" />
      </div>
    </Section>
  );
}

function ListSection<T extends { visible: boolean }>({ title, items, onChange, make, render }: {
  title: string; items: T[]; onChange: (v: T[]) => void; make: () => T; render: (item: T, update: (p: Partial<T>) => void) => ReactNode;
}) {
  return (
    <Section title={title} action={<IconButton title={`Add ${title.toLowerCase()}`} className="h-6 w-6" onClick={() => onChange([...items, make()])}><Plus size={14} /></IconButton>}>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">{render(item, (p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x))))}</div>
              <IconButton title={item.visible ? 'Hide' : 'Show'} className="h-7 w-7" onClick={() => onChange(items.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)))}>
                {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </IconButton>
              <IconButton title="Remove" className="h-7 w-7" onClick={() => onChange(items.filter((_, j) => j !== i))}><Minus size={13} /></IconButton>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function PaintList({ title, items, onChange, make }: { title: string; items: Paint[]; onChange: (v: Paint[]) => void; make: () => Paint }) {
  return <ListSection title={title} items={items} onChange={onChange} make={make} render={(p, u) => <ColorField color={p.color} onCommit={(color) => u({ color })} />} />;
}

function StrokeList({ items, onChange }: { items: Stroke[]; onChange: (v: Stroke[]) => void }) {
  return (
    <ListSection title="Stroke" items={items} onChange={onChange} make={(): Stroke => ({ color: hexToColor('#18181b'), width: 1, align: 'inside', visible: true })}
      render={(s, u) => (
        <div className="space-y-1.5">
          <ColorField color={s.color} onCommit={(color) => u({ color })} />
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField label="W" value={s.width} min={0} step={0.5} onCommit={(width) => u({ width })} />
            <Select value={s.align} onChange={(align) => u({ align })} options={[{ value: 'inside', label: 'Inside' }, { value: 'center', label: 'Center' }, { value: 'outside', label: 'Outside' }]} />
          </div>
        </div>
      )} />
  );
}

function ShadowList({ items, onChange }: { items: Shadow[]; onChange: (v: Shadow[]) => void }) {
  return (
    <ListSection title="Effects" items={items} onChange={onChange} make={(): Shadow => ({ type: 'drop-shadow', x: 0, y: 4, blur: 16, color: { ...hexToColor('#000000'), a: 0.15 }, visible: true })}
      render={(s, u) => (
        <div className="space-y-1.5">
          <ColorField color={s.color} onCommit={(color) => u({ color })} />
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="X" value={s.x} onCommit={(x) => u({ x })} />
            <NumberField label="Y" value={s.y} onCommit={(y) => u({ y })} />
            <NumberField label="B" value={s.blur} min={0} onCommit={(blur) => u({ blur })} />
          </div>
        </div>
      )} />
  );
}
