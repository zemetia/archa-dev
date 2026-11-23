import { useState } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalDistributeCenter, ArrowDown, ArrowRight, Frame, LayoutGrid, Maximize2, Minus, MoveHorizontal, MoveVertical, Plus, SquareDashed,
} from 'lucide-react';
import { alignOps, distributeOps, inAutoLayout, placementOf, placementPatch, type AlignEdge, type Place } from '@archa/core';
import type { FrameNode, Node } from '@archa/schema';
import { commit, toast, useStore } from '../../lib/store';
import { wrapInFrame } from '../../lib/commands';
import { normalizeAngle } from '../../lib/geometry';
import { Check, cn, IconButton, NumberField, Section } from '../controls';
import { patchNodes } from './shared';

/* Arrange sections of the design panel: alignment, position, auto layout and dimensions (blueprint APP_UI/04). */

const EDGES: Array<[typeof AlignStartVertical, AlignEdge, string]> = [
  [AlignStartVertical, 'left', 'Align left'], [AlignCenterVertical, 'center', 'Align horizontal centres'], [AlignEndVertical, 'right', 'Align right'],
  [AlignStartHorizontal, 'top', 'Align top'], [AlignCenterHorizontal, 'middle', 'Align vertical centres'], [AlignEndHorizontal, 'bottom', 'Align bottom'],
];

/** Runs a core arrange command; when nothing moves, says why instead of failing silently. */
async function run(label: string, r: { ops: Parameters<typeof commit>[1]; notes: string[] }) {
  if (r.ops.length) await commit(label, r.ops);
  else if (r.notes.length) toast(r.notes[0]!);
}

export function AlignmentSection({ ids }: { ids: string[] }) {
  const doc = useStore((s) => s.doc)!;
  const nodes = ids.map((id) => doc.get(id)).filter((n): n is Node => !!n);
  const single = nodes.length === 1 ? nodes[0]! : null;
  // A lone layer on the page has nothing to align to (its parent is the page, which has no bounds).
  const lonely = !!single && doc.get(single.parentId!)?.type === 'page';
  const flowParent = single && inAutoLayout(doc, single) ? (doc.get(single.parentId!) as FrameNode) : null;
  const hint = lonely ? 'Put the layer in a frame, or select 2+ layers, to align it'
    : flowParent ? `Sets how "${flowParent.name}" places its children` : nodes.length > 1 ? 'Aligns to the selection bounds' : `Aligns inside "${doc.get(single?.parentId ?? '')?.name ?? 'parent'}"`;
  return (
    <Section title="Alignment" action={nodes.length > 1 && (
      <>
        <IconButton title="Distribute horizontal spacing" className="h-7 w-7" disabled={nodes.length < 3}
          onClick={() => void run('Distribute horizontally', distributeOps(doc, ids, 'horizontal'))}><AlignHorizontalDistributeCenter size={14} /></IconButton>
        <IconButton title="Distribute vertical spacing" className="h-7 w-7" disabled={nodes.length < 3}
          onClick={() => void run('Distribute vertically', distributeOps(doc, ids, 'vertical'))}><AlignVerticalDistributeCenter size={14} /></IconButton>
      </>
    )}>
      <div className="grid grid-cols-2 gap-2" title={hint}>
        {[EDGES.slice(0, 3), EDGES.slice(3)].map((group, i) => (
          <div key={i} className="flex justify-between rounded-lg bg-panel-2 p-0.5">
            {group.map(([Icon, edge, title]) => (
              <IconButton key={edge} title={`${title}${flowParent ? ' (auto layout)' : ''}`} disabled={lonely} className="h-7 flex-1"
                onClick={() => void run(title, alignOps(doc, ids, edge))}><Icon size={14} /></IconButton>
            ))}
          </div>
        ))}
      </div>
      {(lonely || flowParent) && <p className="mt-1.5 text-[11px] text-fg-subtle">{hint}.</p>}
    </Section>
  );
}

