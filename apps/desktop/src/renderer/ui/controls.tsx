import { useEffect, useRef, useState, type ReactNode } from 'react';
import { colorToHex, hexToColor, type Color } from '@archa/schema';

export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Section({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex h-5 items-center justify-between">
        <span className="text-[12px] font-semibold text-fg">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export function IconButton({ title, active, onClick, children, className }: { title: string; active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button title={title} onClick={onClick}
      className={cn('no-drag flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-3 hover:text-fg', active && 'bg-accent-soft text-accent-fg hover:bg-accent-soft hover:text-accent-fg', className)}>
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
  const [text, setText] = useState(hex.slice(1).toUpperCase());
  useEffect(() => setText(hex.slice(1).toUpperCase()), [hex]);
  const commitHex = (h: string) => {
    try {
      const c = hexToColor(h);
      onCommit({ ...c, a: color.a });
    } catch {
      setText(hex.slice(1).toUpperCase());
    }
  };
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-panel-2 px-2">
      <input type="color" value={hex} onChange={(e) => commitHex(e.target.value)} className="h-4 w-4 shrink-0 cursor-pointer" />
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => commitHex(text)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full min-w-0 bg-transparent font-mono text-[12px] uppercase" />
      <input value={Math.round(color.a * 100)} onChange={() => undefined}
        onBlur={(e) => onCommit({ ...color, a: Math.min(1, Math.max(0, Number(e.target.value) / 100 || 0)) })}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-8 bg-transparent text-right text-[12px]" title="Opacity %" />
      <span className="text-[11px] text-fg-subtle">%</span>
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
