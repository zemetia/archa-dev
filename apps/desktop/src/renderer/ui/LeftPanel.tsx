import { Layers, MessageSquare } from 'lucide-react';
import { useStore } from '../lib/store';
import { ChatPanel } from './ChatPanel';
import { LayersPanel } from './LayersPanel';
import { cn } from './controls';

export function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  const running = useStore((s) => s.runningRun);
  const tabs = [
    { id: 'layers' as const, label: 'Layers', icon: Layers },
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
  ];
  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex gap-1 border-b border-line p-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => useStore.setState({ leftTab: t.id })}
            className={cn('flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] text-fg-muted hover:text-fg', tab === t.id && 'bg-panel-3 text-fg')}>
            <t.icon size={14} />{t.label}
            {t.id === 'chat' && running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-agent" />}
          </button>
        ))}
      </div>
      {tab === 'layers' ? <LayersPanel /> : <ChatPanel />}
    </aside>
  );
}