export function PositionSection({ node: n }: { node: Node }) {
  const doc = useStore((s) => s.doc)!;
  const flow = inAutoLayout(doc, n);
  const parent = doc.get(n.parentId ?? '');
  const inLayoutParent = parent?.type === 'frame' && parent.layout !== 'none';
  const set = (patch: Record<string, unknown>, label: string) => void patchNodes([n.id], patch, label);
  return (
    <Section title="Position">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={n.x} disabled={flow} onCommit={(x) => set({ x }, 'Move')} />
        <NumberField label="Y" value={n.y} disabled={flow} onCommit={(y) => set({ y }, 'Move')} />
        {n.type !== 'connector' && (
          <NumberField label="↻" value={n.rotation} min={-180} max={180} suffix="°" onCommit={(r) => set({ rotation: normalizeAngle(r) }, 'Rotate')} />
        )}
      </div>
      {inLayoutParent && (
        <div className="mt-1.5">
          <Check label="Ignore auto layout (absolute)" checked={n.absolute} onChange={(absolute) => set({ absolute }, absolute ? 'Absolute position' : 'Back in auto layout')}
            title={`Keep this layer's own X/Y inside "${parent.name}"`} />
        </div>
      )}
    </Section>
  );
}

const PLACES: Place[] = ['start', 'center', 'end'];

