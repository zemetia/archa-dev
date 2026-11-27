import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, Circle, Copy, Droplet, Frame, Globe, Group, Hash, Image, MoreHorizontal, PenTool, Plus, Search, Square, StickyNote, Trash2, Triangle, Type, Workflow, X,
} from 'lucide-react';
import { hexToColor, newId, type Node, type Variable, type VariableType } from '@archa/schema';
import { commit, select, toast, useStore } from '../lib/store';
import { pageRoot } from '../lib/geometry';
import { cn, ColorField, NumberField } from './controls';
import { AssetsPanel } from './AssetsPanel';

/** Floating panels opened from the tool rail; they sit beside it over the canvas (blueprint APP_UI/01). */
export function RailPanels() {
  const panel = useStore((s) => s.railPanel);
  if (!panel) return null;
  return (
    <div className="pointer-events-auto absolute left-[68px] top-3 z-30 flex max-h-[calc(100%-24px)]">
      {panel === 'variables' && <VariablesPanel />}
      {panel === 'find' && <FindPanel />}
      {panel === 'assets' && <AssetsPanel onClose={close} />}
    </div>
  );
}

const close = () => useStore.setState({ railPanel: null });

function Shell({ title, width, children, footer }: { title: React.ReactNode; width: number; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div style={{ width }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }}
      className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/40">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1.5">
        <div className="min-w-0 flex-1 text-[12.5px] font-semibold">{title}</div>
        <button title="Close (Esc)" onClick={close} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg"><X size={15} /></button>
      </div>
      {children}
      {footer && <div className="shrink-0 border-t border-line">{footer}</div>}
    </div>
  );
}

/* --------------------------------- Variables -------------------------------- */

const TYPE_ICON: Record<VariableType, typeof Hash> = { color: Droplet, number: Hash, string: Type };

function VariablesPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const [adding, setAdding] = useState(false);
  const vars = doc ? [...doc.variables.values()] : [];
  const save = (variable: Variable, label = 'Edit variable') => commit(label, [{ op: 'setVariable', variable }]);

  const add = (type: VariableType) => {
    setAdding(false);
    const taken = new Set(vars.map((v) => v.name));
    let i = 1;
    while (taken.has(`${type}-${i}`)) i++;
    const base = { id: newId(), name: `${type}-${i}` };
    const v: Variable = type === 'color' ? { ...base, type, value: hexToColor('#8b5cf6') } : type === 'number' ? { ...base, type, value: 8 } : { ...base, type, value: 'Text' };
    void save(v, 'Add variable');
  };

  return (
    <Shell width={620} title={<span className="flex items-center gap-2">Theme<span className="rounded bg-panel-3 px-1.5 py-px text-[10.5px] font-normal text-fg-subtle">{vars.length}</span></span>}
      footer={
        <div className="relative px-2 py-1.5">
          <button onClick={() => setAdding((a) => !a)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-fg-muted hover:bg-panel-2 hover:text-fg">
            <Plus size={14} />Add variable<ChevronDown size={12} />
          </button>
          {adding && (
            <div className="absolute bottom-full left-2 mb-1 w-[180px] rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/50">
              {(['color', 'number', 'string'] as const).map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button key={t} onClick={() => add(t)} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12.5px] capitalize hover:bg-panel-3">
                    <Icon size={14} className="text-fg-muted" />{t}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      }>
      <div className="grid shrink-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_32px] gap-2 border-b border-line bg-panel-2/40 px-3 py-2 text-[11.5px] font-semibold text-fg-muted">
        <span className="pl-1">Name</span><span className="pl-1">Value</span><span />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {vars.length === 0 && (
          <p className="px-2 py-8 text-center text-[12px] leading-relaxed text-fg-subtle">
            No variables yet. Add colours, sizes and text your design — and your agents — reuse.
          </p>
        )}
        <div className="space-y-1.5">{vars.map((v) => <VariableRow key={v.id} v={v} all={vars} save={save} />)}</div>
      </div>
    </Shell>
  );
}

function VariableRow({ v, all, save }: { v: Variable; all: Variable[]; save: (v: Variable, label?: string) => Promise<boolean> }) {
  const [menu, setMenu] = useState(false);
  const Icon = TYPE_ICON[v.type];
  const rename = (name: string) => {
    const n = name.trim().replace(/\s+/g, '-');
    if (!n || n === v.name) return;
    if (all.some((x) => x.name === n)) { toast(`A variable named "${n}" already exists`, 'error'); return; }
    void save({ ...v, name: n }, 'Rename variable');
  };
  return (
    <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_32px] items-center gap-2">
      <label className="flex h-8 min-w-0 items-center gap-2 rounded-lg bg-panel-2 px-2">
        <Icon size={13} className="shrink-0 text-fg-subtle" />
        <input key={v.name} defaultValue={v.name} spellCheck={false} aria-label="Variable name"
          onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="min-w-0 flex-1 bg-transparent text-[12px]" />
      </label>
      {v.type === 'color' && <ColorField color={v.value} onCommit={(value) => void save({ ...v, value })} />}
      {v.type === 'number' && <NumberField label="#" value={v.value} onCommit={(value) => void save({ ...v, value })} />}
      {v.type === 'string' && (
        <input key={v.value} defaultValue={v.value} aria-label="Variable value"
          onBlur={(e) => { if (e.target.value !== v.value) void save({ ...v, value: e.target.value }); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="h-8 min-w-0 rounded-lg bg-panel-2 px-2 text-[12px]" />
      )}
      <div className="relative">
        <button title="More" onClick={() => setMenu((m) => !m)} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg"><MoreHorizontal size={15} /></button>
        {menu && (
          <div onMouseLeave={() => setMenu(false)} className="absolute right-0 top-full z-10 mt-1 w-[150px] rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/50">
            <button onClick={() => {
              setMenu(false);
              let i = 2;
              while (all.some((x) => x.name === `${v.name}-${i}`)) i++;
              void save({ ...v, id: newId(), name: `${v.name}-${i}` } as Variable, 'Duplicate variable');
            }} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12px] hover:bg-panel-3"><Copy size={13} />Duplicate</button>
            <button onClick={() => { setMenu(false); void commit('Delete variable', [{ op: 'deleteVariable', id: v.id }]); }}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12px] text-danger hover:bg-panel-3"><Trash2 size={13} />Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Find layer ------------------------------- */

const NODE_ICON: Record<string, typeof Square> = { frame: Frame, rect: Square, ellipse: Circle, text: Type, group: Group, polygon: Triangle, path: PenTool, image: Image, sticky: StickyNote, embed: Globe, connector: Workflow };

function FindPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.rev);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    if (!doc) return [];
    const needle = q.trim().toLowerCase();
    const out: Node[] = [];
    for (const n of doc.walk(pageRoot(doc))) {
      if (n.type === 'page') continue;
      const text = n.type === 'text' || n.type === 'sticky' ? n.text : n.type === 'embed' ? n.url : '';
      if (!needle || n.name.toLowerCase().includes(needle) || text.toLowerCase().includes(needle)) out.push(n);
      if (out.length >= 200) break;
    }
    return out;
  }, [doc, q, useStore.getState().rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(0); }, [q]);

  const go = (n: Node | undefined) => {
    if (!n || !doc) return;
    select([n.id]);
    const host = document.querySelector('[data-canvas-host]');
    const b = doc.worldBounds(n.id);
    const vw = host?.clientWidth ?? 800, vh = host?.clientHeight ?? 600;
    const zoom = Math.min(2, Math.max(0.05, Math.min((vw - 200) / Math.max(1, b.width), (vh - 200) / Math.max(1, b.height))));
    useStore.setState({ camera: { zoom, x: vw / 2 - (b.x + b.width / 2) * zoom, y: vh / 2 - (b.y + b.height / 2) * zoom } });
  };
  const path = (n: Node) => {
    const parts: string[] = [];
    let p = n.parentId ? doc?.get(n.parentId) : undefined;
    while (p && p.type !== 'page') { parts.unshift(p.name); p = p.parentId ? doc?.get(p.parentId) : undefined; }
    return parts.join(' / ');
  };

  return (
    <Shell width={340} title="Find layer">
      <div className="shrink-0 p-2">
        <label className="flex h-9 items-center gap-2 rounded-lg bg-panel-2 px-2.5 ring-1 ring-line focus-within:ring-accent">
          <Search size={14} className="text-fg-subtle" />
          <input autoFocus value={q} placeholder="Layer name or text…" aria-label="Find layer" spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter') go(results[active]);
            }}
            className="min-w-0 flex-1 bg-transparent text-[12.5px]" />
        </label>
      </div>
      <div className="min-h-0 max-h-[420px] flex-1 overflow-y-auto px-2 pb-2">
        {results.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-fg-subtle">No layers match.</p>}
        {results.map((n, i) => {
          const Icon = NODE_ICON[n.type] ?? Square;
          return (
            <button key={n.id} onMouseEnter={() => setActive(i)} onClick={() => go(n)}
              className={cn('flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left', i === active && 'bg-panel-3')}>
              <Icon size={13} className="shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-fg">{n.name}</span>
                {path(n) && <span className="block truncate text-[10.5px] text-fg-subtle">{path(n)}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
