import { useEffect, useState, type ReactNode } from 'react';
import {
  Check, CircleAlert, Copy, ExternalLink, FolderOpen, KeyRound, Loader2, Lock, LogIn, Monitor, MonitorCheck, Plus, RefreshCw, Save, Star, Trash2, X,
} from 'lucide-react';
import type { AccountAgent, AgentAccount, AgentCli } from '@archa/protocol';
import { loadAccounts, toast, useStore } from '../lib/store';
import { Button, cn, Segmented, Switch, TextInput } from './controls';

/*
 * Settings → Agents: login profiles for Claude Code, Antigravity and Codex (blueprint AGENT_BRIDGE/02).
 * The core host owns the profiles; this view only calls `accounts.*` and re-reads on `accounts.changed`.
 */

const AGENT_COPY: Record<AccountAgent, { blurb: string; tone: string; mark: string }> = {
  claude: {
    blurb: 'Each account gets its own config folder (CLAUDE_CONFIG_DIR). Sign in once and ArchaDev runs Claude Code as the account you pick.',
    tone: 'bg-claude/15 text-claude', mark: 'C',
  },
  agy: {
    blurb: 'Antigravity keeps one Google login per computer, in the system keyring. Save each login here, then switch between them with one click.',
    tone: 'bg-agy/15 text-agy', mark: 'A',
  },
  codex: {
    blurb: 'Each account gets its own CODEX_HOME. Sign in with ChatGPT, or save an OpenAI API key.',
    tone: 'bg-codex/15 text-codex', mark: 'X',
  },
};

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const data = useStore((s) => s.accounts);
  const [agent, setAgent] = useState<AccountAgent>('claude');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadAccounts();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const cli = data?.clis.find((c) => c.id === agent);
  const accounts = (data?.accounts ?? []).filter((a) => a.agent === agent);

  const refresh = async () => {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
  };

  return (
    <div className="no-drag fixed inset-0 z-40 flex items-center justify-center bg-app/75 p-6 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Settings"
        className="flex h-[min(700px,calc(100vh-64px))] w-[min(980px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <nav className="flex w-[232px] shrink-0 flex-col border-r border-line bg-app/40 p-3">
          <div className="px-2 pb-4 pt-1 text-[15px] font-semibold tracking-tight">Settings</div>
          <div className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">Agent accounts</div>
          {(data?.clis ?? placeholderClis()).map((c) => {
            const count = (data?.accounts ?? []).filter((a) => a.agent === c.id).length;
            const ready = c.host.signedIn || (data?.accounts ?? []).some((a) => a.agent === c.id && a.signedIn && a.enabled);
            return (
              <button key={c.id} onClick={() => setAgent(c.id)}
                className={cn('flex h-10 items-center gap-2.5 rounded-lg px-2 text-left text-[12.5px] text-fg-muted hover:bg-panel-2 hover:text-fg', agent === c.id && 'bg-panel-3 text-fg hover:bg-panel-3')}>
                <AgentMark agent={c.id} size="sm" />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {count > 0 && <span className="rounded-full bg-panel-2 px-1.5 text-[10.5px] text-fg-subtle">{count}</span>}
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', !c.bin ? 'bg-fg-subtle/50' : ready ? 'bg-ok' : 'bg-warn')}
                  title={!c.bin ? 'CLI not installed' : ready ? 'Ready' : 'No signed-in account'} />
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="flex gap-2 rounded-lg bg-panel-2/60 p-2.5 text-[11px] leading-relaxed text-fg-subtle">
            <Lock size={12} className="mt-0.5 shrink-0" />
            <span>Logins stay on this computer and are never written to a project or a log.</span>
          </div>
        </nav>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start gap-3 border-b border-line px-6 py-5">
            <AgentMark agent={agent} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold tracking-tight">{cli?.label ?? ''}</h2>
                <CliPill cli={cli} />
              </div>
              <p className="mt-1 max-w-[560px] text-[12px] leading-relaxed text-fg-muted">{AGENT_COPY[agent].blurb}</p>
            </div>
            <button onClick={() => void refresh()} title="Re-check logins" className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-panel-3 hover:text-fg">
              <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            </button>
            <button onClick={close} title="Close (Esc)" className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-panel-3 hover:text-fg"><X size={16} /></button>
          </header>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {!data ? (
              <div className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 size={14} className="animate-spin" />Checking installed agents…</div>
            ) : (
              <AgentPage key={agent} agent={agent} cli={cli!} accounts={accounts} profilesDir={data.profilesDir} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function close() { useStore.setState({ settingsOpen: false }); }

function placeholderClis(): AgentCli[] {
  const host = { email: '', plan: '', signedIn: false, savedAccountId: null };
  return [
    { id: 'claude', label: 'Claude Code', bin: null, version: null, host },
    { id: 'agy', label: 'Antigravity', bin: null, version: null, host },
    { id: 'codex', label: 'Codex', bin: null, version: null, host },
  ];
}

function AgentPage({ agent, cli, accounts, profilesDir }: { agent: AccountAgent; cli: AgentCli; accounts: AgentAccount[]; profilesDir: string }) {
  const [adding, setAdding] = useState(false);
  const defaultAccount = accounts.find((a) => a.isDefault);

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
          <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={13} />Add account</Button>
        )}>
          Accounts {accounts.length > 0 && <span className="ml-1 font-normal text-fg-subtle">{accounts.length}</span>}
        </SectionTitle>
        <div className="space-y-2">
          {adding && <AddAccount agent={agent} cli={cli} onDone={() => setAdding(false)} />}
          {accounts.map((a) => <AccountRow key={a.id} account={a} />)}
          {!adding && accounts.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-8 text-center">
              <AgentMark agent={agent} size="md" />
              <div className="text-[12.5px] font-medium">No saved {cli.label} accounts</div>
              <p className="max-w-[380px] text-[11.5px] leading-relaxed text-fg-muted">
                Runs use this computer's own login. Add accounts to keep work and personal logins apart, or to switch when one hits its usage limit.
              </p>
              <Button variant="primary" className="mt-1" onClick={() => setAdding(true)}><Plus size={13} />Add account</Button>
            </div>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
        <Lock size={11} />Profiles folder:
        <button onClick={() => void openFolder(profilesDir)} className="truncate font-mono hover:text-fg-muted hover:underline">{profilesDir}</button>
      </p>
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
    body = (
      <div className="space-y-3">
        <ol className="space-y-2.5">
          <Step n={1} title={a.agent === 'claude' ? 'Open the sign-in page' : 'Finish signing in in your browser'}>
            {l.url ? (
              <div className="flex flex-wrap gap-1.5">
                <Button variant="primary" onClick={() => window.open(l.url, '_blank')}><ExternalLink size={13} />Open sign-in page</Button>
                <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(l.url); toast('Link copied'); }}><Copy size={13} />Copy link</Button>
              </div>
            ) : (
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-app/60 p-2 font-mono text-[10.5px] text-fg-subtle">{l.output || 'Waiting for the sign-in link…'}</pre>
            )}
          </Step>
          {l.needsCode ? (
            <>
              <Step n={2} title={`Sign in with the Claude account for "${a.name}"`} />
              <Step n={3} title="Paste the code the page shows">
                <div className="flex gap-1.5">
                  <TextInput value={code} onChange={setCode} placeholder="Paste the code here" mono autoFocus ariaLabel="Sign-in code" onEnter={() => { if (code.trim() && !sending) submit(); }} />
                  <Button variant="primary" disabled={!code.trim() || sending} onClick={submit}>
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}Sign in
                  </Button>
                </div>
              </Step>
            </>
          ) : (
            <Step n={2} title="Come back here — this closes on its own once the browser says you're signed in">
              <div className="flex items-center gap-2 text-[11.5px] text-fg-muted"><Loader2 size={12} className="animate-spin" />Waiting for Codex…</div>
            </Step>
          )}
        </ol>
        <div className="flex justify-end"><Button variant="ghost" onClick={cancel}>Cancel sign-in</Button></div>
      </div>
    );
  }
  return <div className="border-t border-line bg-app/30 px-4 py-3.5">{body}</div>;
}

function AddAccount({ agent, cli, onDone }: { agent: AccountAgent; cli: AgentCli; onDone: () => void }) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'oauth' | 'key'>('oauth');
  const [apiKey, setApiKey] = useState('');
  const [dir, setDir] = useState('');
  const [advanced, setAdvanced] = useState(false);
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

  const claude = agent === 'claude';
  const useKey = !claude && method === 'key';
  const canSave = !!name.trim() && (!useKey || !!apiKey.trim()) && (!advanced || !!dir.trim());

  const add = () => call(setSaving, async (c) => {
    const a = await c.call('accounts.create', { agent, name: name.trim(), dir: advanced ? dir.trim() : undefined, apiKey: useKey ? apiKey.trim() : undefined });
    onDone();
    if (a.signedIn) toast(`Added ${a.name}`);
    else if (cli.bin) void startLogin(a.id);
  });

  const browse = async () => {
    const p = await window.archa.pickFolder(claude ? 'Choose a Claude config folder' : 'Choose a CODEX_HOME folder');
    if (p) setDir(p);
  };

  return (
    <FormCard title={`Add a ${cli.label} account`} onCancel={onDone}>
      <div className="space-y-3">
        {!claude && (
          <Segmented value={method} onChange={setMethod} options={[
            { value: 'oauth', label: 'Sign in with ChatGPT', title: 'Opens the ChatGPT sign-in in your browser' },
            { value: 'key', label: 'OpenAI API key', title: 'Bill usage to an API key' },
          ]} />
        )}
        <Field label={claude ? 'Account e-mail or name' : 'Name'} hint={claude ? 'An e-mail is pre-filled on the sign-in page.' : undefined}>
          <TextInput value={name} onChange={setName} autoFocus placeholder={claude ? 'e.g. work@company.com' : 'e.g. Work, Personal'} onEnter={() => { if (canSave && !saving) add(); }} />
        </Field>
        {useKey && (
          <Field label="API key" hint="Saved to this account's auth.json on this computer only.">
            <TextInput value={apiKey} onChange={setApiKey} type="password" mono placeholder="sk-…" onEnter={() => { if (canSave && !saving) add(); }} />
          </Field>
        )}
        <button onClick={() => setAdvanced(!advanced)} className="text-[11.5px] text-fg-subtle hover:text-fg-muted">
          {advanced ? '− ' : '+ '}Use an existing config folder (e.g. one from Orca)
        </button>
        {advanced && (
          <Field label={claude ? 'Claude config folder' : 'CODEX_HOME folder'} hint="ArchaDev links to it and never deletes it.">
            <div className="flex gap-1.5">
              <TextInput value={dir} onChange={setDir} mono placeholder={claude ? 'C:\\Users\\you\\.claude-work' : 'C:\\Users\\you\\.codex-work'} />
              <Button onClick={() => void browse()}><FolderOpen size={13} />Browse</Button>
            </div>
          </Field>
        )}
        {!cli.bin && !useKey && <p className="text-[11.5px] text-warn">Install the {cli.label} CLI to sign this account in.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-1.5">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!canSave || saving} onClick={add}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : useKey ? <KeyRound size={13} /> : <LogIn size={13} />}
          {useKey ? 'Save key' : advanced ? 'Link folder' : 'Add and sign in'}
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

/** Runs an RPC with a busy flag; errors become toasts. */
async function call(setBusy: (v: boolean) => void, fn: (client: NonNullable<ReturnType<typeof useStore.getState>['client']>) => Promise<void>) {
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

async function openFolder(path: string) {
  const err = await window.archa.openFolder(path);
  if (err) toast(err, 'error');
}

export function AgentMark({ agent, size }: { agent: AccountAgent; size: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-lg font-semibold', AGENT_COPY[agent].tone,
      size === 'sm' && 'h-6 w-6 text-[11px]', size === 'md' && 'h-9 w-9 text-[14px]', size === 'lg' && 'h-11 w-11 rounded-xl text-[17px]')}>
      {AGENT_COPY[agent].mark}
    </span>
  );
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

function Chip({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'accent' }) {
  return (
    <span className={cn('inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium',
      !tone && 'bg-panel-3 text-fg-muted', tone === 'ok' && 'bg-ok/15 text-ok', tone === 'warn' && 'bg-warn/15 text-warn', tone === 'accent' && 'bg-accent-soft text-accent-fg')}>
      {children}
    </span>
  );
}

function IconAction({ title, onClick, children, active }: { title: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button title={title} aria-label={title} onClick={onClick}
      className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-3 hover:text-fg', active && 'text-accent-fg')}>
      {children}
    </button>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex h-8 items-center justify-between">
      <h3 className="text-[12.5px] font-semibold">{children}</h3>
      {action}
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: 'warn' }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-xl px-4 py-3 text-[12px] leading-relaxed', tone === 'warn' && 'bg-warn/10 text-warn')}>
      <CircleAlert size={14} className="mt-0.5 shrink-0" /><span>{children}</span>
    </div>
  );
}

function FormCard({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }) {
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11.5px] font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
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
