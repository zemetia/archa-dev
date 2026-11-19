import {
  Circle, Diamond, Frame, Globe, Group, Image as ImageIcon, PanelRightClose, PenTool, Square, StickyNote, Triangle, Type, Workflow, type LucideIcon,
} from 'lucide-react';
import type { Node, NodeType } from '@archa/schema';
import { togglePanel, useStore } from '../lib/store';
import { cn, Section } from './controls';
import { CommentsPanel } from './CommentsPanel';
import { AlignmentSection, ArrangeSection, DimensionsSection, LayoutSection, PositionSection } from './inspector/ArrangeSections';
import { AppearanceSection, EffectsSection, FillSection, StrokeSection, TextSection, TypeExtras } from './inspector/StyleSections';
import { CodeSection, ComponentRow, ContextSection, ExportSection } from './inspector/OutputSections';
import { patchNodes } from './inspector/shared';

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

const TYPE_ICONS: Record<NodeType, LucideIcon> = {
  page: Frame, frame: Frame, group: Group, rect: Square, ellipse: Circle, text: Type, polygon: Triangle, path: PenTool, image: ImageIcon, sticky: StickyNote, embed: Globe, connector: Workflow,
};

function DesignPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const nodes = doc ? selection.map((id) => doc.get(id)).filter((n): n is Node => !!n) : [];
  const single = nodes.length === 1 ? nodes[0]! : null;

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line pl-3 pr-1.5">
        {single ? <NameField node={single} /> : (
          <>
            <span className="h-3 w-[3px] shrink-0 rounded-full bg-accent" />
            <span className="min-w-0 flex-1 truncate pl-1 text-[12.5px] font-semibold">{nodes.length > 1 ? `${nodes.length} layers` : 'Design'}</span>
          </>
        )}
        <button title="Hide design panel (Ctrl+Shift+\)" aria-label="Hide design panel" onClick={() => togglePanel('right', false)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg">
          <PanelRightClose size={15} />
        </button>
      </div>
      {doc && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {nodes.length === 0 && <DocumentSections />}
          {nodes.length > 1 && (
            <>
              <AlignmentSection ids={selection} />
              <ArrangeSection ids={selection} />
            </>
          )}
          {single && <NodeSections key={single.id} node={single} />}
        </div>
      )}
    </>
  );
}

/** Layer name with its type icon, renamed in place. Components get the accent diamond. */
function NameField({ node: n }: { node: Node }) {
  const Icon = n.meta?.component ? Diamond : TYPE_ICONS[n.type];
  return (
    <>
      <span title={n.type} className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', n.meta?.component || n.meta?.instanceOf ? 'text-accent-fg' : 'text-fg-subtle')}>
        <Icon size={14} />
      </span>
      <input key={n.id + n.name} defaultValue={n.name} aria-label="Layer name" spellCheck={false}
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== n.name) void patchNodes([n.id], { name: v }, 'Rename'); else e.target.value = n.name; }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = n.name; (e.target as HTMLInputElement).blur(); } }}
        className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] font-semibold ring-1 ring-transparent hover:bg-panel-2 focus:bg-panel-2 focus:ring-accent" />
    </>
  );
}

function NodeSections({ node: n }: { node: Node }) {
  const set = (patch: Record<string, unknown>, label = 'Edit') => void patchNodes([n.id], patch, label);
  return (
    <>
      <ComponentRow node={n} />
      <ContextSection node={n} />
      {/* A connector's box comes from its ends: it gets line controls instead of position and size. */}
      {n.type !== 'connector' && <>
        <AlignmentSection ids={[n.id]} />
        <PositionSection node={n} />
        {n.type === 'frame' && <LayoutSection node={n} />}
        <DimensionsSection node={n} />
      </>}
      <AppearanceSection node={n} set={set} />
      {n.type === 'text' && <TextSection node={n} set={set} />}
      <TypeExtras node={n} set={set} />
      {'fills' in n && <FillSection node={n} set={set} />}
      {'strokes' in n && <StrokeSection node={n} set={set} />}
      {'effects' in n && <EffectsSection node={n} set={set} />}
      <CodeSection nodeId={n.id} />
      <ExportSection nodeId={n.id} />
    </>
  );
}

function DocumentSections() {
  const docs = useStore((s) => s.docs);
  const activeDocId = useStore((s) => s.activeDocId);
  const client = useStore((s) => s.client);
  const summary = docs.find((d) => d.id === activeDocId);
  return (
    <>
      <Section title="Document">
        <input defaultValue={summary?.name} key={summary?.id} aria-label="Document name"
          onBlur={(e) => { if (activeDocId && e.target.value.trim()) void client?.call('doc.rename', { docId: activeDocId, name: e.target.value.trim() }); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="h-8 w-full rounded-lg bg-panel-2 px-2 text-[12.5px] ring-1 ring-transparent focus:ring-accent" />
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
  );
}
