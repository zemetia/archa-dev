import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2, Upload, X } from 'lucide-react';
import {
  CUSTOM_SET, getIcon, ICON_SETS, iconRef, loadAllIconSets, loadIconSet, searchIconSet, searchIcons, searchNames, type IconSet, type IconSetMeta,
} from '@archa/icons';
import { useStore } from '../lib/store';
import { ASSET_MIME, assetStyle, insertAsset, loadCustomIcons, removeCustomIcon, setAssetStyle, uploadIcons } from '../lib/assets';
import { cn } from './controls';

/*
 * Assets (blueprint DESIGN_SYSTEM/05): every icon set, brand logos and the person's own icons in one floating
 * panel beside the tool rail. Click inserts in the middle of the view; drag drops at the pointer.
 */

type Family = { id: string; label: string; sets: IconSetMeta[] };
const FAMILIES: Family[] = [];
for (const s of ICON_SETS) {
  const f = FAMILIES.find((x) => x.label === s.family);
  if (f) f.sets.push(s); else FAMILIES.push({ id: s.id, label: s.family, sets: [s] });
}
const ALL = 'all';
const PAGE = 240;
const SIZES = [16, 20, 24, 32, 48, 64];

/** Choices survive closing the panel (per window). */
let last = { family: 'lucide', style: { lucide: 'lucide' } as Record<string, string>, query: '' };

type Tile = { ref: string; label: string };

