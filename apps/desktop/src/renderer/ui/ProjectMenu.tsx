import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, FolderOpen, Plus } from 'lucide-react';
import type { ProjectFile } from '@archa/protocol';
import { activate, newDoc, openPath, toast, useStore } from '../lib/store';
import { cn } from './controls';

/*
 * Project chip in the title bar (blueprint APP_UI/01 → Title bar). A window opened on a folder works in that
 * project: its designs are the `.archa` files in `<folder>/.design/`, listed here newest first.
 */

const folderName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export function ProjectMenu() {
  const project = useStore((s) => s.project);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !project) return;
    const client = useStore.getState().client;
    client?.call('project.files', { project }).then(setFiles, (e: Error) => toast(e.message, 'error'));
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', () => setOpen(false), { once: true });
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key);
    };
  }, [open, project]);

  if (!project) return null;
  const pick = (f: ProjectFile) => {
    setOpen(false);
    void (f.docId ? activate(f.docId) : openPath(f.path));
  };
  const sep = project.includes('\\') ? '\\' : '/';
  const designDir = `${project.replace(/[\\/]+$/, '')}${sep}.design`;

  return (
    <div ref={root} className="no-drag relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} title={project} onClick={() => setOpen((o) => !o)}
        className={cn('flex h-7 max-w-[200px] items-center gap-1.5 rounded-lg px-2 text-[12px] text-fg-muted hover:bg-panel-2 hover:text-fg', open && 'bg-panel-3 text-fg hover:bg-panel-3')}>
        <FolderOpen size={14} className="shrink-0" />
        <span className="truncate font-medium">{folderName(project)}</span>
        <ChevronDown size={12} className={cn('shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-9 z-50 w-[300px] overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-2xl">
          <div className="truncate px-2.5 pb-1.5 pt-1 font-mono text-[10.5px] text-fg-subtle" title={designDir}>{designDir}</div>
          <div className="max-h-[320px] overflow-y-auto">
            {files === null && <div className="px-2.5 py-2 text-[12px] text-fg-subtle">Loading…</div>}
            {files?.length === 0 && <div className="px-2.5 py-2 text-[12px] text-fg-subtle">No designs saved yet. Unsaved files land here on the first save.</div>}
            {files?.map((f) => (
              <button key={f.path} role="menuitem" onClick={() => pick(f)} title={f.path}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] text-fg-muted hover:bg-panel-2 hover:text-fg">
                <FileText size={13} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {f.docId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Open" />}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" onClick={() => { setOpen(false); void newDoc(); }}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] text-fg-muted hover:bg-panel-2 hover:text-fg">
            <Plus size={13} />New design
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); void window.archa.openFolder(designDir).then((err) => err && toast(err, 'error')); }}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] text-fg-muted hover:bg-panel-2 hover:text-fg">
            <FolderOpen size={13} />Show in Explorer
          </button>
        </div>
      )}
    </div>
  );
}
