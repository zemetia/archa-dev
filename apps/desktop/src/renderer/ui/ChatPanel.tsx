import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Copy, Crosshair, FileText, Hexagon, History, Loader2, Settings, Sparkles, Square, SquarePen, UserRound, Wrench, X, Zap } from 'lucide-react';
import { chatThreads, threadOf, type ModelOption } from '@archa/protocol';
import { runOfThread, select, toast, useStore } from '../lib/store';
import { personaBg } from './persona';
import { cn } from './controls';
import { Dropdown, type DropdownOption } from './Dropdown';
import { Markdown } from './Markdown';

/*
 * Agent-first panel: launch a local agent on this canvas (launch mode) and see what
 * any connected agent does (listen mode). Blueprint AGENT_BRIDGE.
 * Split in two cards: the thread (inside the left sidebar card) and the composer (its own card below).
 */

const AGENT_DOT: Record<string, string> = { claude: 'bg-claude', agy: 'bg-agy', codex: 'bg-codex' };

const SUGGESTIONS = [
  'A pricing page with three tiers and a monthly / yearly toggle',
  'A mobile onboarding flow, three screens, auto-layout',
  'A dark analytics dashboard with KPI cards and a revenue chart',
  'A landing hero for an industrial estate, bold type, one CTA',
];

let focusComposer: (() => void) | null = null;

