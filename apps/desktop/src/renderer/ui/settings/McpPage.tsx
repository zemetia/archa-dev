import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleAlert, Download, Loader2, Lock, Pencil, Plug, Plus, Trash2, X, Zap } from 'lucide-react';
import type { McpImportCandidate, McpServer, McpServerInput, McpTransport, SecretEntry } from '@archa/protocol';
import { loadMcpServers, toast, useStore } from '../../lib/store';
import { Button, cn, Segmented, Switch, TextInput } from '../controls';
import { BrandMark, BrandTile, type Brand } from './Logo';
import { call, Chip, Empty, Field, FormCard, IconAction, Notice, PageHeader, SectionTitle } from './kit';

/*
 * Settings → MCP servers (blueprint AGENT_BRIDGE/05): external servers handed to chat runs next to
 * ArchaDev's own. Secret values never come back from the core — the form only sees their keys.
 */

type Draft = { id?: string; name: string; transport: McpTransport; command: string; args: string; url: string; env: SecretEntry[]; headers: SecretEntry[] };

const EMPTY: Draft = { name: '', transport: 'stdio', command: '', args: '', url: '', env: [], headers: [] };

/** Well-known servers that prefill the form. */
const PRESETS: Array<{ label: string; brand?: Brand; hint: string; draft: Draft }> = [
  { label: 'GitHub', brand: 'github', hint: 'Repos, issues and PRs (needs a token)', draft: { ...EMPTY, name: 'github', transport: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: [{ key: 'Authorization', value: 'Bearer ' }] } },
  { label: 'Figma Dev Mode', brand: 'figma', hint: 'Local server from the Figma desktop app', draft: { ...EMPTY, name: 'figma', transport: 'http', url: 'http://127.0.0.1:3845/mcp' } },
  { label: 'Context7', hint: 'Up-to-date library docs', draft: { ...EMPTY, name: 'context7', transport: 'http', url: 'https://mcp.context7.com/mcp' } },
  { label: 'Playwright', hint: 'Drive a real browser', draft: { ...EMPTY, name: 'playwright', command: 'npx', args: '-y @playwright/mcp@latest' } },
  { label: 'Filesystem', hint: 'Read files from a folder', draft: { ...EMPTY, name: 'filesystem', command: 'npx', args: '-y @modelcontextprotocol/server-filesystem C:\\path\\to\\folder' } },
];

