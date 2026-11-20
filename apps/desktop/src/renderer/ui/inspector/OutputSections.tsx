import { useState } from 'react';
import { Check as CheckIcon, Component, Copy, Crosshair, Download, RefreshCw, Sparkles, Unlink } from 'lucide-react';
import { componentMeta, contextOf, detachOps, instanceOf, instancesOf, makeComponentOps, syncInstanceOps } from '@archa/core';
import type { Node } from '@archa/schema';
import { commit, EXPORT_KINDS, exportEach, exportNode, exportPdf, readingOrder, toast, useStore, type ExportKind } from '../../lib/store';
import { revealNode } from '../../lib/thumbs';
import { cn, Section, Select } from '../controls';
import { patchNodes } from './shared';

/* Design panel: component status, context for agents, code and export (blueprint APP_UI/04). */

const smallBtn = 'flex h-8 items-center justify-center gap-1.5 rounded-lg bg-panel-2 px-2.5 text-[12px] text-fg-muted hover:bg-panel-3 hover:text-fg disabled:pointer-events-none disabled:opacity-40';

function run(label: string, fn: () => Parameters<typeof commit>[1]) {
  try { void commit(label, fn()); } catch (e) { toast((e as Error).message, 'error'); }
}

/** "Create component" for a plain frame; status and actions for a main or an instance. */
export function ComponentRow({ node: n }: { node: Node }) {
  const doc = useStore((s) => s.doc)!;
  const main = instanceOf(n);
  if (main) {
    const m = doc.get(main);
    return (
      <div className="border-b border-line px-4 py-2.5">
        <div className="mb-2 truncate text-[11.5px] text-fg-muted">Instance of <span className="text-accent-fg">{m?.name ?? 'a deleted component'}</span></div>
        <div className="grid grid-cols-3 gap-1.5">
          <button disabled={!m} className={smallBtn} title="Copy the main's current look onto this instance" onClick={() => run('Sync instance', () => syncInstanceOps(doc, n.id))}><RefreshCw size={12} />Reset</button>
          <button disabled={!m} className={smallBtn} onClick={() => m && revealNode(m.id)}><Crosshair size={12} />Main</button>
          <button className={smallBtn} onClick={() => run('Detach instance', () => detachOps(doc, n.id))}><Unlink size={12} />Detach</button>
        </div>
      </div>
    );
  }
  if (componentMeta(n)) {
    const count = instancesOf(doc, n.id).length;
    return (
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Component size={14} className="shrink-0 text-accent-fg" />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">Component · {count} instance{count === 1 ? '' : 's'}</span>
        <button disabled={!count} className={smallBtn} title="Push this main's changes to every instance"
          onClick={() => run('Sync instances', () => instancesOf(doc, n.id).flatMap((i) => syncInstanceOps(doc, i.id)))}><RefreshCw size={12} />Sync</button>
      </div>
    );
  }
  if (n.type !== 'frame') return null;
  return (
    <div className="border-b border-line px-4 py-2.5">
      <button className={cn(smallBtn, 'w-full')} title="Reusable piece: agents see it in their component list and place instances instead of rebuilding it"
        onClick={() => run('Create component', () => makeComponentOps(doc, n.id))}><Component size={13} />Create component</button>
    </div>
  );
}

/** Free-text notes for agents on this layer; they show up in the agent's state and in outline / inspect. */
export function ContextSection({ node: n }: { node: Node }) {
  const note = contextOf(n);
  return (
    <Section title="Context" action={<span title="Agents read this note whenever they work on this layer" className="flex h-7 w-7 items-center justify-center text-fg-subtle"><Sparkles size={13} /></span>}>
      <textarea key={n.id + note} defaultValue={note} rows={2} spellCheck
        placeholder="Notes for agents: what this is for, content rules, what must not change…"
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === note) return;
          const meta: Record<string, unknown> = { ...n.meta, context: v };
          if (!v) delete meta.context;
          void patchNodes([n.id], { meta }, v ? 'Edit context' : 'Clear context');
        }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur(); }}
        className="min-h-[52px] w-full resize-y rounded-lg bg-panel-2 px-2 py-1.5 text-[12px] leading-relaxed ring-1 ring-transparent placeholder:text-fg-subtle focus:ring-accent" />
    </Section>
  );
}

