import { FileText, FolderOpen, Hexagon, Plus, Save, X } from 'lucide-react';
import { activate, closeDoc, newDoc, openFile, save, useStore } from '../lib/store';
import { cn, IconButton } from './controls';

export function TitleBar() {
  const docs = useStore((s) => s.docs);
  const active = useStore((s) => s.activeDocId);
  const agents = useStore((s) => s.agents);
  const running = useStore((s) => s.runningRun);
  const live = agents.length > 0 || !!running;

  return (
    <div className="drag flex h-10 shrink-0 items-center gap-2 pl-3 pr-[150px]">
      <div className="flex items-center gap-1.5 pr-2 text-[14px] font-semibold tracking-tight">
        <Hexagon size={17} className="text-accent" strokeWidth={2.4} />
        ArchaDev
      </div>
      <div className="no-drag flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-panel p-1">
        {docs.map((d) => (
          <div key={d.id} onClick={() => void activate(d.id)}
            className={cn('group flex h-7 max-w-[220px] cursor-default items-center gap-1.5 rounded-lg pl-2.5 pr-1 text-[12px] text-fg-muted hover:bg-panel-2', d.id === active && 'bg-panel-3 text-fg hover:bg-panel-3')}>
            <FileText size={13} className="shrink-0" />
            <span className="truncate">{d.name}{d.filePath ? '.archa' : ''}</span>
            {d.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-muted" title="Unsaved changes" />}
            <button onClick={(e) => { e.stopPropagation(); void closeDoc(d.id); }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 hover:bg-panel-3 group-hover:opacity-100" title="Close">
              <X size={12} />
            </button>
          </div>
        ))}
        <button onClick={() => void newDoc()} title="New file (Ctrl+N)" className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-panel-2 hover:text-fg"><Plus size={14} /></button>
      </div>
      <div className="flex-1" />
      <div className={cn('no-drag flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px]', live ? 'bg-agent/15 text-agent' : 'bg-panel text-fg-subtle')}
        title={agents.map((a) => a.name).join(', ') || 'No agent connected'}>
        <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-agent' : 'bg-fg-subtle')} />
        {running ? 'Agent working' : agents.length ? `${agents.length} agent${agents.length > 1 ? 's' : ''} connected` : 'No agent'}
      </div>
      <IconButton title="Open (Ctrl+O)" onClick={() => void openFile()}><FolderOpen size={16} /></IconButton>
      <IconButton title="Save (Ctrl+S)" onClick={() => void save()}><Save size={16} /></IconButton>
    </div>
  );
}