export function LayoutSection({ node: f }: { node: FrameNode }) {
  const set = (patch: Record<string, unknown>, label: string) => void patchNodes([f.id], patch, label);
  const on = f.layout !== 'none';
  const [sides, setSides] = useState(false);
  const p = f.padding;
  const perSide = sides || p.left !== p.right || p.top !== p.bottom;
  const place = placementOf(f);
  const distributed = f.justify === 'space-between' || f.justify === 'space-around';
  const mainIsH = f.layout === 'row';

  return (
    <Section title="Auto layout" action={
      on ? <IconButton title="Remove auto layout" className="h-7 w-7" onClick={() => set({ layout: 'none' }, 'Remove auto layout')}><Minus size={14} /></IconButton>
        : <IconButton title="Add auto layout (Shift+A)" className="h-7 w-7" onClick={() => set({ layout: 'column' }, 'Add auto layout')}><Plus size={14} /></IconButton>
    }>
      <div className="flex h-8 rounded-lg bg-panel-2 p-0.5">
        {([['none', <LayoutGrid key="n" size={14} />, 'Freeform — children keep their own X/Y'], ['column', <ArrowDown key="c" size={14} />, 'Vertical stack'], ['row', <ArrowRight key="r" size={14} />, 'Horizontal stack']] as const).map(([v, icon, title]) => (
          <button key={v} title={title} aria-pressed={f.layout === v} onClick={() => f.layout !== v && set({ layout: v }, v === 'none' ? 'Remove auto layout' : 'Layout direction')}
            className={cn('flex flex-1 items-center justify-center rounded-md text-fg-muted hover:text-fg', f.layout === v && 'bg-panel-3 text-fg shadow-sm')}>{icon}</button>
        ))}
      </div>

      {on && (
        <>
          <div className="mt-3 grid grid-cols-[88px_1fr] gap-3">
            <div>
              <div className="mb-1 text-[11px] text-fg-subtle">Align</div>
              <div className="grid h-[88px] grid-cols-3 grid-rows-3 rounded-lg bg-panel-2 p-1" role="grid" aria-label="Child alignment">
                {PLACES.map((v) => PLACES.map((h) => {
                  // A distributed main axis has no single position: every cell on the cross line lights up.
                  const active = (distributed ? (mainIsH ? place.vertical === v : place.horizontal === h) : place.horizontal === h && place.vertical === v);
                  return (
                    <button key={`${h}-${v}`} title={`${v === 'start' ? 'Top' : v === 'center' ? 'Middle' : 'Bottom'} ${h === 'start' ? 'left' : h === 'center' ? 'centre' : 'right'}`}
                      onClick={() => set(placementPatch(f, h, v), 'Align children')}
                      className="group flex items-center justify-center rounded-md hover:bg-panel-3">
                      <span className={cn('rounded-full transition-all', active ? 'h-2 w-2 bg-accent' : 'h-1 w-1 bg-fg-subtle group-hover:h-1.5 group-hover:w-1.5 group-hover:bg-fg-muted')} />
                    </button>
                  );
                }))}
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] text-fg-subtle">Gap</div>
              <NumberField label={mainIsH ? <MoveHorizontal size={12} /> : <MoveVertical size={12} />} value={f.gap} min={0} onCommit={(gap) => set({ gap }, 'Gap')} />
              <div className="mt-1.5 space-y-0.5">
                {(['space-between', 'space-around'] as const).map((j) => (
                  <Check key={j} label={j === 'space-between' ? 'Space between' : 'Space around'} checked={f.justify === j}
                    onChange={(v) => set({ justify: v ? j : 'start' }, 'Distribute children')} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField label={<span title={mainIsH ? 'Items per row before a new row (0 = one row) — like grid-template-columns' : 'Items per column before a new column (0 = one column) — like grid-template-rows'}>{mainIsH ? 'Cols' : 'Rows'}</span>}
              value={f.wrap} min={0} max={100} onCommit={(v) => set({ wrap: Math.round(v) }, 'Grid wrap')} />
            {f.wrap > 0 && (
              <NumberField label={<span title="Space between lines (null = same as gap)">{mainIsH ? <MoveVertical size={12} /> : <MoveHorizontal size={12} />}</span>}
                value={f.lineGap ?? f.gap} min={0} onCommit={(lineGap) => set({ lineGap }, 'Line gap')} />
            )}
          </div>

          <div className="mt-3 mb-1 flex items-center justify-between text-[11px] text-fg-subtle">
            Padding
            <IconButton title={perSide ? 'Same padding per axis' : 'Padding per side'} active={perSide} className="h-6 w-6"
              onClick={() => {
                if (perSide) { setSides(false); set({ padding: { top: p.top, bottom: p.top, left: p.left, right: p.left } }, 'Padding'); }
                else setSides(true);
              }}><SquareDashed size={12} /></IconButton>
          </div>
          {perSide ? (
            <div className="grid grid-cols-4 gap-1.5">
              {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
                <NumberField key={k} label={k[0]!.toUpperCase()} value={p[k]} min={0} onCommit={(v) => set({ padding: { ...p, [k]: v } }, 'Padding')} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label={<span title="Left and right">↔</span>} value={p.left} min={0} onCommit={(v) => set({ padding: { ...p, left: v, right: v } }, 'Padding')} />
              <NumberField label={<span title="Top and bottom">↕</span>} value={p.top} min={0} onCommit={(v) => set({ padding: { ...p, top: v, bottom: v } }, 'Padding')} />
            </div>
          )}
        </>
      )}
      {!on && <p className="mt-2 text-[11px] text-fg-subtle">Children keep their own position. Pick a direction to stack them.</p>}
    </Section>
  );
}

/** W/H plus the sizing modes as checkboxes: typing a size makes that axis fixed again. */
export function DimensionsSection({ node: n }: { node: Node }) {
  const doc = useStore((s) => s.doc)!;
  const set = (patch: Record<string, unknown>, label: string) => void patchNodes([n.id], patch, label);
  const parent = doc.get(n.parentId ?? '');
  const canFill = parent?.type === 'frame' && parent.layout !== 'none' && !n.absolute;
  const text = n.type === 'text' ? n : null;
  const canHug = (n.type === 'frame' && n.layout !== 'none') || !!text;
  const hugW = text ? text.textSizing === 'auto-width' && n.sizing.horizontal !== 'fill' : n.sizing.horizontal === 'hug';
  const hugH = text ? text.textSizing !== 'fixed' && n.sizing.vertical !== 'fill' : n.sizing.vertical === 'hug';
  const sizing = (axis: 'horizontal' | 'vertical', mode: 'fixed' | 'hug' | 'fill') => ({ ...n.sizing, [axis]: mode });

  const commitW = (width: number) => set(text ? { width, sizing: sizing('horizontal', 'fixed'), textSizing: text.textSizing === 'auto-width' ? 'auto-height' : text.textSizing } : { width, sizing: sizing('horizontal', 'fixed') }, 'Resize');
  const commitH = (height: number) => set(text ? { height, sizing: sizing('vertical', 'fixed'), textSizing: 'fixed' } : { height, sizing: sizing('vertical', 'fixed') }, 'Resize');
  const toggleHug = (axis: 'horizontal' | 'vertical', on: boolean) => {
    if (text) {
      const textSizing = axis === 'horizontal' ? (on ? 'auto-width' : 'auto-height') : on ? (hugW ? 'auto-width' : 'auto-height') : 'fixed';
      set({ textSizing, sizing: n.sizing[axis] === 'fill' ? sizing(axis, 'fixed') : n.sizing }, 'Text sizing');
    } else set({ sizing: sizing(axis, on ? 'hug' : 'fixed') }, 'Sizing');
  };
  const toggleFill = (axis: 'horizontal' | 'vertical', on: boolean) =>
    set({ sizing: sizing(axis, on ? 'fill' : 'fixed'), ...(text && on && axis === 'horizontal' ? { textSizing: 'auto-height' } : {}) }, 'Sizing');
  const hugTitle = canHug ? undefined : n.type === 'frame' ? 'Hug needs auto layout on this frame' : 'Only auto-layout frames and text can hug';
  const fillTitle = canFill ? undefined : 'Fill needs a parent with auto layout';

  return (
    <Section title="Dimensions">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="W" value={n.width} min={0} onCommit={commitW} />
        <NumberField label="H" value={n.height} min={0} onCommit={commitH} />
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2">
        <Check label="Fill width" checked={n.sizing.horizontal === 'fill'} disabled={!canFill} title={fillTitle} onChange={(v) => toggleFill('horizontal', v)} />
        <Check label="Fill height" checked={n.sizing.vertical === 'fill'} disabled={!canFill} title={fillTitle} onChange={(v) => toggleFill('vertical', v)} />
        <Check label="Hug width" checked={canHug && hugW} disabled={!canHug} title={hugTitle} onChange={(v) => toggleHug('horizontal', v)} />
        <Check label="Hug height" checked={canHug && hugH} disabled={!canHug} title={hugTitle} onChange={(v) => toggleHug('vertical', v)} />
      </div>
    </Section>
  );
}

/** Selection-wide arrange actions (several layers selected). */
export function ArrangeSection({ ids }: { ids: string[] }) {
  const doc = useStore((s) => s.doc)!;
  const nodes = ids.map((id) => doc.get(id)).filter((n): n is Node => !!n);
  const sameParent = nodes.every((n) => n.parentId === nodes[0]?.parentId);
  const opacity = nodes.every((n) => n.opacity === nodes[0]?.opacity) ? Math.round((nodes[0]?.opacity ?? 1) * 100) : null;
  return (
    <Section title="Arrange">
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!sameParent} onClick={() => void wrapInFrame(true)} title="Shift+A"
          className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-panel-2 text-[12px] text-fg-muted hover:bg-panel-3 hover:text-fg disabled:opacity-40"><Maximize2 size={13} />Auto layout</button>
        <button disabled={!sameParent} onClick={() => void wrapInFrame(false)} title="Ctrl+Alt+G"
          className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-panel-2 text-[12px] text-fg-muted hover:bg-panel-3 hover:text-fg disabled:opacity-40"><Frame size={13} />Frame</button>
      </div>
      {!sameParent && <p className="mt-1.5 text-[11px] text-fg-subtle">Wrapping needs layers with the same parent.</p>}
      <div className="mt-2">
        <NumberField label="Opacity" value={opacity} min={0} max={100} suffix="%" onCommit={(v) => void patchNodes(ids, { opacity: v / 100 }, 'Opacity')} />
      </div>
    </Section>
  );
}