export function ChatThread() {
  const info = useStore((s) => s.info);
  const chat = useStore((s) => s.chat);
  const activity = useStore((s) => s.activity);
  const docId = useStore((s) => s.activeDocId);
  const runs = useStore((s) => s.runs);
  const agents = useStore((s) => s.agents);
  const thread = useStore((s) => s.chatThread);
  const running = runOfThread(runs, thread);
  const live = useStore((s) => (s.chatThread ? s.chatLive[s.chatThread] ?? null : null));
  // Other sessions working on this document in parallel; one click switches to their conversation.
  const others = Object.values(runs).filter((r) => r.docId === docId && r.threadId !== thread);
  const end = useRef<HTMLDivElement>(null);
  const agentLabel = (id: string) => info?.agents.find((a) => a.id === id)?.label ?? id;

  const latest = chat.at(-1);
  const meta = useMemo(() => (thread ? chatThreads(chat.filter((c) => threadOf(c) === thread))[0] : undefined), [chat, thread]);
  const title = meta?.title ?? null;
  const persona = running?.persona ?? meta?.persona;
  const items = useMemo(() => {
    const own = chat.filter((c) => thread !== null && threadOf(c) === thread).map((c) => ({ ...c, nodeIds: [] as string[] }));
    // Listen-mode agents (connected through `archa mcp` from a terminal) are not threaded: show them with the newest conversation.
    const current = thread === null || (latest && threadOf(latest) === thread);
    const listen = !current ? [] : activity.filter((a) => a.docId === docId && a.author.kind === 'agent' && !a.runId && !chat.some((c) => Math.abs(c.ts - a.ts) < 50))
      .map((a) => ({ id: a.id, ts: a.ts, role: a.tool === 'say' ? 'agent' as const : 'tool' as const, agent: a.author.id.split(':')[0]!, persona: a.author.name, text: a.tool === 'say' ? a.text : `${a.tool} · ${a.text}`, nodeIds: a.nodeIds }));
    return [...own, ...listen].sort((a, b) => a.ts - b.ts);
  }, [chat, activity, docId, thread, latest]);

  // Braces matter: scrollIntoView returns a Promise in Chromium 156+, and an effect must not return it.
  useEffect(() => { void end.current?.scrollIntoView({ block: 'end' }); }, [items.length, live?.text.length]);

  const mcpLine = info ? `claude mcp add archadev -- ${info.mcpCommand.map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' ')}` : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-line">
      <div className="flex h-10 shrink-0 items-center gap-2 px-4">
        {persona && <span title="Session name — its cursor on the canvas has this colour" className="flex shrink-0 items-center gap-1 rounded-full bg-panel-2 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted"><span className={cn('h-1.5 w-1.5 rounded-full', personaBg(persona))} />{persona}</span>}
        <span className="min-w-0 truncate text-[12.5px] font-semibold" title={title ?? undefined}>{title ?? 'New chat'}</span>
        <div className="flex-1" />
        {agents.length > 0 && (
          <span title={agents.map((a) => a.name).join(', ')} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-agent/15 px-2 py-0.5 text-[10.5px] font-medium text-agent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-agent" />{agents.length}&nbsp;live
          </span>
        )}
        <button title="Chat history" onClick={() => useStore.setState({ leftTab: 'history' })}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg"><History size={14} /></button>
        <button title="New chat" onClick={() => { useStore.setState({ chatThread: null }); focusComposer?.(); }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg"><SquarePen size={14} /></button>
      </div>
      {others.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1 px-3 pb-2">
          {others.map((r) => (
            <button key={r.runId} title="Working in parallel — open this conversation" onClick={() => useStore.setState({ chatThread: r.threadId })}
              className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10.5px] text-fg-muted hover:bg-panel-2 hover:text-fg">
              <span className={cn('h-1.5 w-1.5 animate-pulse rounded-full', personaBg(r.persona))} />{r.persona}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {items.length === 0 && (
          <div className="space-y-5 px-1 pt-6">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-fg"><Hexagon size={15} strokeWidth={2.4} /></span>
                <span className="text-[14px] font-semibold tracking-tight">What should your agent design?</span>
              </div>
              <div className="flex flex-col items-start gap-1.5">
                {SUGGESTIONS.map((t) => (
                  <button key={t} onClick={() => { useStore.setState({ chatDraft: t }); focusComposer?.(); }}
                    className="group flex max-w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg">
                    <Sparkles size={12} className="shrink-0 text-fg-subtle group-hover:text-accent-fg" /><span className="truncate">{t}</span>
                  </button>
                ))}
              </div>
            </div>
            <Hint title="It checks its own work">Your installed agent builds with auto-layout frames, screenshots the result and fixes what the checks report, live on this canvas.</Hint>
            <Hint title="Bring your terminal agent">
              Connect Claude Code once, then ask it to design in ArchaDev from any terminal:
              {mcpLine && (
                <button onClick={() => { void navigator.clipboard.writeText(mcpLine); toast('Copied'); }}
                  className="mt-2 flex w-full items-start gap-2 rounded-lg bg-panel-2 p-2 text-left font-mono text-[10.5px] leading-relaxed text-fg-muted hover:text-fg">
                  <span className="min-w-0 flex-1 break-all">{mcpLine}</span><Copy size={12} className="mt-0.5 shrink-0" />
                </button>
              )}
            </Hint>
            <Hint title="Stays on this machine">Everything is local. Save as <span className="font-mono text-fg-muted">.archa</span> with Ctrl+S.</Hint>
          </div>
        )}
        {items.map((m) => (
          <div key={m.id}>
            {m.role === 'user' && <div className="ml-6 rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed text-fg">{m.text}</div>}
            {m.role === 'agent' && <AgentText agent={m.agent} persona={m.persona} label={agentLabel(m.agent)} text={m.text} />}
            {m.role === 'tool' && (
              <button onClick={() => m.nodeIds.length && select(m.nodeIds.filter((id) => useStore.getState().doc?.get(id)).slice(0, 50))}
                className="flex w-full items-center gap-1.5 truncate px-1 text-left text-[11.5px] text-fg-subtle hover:text-fg-muted">
                <Wrench size={11} className="shrink-0" /><span className="truncate">{m.text}</span>
              </button>
            )}
            {m.role === 'status' && <div className="flex items-center gap-1.5 px-1 text-[11px] text-fg-subtle"><UserRound size={11} className="shrink-0" /><span className="truncate">{m.text}</span></div>}
            {m.role === 'error' && <div className="whitespace-pre-wrap rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{m.text}</div>}
          </div>
        ))}
        {live && <AgentText agent={live.agent} persona={persona} label={agentLabel(live.agent)} text={live.text} streaming />}
        {running && !live && <div className="flex items-center gap-2 px-1 text-[12px] text-agent"><Loader2 size={13} className="animate-spin" />{running.persona} is working on the canvas…</div>}
        <div ref={end} />
      </div>
    </div>
  );
}

function AgentText({ agent, persona, label, text, streaming }: { agent: string; persona?: string; label: string; text: string; streaming?: boolean }) {
  return (
    <div className="break-words px-1 text-[12.5px] leading-relaxed text-fg">
      <span className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-fg-muted">
        <span className={cn('h-1.5 w-1.5 rounded-full', persona ? personaBg(persona) : AGENT_DOT[agent] ?? 'bg-agent')} />
        {persona ?? label}{persona && <span className="font-normal normal-case tracking-normal text-fg-subtle">· {label}</span>}
      </span>
      <Markdown text={text} />
      {streaming && <span className="inline-block h-3 w-1.5 animate-pulse rounded-sm bg-agent align-middle" />}
    </div>
  );
}

function Hint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-0.5">
      <div className="mb-1 text-[12px] font-semibold text-fg">{title}</div>
      <div className="text-[11.5px] leading-relaxed text-fg-subtle">{children}</div>
    </div>
  );
}

const AGENT_HINT: Record<string, string> = {
  claude: 'Anthropic · claude CLI',
  agy: 'Google Antigravity · agy CLI',
  codex: 'OpenAI · codex CLI',
};

function remembered(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: choice lasts this session */ }
}

const Dot = ({ agent, dim }: { agent: string; dim?: boolean }) => (
  <span className={cn('h-2 w-2 shrink-0 rounded-full', AGENT_DOT[agent] ?? 'bg-fg-subtle', dim && 'opacity-40')} />
);

export function ChatComposer() {
  const info = useStore((s) => s.info);
  const docId = useStore((s) => s.activeDocId);
  const docName = useStore((s) => s.docs.find((d) => d.id === s.activeDocId)?.name);
  const client = useStore((s) => s.client);
  const thread = useStore((s) => s.chatThread);
  const running = useStore((s) => runOfThread(s.runs, s.chatThread));
  const prompt = useStore((s) => s.chatDraft);
  const setPrompt = (chatDraft: string) => useStore.setState({ chatDraft });
  const [agent, setAgentState] = useState(() => remembered('archa.chatAgent', 'claude'));
  const [model, setModelState] = useState(() => remembered(`archa.chatModel.${agent}`, ''));
  const [account, setAccount] = useState('');
  const [models, setModels] = useState<{ agent: string; list: ModelOption[]; source: string } | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [sending, setSending] = useState(false);
  const accounts = useStore((s) => s.accounts?.accounts);
  const input = useRef<HTMLTextAreaElement>(null);
  // Selection chip: what is selected when sending is what the request is about (unless dismissed).
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const [focusOff, setFocusOff] = useState<string>('');
  const selKey = selection.join(',');
  const focusNodes = selKey && focusOff !== selKey ? selection.map((id) => doc?.get(id)).filter((n) => !!n).slice(0, 12) : [];
  // A thread id reserved by pre-warming a new chat, used by its first Send.
  const reserved = useRef<string | null>(null);

  const setAgent = (a: string) => {
    setAgentState(a);
    setModelState(remembered(`archa.chatModel.${a}`, ''));
    setAccount('');
    remember('archa.chatAgent', a);
  };
  const setModel = (m: string) => { setModelState(m); remember(`archa.chatModel.${agent}`, m); };

  useEffect(() => {
    focusComposer = () => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } };
    return () => { focusComposer = null; };
  }, []);

  const available = info?.agents.find((a) => a.id === agent);
  // A remembered agent that is no longer offered falls back to the first installed one.
  useEffect(() => {
    if (!info || available) return;
    const first = info.agents.find((a) => a.available) ?? info.agents[0];
    if (first) setAgent(first.id);
  }, [info, available]);

  // Saved login profiles for this agent ('' = its default account, 'host' = this computer's login).
  const agentAccounts = (accounts ?? []).filter((a) => a.agent === agent && a.enabled);
  const defaultAccount = agentAccounts.find((a) => a.isDefault);
  useEffect(() => { if (account && account !== 'host' && !agentAccounts.some((a) => a.id === account)) setAccount(''); }, [account, agentAccounts]);

  // Ask the installed CLI which models it offers (agy queries its service, so this can take a few seconds).
  useEffect(() => {
    if (!client || !available?.available) { setModels(null); return; }
    let live = true;
    setLoadingModels(true);
    client.call('agents.models', { agent, account: account || undefined })
      .then((r) => { if (live) setModels({ agent, list: r.models, source: r.source }); })
      .catch(() => { if (live) setModels({ agent, list: [], source: 'Could not list models' }); })
      .finally(() => { if (live) setLoadingModels(false); });
    return () => { live = false; };
  }, [client, agent, account, available?.available]);

  const modelList = models?.agent === agent ? models.list : [];
  const modelOptions: Array<DropdownOption<string>> = [
    { value: '', label: 'Default model', description: 'Whatever the CLI is set to use' },
    ...modelList.map((m) => ({ value: m.id, label: m.label, description: m.description ?? (m.label !== m.id ? m.id : undefined) })),
    // Keep a remembered model visible even before the list arrives.
    ...(model && !modelList.some((m) => m.id === model) ? [{ value: model, label: model, note: loadingModels ? undefined : 'saved' }] : []),
  ];

  const agentOptions: Array<DropdownOption<string>> = (info?.agents ?? []).map((a) => ({
    value: a.id, label: a.label, description: AGENT_HINT[a.id], icon: <Dot agent={a.id} dim={!a.available} />,
    note: a.available ? undefined : 'Not installed', disabled: !a.available,
  }));

  const accountOptions: Array<DropdownOption<string>> = [
    { value: '', label: `Default · ${defaultAccount ? defaultAccount.email || defaultAccount.name : "this computer's login"}` },
    { value: 'host', label: "This computer's login" },
    ...agentAccounts.map((a) => ({ value: a.id, label: a.email || a.name, note: a.signedIn ? undefined : 'Signed out', description: a.plan || undefined })),
  ];

  // Start the agent process while the person types, so Send begins at once (warm sessions, plan CHAT_AGENT).
  const warm = () => {
    if (!client || !docId || !available?.available) return;
    const threadId = thread ?? reserved.current ?? undefined;
    client.call('chat.warm', { docId, agent, model: model || undefined, account: account || undefined, threadId })
      .then((r) => { if (!thread) reserved.current = r.threadId; })
      .catch(() => { /* warming is best-effort; Send still starts the agent */ });
  };
  useEffect(() => { reserved.current = null; }, [docId, agent, model, account]);

  const send = async (now = false) => {
    if (!client || !docId || !prompt.trim() || sending || !available?.available) return;
    setSending(true);
    try {
      const threadId = thread ?? reserved.current ?? undefined;
      const r = await client.call('chat.send', { docId, agent, model: model || undefined, account: account || undefined, prompt: prompt.trim(), threadId, now: running ? now : undefined, focus: focusNodes.map((n) => n.id) });
      reserved.current = null;
      useStore.setState({ chatDraft: '', chatThread: r.threadId });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };
  const canSend = !!prompt.trim() && !!available?.available && !sending;

  return (
    <div className="shrink-0 rounded-2xl border border-line bg-panel p-2 transition-colors focus-within:border-accent/60">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <span title="The agent works on this document" className="flex h-6 max-w-[140px] shrink-0 items-center gap-1 rounded-md border border-line px-1.5 text-[11px] text-fg-muted">
          <FileText size={11} className="shrink-0" /><span className="truncate">{docName ?? 'Canvas'}</span>
        </span>
        {focusNodes.length > 0 && (
          <span title={`The request is about: ${focusNodes.map((n) => n.name).join(', ')}`} className="flex h-6 min-w-0 items-center gap-1 rounded-md border border-accent/40 bg-accent-soft pl-1.5 text-[11px] text-accent-fg">
            <Crosshair size={11} className="shrink-0" />
            <span className="truncate">{focusNodes.length === 1 ? focusNodes[0]!.name : `${focusNodes[0]!.name} +${focusNodes.length - 1}`}</span>
            <button title="Don't send the selection" onClick={() => setFocusOff(selKey)} className="flex h-6 w-5 shrink-0 items-center justify-center hover:text-fg"><X size={11} /></button>
          </span>
        )}
      </div>
      <textarea ref={input} value={prompt} onChange={(e) => setPrompt(e.target.value)} onFocus={warm} rows={3}
        placeholder={running ? `${running.persona} is working — Enter queues a follow-up, Ctrl+Enter sends it now` : 'Describe what to design…'}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e.ctrlKey || e.metaKey); } }}
        className="block w-full resize-none bg-transparent px-1.5 py-1 text-[12.5px] leading-relaxed placeholder:text-fg-subtle" />
      <div className="flex items-center gap-0.5">
        <Dropdown className="max-w-[45%] shrink-0" value={agent} options={agentOptions} onChange={setAgent} header="Agent" title="Agent that runs this prompt" menuWidth={250} />
        <Dropdown className="flex-1" value={model} options={modelOptions} onChange={setModel} header={models?.source ?? 'Model'} loading={loadingModels} title="Model" menuWidth={260} />
        {running && prompt.trim() ? (
          <button title={`Send now — stops ${running.persona}'s current turn (Ctrl+Enter). Enter queues instead.`} disabled={!canSend} onClick={() => void send(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-agent text-fg shadow-lg shadow-agent/30"><Zap size={14} /></button>
        ) : running ? (
          <button title={`Stop ${running.persona}`} onClick={() => void client?.call('chat.stop', { runId: running.runId })} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-agent/20 text-agent ring-1 ring-agent/40 hover:bg-agent/30"><Square size={11} fill="currentColor" strokeWidth={0} /></button>
        ) : (
          <button title="Send (Enter)" disabled={!canSend} onClick={() => void send()}
            className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-fg shadow-lg shadow-accent/30 transition-opacity', !canSend && 'opacity-30 shadow-none')}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} strokeWidth={2.5} />}
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1 border-t border-line px-0.5 pt-1.5 text-[11px] text-fg-subtle">
        <UserRound size={11} className="ml-1 shrink-0" />
        {agentAccounts.length > 0
          ? <Dropdown className="flex-1" value={account} options={accountOptions} onChange={setAccount} header="Sign in as" title="Account this run signs in as" menuWidth={260} />
          : <span className="min-w-0 flex-1 truncate px-1">This computer's login</span>}
        <button title="Manage agent accounts" onClick={() => useStore.setState({ settingsOpen: true })}
          className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 hover:bg-panel-3 hover:text-fg-muted"><Settings size={11} />Accounts</button>
      </div>
      {available && !available.available && <p className="mt-1.5 px-1 text-[11px] text-warn">{available.label} CLI not found on PATH, or the archa CLI is not built (pnpm cli).</p>}
    </div>
  );
}