export function McpPage() {
  const servers = useStore((s) => s.mcpServers);
  const info = useStore((s) => s.info);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => { void loadMcpServers(); }, []);
  const busy = !!draft || importing;

  return (
    <>
      <PageHeader title="MCP servers"
        description="Connect external Model Context Protocol servers — GitHub, docs, databases, your own tools. Enabled servers are given to chat runs next to ArchaDev's canvas tools."
        actions={!busy && (
          <>
            <Button variant="ghost" onClick={() => setImporting(true)}><Download size={13} />Import</Button>
            <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}><Plus size={13} />Add server</Button>
          </>
        )} />

      <div className="space-y-6">
        {draft && <ServerForm initial={draft} onDone={() => setDraft(null)} />}
        {importing && <ImportPanel onDone={() => setImporting(false)} />}

        <div>
          <SectionTitle>Servers {servers && <span className="font-normal text-fg-subtle">{servers.length + 1}</span>}</SectionTitle>
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2/40 px-4 py-3">
              <BrandTile brand="mcp" size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className="font-mono text-[12px] font-medium">archadev</span><Chip>stdio</Chip><Chip tone="accent">Built in</Chip></div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">{info?.mcpCommand.join(' ') ?? 'archa mcp'}</div>
              </div>
              <span className="text-[11.5px] text-fg-subtle">Canvas tools · always on</span>
            </div>
            {!servers ? (
              <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-fg-muted"><Loader2 size={14} className="animate-spin" />Loading servers…</div>
            ) : servers.map((s) => <ServerRow key={s.id} server={s} onEdit={() => setDraft(toDraft(s))} />)}
            {servers?.length === 0 && !busy && (
              <Empty icon={<Plug size={22} className="text-accent-fg" />} title="No external servers yet">
                Add one below from a preset, import the servers you already use in Claude Code, Antigravity or Cursor, or enter a command or URL yourself.
              </Empty>
            )}
          </div>
        </div>

        {!draft && (
          <div>
            <SectionTitle>Quick add</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setDraft({ ...p.draft, env: [...p.draft.env], headers: [...p.draft.headers] })}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-panel-2/40 p-3 text-left hover:border-accent/50 hover:bg-panel-2">
                  {p.brand ? <BrandTile brand={p.brand} size="sm" /> : <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-panel-3 ring-1 ring-line"><BrandMark brand="mcp" size={13} /></span>}
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium">{p.label}</span>
                    <span className="block truncate text-[11px] text-fg-subtle">{p.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Lock size={11} className="shrink-0" />Saved in <span className="font-mono">~/.archadev/mcp.json</span> on this computer. Env values and headers are never shown again or sent to a project.
        </p>
      </div>
    </>
  );
}

function ServerRow({ server: s, onEdit }: { server: McpServer; onEdit: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const t = s.test;
  const detail = s.transport === 'stdio' ? [s.command, ...s.args].join(' ') : s.url;

  const test = () => call((v) => setBusy(v ? 'test' : null), async (c) => {
    const r = await c.call('mcp.test', { id: s.id });
    if (r.ok) { toast(`${s.name}: connected · ${r.tools.length} tools`); setOpen(true); } else toast(`${s.name}: ${r.error ?? 'failed'}`, 'error');
  });
  const remove = () => call((v) => setBusy(v ? 'delete' : null), async (c) => { await c.call('mcp.delete', { id: s.id }); toast(`Removed ${s.name}`); });
  const toggle = (enabled: boolean) => call((v) => setBusy(v ? 'toggle' : null), async (c) => { await c.call('mcp.save', { ...fromServer(s), enabled }); });

  return (
    <div className={cn('rounded-xl border border-line bg-panel-2/40', !s.enabled && 'opacity-60')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(!open)} disabled={!t} title="Show tools" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-panel-3 hover:text-fg disabled:opacity-30">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[12px] font-medium">{s.name}</span>
            <Chip>{s.transport}</Chip>
            {busy === 'test' ? <Chip tone="accent"><Loader2 size={10} className="animate-spin" />Testing</Chip>
              : t?.ok ? <Chip tone="ok"><Check size={10} />{t.tools.length} tools</Chip>
              : t ? <Chip tone="danger" title={t.error}><CircleAlert size={10} />Failed</Chip>
              : <Chip>Not tested</Chip>}
            {(s.envKeys.length > 0 || s.headerKeys.length > 0) && <Chip title={[...s.envKeys, ...s.headerKeys].join(', ')}><Lock size={9} />{s.envKeys.length + s.headerKeys.length} secret{s.envKeys.length + s.headerKeys.length === 1 ? '' : 's'}</Chip>}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle" title={detail}>{detail}</div>
        </div>
        {confirm ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-fg-muted">Remove this server?</span>
            <Button variant="danger" disabled={busy === 'delete'} onClick={remove}>Remove</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" disabled={!!busy} onClick={test}><Zap size={13} />Test</Button>
            <IconAction title="Edit" onClick={onEdit}><Pencil size={14} /></IconAction>
            <div className="px-1.5"><Switch checked={s.enabled} disabled={!!busy} label={s.enabled ? `Turn off ${s.name}` : `Turn on ${s.name}`} onChange={(v) => void toggle(v)} /></div>
            <IconAction title="Remove" onClick={() => setConfirm(true)}><Trash2 size={14} /></IconAction>
          </div>
        )}
      </div>
      {open && t && (
        <div className="border-t border-line bg-app/30 px-4 py-3">
          {t.ok ? (
            <>
              {t.serverName && <div className="mb-2 text-[11px] text-fg-subtle">{t.serverName}{t.serverVersion ? ` ${t.serverVersion}` : ''} · tested {new Date(t.at).toLocaleTimeString()}</div>}
              <div className="grid max-h-60 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto">
                {t.tools.map((tool) => (
                  <div key={tool.name} className="min-w-0">
                    <div className="truncate font-mono text-[11px] text-fg">{tool.name}</div>
                    {tool.description && <div className="truncate text-[10.5px] text-fg-subtle" title={tool.description}>{tool.description}</div>}
                  </div>
                ))}
                {t.tools.length === 0 && <span className="text-[11.5px] text-fg-subtle">The server has no tools.</span>}
              </div>
            </>
          ) : <pre className="select-text whitespace-pre-wrap font-mono text-[11px] text-danger">{t.error}</pre>}
        </div>
      )}
    </div>
  );
}

function ServerForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<Draft>) => setD({ ...d, ...p });
  const stdio = d.transport === 'stdio';
  const canSave = /^[A-Za-z0-9_-]+$/.test(d.name.trim()) && (stdio ? !!d.command.trim() : /^https?:\/\/\S+$/.test(d.url.trim()));

  const save = (thenTest: boolean) => call(setSaving, async (c) => {
    const input: McpServerInput = {
      id: d.id, name: d.name.trim(), transport: d.transport,
      command: stdio ? d.command.trim() : undefined, args: stdio ? splitArgs(d.args) : undefined, url: stdio ? undefined : d.url.trim(),
      env: clean(d.env), headers: clean(d.headers),
    };
    const s = await c.call('mcp.save', input);
    toast(d.id ? `Saved ${s.name}` : `Added ${s.name}`);
    onDone();
    if (thenTest) {
      const r = await c.call('mcp.test', { id: s.id });
      if (r.ok) toast(`${s.name}: connected · ${r.tools.length} tools`); else toast(`${s.name}: ${r.error ?? 'failed'}`, 'error');
    }
  });

  return (
    <FormCard title={d.id ? `Edit ${initial.name}` : 'Add an MCP server'} onCancel={onDone}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_260px] gap-3">
          <Field label="Name" hint={<>Agents see its tools as <span className="font-mono">mcp__{d.name.trim() || 'name'}__…</span></>}>
            <TextInput value={d.name} onChange={(v) => patch({ name: v })} mono autoFocus={!d.name} placeholder="e.g. github" />
          </Field>
          <div className="space-y-1.5">
            <span className="block text-[11.5px] font-medium text-fg-muted">Type</span>
            <Segmented value={d.transport} onChange={(v) => patch({ transport: v })} options={[
              { value: 'stdio', label: 'Command', title: 'A local program that speaks MCP over stdio' },
              { value: 'http', label: 'HTTP', title: 'Streamable HTTP endpoint' },
              { value: 'sse', label: 'SSE', title: 'Older Server-Sent Events endpoint' },
            ]} />
          </div>
        </div>
        {stdio ? (
          <div className="grid grid-cols-[180px_1fr] gap-3">
            <Field label="Command"><TextInput value={d.command} onChange={(v) => patch({ command: v })} mono placeholder="npx" /></Field>
            <Field label="Arguments" hint='Separated by spaces; quote an argument that has spaces.'><TextInput value={d.args} onChange={(v) => patch({ args: v })} mono placeholder="-y @scope/server" /></Field>
          </div>
        ) : (
          <Field label="URL"><TextInput value={d.url} onChange={(v) => patch({ url: v })} mono placeholder="https://example.com/mcp" /></Field>
        )}
        {stdio
          ? <Pairs label="Environment variables" entries={d.env} onChange={(env) => patch({ env })} keyHint="API_KEY" />
          : <Pairs label="Headers" entries={d.headers} onChange={(headers) => patch({ headers })} keyHint="Authorization" />}
        {!stdio && d.url.startsWith('http://') && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(d.url) && <Notice tone="warn">This URL is not encrypted. Prefer https for servers that are not on this computer.</Notice>}
      </div>
      <div className="mt-4 flex justify-end gap-1.5">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button disabled={!canSave || saving} onClick={() => save(false)}>Save</Button>
        <Button variant="primary" disabled={!canSave || saving} onClick={() => save(true)}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}Save and test</Button>
      </div>
    </FormCard>
  );
}

