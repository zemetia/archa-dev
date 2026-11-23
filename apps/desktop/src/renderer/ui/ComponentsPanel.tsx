import { Component, Copy, Crosshair, Library, RefreshCw, Unlink } from 'lucide-react';
import {
  componentMeta, detachOps, findEmptySpace, instanceOf, instanceOps, instancesOf, listComponents, makeComponentOps, syncInstanceOps, unmakeComponentOps,
  type ComponentInfo,
} from '@archa/core';
import { renderNodePng } from '@archa/render';
import { commit, loadLibrary, select, toast, useStore } from '../lib/store';
import { pageRoot } from '../lib/geometry';
import { revealNode, useNodeThumb } from '../lib/thumbs';
import { cn } from './controls';

/*
 * Components, linked v1 (blueprint DESIGN_SYSTEM/02): a frame marked as a component is the "main";
 * instances are linked copies. Agents get this list (with descriptions) in their state and must reuse it.
 */
export function ComponentsPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  if (!doc) return null;
  const list = listComponents(doc);
  const sel = selection.length === 1 ? doc.get(selection[0]!) : undefined;
  const selMain = sel && instanceOf(sel) ? doc.get(instanceOf(sel)!) : undefined;
  const canMake = sel?.type === 'frame' && !componentMeta(sel) && !instanceOf(sel);

  const run = (label: string, fn: () => Parameters<typeof commit>[1]) => {
    try { void commit(label, fn()); } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-line px-3 pb-3">
        <p className="px-0.5 text-[11.5px] leading-relaxed text-fg-subtle">
          Reusable pieces — buttons, cards, nav items. Your agent sees this list and reuses it, so new screens stay consistent.
        </p>
        {sel && instanceOf(sel) ? (
          <div className="rounded-lg border border-line bg-panel-2 p-2 text-[11.5px]">
            <div className="mb-1.5 truncate text-fg-muted">
              <span className="text-fg">{sel.name}</span> is an instance of <span className="text-accent-fg">{selMain?.name ?? 'a deleted component'}</span>
            </div>
            <div className="flex gap-1">
              {selMain && <SmallButton icon={RefreshCw} label="Reset to main" onClick={() => run('Reset instance', () => syncInstanceOps(doc, sel.id, { reset: true }))} />}
              {selMain && <SmallButton icon={Crosshair} label="Go to main" onClick={() => revealNode(selMain.id)} />}
              <SmallButton icon={Unlink} label="Detach" onClick={() => run('Detach instance', () => detachOps(doc, sel.id))} />
            </div>
          </div>
        ) : (
          <button disabled={!canMake} onClick={() => sel && run('Create component', () => makeComponentOps(doc, sel.id))}
            title={canMake ? undefined : 'Select one frame (not an instance) to turn it into a component'}
            className={cn('flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-colors',
              canMake ? 'bg-accent text-fg shadow-lg shadow-accent/25 hover:opacity-90' : 'bg-panel-2 text-fg-subtle')}>
            <Component size={14} />{canMake ? `Make "${sel.name}" a component` : 'Select a frame to make a component'}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {list.length === 0 && <p className="px-1 pt-6 text-center text-[12px] text-fg-subtle">No components yet.</p>}
        {list.map((c) => <ComponentCard key={c.id} info={c} />)}
      </div>
    </div>
  );
}

function ComponentCard({ info }: { info: ComponentInfo }) {
  const doc = useStore((s) => s.doc)!;
  const client = useStore((s) => s.client);
  const docId = useStore((s) => s.activeDocId);
  const selected = useStore((s) => s.selection.includes(info.id));
  const url = useNodeThumb(info.id, 72);

  const insert = async () => {
    const main = doc.require(info.id);
    const root = pageRoot(doc);
    const spot = findEmptySpace(doc, root, main.width, main.height);
    try {
      const { ops, rootId } = instanceOps(doc, info.id, root, spot);
      if (await commit(`Insert ${info.name}`, ops)) revealNode(rootId);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const sync = () => {
    const ops = instancesOf(doc, info.id).flatMap((n) => syncInstanceOps(doc, n.id));
    void commit(`Sync ${info.name}`, ops).then((ok) => ok && toast(`Synced ${info.instances} instance${info.instances === 1 ? '' : 's'}`));
  };
  const publish = async () => {
    if (!client || !docId) return;
    try {
      const n = doc.require(info.id);
      const png = await renderNodePng(doc, info.id, Math.min(2, 320 / Math.max(1, n.width, n.height)));
      await client.call('library.publish', { docId, nodeId: info.id, png });
      toast(`Published ${info.name} to your library`);
      void loadLibrary();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const setDescription = (description: string) => {
    const n = doc.get(info.id);
    if (!n || description === info.description) return;
    void commit('Describe component', [{ op: 'update', id: info.id, patch: { meta: { ...n.meta, component: { description } } } }]);
  };

  return (
    <div className={cn('rounded-xl border bg-panel-2/40 p-2 transition-colors', selected ? 'border-accent' : 'border-line')}>
      <div className="flex gap-2.5">
        <button onClick={() => revealNode(info.id)} title="Go to main"
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
          {url ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full object-contain" /> : <Component size={18} className="text-fg-subtle" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Component size={12} className="shrink-0 text-accent-fg" />
            <span className="truncate text-[12.5px] font-medium">{info.name}</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-fg-subtle">{Math.round(info.width)}×{Math.round(info.height)} · {info.instances} instance{info.instances === 1 ? '' : 's'}</div>
          <input key={info.description} defaultValue={info.description} placeholder="Describe when to use it…"
            onBlur={(e) => setDescription(e.target.value.trim())}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            title="Agents read this to decide when to use the component"
            className="mt-1 h-6 w-full rounded-md bg-transparent px-1 text-[11px] text-fg-muted placeholder:text-fg-subtle hover:bg-panel-3 focus:bg-panel-3" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <SmallButton icon={Copy} label="Insert" onClick={() => void insert()} />
        {info.instances > 0 && <SmallButton icon={RefreshCw} label="Sync" title="Push the main's current design to every instance" onClick={sync} />}
        <SmallButton icon={Library} label="Publish" title="Save to your global library, usable in every document" onClick={() => void publish()} />
        <div className="flex-1" />
        <SmallButton icon={Unlink} label="" title="Stop being a component (instances are detached)"
          onClick={() => { void commit(`Unmake ${info.name}`, unmakeComponentOps(doc, info.id)); select([info.id]); }} />
      </div>
    </div>
  );
}

function SmallButton({ icon: Icon, label, title, onClick }: { icon: typeof Copy; label: string; title?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title ?? label}
      className="flex h-6 items-center gap-1 rounded-md border border-line px-1.5 text-[11px] text-fg-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg">
      <Icon size={11} />{label}
    </button>
  );
}
