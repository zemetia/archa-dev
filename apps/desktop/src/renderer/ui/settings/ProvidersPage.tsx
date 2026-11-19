import { useState, type ReactNode } from 'react';
import {
  Check, CircleAlert, Copy, ExternalLink, KeyRound, Loader2, Lock, LogIn, Monitor, MonitorCheck, Plus, RefreshCw, Save, Star, Trash2,
} from 'lucide-react';
import type { AccountAgent, AgentAccount, AgentCli } from '@archa/protocol';
import { loadAccounts, toast, useStore } from '../../lib/store';
import { Button, cn, Segmented, Switch, TextInput } from '../controls';
import { BrandTile, type Brand } from './Logo';
import { call, Chip, Empty, Field, FormCard, IconAction, Notice, openFolder, PageHeader, SectionTitle, SoonChip, Step } from './kit';

/*
 * Settings → AI providers: every agent CLI's login profiles on one page (blueprint AGENT_BRIDGE/02).
 * The core host owns the profiles; this view only calls `accounts.*` and re-reads on `accounts.changed`.
 */

const AGENT_COPY: Record<AccountAgent, { blurb: string; tone: string; brand: Brand; vendor: string }> = {
  claude: {
    blurb: 'Each account gets its own config folder (CLAUDE_CONFIG_DIR). Sign in once and ArchaDev runs Claude Code as the account you pick.',
    tone: 'bg-claude/15 text-claude', brand: 'claude', vendor: 'Anthropic',
  },
  agy: {
    blurb: 'Antigravity keeps one Google login per computer, in the system keyring. Save each login here, then switch between them with one click.',
    tone: 'bg-agy/15 text-agy', brand: 'agy', vendor: 'Google',
  },
  codex: {
    blurb: 'Each account gets its own CODEX_HOME. Sign in with ChatGPT, or save an OpenAI API key.',
    tone: 'bg-codex/15 text-codex', brand: 'codex', vendor: 'OpenAI',
  },
};

/** Providers that are planned but not wired to a runner yet. */
const UPCOMING: Array<{ brand: Brand; label: string; blurb: string }> = [
  { brand: 'gemini', label: 'Gemini CLI', blurb: 'Google\'s open-source agent CLI, with a Gemini API key or a Google login.' },
  { brand: 'ollama', label: 'Ollama', blurb: 'Local models on this computer — no account, nothing leaves the machine.' },
  { brand: 'openrouter', label: 'OpenRouter', blurb: 'One API key for hundreds of hosted models.' },
];