type CodeStyle = 'tailwind' | 'css';
/** Kept across selections, like the last export settings in other design tools. */
let lastCode: CodeStyle = 'tailwind';
let lastExport: { kind: ExportKind; scale: string } = { kind: 'png', scale: '2' };

export function CodeSection({ nodeId }: { nodeId: string }) {
  const client = useStore((s) => s.client);
  const docId = useStore((s) => s.activeDocId);
  const [style, setStyle] = useState<CodeStyle>(lastCode);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!client || !docId) return;
    try {
      const { code } = await client.call('export.code', { docId, nodeId, style });
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      toast(`Copy failed: ${(e as Error).message}`, 'error');
    }
  };
  return (
    <Section title="Code">
      <Select title="Code style" value={style} onChange={(v) => { lastCode = v; setStyle(v); }}
        options={[{ value: 'tailwind', label: 'HTML + Tailwind' }, { value: 'css', label: 'HTML + CSS' }]} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className={smallBtn} onClick={() => void copy()}>{copied ? <CheckIcon size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy code'}</button>
        <button className={smallBtn} onClick={() => void exportNode(nodeId, style === 'tailwind' ? 'tailwind' : 'html')}><Download size={13} />Export</button>
      </div>
    </Section>
  );
}

const IMAGE_KINDS = EXPORT_KINDS.filter((k) => k.value !== 'html' && k.value !== 'tailwind');

/** One layer: one file. Several layers: PDF puts them in one file, a page each; other formats write one file per layer. */
export function ExportSection({ ids }: { ids: string[] }) {
  const [opts, setOpts] = useState(lastExport);
  const update = (o: typeof opts) => { lastExport = o; setOpts(o); };
  const raster = opts.kind === 'png' || opts.kind === 'jpg';
  const doc = useStore((s) => s.doc);
  const pages = doc ? readingOrder(doc, ids).length : ids.length;
  const many = pages > 1;
  const run = () => {
    if (opts.kind === 'pdf') return exportPdf(ids);
    if (!many) return exportNode(ids[0]!, opts.kind, Number(opts.scale));
    if (opts.kind !== 'html' && opts.kind !== 'tailwind') return exportEach(ids, opts.kind, Number(opts.scale));
  };
  return (
    <Section title="Export">
      <div className="flex gap-2">
        {raster && (
          <div className="w-[72px] shrink-0">
            <Select title="Scale" value={opts.scale} onChange={(scale) => update({ ...opts, scale })} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: `${v}x` }))} />
          </div>
        )}
        <Select title="Format" value={opts.kind} onChange={(kind) => update({ ...opts, kind })} options={IMAGE_KINDS.map(({ value, label }) => ({ value, label }))} />
      </div>
      {opts.kind === 'pdf' && (
        <p className="mt-1.5 text-[11px] text-fg-subtle">
          {many ? `One file, ${pages} vector pages in canvas order (left to right, top to bottom); text stays selectable.` : 'One vector page; text stays selectable.'}
        </p>
      )}
      {opts.kind !== 'pdf' && many && <p className="mt-1.5 text-[11px] text-fg-subtle">{pages} files, one per layer, into a folder you pick.</p>}
      <button onClick={() => void run()} className={cn(smallBtn, 'mt-2 w-full')}>
        <Download size={13} />Export {opts.kind === 'pdf' && many ? `PDF · ${pages} pages` : IMAGE_KINDS.find((k) => k.value === opts.kind)?.label}
      </button>
    </Section>
  );
}
