import { Circle, Frame, Hand, MousePointer2, PanelLeft, Square, Type } from 'lucide-react';
import { togglePanel, useStore, type Tool } from '../lib/store';
import { IconButton } from './controls';

export const TOOLS: Array<{ id: Tool; key: string; label: string; icon: typeof Square }> = [
  { id: 'select', key: 'V', label: 'Select', icon: MousePointer2 },
  { id: 'frame', key: 'F', label: 'Frame', icon: Frame },
  { id: 'rect', key: 'R', label: 'Rectangle', icon: Square },
  { id: 'ellipse', key: 'O', label: 'Ellipse', icon: Circle },
  { id: 'text', key: 'T', label: 'Text', icon: Type },
  { id: 'hand', key: 'H', label: 'Hand', icon: Hand },
];

export function ToolRail() {
  const tool = useStore((s) => s.tool);
  const leftOpen = useStore((s) => s.leftOpen);
  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-line bg-panel p-1.5 shadow-xl shadow-black/30">
      <IconButton title={`${leftOpen ? 'Hide' : 'Show'} sidebar (Ctrl+\\)`} onClick={() => togglePanel('left')}>
        <PanelLeft size={17} />
      </IconButton>
      <div className="mx-1.5 my-0.5 h-px bg-line" />
      {TOOLS.map((t) => (
        <IconButton key={t.id} title={`${t.label} (${t.key})`} active={tool === t.id} onClick={() => useStore.setState({ tool: t.id })}>
          <t.icon size={17} />
        </IconButton>
      ))}
    </div>
  );
}
