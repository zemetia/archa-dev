import type { ReactNode } from 'react';
import { CircleAlert, Info, X } from 'lucide-react';
import { toast, useStore } from '../../lib/store';
import { cn } from '../controls';

/* Building blocks shared by the Settings pages. */

type Client = NonNullable<ReturnType<typeof useStore.getState>['client']>;

/** Runs an RPC with a busy flag; errors become toasts. */
export async function call(setBusy: (v: boolean) => void, fn: (client: Client) => Promise<void>) {
  const client = useStore.getState().client;
  if (!client) return;
  setBusy(true);
  try {
    await fn(client);
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    setBusy(false);
  }
}

export async function openFolder(path: string) {
  const err = await window.archa.openFolder(path);
  if (err) toast(err, 'error');
}

export function copyText(text: string, label = 'Copied') {
  void navigator.clipboard.writeText(text);
  toast(label);
}

export function PageHeader({ title, description, actions }: { title: string; description: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-[620px] text-[12px] leading-relaxed text-fg-muted">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export type ChipTone = 'ok' | 'warn' | 'danger' | 'accent';

export function Chip({ children, tone, title }: { children: ReactNode; tone?: ChipTone; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium',
      !tone && 'bg-panel-3 text-fg-muted', tone === 'ok' && 'bg-ok/15 text-ok', tone === 'warn' && 'bg-warn/15 text-warn',
      tone === 'danger' && 'bg-danger/15 text-danger', tone === 'accent' && 'bg-accent-soft text-accent-fg')}>
      {children}
    </span>
  );
}

export function SoonChip() {
  return <Chip tone="accent">Coming soon</Chip>;
}

export function IconAction({ title, onClick, children, active, disabled }: { title: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-3 hover:text-fg disabled:opacity-40', active && 'text-accent-fg')}>
      {children}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex h-8 items-center justify-between gap-3">
      <h3 className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold">{children}</h3>
      {action}
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'warn' | 'info' | 'danger' }) {
  const Icon = tone === 'info' ? Info : CircleAlert;
  return (
    <div className={cn('flex items-start gap-2 rounded-xl px-4 py-3 text-[12px] leading-relaxed',
      tone === 'warn' && 'bg-warn/10 text-warn', tone === 'danger' && 'bg-danger/10 text-danger', tone === 'info' && 'bg-panel-2 text-fg-muted')}>
      <Icon size={14} className="mt-0.5 shrink-0" /><div className="min-w-0">{children}</div>
    </div>
  );
}

export function FormCard({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-panel-2/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold">{title}</span>
        <button onClick={onCancel} title="Cancel" className="flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-panel-3 hover:text-fg"><X size={13} /></button>
      </div>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11.5px] font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-3 text-[10.5px] font-semibold text-fg-muted">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div className="text-[12px] text-fg">{title}</div>
        {children}
      </div>
    </li>
  );
}

/** A dashed placeholder for an empty list. */
export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-8 text-center">
      {icon}
      <div className="text-[12.5px] font-medium">{title}</div>
      {children && <p className="max-w-[400px] text-[11.5px] leading-relaxed text-fg-muted">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Monospace text with a copy button. */
export function CodeLine({ text, label }: { text: string; label?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-app/60 px-3 py-2">
      <code className="min-w-0 flex-1 select-text whitespace-pre-wrap break-all font-mono text-[11px] text-fg-muted">{text}</code>
      <button onClick={() => copyText(text, label ?? 'Copied')} className="shrink-0 text-[11px] text-fg-subtle hover:text-fg">Copy</button>
    </div>
  );
}
