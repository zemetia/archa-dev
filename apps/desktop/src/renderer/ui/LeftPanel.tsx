import { Component, GalleryVertical, Layers, Library, MessageSquare } from 'lucide-react';
import { useStore, type LeftTab } from '../lib/store';
import { ChatComposer, ChatThread } from './ChatPanel';
import { ComponentsPanel } from './ComponentsPanel';
import { HistoryPanel } from './HistoryPanel';
import { LayersPanel } from './LayersPanel';
import { LibraryPanel } from './LibraryPanel';
import { SlidesPanel } from './SlidesPanel';
import { cn } from './controls';

export const LEFT_WIDTH = 300;

type Tab = { id: LeftTab; label: string; icon: typeof Layers };

// History is reached from the chat header and collapsing from the tool rail / Ctrl+\, so neither sits in this row.
const CHAT_TAB: Tab = { id: 'chat', label: 'Chat', icon: MessageSquare };
const DESIGN_TABS: Tab[] = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'components', label: 'Components', icon: Component },
  { id: 'slides', label: 'Slides', icon: GalleryVertical },
  { id: 'library', label: 'Library', icon: Library },
];
const TITLES: Partial<Record<LeftTab, string>> = { history: 'Chat history', ...Object.fromEntries(DESIGN_TABS.map((t) => [t.id, t.label])) };

/*
 * Left sidebar (blueprint APP_UI/01 → Left menu). Collapses to zero width (Ctrl+\ or the toggle on
 * the tool rail); the inner column keeps its width so content never reflows while it animates.
 */
export function LeftPanel() {
  const open = useStore((s) => s.leftOpen);
  const tab = useStore((s) => s.leftTab);
  const running = useStore((s) => Object.keys(s.runs).length > 0);
  const label = TITLES[tab];

  return (
    <div aria-hidden={!open} style={{ width: open ? LEFT_WIDTH + 8 : 0 }}
      className="shrink-0 overflow-hidden transition-[width] duration-200 ease-out">
      <aside style={{ width: LEFT_WIDTH }} className={cn('flex h-full flex-col gap-2 transition-opacity duration-150', !open && 'opacity-0')}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="flex h-11 shrink-0 items-center gap-0.5 px-1.5">
            <TabButton tab={CHAT_TAB} active={tab === 'chat' || tab === 'history'} pulse={!!running} />
            <div className="flex-1" />
            {DESIGN_TABS.map((t) => <TabButton key={t.id} tab={t} active={tab === t.id} />)}
          </div>
          {tab === 'chat' ? <ChatThread /> : (
            <div className="flex min-h-0 flex-1 flex-col border-t border-line">
              <div className="flex h-10 shrink-0 items-center px-4 text-[12.5px] font-semibold">{label}</div>
              {tab === 'history' && <HistoryPanel />}
              {tab === 'layers' && <LayersPanel />}
              {tab === 'components' && <ComponentsPanel />}
              {tab === 'slides' && <SlidesPanel />}
              {tab === 'library' && <LibraryPanel />}
            </div>
          )}
        </div>
        {tab === 'chat' && <ChatComposer />}
      </aside>
    </div>
  );
}

function TabButton({ tab, active, pulse }: { tab: Tab; active: boolean; pulse?: boolean }) {
  return (
    <button title={tab.label} onClick={() => useStore.setState({ leftTab: tab.id })}
      className={cn('relative flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-2 hover:text-fg',
        active && 'bg-accent-soft text-accent-fg hover:bg-accent-soft hover:text-accent-fg')}>
      <tab.icon size={15} />
      {pulse && <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-agent" />}
    </button>
  );
}
