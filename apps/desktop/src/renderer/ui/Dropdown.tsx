import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from './controls';

/*
 * Themed replacement for <select> (native popups ignore the app's tokens on Windows).
 * Opens upward by default because its main home is the chat composer at the bottom of the window.
 */

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  /** Leading element, e.g. an agent colour dot. */
  icon?: ReactNode;
  /** Trailing note such as "Not installed". */
  note?: string;
  disabled?: boolean;
};

export function Dropdown<T extends string>({ value, options, onChange, title, header, loading, placement = 'up', className, menuWidth = 240, footer }: {
  value: T;
  options: Array<DropdownOption<T>>;
  onChange: (v: T) => void;
  title?: string;
  header?: string;
  loading?: boolean;
  placement?: 'up' | 'down';
  className?: string;
  menuWidth?: number;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => { window.removeEventListener('pointerdown', close, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    list.current?.focus();
  }, [open, options, value]);

  const pick = (o: DropdownOption<T> | undefined) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };

  const step = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i]?.disabled) break;
    }
    setActive(i);
  };

  return (
    <div ref={root} className={cn('relative min-w-0', className)}>
      <button type="button" title={title} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={cn('flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-[11.5px] text-fg-muted transition-colors hover:bg-panel-3 hover:text-fg', open && 'bg-panel-3 text-fg')}>
        {current?.icon}
        <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? 'Choose…'}</span>
        {loading ? <Loader2 size={11} className="shrink-0 animate-spin" /> : <ChevronDown size={11} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <div ref={list} role="listbox" tabIndex={-1} style={{ width: menuWidth }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active]); }
          }}
          className={cn('absolute left-0 z-50 max-h-[320px] overflow-y-auto rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/50 outline-none',
            placement === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>
          {header && <div className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">{header}</div>}
          {options.map((o, i) => (
            <button key={o.value || '__default'} type="button" role="option" aria-selected={o.value === value} disabled={o.disabled}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
              className={cn('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left',
                i === active && !o.disabled && 'bg-panel-3', o.disabled && 'cursor-not-allowed opacity-45')}>
              {o.icon && <span className="mt-[3px] flex shrink-0">{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn('truncate text-[12px]', o.value === value ? 'font-medium text-fg' : 'text-fg-muted')}>{o.label}</span>
                  {o.note && <span className="shrink-0 rounded bg-panel px-1 py-px text-[9.5px] text-fg-subtle">{o.note}</span>}
                </span>
                {o.description && <span className="block truncate text-[10.5px] text-fg-subtle">{o.description}</span>}
              </span>
              {o.value === value && <Check size={12} className="mt-[3px] shrink-0 text-accent-fg" />}
            </button>
          ))}
          {footer && <div className="mt-1 border-t border-line pt-1">{footer}</div>}
        </div>
      )}
    </div>
  );
}