export function ProvidersPage() {
  const data = useStore((s) => s.accounts);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
  };

  return (
    <>
      <PageHeader title="AI providers"
        description="Sign in to the coding agents ArchaDev can drive. Runs use this computer's own login unless you add accounts — add more to keep work and personal apart, or to switch when one hits its usage limit."
        actions={<Button variant="ghost" onClick={() => void refresh()} title="Re-check logins"><RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />Re-check</Button>} />
      {!data ? (
        <div className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 size={14} className="animate-spin" />Checking installed agents…</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {data.clis.map((c) => {
              const ready = c.host.signedIn || data.accounts.some((a) => a.agent === c.id && a.signedIn && a.enabled);
              return (
                <button key={c.id} onClick={() => document.getElementById(`provider-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  title={!c.bin ? 'CLI not installed' : ready ? 'Ready' : 'No signed-in account'}
                  className="flex h-8 items-center gap-2 rounded-full border border-line bg-panel-2/60 pl-1 pr-3 text-[12px] text-fg-muted hover:bg-panel-3 hover:text-fg">
                  <BrandTile brand={AGENT_COPY[c.id].brand} size="sm" />{c.label}
                  <span className={cn('h-1.5 w-1.5 rounded-full', !c.bin ? 'bg-fg-subtle/50' : ready ? 'bg-ok' : 'bg-warn')} />
                </button>
              );
            })}
          </div>
          {data.clis.map((c) => (
            <ProviderSection key={c.id} cli={c} accounts={data.accounts.filter((a) => a.agent === c.id)} />
          ))}
          <div className="pt-2">
            <SectionTitle>More providers <SoonChip /></SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {UPCOMING.map((u) => (
                <div key={u.label} className="rounded-xl border border-line bg-panel-2/40 p-3.5">
                  <div className="flex items-center gap-2.5"><BrandTile brand={u.brand} size="sm" muted /><span className="text-[12.5px] font-medium">{u.label}</span></div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">{u.blurb}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <Lock size={11} className="shrink-0" />Logins stay on this computer. Profiles folder:
            <button onClick={() => void openFolder(data.profilesDir)} className="truncate font-mono hover:text-fg-muted hover:underline">{data.profilesDir}</button>
          </p>
        </div>
      )}
    </>
  );
}

function ProviderSection({ cli, accounts }: { cli: AgentCli; accounts: AgentAccount[] }) {
  const copy = AGENT_COPY[cli.id];
  return (
    <section id={`provider-${cli.id}`} className="scroll-mt-4 rounded-2xl border border-line bg-panel-2/30 p-5">
      <div className="mb-4 flex items-start gap-3">
        <BrandTile brand={copy.brand} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight">{cli.label}</h3>
            <span className="text-[11px] text-fg-subtle">{copy.vendor}</span>
            <CliPill cli={cli} />
          </div>
          <p className="mt-1 max-w-[560px] text-[11.5px] leading-relaxed text-fg-muted">{copy.blurb}</p>
        </div>
      </div>
      <div className="space-y-5">
        <AgentPage agent={cli.id} cli={cli} accounts={accounts} />
      </div>
    </section>
  );
}

function AgentPage({ agent, cli, accounts }: { agent: AccountAgent; cli: AgentCli; accounts: AgentAccount[] }) {
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const defaultAccount = accounts.find((a) => a.isDefault);
  // Claude has only one way in, so Add account goes straight to the browser sign-in; the account takes the login's e-mail.
  const startAdd = () => {
    if (agent !== 'claude') { setAdding(true); return; }
    void call(setCreating, async (c) => {
      const a = await c.call('accounts.create', { agent });
      if (cli.bin) void startLogin(a.id);
    });
  };
  const addButton = (variant: 'primary' | 'secondary') => (
    <Button variant={variant} disabled={creating} onClick={startAdd}>{creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Add account</Button>
  );

  return (
    <>
      {!cli.bin && (
        <Notice tone="warn">
          {cli.label} CLI was not found on PATH. You can still add accounts; install the CLI to sign in and run it.
        </Notice>
      )}

      <div>
        <SectionTitle>This computer</SectionTitle>
        <HostCard agent={agent} cli={cli} usedForRuns={!defaultAccount} />
      </div>

      <div>
        <SectionTitle action={!adding && (
          addButton('secondary')
        )}>
          Accounts {accounts.length > 0 && <span className="ml-1 font-normal text-fg-subtle">{accounts.length}</span>}
        </SectionTitle>
        <div className="space-y-2">
          {adding && <AddAccount agent={agent} cli={cli} onDone={() => setAdding(false)} />}
          {accounts.map((a) => <AccountRow key={a.id} account={a} />)}
          {!adding && accounts.length === 0 && (
            <Empty icon={<BrandTile brand={AGENT_COPY[agent].brand} size="md" muted />} title={`No saved ${cli.label} accounts`}
              action={addButton('primary')}>
              Runs use this computer's own login.
            </Empty>
          )}
        </div>
      </div>

    </>
  );
}

/* --------------------------------- host ---------------------------------- */

function HostCard({ agent, cli, usedForRuns }: { agent: AccountAgent; cli: AgentCli; usedForRuns: boolean }) {
  const [busy, setBusy] = useState(false);
  const h = cli.host;
  const saved = !!h.savedAccountId;

  const capture = () => call(setBusy, async (c) => {
    const a = await c.call('accounts.captureHost', { agent: 'agy' });
    toast(`Saved agy login ${a.email || a.name}`);
  });

  return (
    <div className="flex items-center gap-3 rounded-xl bg-panel-2 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel-3 text-fg-muted"><Monitor size={16} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {h.signedIn ? (
            <>
              <span className="truncate font-medium">{h.email || 'Signed in'}</span>
              {h.plan && <Chip>{h.plan}</Chip>}
            </>
          ) : <span className="text-fg-muted">Not signed in</span>}
          {saved && <Chip tone="ok"><Check size={10} />Saved</Chip>}
        </div>
        <div className="mt-0.5 text-[11.5px] text-fg-subtle">
          {h.error ? <span className="text-danger">{h.error}</span>
            : agent === 'agy' ? (h.signedIn ? 'The login agy uses right now, in the system keyring.' : 'Run `agy` in a terminal and sign in, then save that login here.')
            : usedForRuns ? 'Used for runs — no default account is set.' : 'Not used for runs — a default account is set below.'}
        </div>
      </div>
      {agent === 'agy' && h.signedIn && (
        <Button variant={saved ? 'ghost' : 'primary'} disabled={busy} onClick={capture} title={saved ? 'Save the latest token of this login again' : undefined}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{saved ? 'Update saved copy' : 'Save as account'}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------- accounts -------------------------------- */

function AccountRow({ account: a }: { account: AgentAccount }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [starting, setStarting] = useState(false);
  const signingIn = starting || !!a.login;
  const title = a.name;
  const subtitle = a.email && a.email.toLowerCase() !== a.name.toLowerCase() ? a.email : '';

  const update = (patch: { enabled?: boolean; isDefault?: boolean; name?: string }, ok?: string) =>
    call((v) => setBusy(v ? 'update' : null), async (c) => { await c.call('accounts.update', { id: a.id, ...patch }); if (ok) toast(ok); });

  const signIn = () => startLogin(a.id, setStarting);

  const useOnHost = () => call((v) => setBusy(v ? 'host' : null), async (c) => {
    await c.call('accounts.useOnHost', { id: a.id });
    toast(`agy on this computer now uses ${a.email || a.name}`);
  });

  const remove = () => call((v) => setBusy(v ? 'delete' : null), async (c) => {
    await c.call('accounts.delete', { id: a.id });
    toast(`Removed ${a.name}`);
  });

  return (
    <div className={cn('rounded-xl border bg-panel-2/40 transition-colors', a.isDefault ? 'border-accent/50' : 'border-line', !a.enabled && 'opacity-60')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar text={a.email || a.name} agent={a.agent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[12.5px] font-medium">{title}</span>
            {a.isDefault && <Chip tone="accent"><Star size={9} fill="currentColor" />Default</Chip>}
            {signingIn ? <Chip tone="accent"><Loader2 size={10} className="animate-spin" />Signing in</Chip>
              : a.signedIn ? <Chip tone="ok">Signed in{a.plan ? ` · ${a.plan}` : ''}</Chip>
              : <Chip tone="warn">Not signed in</Chip>}
            {!a.enabled && <Chip>Disabled</Chip>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-fg-subtle">
            {subtitle && <><span className="truncate">{subtitle}</span><span>·</span></>}
            <button onClick={() => void openFolder(a.dir)} title="Open profile folder" className="truncate font-mono hover:text-fg-muted hover:underline">{a.dir}</button>
            {!a.managed && <span className="shrink-0">(linked)</span>}
          </div>
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-fg-muted">{a.managed ? 'Remove and delete its saved login?' : 'Remove? The folder stays.'}</span>
            <Button variant="danger" disabled={busy === 'delete'} onClick={remove}>{busy === 'delete' ? <Loader2 size={13} className="animate-spin" /> : 'Remove'}</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            {a.agent !== 'agy' && !signingIn && (
              <Button variant={a.signedIn ? 'ghost' : 'primary'} onClick={signIn}><LogIn size={13} />{a.signedIn ? 'Sign in again' : 'Sign in'}</Button>
            )}
            {a.agent === 'agy' && a.signedIn && (
              <Button variant="ghost" disabled={busy === 'host'} onClick={useOnHost} title="Make this the login agy uses on this computer">
                {busy === 'host' ? <Loader2 size={13} className="animate-spin" /> : <MonitorCheck size={13} />}Use on this computer
              </Button>
            )}
            {a.agent !== 'agy' && (
              <IconAction title={a.isDefault ? 'Default for runs — click to use this computer\'s login instead' : 'Use for runs by default'} active={a.isDefault}
                onClick={() => update({ isDefault: !a.isDefault }, a.isDefault ? 'Runs use this computer\'s login' : `Runs now use ${a.name}`)}>
                <Star size={14} fill={a.isDefault ? 'currentColor' : 'none'} />
              </IconAction>
            )}
            <div className="px-1.5"><Switch checked={a.enabled} label={a.enabled ? `Disable ${a.name}` : `Enable ${a.name}`} onChange={(v) => update({ enabled: v })} /></div>
            <IconAction title="Remove account" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></IconAction>
          </div>
        )}
      </div>
      {signingIn && <SignInPanel account={a} starting={starting} onRetry={signIn} />}
    </div>
  );
}

function SignInPanel({ account: a, starting, onRetry }: { account: AgentAccount; starting: boolean; onRetry: () => void }) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const l = a.login;
  const cancel = () => void useStore.getState().client?.call('accounts.login.cancel', { id: a.id });

  const submit = () => call(setSending, async (c) => {
    const r = await c.call('accounts.login.code', { id: a.id, code: code.trim() });
    toast(`Signed in${r.email ? ` as ${r.email}` : ''}`);
    setCode('');
  });

  let body: ReactNode;
  if (starting || !l) {
    body = <div className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 size={13} className="animate-spin" />Starting {a.agent === 'claude' ? 'Claude' : 'Codex'} sign-in…</div>;
  } else if (!l.active) {
    body = (
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-[12px] text-danger"><CircleAlert size={14} className="mt-0.5 shrink-0" /><span className="whitespace-pre-wrap">{l.error || 'The sign-in ended before it finished.'}</span></div>
        <div className="flex gap-1.5"><Button onClick={onRetry}>Try again</Button><Button variant="ghost" onClick={cancel}>Close</Button></div>
      </div>
    );
  } else {
    const vendor = a.agent === 'claude' ? 'Claude' : 'ChatGPT';
    body = (
      <div className="space-y-3">
        <ol className="space-y-2.5">
          <Step n={1} title={`Sign in with your ${vendor} account in the browser tab that just opened — the account is named after it`}>
            {!l.url && (
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-app/60 p-2 font-mono text-[10.5px] text-fg-subtle">{l.output || 'Opening the sign-in page…'}</pre>
            )}
          </Step>
          <Step n={2} title="Come back here — this closes on its own once the browser says you're signed in">
            <div className="flex items-center gap-2 text-[11.5px] text-fg-muted"><Loader2 size={12} className="animate-spin" />Waiting for {a.agent === 'claude' ? 'Claude Code' : 'Codex'}…</div>
          </Step>
        </ol>
        {l.url && (
          <div className="space-y-2 rounded-lg bg-app/40 p-3">
            <div className="text-[11.5px] text-fg-muted">
              No browser tab? Open the sign-in page yourself{l.needsCode ? ', then paste the code it shows' : ''}.
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" onClick={() => window.open(l.url, '_blank')}><ExternalLink size={13} />Open sign-in page</Button>
              <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(l.url); toast('Link copied'); }}><Copy size={13} />Copy link</Button>
            </div>
            {l.needsCode && (
              <div className="flex gap-1.5">
                <TextInput value={code} onChange={setCode} placeholder="Paste the code here" mono ariaLabel="Sign-in code" onEnter={() => { if (code.trim() && !sending) submit(); }} />
                <Button variant="primary" disabled={!code.trim() || sending} onClick={submit}>
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}Sign in
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end"><Button variant="ghost" onClick={cancel}>Cancel sign-in</Button></div>
      </div>
    );
  }
  return <div className="border-t border-line bg-app/30 px-4 py-3.5">{body}</div>;
}

function AddAccount({ agent, cli, onDone }: { agent: AccountAgent; cli: AgentCli; onDone: () => void }) {
  const [method, setMethod] = useState<'oauth' | 'key'>('oauth');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  if (agent === 'agy') {
    const h = cli.host;
    const capture = () => call(setSaving, async (c) => {
      const a = await c.call('accounts.captureHost', { agent: 'agy' });
      toast(`Saved agy login ${a.email || a.name}`);
      onDone();
    });
    return (
      <FormCard title="Add an Antigravity account" onCancel={onDone}>
        <ol className="space-y-2.5">
          <Step n={1} title="In a terminal, run agy and sign in with the Google account you want to add">
            <code className="inline-block rounded-md bg-app/60 px-2 py-1 font-mono text-[11px] text-fg-muted">agy</code>
          </Step>
          <Step n={2} title="Save that login here">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!h.signedIn || saving} onClick={capture}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save current agy login
              </Button>
              <span className="text-[11.5px] text-fg-subtle">{h.signedIn ? <>agy is signed in as <span className="text-fg-muted">{h.email}</span>{h.savedAccountId ? ' (already saved)' : ''}</> : 'agy is not signed in yet'}</span>
            </div>
          </Step>
          <Step n={3} title="To add another, sign agy in with the next account and save again. Your current login is saved before any switch." />
        </ol>
      </FormCard>
    );
  }

  // Codex: sign in with ChatGPT or save an API key. The account takes the login's e-mail as its name.
  const useKey = method === 'key';
  const canSave = !useKey || !!apiKey.trim();

  const add = () => call(setSaving, async (c) => {
    const a = await c.call('accounts.create', { agent, apiKey: useKey ? apiKey.trim() : undefined });
    onDone();
    if (a.signedIn) toast(`Added ${a.name}`);
    else if (cli.bin) void startLogin(a.id);
  });

  return (
    <FormCard title={`Add a ${cli.label} account`} onCancel={onDone}>
      <div className="space-y-3">
        <Segmented value={method} onChange={setMethod} options={[
          { value: 'oauth', label: 'Sign in with ChatGPT', title: 'Opens the ChatGPT sign-in in your browser' },
          { value: 'key', label: 'OpenAI API key', title: 'Bill usage to an API key' },
        ]} />
        {useKey && (
          <Field label="API key" hint="Saved to this account's auth.json on this computer only.">
            <TextInput value={apiKey} onChange={setApiKey} type="password" mono autoFocus placeholder="sk-…" onEnter={() => { if (canSave && !saving) add(); }} />
          </Field>
        )}
        {!cli.bin && !useKey && <p className="text-[11.5px] text-warn">Install the {cli.label} CLI to sign this account in.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-1.5">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!canSave || saving} onClick={add}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : useKey ? <KeyRound size={13} /> : <LogIn size={13} />}
          {useKey ? 'Save key' : 'Sign in'}
        </Button>
      </div>
    </FormCard>
  );
}

/* -------------------------------- helpers -------------------------------- */

async function startLogin(accountId: string, setStarting?: (v: boolean) => void) {
  const client = useStore.getState().client;
  if (!client) return;
  setStarting?.(true);
  try {
    const st = await client.call('accounts.login.start', { id: accountId });
    if (st.error) toast(st.error, 'error');
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    setStarting?.(false);
  }
}

function Avatar({ text, agent }: { text: string; agent: AccountAgent }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold uppercase', AGENT_COPY[agent].tone)}>
      {text.trim().charAt(0) || '?'}
    </span>
  );
}

function CliPill({ cli }: { cli: AgentCli | undefined }) {
  if (!cli) return null;
  if (!cli.bin) return <Chip tone="warn">Not installed</Chip>;
  return <span title={cli.bin}><Chip tone="ok">Installed{cli.version ? ` · ${cli.version.replace(/^[^\d]*/, '').split(' ')[0]}` : ''}</Chip></span>;
}