/** Key/value rows. A stored secret shows as "unchanged" (`value: null`) until it is retyped. */
function Pairs({ label, entries, onChange, keyHint }: { label: string; entries: SecretEntry[]; onChange: (e: SecretEntry[]) => void; keyHint: string }) {
  const set = (i: number, p: Partial<SecretEntry>) => onChange(entries.map((e, j) => (j === i ? { ...e, ...p } : e)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-fg-muted">{label}</span>
        <button onClick={() => onChange([...entries, { key: '', value: '' }])} className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg"><Plus size={11} />Add</button>
      </div>
      {entries.map((e, i) => (
        <div key={i} className="grid grid-cols-[180px_1fr_auto] gap-1.5">
          <TextInput value={e.key} onChange={(v) => set(i, { key: v })} mono placeholder={keyHint} ariaLabel={`${label} key`} />
          <TextInput value={e.value ?? ''} onChange={(v) => set(i, { value: v })} type="password" mono placeholder={e.value === null ? '•••••• unchanged' : 'value'} ariaLabel={`${label} value`} />
          <IconAction title="Remove" onClick={() => onChange(entries.filter((_, j) => j !== i))}><X size={13} /></IconAction>
        </div>
      ))}
    </div>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [list, setList] = useState<McpImportCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void call(() => undefined, async (c) => {
      const l = await c.call('mcp.importCandidates');
      setList(l);
      setPicked(new Set(l.filter((x) => !x.exists).map(key)));
    });
  }, []);

  const run = () => call(setSaving, async (c) => {
    let n = 0;
    for (const source of ['claude', 'antigravity', 'cursor'] as const) {
      const names = (list ?? []).filter((x) => x.source === source && picked.has(key(x))).map((x) => x.name);
      if (names.length) n += (await c.call('mcp.import', { source, names })).length;
    }
    toast(`Imported ${n} server${n === 1 ? '' : 's'}`);
    onDone();
  });

  return (
    <FormCard title="Import MCP servers" onCancel={onDone}>
      {!list ? <div className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 size={13} className="animate-spin" />Looking for servers…</div>
        : list.length === 0 ? <p className="text-[12px] text-fg-muted">No user-level servers found in Claude Code, Antigravity or Cursor.</p>
        : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {list.map((c) => (
              <label key={key(c)} className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-panel-3/60', c.exists && 'cursor-default opacity-50')}>
                <input type="checkbox" disabled={c.exists} checked={picked.has(key(c))} className="accent-accent"
                  onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(key(c)); else n.delete(key(c)); setPicked(n); }} />
                <span className="w-32 truncate font-mono text-[12px]">{c.name}</span>
                <Chip>{SOURCE_LABEL[c.source]}</Chip>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-subtle">{c.detail}</span>
                {c.exists && <span className="text-[11px] text-fg-subtle">already added</span>}
              </label>
            ))}
          </div>
        )}
      <div className="mt-4 flex justify-end gap-1.5">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!picked.size || saving} onClick={run}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}Import {picked.size || ''}</Button>
      </div>
    </FormCard>
  );
}

const SOURCE_LABEL: Record<McpImportCandidate['source'], string> = { claude: 'Claude Code', antigravity: 'Antigravity', cursor: 'Cursor' };

const key = (c: McpImportCandidate) => `${c.source}:${c.name}`;

function toDraft(s: McpServer): Draft {
  return {
    id: s.id, name: s.name, transport: s.transport, command: s.command, args: s.args.map(quoteArg).join(' '), url: s.url,
    env: s.envKeys.map((k) => ({ key: k, value: null })), headers: s.headerKeys.map((k) => ({ key: k, value: null })),
  };
}

/** The stored server as a save input that keeps every secret. */
function fromServer(s: McpServer): McpServerInput {
  return {
    id: s.id, name: s.name, transport: s.transport, command: s.command, args: s.args, url: s.url,
    env: s.envKeys.map((k) => ({ key: k, value: null })), headers: s.headerKeys.map((k) => ({ key: k, value: null })),
  };
}

const clean = (e: SecretEntry[]) => e.filter((x) => x.key.trim()).map((x) => ({ key: x.key.trim(), value: x.value }));

const quoteArg = (a: string) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/** Splits on spaces, keeping "quoted parts" together. Never run through a shell. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\"|[^"])*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2]!);
  return out;
}