export function AssetsPanel({ onClose }: { onClose: () => void }) {
  const custom = useStore((s) => s.customIcons);
  const [family, setFamily] = useState(last.family);
  const [styles, setStyles] = useState(last.style);
  const [query, setQuery] = useState(last.query);
  const [st, setSt] = useState(assetStyle);
  const [sets, setSets] = useState<Record<string, IconSet>>({});
  const [allLoaded, setAllLoaded] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);

  const fam = FAMILIES.find((f) => f.id === family);
  const setId = fam ? styles[fam.id] ?? fam.sets[0]!.id : null;
  last = { family, style: styles, query };
  useEffect(() => { setAssetStyle(st); }, [st]);

  useEffect(() => { if (custom === null) void loadCustomIcons(); }, [custom]);
  useEffect(() => { setLimit(PAGE); }, [family, setId, query]);
  useEffect(() => {
    if (setId && !sets[setId]) void loadIconSet(setId).then((s) => setSets((m) => ({ ...m, [s.id]: s })));
  }, [setId, sets]);
  // "All icons" searches every set, so it loads them all once (about 10 MB).
  useEffect(() => {
    if (family === ALL && query.trim() && !allLoaded) void loadAllIconSets().then((all) => { setSets(Object.fromEntries(all.map((s) => [s.id, s]))); setAllLoaded(true); });
  }, [family, query, allLoaded]);

  const tiles: Tile[] | null = useMemo(() => {
    const q = query.trim();
    if (family === CUSTOM_SET) {
      const names = (custom ?? []).map((i) => i.name);
      return (q ? searchNames(names, q, 500) : names).map((n) => ({ ref: `${CUSTOM_SET}:${n}`, label: n }));
    }
    if (family === ALL) {
      if (!q) return null;
      if (!allLoaded) return [];
      const mine = searchNames((custom ?? []).map((i) => i.name), q, 12).map((n) => ({ ref: `${CUSTOM_SET}:${n}`, label: n }));
      return [...mine, ...searchIcons(q, { limit: 600 }).map((ref) => ({ ref, label: ref }))];
    }
    const set = setId ? sets[setId] : undefined;
    if (!set) return [];
    return (q ? searchIconSet(set, q, 1000) : Object.keys(set.icons)).map((n) => ({ ref: iconRef(set.id, n), label: n }));
  }, [family, setId, sets, query, custom, allLoaded]);

  const loading = family !== CUSTOM_SET && (family === ALL ? !!query.trim() && !allLoaded : !!setId && !sets[setId]);
  const shown = tiles?.slice(0, limit) ?? [];
  const meta = setId ? ICON_SETS.find((s) => s.id === setId) : undefined;

  return (
    <div style={{ width: 600, height: 'min(640px, calc(100vh - 140px))' }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}
      className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/40">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1.5">
        <div className="text-[12.5px] font-semibold">Assets</div>
        <label className="ml-2 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-panel-2 px-2.5 ring-1 ring-line focus-within:ring-accent">
          <Search size={13} className="shrink-0 text-fg-subtle" />
          <input autoFocus value={query} placeholder={family === ALL ? 'Search all icons and logos…' : `Search ${fam?.label ?? 'My icons'}…`} aria-label="Search assets" spellCheck={false}
            onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[12.5px]" />
          {query && <button title="Clear" onClick={() => setQuery('')} className="text-fg-subtle hover:text-fg"><X size={13} /></button>}
        </label>
        <button title="Close (Esc)" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg"><X size={15} /></button>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="w-[148px] shrink-0 space-y-0.5 overflow-y-auto border-r border-line p-2" aria-label="Collections">
          <Collection label="All icons" active={family === ALL} onClick={() => setFamily(ALL)} />
          <div className="px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Icon sets</div>
          {FAMILIES.filter((f) => f.id !== 'logos').map((f) => (
            <Collection key={f.id} label={f.label} count={f.sets[0]!.count} active={family === f.id} onClick={() => setFamily(f.id)} />
          ))}
          <div className="px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Brands</div>
          {FAMILIES.filter((f) => f.id === 'logos').map((f) => (
            <Collection key={f.id} label="Logos" count={f.sets[0]!.count} active={family === f.id} onClick={() => setFamily(f.id)} />
          ))}
          <div className="px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Yours</div>
          <Collection label="My icons" count={custom?.length} active={family === CUSTOM_SET} onClick={() => setFamily(CUSTOM_SET)} />
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {fam && fam.sets.length > 1 && (
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-line px-2.5 py-2">
              {fam.sets.map((s) => (
                <button key={s.id} onClick={() => setStyles((m) => ({ ...m, [fam.id]: s.id }))}
                  className={cn('h-6 rounded-md px-2 text-[11.5px]', setId === s.id ? 'bg-accent-soft text-accent-fg' : 'text-fg-muted hover:bg-panel-2 hover:text-fg')}>{s.style}</button>
              ))}
            </div>
          )}
          {family === CUSTOM_SET && (
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-2.5 py-2">
              <button onClick={() => upload.current?.click()}
                className="flex h-7 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[11.5px] font-medium text-fg hover:opacity-90"><Upload size={12} />Upload SVG / PNG</button>
              <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">Saved on this computer for every document. Agents use them as my:&lt;name&gt;.</span>
              <input ref={upload} type="file" multiple accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { void uploadIcons([...(e.target.files ?? [])]); e.target.value = ''; }} />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {tiles === null && <Hint>Type to search Lucide, Tabler, Phosphor, Heroicons, brand logos and your own icons at once.</Hint>}
            {loading && <Hint>Loading icons…</Hint>}
            {!loading && tiles && tiles.length === 0 && (
              <Hint>
                {family === CUSTOM_SET && !query ? 'No icons yet. Upload SVG or PNG files to keep them here.' : `Nothing in ${fam?.label ?? 'this collection'} matches.`}
                {family !== ALL && query.trim() && <button onClick={() => setFamily(ALL)} className="mt-2 block w-full text-accent-fg hover:underline">Search every set and logo for “{query.trim()}”</button>}
              </Hint>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1">
              {shown.map((t) => (
                <div key={t.ref} className="group relative">
                  <button title={`${t.label}\n${t.ref} · click to insert, or drag onto the canvas`} draggable
                    onDragStart={(e) => { e.dataTransfer.setData(ASSET_MIME, t.ref); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => void insertAsset(t.ref, st)}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg text-fg-muted hover:bg-panel-3 hover:text-fg">
                    <Preview iconRefStr={t.ref} sets={sets} brand={st.brandColors} />
                    {(family === 'logos' || family === CUSTOM_SET) && <span className="w-full truncate px-1 text-center text-[9.5px] leading-none text-fg-subtle">{labelOf(t, sets)}</span>}
                  </button>
                  {family === CUSTOM_SET && (
                    <button title={confirm === t.label ? 'Click again to delete' : 'Delete'} onMouseLeave={() => setConfirm(null)}
                      onClick={() => { if (confirm === t.label) { void removeCustomIcon(t.label); setConfirm(null); } else setConfirm(t.label); }}
                      className={cn('absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-panel-2 opacity-0 group-hover:opacity-100',
                        confirm === t.label ? 'text-danger opacity-100' : 'text-fg-subtle hover:text-fg')}><Trash2 size={11} /></button>
                  )}
                </div>
              ))}
            </div>
            {tiles && tiles.length > shown.length && (
              <button onClick={() => setLimit((l) => l + PAGE * 2)} className="mt-2 h-8 w-full rounded-lg bg-panel-2 text-[11.5px] text-fg-muted hover:bg-panel-3 hover:text-fg">
                Show more ({tiles.length - shown.length} left)
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-2 text-[11.5px] text-fg-subtle">
        <div className="flex items-center gap-0.5">
          {SIZES.map((s) => (
            <button key={s} onClick={() => setSt({ ...st, size: s })} className={cn('h-6 rounded-md px-1.5', st.size === s ? 'bg-panel-3 text-fg' : 'hover:text-fg')}>{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSt({ ...st, color: null })} className={cn('h-6 rounded-md px-1.5', st.color === null ? 'bg-panel-3 text-fg' : 'hover:text-fg')} title="Dark ink, light on the dark page">Auto</button>
          <input type="color" aria-label="Icon colour" value={st.color ?? '#18181b'} onChange={(e) => setSt({ ...st, color: e.target.value })}
            className={cn('h-6 w-7 cursor-pointer rounded-md bg-transparent', st.color !== null && 'ring-1 ring-accent')} />
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={st.brandColors} onChange={(e) => setSt({ ...st, brandColors: e.target.checked })} className="accent-accent" />Brand colours for logos
        </label>
        <span className="ml-auto truncate">{meta ? `${meta.label} · ${meta.licence}` : family === CUSTOM_SET ? 'My icons' : 'All sets'}</span>
      </div>
    </div>
  );
}

function Collection({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px]', active ? 'bg-panel-3 text-fg' : 'text-fg-muted hover:bg-panel-2 hover:text-fg')}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-[10.5px] text-fg-subtle">{count.toLocaleString()}</span>}
    </button>
  );
}

/** Brand colours too dark to see on the panel. */
function tooDark(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 60;
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-8 text-center text-[12px] leading-relaxed text-fg-subtle">{children}</p>;

function labelOf(t: Tile, sets: Record<string, IconSet>) {
  const [set, name] = t.ref.includes(':') ? t.ref.split(/:(.+)/) as [string, string] : ['lucide', t.ref];
  return getIcon(sets[set], name)?.title ?? t.label;
}

/** One grid preview: the set's own path, or the uploaded icon's picture. */
function Preview({ iconRefStr, sets, brand }: { iconRefStr: string; sets: Record<string, IconSet>; brand: boolean }) {
  const custom = useStore((s) => s.customIcons);
  const [set, name] = iconRefStr.includes(':') ? iconRefStr.split(/:(.+)/) as [string, string] : ['lucide', iconRefStr];
  if (set === CUSTOM_SET) {
    const mine = custom?.find((i) => i.name === name);
    return mine?.preview ? <img src={mine.preview} alt="" className="h-6 w-6 object-contain" draggable={false} /> : <span className="h-6 w-6 rounded bg-panel-3" />;
  }
  const icon = getIcon(sets[set], name);
  if (!icon) return <span className="h-5 w-5" />;
  const vb = icon.set.viewBox;
  return (
    <svg width={22} height={22} viewBox={`0 0 ${vb} ${vb}`} aria-hidden>
      {icon.set.mode === 'stroke'
        ? <path d={icon.d} fill="none" stroke="currentColor" strokeWidth={icon.set.stroke ?? 2} strokeLinecap="round" strokeLinejoin="round" />
        : <path d={icon.d} fill={brand && icon.brand && !tooDark(icon.brand) ? icon.brand : 'currentColor'} fillRule={icon.evenodd ? 'evenodd' : 'nonzero'} />}
    </svg>
  );
}
