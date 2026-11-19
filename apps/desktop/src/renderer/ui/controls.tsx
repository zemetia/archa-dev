import { useEffect, useRef, useState, type ReactNode } from 'react';
import { colorToHex, hexToColor, type Color } from '@archa/schema';

export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Section({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  const body = children !== undefined && children !== null && children !== false;
  return (
    <div className="border-b border-line px-4 py-3">
      <div className={cn('flex h-6 items-center justify-between gap-1', body && 'mb-2')}>
        <span className="text-[12px] font-semibold text-fg">{title}</span>
        {action && <div className="-mr-1.5 flex items-center gap-0.5">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function IconButton({ title, active, onClick, children, className, disabled }: { title: string; active?: boolean; onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}
      className={cn('no-drag flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-3 hover:text-fg disabled:pointer-events-none disabled:opacity-35', active && 'bg-accent-soft text-accent-fg hover:bg-accent-soft hover:text-accent-fg', className)}>
      {children}
    </button>
  );
}

/** Number input with drag-to-scrub on the label; commits on Enter/blur. */
export function NumberField({ label, value, onCommit, min, max, step = 1, suffix, disabled }: {
  label: ReactNode; value: number | null; onCommit: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value === null ? '' : fmt(value)); }, [value]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commitText = () => {
    const v = Number(text);
    if (text.trim() !== '' && Number.isFinite(v) && v !== value) onCommit(clamp(v));
    else setText(value === null ? '' : fmt(value));
  };
  const scrub = (e: React.PointerEvent) => {
    if (disabled || value === null) return;
    const startX = e.clientX, start = value;
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clamp(Math.round((start + (ev.clientX - startX) * step * (ev.shiftKey ? 10 : 1)) / step) * step);
      setText(fmt(last));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (last !== start) onCommit(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <label className={cn('flex h-8 min-w-0 items-center gap-1.5 rounded-lg bg-panel-2 px-2 ring-1 ring-transparent focus-within:ring-accent', disabled && 'opacity-50')}>
      <span onPointerDown={scrub} className="cursor-ew-resize select-none text-[11px] text-fg-subtle">{label}</span>
      <input value={text} disabled={disabled} onChange={(e) => setText(e.target.value)}
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={() => { focused.current = false; commitText(); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = clamp((Number(text) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
            setText(fmt(v));
            onCommit(v);
          }
        }}
        className="w-full min-w-0 bg-transparent text-[12px]" />
      {suffix && <span className="text-[11px] text-fg-subtle">{suffix}</span>}
    </label>
  );
}

const fmt = (v: number) => String(Math.round(v * 100) / 100);

export function ColorField({ color, onCommit }: { color: Color; onCommit: (c: Color) => void }) {
  const hex = colorToHex(color);
  const alpha = Math.round(color.a * 100);
  const [text, setText] = useState(hex.slice(1).toUpperCase());
  const [alphaText, setAlphaText] = useState(String(alpha));
  useEffect(() => { setText(hex.slice(1).toUpperCase()); }, [hex]);
  useEffect(() => { setAlphaText(String(alpha)); }, [alpha]);
  const commitHex = (h: string) => {
    try {
      const c = hexToColor(h.startsWith('#') ? h : `#${h}`);
      // An 8-digit hex carries its own alpha; otherwise the current one is kept.
      onCommit({ ...c, a: /^#?[0-9a-f]{8}$/i.test(h) ? c.a : color.a });
    } catch {
      setText(hex.slice(1).toUpperCase());
    }
  };
  const commitAlpha = () => {
    const v = Number(alphaText);
    if (alphaText.trim() === '' || !Number.isFinite(v)) { setAlphaText(String(alpha)); return; }
    const a = Math.min(100, Math.max(0, v)) / 100;
    if (a !== color.a) onCommit({ ...color, a });
    else setAlphaText(String(alpha));
  };
  const blur = (e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); };
  const css = colorToHex(color, true);
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg bg-panel-2 ring-1 ring-transparent focus-within:ring-accent">
      <label className="relative ml-1.5 h-[18px] w-[18px] shrink-0 cursor-pointer overflow-hidden rounded-[5px] ring-1 ring-line"
        style={{ background: `linear-gradient(${css}, ${css}), repeating-conic-gradient(var(--color-panel-3) 0 25%, var(--color-fg-subtle) 0 50%) 0 0 / 8px 8px` }}>
        <input type="color" value={hex} onChange={(e) => commitHex(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick colour" />
      </label>
      <input value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={() => commitHex(text)} onKeyDown={blur}
        onFocus={(e) => e.target.select()} aria-label="Hex colour"
        className="h-full w-full min-w-0 bg-transparent pl-2 font-mono text-[12px] uppercase" />
      <span className="h-4 w-px shrink-0 bg-line" />
      <input value={alphaText} onChange={(e) => setAlphaText(e.target.value)} onBlur={commitAlpha} onKeyDown={blur}
        onFocus={(e) => e.target.select()} title="Opacity" aria-label="Colour opacity"
        className="h-full w-9 shrink-0 bg-transparent text-right text-[12px]" />
      <span className="pl-0.5 pr-2 text-[11px] text-fg-subtle">%</span>
    </div>
  );
}

/** Compact checkbox row with the app's tokens. */
export function Check({ label, checked, onChange, disabled, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label title={title} className={cn('flex h-7 min-w-0 cursor-pointer select-none items-center gap-2 text-[12px] text-fg-muted hover:text-fg', disabled && 'pointer-events-none opacity-40')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ring-inset transition-colors peer-focus-visible:ring-accent', checked ? 'bg-accent ring-accent' : 'bg-panel-2 ring-line')}>
        {checked && <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-white stroke-[1.8]"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
      </span>
      <span className="truncate">{label}</span>
    </label>
  );
}

/** Icon button that opens a small menu of actions below it. */
export function MenuButton({ title, children, items, className }: {
  title: string; children: ReactNode; className?: string;
  items: Array<{ label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <IconButton title={title} active={open} onClick={() => setOpen((o) => !o)} className={className}>{children}</IconButton>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-line bg-panel p-1 shadow-2xl">
          {items.map((it) => (
            <button key={it.label} role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect(); }}
              className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] text-fg-muted hover:bg-panel-3 hover:text-fg disabled:opacity-40">
              {it.icon && <span className="flex w-4 justify-center text-fg-subtle">{it.icon}</span>}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: ReactNode; title: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex h-8 rounded-lg bg-panel-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} title={o.title} onClick={() => onChange(o.value)}
          className={cn('flex flex-1 items-center justify-center rounded-md text-[12px] text-fg-muted hover:text-fg', value === o.value && 'bg-panel-3 text-fg shadow-sm')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-panel-3', disabled && 'opacity-40')}>
      <span className={cn('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-fg shadow transition-[left]', checked ? 'left-[14px]' : 'left-[2px]')} />
    </button>
  );
}

export function Button({ children, onClick, variant = 'secondary', disabled, title, className, type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; title?: string; className?: string; type?: 'button' | 'submit';
}) {
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick}
      className={cn('inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary' && 'bg-accent text-white hover:brightness-110',
        variant === 'secondary' && 'bg-panel-3 text-fg hover:bg-line',
        variant === 'ghost' && 'text-fg-muted hover:bg-panel-3 hover:text-fg',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className)}>
      {children}
    </button>
  );
}

export function TextInput({ value, onChange, placeholder, mono, type = 'text', autoFocus, onEnter, ariaLabel }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: 'text' | 'password'; autoFocus?: boolean; onEnter?: () => void; ariaLabel?: string;
}) {
  return (
    <input value={value} type={type} autoFocus={autoFocus} placeholder={placeholder} aria-label={ariaLabel ?? placeholder} spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && onEnter) onEnter(); }}
      className={cn('h-8 w-full min-w-0 rounded-lg bg-panel-2 px-2.5 text-[12px] ring-1 ring-line placeholder:text-fg-subtle focus:ring-accent', mono && 'font-mono text-[11.5px]')} />
  );
}

export function Select<T extends string>({ value, options, onChange, title }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; title?: string }) {
  return (
    <select title={title} value={value} onChange={(e) => onChange(e.target.value as T)}
      className="h-8 min-w-0 flex-1 rounded-lg bg-panel-2 px-2 text-[12px]">
      {options.map((o) => <option key={o.value} value={o.value} className="bg-panel">{o.label}</option>)}
    </select>
  );
}
