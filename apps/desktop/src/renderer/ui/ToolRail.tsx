import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check, ChevronDown, Circle, Code, Diamond, Frame, Globe, Hand, ImageUp, MessageCircle, MousePointer2,
  PanelLeft, PenTool, Scaling, Search, Shapes, Square, StickyNote, Triangle, Type,
} from 'lucide-react';
import { setTool, toast, togglePanel, toggleRailPanel, useStore, type Tool } from '../lib/store';
import { importImageOrSvg } from '../lib/importers';
import { cn, IconButton } from './controls';
import figmaLogo from '../assets/logos/figma.svg';

/** Figma's own mark (lucide has no brand icons). */
const FigmaMark = ({ size = 15 }: { size?: number }) => <img src={figmaLogo} alt="" width={size} height={size} className="opacity-80 grayscale" />;

type Item = { id: string; label: string; key?: string; icon: typeof Square; tool?: Tool; run?: () => void; soon?: boolean };

/** Single-key tool shortcuts (blueprint APP_UI/01 → Tool rail). */
export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select', k: 'scale', h: 'hand', r: 'rect', o: 'ellipse', p: 'pen', t: 'text', f: 'frame', s: 'sticky', b: 'embed', c: 'comment',
};

const POINTER: Item[] = [
  { id: 'select', label: 'Move', key: 'V', icon: MousePointer2, tool: 'select' },
  { id: 'scale', label: 'Scale', key: 'K', icon: Scaling, tool: 'scale' },
  { id: 'hand', label: 'Hand', key: 'H', icon: Hand, tool: 'hand' },
];

const SHAPES: Item[] = [
  { id: 'rect', label: 'Rectangle', key: 'R', icon: Square, tool: 'rect' },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: Circle, tool: 'ellipse' },
  { id: 'polygon', label: 'Polygon', icon: Triangle, tool: 'polygon' },
  { id: 'icon', label: 'Icon', icon: Shapes, run: () => toggleRailPanel('icons') },
  { id: 'script', label: 'Script', icon: Code, soon: true },
  { id: 'import', label: 'Import image or SVG…', key: 'Ctrl+Shift+K', icon: ImageUp, run: () => void importImageOrSvg() },
  { id: 'figma', label: 'Import Figma', icon: FigmaMark as unknown as typeof Square, soon: true },
];

export function ToolRail() {
  const tool = useStore((s) => s.tool);
  const leftOpen = useStore((s) => s.leftOpen);
  const railPanel = useStore((s) => s.railPanel);
  const [menu, setMenu] = useState<'pointer' | 'shapes' | null>(null);
  const [lastShape, setLastShape] = useState<Item>(SHAPES[0]!);
  const shapeTools = SHAPES.filter((s) => s.tool);
  const activeShape = shapeTools.find((s) => s.tool === tool);
  useEffect(() => { if (activeShape) setLastShape(activeShape); }, [activeShape]);

  const pointer = POINTER.find((p) => p.tool === tool) ?? POINTER[0]!;
  const single = (t: Tool, label: string, key: string, Icon: typeof Square) => (
    <IconButton title={`${label} (${key})`} active={tool === t} onClick={() => setTool(t)}><Icon size={17} /></IconButton>
  );

  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-line bg-panel p-1.5 shadow-xl shadow-black/30">
      <IconButton title={`${leftOpen ? 'Hide' : 'Show'} sidebar (Ctrl+\\)`} onClick={() => togglePanel('left')}>
        <PanelLeft size={17} />
      </IconButton>
      <div className="mx-1.5 my-0.5 h-px bg-line" />
      <Group item={POINTER.find((p) => p.tool === tool) ? pointer : POINTER[0]!} active={POINTER.some((p) => p.tool === tool)} items={POINTER}
        current={tool} open={menu === 'pointer'} onOpen={(o) => setMenu(o ? 'pointer' : null)} />
      <Group item={activeShape ?? lastShape} active={!!activeShape} items={SHAPES}
        current={tool} open={menu === 'shapes'} onOpen={(o) => setMenu(o ? 'shapes' : null)} />
      {single('pen', 'Pen', 'P', PenTool)}
      {single('text', 'Text', 'T', Type)}
      {single('frame', 'Frame', 'F', Frame)}
      {single('sticky', 'Sticky note', 'S', StickyNote)}
      {single('embed', 'Web page', 'B', Globe)}
      {single('comment', 'Comment', 'C', MessageCircle)}
      <div className="mx-1.5 my-0.5 h-px bg-line" />
      <IconButton title="Variables" active={railPanel === 'variables'} onClick={() => toggleRailPanel('variables')}><Diamond size={17} /></IconButton>
      <IconButton title="Find layer (Ctrl+F)" active={railPanel === 'find'} onClick={() => toggleRailPanel('find')}><Search size={17} /></IconButton>
    </div>
  );
}

/** A rail button for a family of tools: click uses the shown one, the chevron opens the family. */
function Group({ item, active, items, current, open, onOpen }: { item: Item; active: boolean; items: Item[]; current: Tool; open: boolean; onOpen: (o: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) onOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpen(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', esc, true); };
  }, [open, onOpen]);

  const choose = (it: Item) => {
    onOpen(false);
    if (it.soon) { toast(`${it.label} is coming soon`); return; }
    if (it.tool) setTool(it.tool);
    it.run?.();
  };

  return (
    <div ref={root} className="relative flex flex-col items-center">
      <IconButton title={`${item.label}${item.key ? ` (${item.key})` : ''}`} active={active} onClick={() => choose(item)}><item.icon size={17} /></IconButton>
      <button title="More tools" aria-haspopup="menu" aria-expanded={open} onClick={() => onOpen(!open)}
        className={cn('flex h-3.5 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-panel-3 hover:text-fg', open && 'bg-panel-3 text-fg')}>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div role="menu" className="absolute left-full top-0 z-50 ml-3 w-[264px] rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/50">
          {items.map((it) => (
            <MenuRow key={it.id} checked={!!it.tool && it.tool === current} onClick={() => choose(it)} icon={<it.icon size={15} />} label={it.label}
              hint={it.soon ? 'Soon' : it.key} dim={it.soon} />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuRow({ checked, onClick, icon, label, hint, dim }: { checked: boolean; onClick: () => void; icon: ReactNode; label: string; hint?: string; dim?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick}
      className={cn('flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px] hover:bg-panel-3', dim ? 'text-fg-subtle' : 'text-fg')}>
      <span className="flex w-3.5 justify-center">{checked && <Check size={12} />}</span>
      <span className="flex w-4 justify-center text-fg-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="text-[10.5px] text-fg-subtle">{hint}</span>}
    </button>
  );
}
