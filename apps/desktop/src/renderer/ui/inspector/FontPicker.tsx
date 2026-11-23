import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../controls';
import { BUNDLED_FONTS, FALLBACK_FONTS, loadLocalFonts } from '../../lib/fonts';

const MENU_HEIGHT = 320;

/** Font family combobox: a searchable list of the installed fonts, each previewed in its own face. */
export function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? fonts.filter((f) => f.toLowerCase().includes(q)) : fonts;
  }, [fonts, query]);
  // A typed name that is not installed can still be used (e.g. a web font the export will load).
  const custom = query.trim() && !fonts.some((f) => f.toLowerCase() === query.trim().toLowerCase()) ? query.trim() : null;
  const options = custom ? [...matches, custom] : matches;

  const show = () => {
    // Asked from the click so the font permission sees a user gesture.
    void loadLocalFonts().then(setFonts);
    setQuery('');
    setOpen(true);
  };
  const choose = (family: string) => {
    setOpen(false);
    if (family !== value) onChange(family);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const up = window.innerHeight - r.bottom < MENU_HEIGHT + 8 && r.top > window.innerHeight - r.bottom;
      setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 220), up });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as globalThis.Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => { if (!menu.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);

  // Start on the current font, then follow the filter.
  useEffect(() => {
    if (!open) return;
    const i = query ? 0 : Math.max(0, options.indexOf(value));
    setActive(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, fonts]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, pos]);

  return (
    <>
      <button ref={button} type="button" title="Font" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        className={cn('flex h-8 w-full min-w-0 items-center gap-2 rounded-lg bg-panel-2 px-2 text-left text-[12px] ring-1 ring-transparent', open && 'ring-accent')}>
        <span className="min-w-0 flex-1 truncate" style={{ fontFamily: `"${value}", Inter, system-ui, sans-serif` }}>{value}</span>
        <ChevronDown size={13} className="shrink-0 text-fg-subtle" />
      </button>
      {open && pos && createPortal(
        <div ref={menu} role="dialog" aria-label="Choose font"
          onKeyDown={(e) => e.stopPropagation()}
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line px-2.5">
            <Search size={13} className="shrink-0 text-fg-subtle" />
            <input autoFocus value={query} placeholder={`Search ${fonts.length} fonts`} aria-label="Search fonts"
              aria-controls="font-picker-list" aria-activedescendant={options.length ? `font-option-${active}` : undefined}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) choose(options[active]); }
                else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); }
              }}
              className="h-9 min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-fg-subtle" />
          </div>
          <div ref={list} id="font-picker-list" role="listbox" style={{ maxHeight: MENU_HEIGHT - 37 }} className="overflow-y-auto p-1">
            {options.length === 0 && <div className="px-2.5 py-2 text-[12px] text-fg-subtle">No fonts match</div>}
            {options.map((f, i) => (
              <div key={f + (f === custom ? ':custom' : '')} id={`font-option-${i}`} data-index={i} role="option" aria-selected={f === value}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(f)}
                className={cn('flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-[13px]', i === active ? 'bg-panel-3 text-fg' : 'text-fg-muted')}>
                <span className="flex w-3.5 shrink-0 justify-center text-accent">{f === value && <Check size={13} />}</span>
                {f === custom
                  ? <span className="truncate">Use “{f}”</span>
                  : <span className="min-w-0 flex-1 truncate" style={{ fontFamily: `"${f}", Inter, system-ui, sans-serif` }}>{f}</span>}
                {BUNDLED_FONTS.includes(f) && <span title="Ships with ArchaDev: looks the same on every machine" className="shrink-0 text-[10.5px] text-fg-subtle">Built-in</span>}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
