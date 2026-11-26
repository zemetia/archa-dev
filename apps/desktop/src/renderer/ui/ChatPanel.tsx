import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowUp, BookOpen, Camera, Check, ChevronRight, Code2, Copy, Crosshair, FileText, Globe, History, ImagePlus, Layers, Loader2, MessageSquare, Network, ScanSearch, Settings, Shapes, Sparkles, Square, SquarePen, Timer, UserRound, Wrench, X, Zap } from 'lucide-react';
import { chatThreads, formatElapsed, GUIDES, threadOf, type ChatImage, type ChatMessage, type ChatMode, type ModelOption } from '@archa/protocol';
import { loadSkills, runOfThread, select, toast, useStore } from '../lib/store';
import { imageFiles, MAX_CHAT_IMAGES, toChatImage } from '../lib/chatImages';
import { assetUrl } from '../lib/asset-urls';
import { personaBg } from './persona';
import { cn } from './controls';
import { Dropdown, type DropdownOption } from './Dropdown';
import { BrandMark, type Brand } from './settings/Logo';
import { Markdown } from './Markdown';
import { ArchaLogo } from './ArchaLogo';
import { SvgBlock } from './SvgBlock';
import { extractSvg, isSvgMarkup } from '@archa/formats';

/*
 * Agent-first panel: launch a local agent on this canvas (launch mode) and see what
 * any connected agent does (listen mode). Blueprint AGENT_BRIDGE.
 * Split in two cards: the thread (inside the left sidebar card) and the composer (its own card below).
 */

const AGENT_DOT: Record<string, string> = { claude: 'bg-claude', agy: 'bg-agy', codex: 'bg-codex' };

const TEAM_SUGGESTIONS = [
  'Research three SaaS pricing pages, then design ours: hero, tiers, FAQ and footer in parallel',
  'A landing page for a coffee brand — one worker per section, same style',
  'A mobile banking app: onboarding, home and transfer screens built side by side',
];

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
  const role = meta?.orchestra;
  const leadId = role ? ('lead' in role ? thread : role.parent) : null;
  const leadName = useMemo(() => (role && 'parent' in role ? chatThreads(chat.filter((c) => threadOf(c) === role.parent))[0]?.persona : undefined), [chat, role]);
  const teamSize = useMemo(() => (leadId ? new Set(chat.filter((c) => c.orchestra && 'parent' in c.orchestra && c.orchestra.parent === leadId).map(threadOf)).size : 0), [chat, leadId]);
  const mode = useStore((s) => s.chatMode);
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
        {role && 'parent' in role && (
          <button title={`Back to ${leadName ?? 'the lead'}'s chat`} onClick={() => useStore.setState({ chatThread: role.parent })}
            className="-ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-panel-2 hover:text-fg"><ArrowLeft size={14} /></button>
        )}
        {persona && <span title="Session name — its cursor on the canvas has this colour" className="flex shrink-0 items-center gap-1 rounded-full bg-panel-2 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted"><span className={cn('h-1.5 w-1.5 rounded-full', personaBg(persona))} />{persona}</span>}
        <span className="min-w-0 truncate text-[12.5px] font-semibold" title={title ?? undefined}>{title ?? 'New chat'}</span>
        <div className="flex-1" />
        {agents.length > 0 && (
          <span title={agents.map((a) => a.name).join(', ')} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-agent/15 px-2 py-0.5 text-[10.5px] font-medium text-agent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-agent" />{agents.length}&nbsp;live
          </span>
        )}
        {leadId && (
          <button title="Team view — the lead and its workers" onClick={() => useStore.setState({ orchestraView: leadId })}
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-2 text-[11px] font-medium text-accent-fg hover:bg-accent/30">
            <Network size={13} />{teamSize > 0 ? teamSize : 'Team'}
          </button>
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
      <div className="min-h-0 flex-1 select-text space-y-2 overflow-y-auto px-3 pb-3">
        {items.length === 0 && (
          <div className="space-y-5 px-1 pt-6">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft"><ArchaLogo size={20} /></span>
                <span className="text-[14px] font-semibold tracking-tight">{mode === 'orchestrate' ? 'What should your team build?' : 'What should your agent design?'}</span>
              </div>
              {mode === 'orchestrate' && (
                <p className="mb-3 text-[11.5px] leading-relaxed text-fg-subtle">Orchestrate: the agent you talk to leads. It splits the work and sends other agents to research or build different sections at the same time, then checks and joins the result.</p>
              )}
              <div className="flex flex-col items-start gap-1.5">
                {(mode === 'orchestrate' ? TEAM_SUGGESTIONS : SUGGESTIONS).map((t) => (
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
            {m.role === 'user' && (
              <div className="ml-6 rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed text-fg">
                {m.images?.length ? (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {m.images.map((src, i) => <img key={i} src={assetUrl(src, m.docId, 'data')} alt="" className="h-16 max-w-[120px] rounded-md border border-line object-cover" />)}
                  </div>
                ) : null}
                <MentionText text={m.text} />
              </div>
            )}
            {m.role === 'agent' && <AgentText agent={m.agent} persona={m.persona} label={agentLabel(m.agent)} text={m.text} />}
            {m.role === 'tool' && <ToolRow m={m} pending={!!running && 'callId' in m && !!m.callId && m.runId === running.runId && m.result === undefined} />}
            {m.role === 'status' && m.elapsedMs !== undefined && (
              <div title={`This turn took ${formatElapsed(m.elapsedMs)}`} className="flex items-center gap-1.5 px-1 text-[11px] tabular-nums text-fg-subtle"><Timer size={11} className="shrink-0" /><span className="truncate">{m.text}</span></div>
            )}
            {m.role === 'status' && m.elapsedMs === undefined && <div className="flex items-center gap-1.5 px-1 text-[11px] text-fg-subtle"><UserRound size={11} className="shrink-0" /><span className="truncate">{m.text}</span></div>}
            {m.role === 'error' && <div className="whitespace-pre-wrap rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{m.text}</div>}
          </div>
        ))}
        {live && <AgentText agent={live.agent} persona={persona} label={agentLabel(live.agent)} text={live.text} streaming />}
        {running && !live && <div className="flex items-center gap-2 px-1 text-[12px] text-agent"><Loader2 size={13} className="animate-spin" />{running.persona} is working on the canvas…<Elapsed since={running.startedAt} /></div>}
        {running && live && <div className="flex items-center gap-1.5 px-1 text-[11px] text-fg-subtle"><Timer size={11} className="shrink-0" />Working<Elapsed since={running.startedAt} /></div>}
        <div ref={end} />
      </div>
    </div>
  );
}

/** Live "· 1m 05s" next to a running turn; ticks once a second. */
function Elapsed({ since }: { since?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return null;
  return <span className="tabular-nums text-fg-subtle">· {formatElapsed(now - since)}</span>;
}

/**
 * Messages sent while the agent works wait here, pinned above the composer, until their turn starts.
 * Send interrupts the running turn and runs that message next; X drops it.
 */
function QueuedMessages({ threadId, persona }: { threadId: string; persona: string }) {
  const client = useStore((s) => s.client);
  const items = useStore((s) => s.chatQueue[threadId]);
  // The queue lives in the core: pick it up when the thread opens (events keep it current after that).
  useEffect(() => {
    if (!client) return;
    let live = true;
    client.call('chat.queued', { threadId })
      .then((list) => { if (live) useStore.setState((s) => ({ chatQueue: list.length ? { ...s.chatQueue, [threadId]: list } : Object.fromEntries(Object.entries(s.chatQueue).filter(([k]) => k !== threadId)) })); })
      .catch(() => { /* an older core without a queue list: events still fill it */ });
    return () => { live = false; };
  }, [client, threadId]);
  if (!items?.length) return null;
  const act = (method: 'chat.sendQueued' | 'chat.unqueue', id: string) => client?.call(method, { threadId, id }).catch((e: Error) => toast(e.message, 'error'));
  return (
    <div className="mb-1.5 space-y-1">
      {items.map((q, i) => (
        <div key={q.id} className="flex items-start gap-2 rounded-xl border border-line bg-panel-2 py-1.5 pl-2.5 pr-1.5">
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[12px] leading-snug text-fg-muted">{q.text}</span>
            <span className="text-[10.5px] text-fg-subtle">{i === 0 ? `Runs when ${persona} finishes` : `Waiting · ${i + 1} in line`}{q.images?.length ? ` · ${q.images.length} image${q.images.length > 1 ? 's' : ''}` : ''}</span>
          </span>
          <button title={`Send now — stops ${persona}'s current turn and runs this next`} onClick={() => void act('chat.sendQueued', q.id)}
            className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-agent px-2 text-[11px] font-medium text-fg hover:opacity-90"><Zap size={11} />Send</button>
          <button title="Remove from the queue" onClick={() => void act('chat.unqueue', q.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-panel-3 hover:text-fg"><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

/** `/skill` mentions in a sent message, tinted so the person sees which skills went with it. */
function MentionText({ text }: { text: string }) {
  const parts = text.split(/((?:^|\s)\/[a-z0-9][a-z0-9-]*)/gi);
  return parts.map((p, i) => (i % 2 ? <span key={i} className="whitespace-nowrap font-medium text-accent-fg">{p}</span> : p));
}

const TOOL_ICON: Record<string, typeof Wrench> = {
  execute: Code2, inspect: ScanSearch, screenshot: Camera, get_state: Layers, read_guide: BookOpen, browser: Globe,
  export_svg: Code2, place_svg: Shapes, delegate: Network, wait_workers: Network, tell_worker: Network,
};

/**
 * One tool call the agent made. Collapsed: what it did in one line. Expanded: the full input (the code an
 * execute ran, the node an inspect looked at…) and what the tool returned.
 */
type ToolItem = Pick<ChatMessage, 'text' | 'detail' | 'result' | 'failed'> & { nodeIds: string[] };

function ToolRow({ m, pending }: { m: ToolItem; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const tool = m.text.split(' · ')[0]!.trim();
  const Icon = TOOL_ICON[tool] ?? Wrench;
  const expandable = !!(m.detail || m.result);
  const selectNodes = () => select(m.nodeIds.filter((id) => useStore.getState().doc?.get(id)).slice(0, 50));
  return (
    <div className="px-0.5">
      <button onClick={() => (expandable ? setOpen(!open) : m.nodeIds.length && selectNodes())} aria-expanded={expandable ? open : undefined}
        title={expandable ? (open ? 'Hide details' : 'Show what this step did') : m.text}
        className={cn('group flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11.5px] text-fg-subtle hover:bg-panel-2 hover:text-fg-muted', open && 'text-fg-muted')}>
        {expandable
          ? <ChevronRight size={11} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
          : <span className="w-[11px] shrink-0" />}
        <Icon size={11} className={cn('shrink-0', m.failed && 'text-danger')} />
        <span className="min-w-0 flex-1 truncate">{m.text}</span>
        {pending && <Loader2 size={10} className="shrink-0 animate-spin" />}
        {m.failed && <span className="shrink-0 text-[10px] text-danger">failed</span>}
      </button>
      {open && (
        <div className="mb-1 ml-[18px] mt-0.5 space-y-1.5 rounded-lg border border-line bg-panel-2/60 p-1.5">
          {tool === 'place_svg' && m.detail && isSvgMarkup(m.detail) && extractSvg(m.detail) && <SvgBlock code={extractSvg(m.detail)!} />}
          {m.detail && <DetailBlock label={tool === 'execute' ? 'Code' : tool === 'place_svg' ? 'SVG' : 'Input'} text={m.detail} />}
          {m.result !== undefined
            ? <DetailBlock label={m.failed ? 'Error' : 'Result'} text={m.result} danger={m.failed} />
            : pending && <div className="flex items-center gap-1.5 px-1 text-[10.5px] text-fg-subtle"><Loader2 size={10} className="animate-spin" />Waiting for the result…</div>}
          {m.nodeIds.length > 0 && (
            <button onClick={selectNodes} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-fg-muted hover:bg-panel-3 hover:text-fg">
              <Crosshair size={10} />Select {m.nodeIds.length === 1 ? 'the layer' : `${m.nodeIds.length} layers`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DetailBlock({ label, text, danger }: { label: string; text: string; danger?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex h-5 items-center px-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
        <span className="flex-1">{label}</span>
        <button title="Copy" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-panel-3 hover:text-fg">{copied ? <Check size={10} /> : <Copy size={10} />}</button>
      </div>
      <pre className={cn('max-h-64 select-text overflow-auto whitespace-pre-wrap break-words rounded-md bg-panel px-2 py-1.5 font-mono text-[10.5px] leading-relaxed', danger ? 'text-danger' : 'text-fg-muted')}>{text}</pre>
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

const AGENT_BRAND: Record<string, Brand> = { claude: 'claude', agy: 'agy', codex: 'codex' };

/** The agent's logo (a dot for agents without one); dimmed when its CLI is not installed. */
const AgentIcon = ({ agent, dim }: { agent: string; dim?: boolean }) => {
  const brand = AGENT_BRAND[agent];
  if (brand) return <BrandMark brand={brand} size={14} className={cn(dim && 'opacity-40 grayscale')} />;
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', AGENT_DOT[agent] ?? 'bg-fg-subtle', dim && 'opacity-40')} />;
};

export function ChatComposer() {
  const info = useStore((s) => s.info);
  const docId = useStore((s) => s.activeDocId);
  const docName = useStore((s) => s.docs.find((d) => d.id === s.activeDocId)?.name);
  const client = useStore((s) => s.client);
  const thread = useStore((s) => s.chatThread);
  const running = useStore((s) => runOfThread(s.runs, s.chatThread));
  const prompt = useStore((s) => s.chatDraft);
  const setPrompt = (chatDraft: string) => useStore.setState({ chatDraft });
  // A thread keeps the mode it started in; the toggle picks the mode of a new chat.
  const chatMode = useStore((s) => s.chatMode);
  const threadRole = useStore((s) => (s.chatThread ? s.chat.find((m) => threadOf(m) === s.chatThread && m.orchestra)?.orchestra : undefined));
  const threadStarted = useStore((s) => !!s.chatThread && s.chat.some((m) => threadOf(m) === s.chatThread));
  const mode: ChatMode = threadStarted ? (threadRole && 'lead' in threadRole ? 'orchestrate' : 'chat') : chatMode;
  const isWorker = !!threadRole && 'parent' in threadRole;
  const setMode = (m: ChatMode) => { useStore.setState({ chatMode: m }); remember('archa.chatMode', m); };
  const [agent, setAgentState] = useState(() => remembered('archa.chatAgent', 'claude'));
  const [model, setModelState] = useState(() => remembered(`archa.chatModel.${agent}`, ''));
  const [account, setAccount] = useState('');
  const [models, setModels] = useState<{ agent: string; list: ModelOption[]; source: string } | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [sending, setSending] = useState(false);
  // Images pasted into the composer, sent with the next message.
  const [images, setImages] = useState<ChatImage[]>([]);
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
    value: a.id, label: a.label, description: AGENT_HINT[a.id], icon: <AgentIcon agent={a.id} dim={!a.available} />,
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

  const addImages = (files: File[]) => {
    const room = MAX_CHAT_IMAGES - images.length;
    if (room <= 0) { toast(`Up to ${MAX_CHAT_IMAGES} images per message`, 'error'); return; }
    Promise.all(files.slice(0, room).map(toChatImage))
      .then((added) => setImages((list) => [...list, ...added].slice(0, MAX_CHAT_IMAGES)))
      .catch((err: Error) => toast(`Could not read the image: ${err.message}`, 'error'));
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const files = imageFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    addImages(files);
  };
  // Photos dragged from Explorer onto the composer attach like pasted ones.
  const [dropping, setDropping] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDropping(false);
    const files = imageFiles(e.dataTransfer);
    if (files.length) addImages(files);
    else toast('Only images can be attached', 'error');
  };

  // `/` opens a list of skills and guides; the picked one goes with the message (blueprint AGENT_BRIDGE/05).
  const skills = useStore((s) => s.skills);
  const [slash, setSlash] = useState<{ start: number; end: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashOptions = useMemo(() => {
    if (!slash) return [];
    const q = slash.query.toLowerCase();
    const seen = new Set<string>();
    const all: Array<{ name: string; description: string; source: string }> = [];
    for (const s of skills?.skills ?? []) {
      const name = s.name.toLowerCase();
      if (s.error || seen.has(name) || !/^[a-z0-9][a-z0-9-]*$/.test(name)) continue;
      seen.add(name);
      all.push({ name, description: s.description, source: s.source === 'archadev' ? 'Skill' : s.source === 'builtin' ? 'Built-in' : `Skill · ${s.source}` });
    }
    for (const [name, g] of Object.entries(GUIDES)) if (!seen.has(name)) all.push({ name, description: `${g.title} — ${g.when}`, source: 'Guide' });
    // Names first (prefix, then anywhere), then descriptions: "/instagram" finds design-social.
    const rank = (o: { name: string; description: string }) => (o.name.startsWith(q) ? 0 : o.name.includes(q) ? 1 : o.description.toLowerCase().includes(q) ? 2 : 3);
    return all.map((o) => [o, rank(o)] as const).filter(([, r]) => r < 3).sort((a, b) => a[1] - b[1]).map(([o]) => o).slice(0, 12);
  }, [slash, skills]);
  const readSlash = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    const m = /(^|\s)\/([a-z0-9-]*)$/i.exec(el.value.slice(0, caret));
    if (!m) { setSlash(null); return; }
    if (!skills) void loadSkills();
    setSlash({ start: caret - m[2]!.length - 1, end: caret, query: m[2]! });
    setSlashIndex(0);
  };
  const pickSlash = (name: string) => {
    if (!slash) return;
    const next = `${prompt.slice(0, slash.start)}/${name} ${prompt.slice(slash.end)}`;
    setPrompt(next);
    setSlash(null);
    const at = slash.start + name.length + 2;
    requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(at, at); } });
  };

  const send = async (now = false) => {
    if (!client || !docId || (!prompt.trim() && !images.length) || sending || !available?.available) return;
    setSending(true);
    try {
      const threadId = thread ?? reserved.current ?? undefined;
      const text = prompt.trim() || (images.length > 1 ? 'Use the attached images.' : 'Use the attached image.');
      const r = await client.call('chat.send', {
        docId, agent, model: model || undefined, account: account || undefined, prompt: text, threadId, now: running ? now : undefined, mode: threadStarted ? undefined : mode,
        focus: focusNodes.map((n) => n.id), images: images.length ? images : undefined,
      });
      reserved.current = null;
      setImages([]);
      useStore.setState({ chatDraft: '', chatThread: r.threadId });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };
  const canSend = (!!prompt.trim() || images.length > 0) && !!available?.available && !sending;

  return (
    <div onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Element | null)) setDropping(false); }} onDrop={onDrop}
      className={cn('relative shrink-0 rounded-2xl border border-line bg-panel p-2 transition-colors focus-within:border-accent/60', dropping && 'border-accent bg-accent-soft')}>
      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl text-[12px] font-medium text-accent-fg">
          <ImagePlus size={15} />Drop to attach
        </div>
      )}
      {slash && slashOptions.length > 0 && (
        <div role="listbox" className="absolute bottom-full left-0 right-0 z-20 mb-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-panel-2 p-1 shadow-2xl shadow-black/40">
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Skills · goes with this message</div>
          {slashOptions.map((o, i) => (
            <button key={o.name} role="option" aria-selected={i === slashIndex} onMouseEnter={() => setSlashIndex(i)}
              ref={i === slashIndex ? (el) => { el?.scrollIntoView({ block: 'nearest' }); } : undefined}
              onMouseDown={(e) => { e.preventDefault(); pickSlash(o.name); }}
              className={cn('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left', i === slashIndex && 'bg-panel-3')}>
              <Sparkles size={12} className="mt-0.5 shrink-0 text-accent-fg" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[12px] text-fg">/{o.name}<span className="text-[10px] text-fg-subtle">{o.source}</span></span>
                <span className="block truncate text-[11px] text-fg-subtle">{o.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {thread && <QueuedMessages threadId={thread} persona={running?.persona ?? 'the agent'} />}
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <span title="The agent works on this document" className="flex h-6 max-w-[140px] shrink-0 items-center gap-1 rounded-md border border-line px-1.5 text-[11px] text-fg-muted">
          <FileText size={11} className="shrink-0" /><span className="truncate">{docName ?? 'Canvas'}</span>
        </span>
        <ModeToggle mode={mode} locked={threadStarted} worker={isWorker} onChange={setMode} />
        {focusNodes.length > 0 && (
          <span title={`The request is about: ${focusNodes.map((n) => n.name).join(', ')}`} className="flex h-6 min-w-0 items-center gap-1 rounded-md border border-accent/40 bg-accent-soft pl-1.5 text-[11px] text-accent-fg">
            <Crosshair size={11} className="shrink-0" />
            <span className="truncate">{focusNodes.length === 1 ? focusNodes[0]!.name : `${focusNodes[0]!.name} +${focusNodes.length - 1}`}</span>
            <button title="Don't send the selection" onClick={() => setFocusOff(selKey)} className="flex h-6 w-5 shrink-0 items-center justify-center hover:text-fg"><X size={11} /></button>
          </span>
        )}
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pb-1">
          {images.map((img, i) => (
            <span key={i} className="group relative">
              <img src={img.thumb} alt={`Pasted image ${i + 1}`} className="h-12 w-12 rounded-md border border-line object-cover" />
              <button title="Remove image" onClick={() => setImages((list) => list.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-panel-3 text-fg-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"><X size={9} /></button>
            </span>
          ))}
        </div>
      )}
      <textarea ref={input} value={prompt} onChange={(e) => { setPrompt(e.target.value); readSlash(e.target); }} onFocus={warm} onPaste={onPaste} rows={3}
        onBlur={() => setSlash(null)} onClick={(e) => readSlash(e.currentTarget)}
        placeholder={running ? `${running.persona} is working — Enter queues a follow-up, Ctrl+Enter sends it now` : mode === 'orchestrate' ? 'Describe the job — the lead splits it across a team…' : 'Describe what to design… (/ for skills)'}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (slash && slashOptions.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setSlashIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : slashOptions.length - 1)) % slashOptions.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSlash(slashOptions[slashIndex]!.name); return; }
            if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e.ctrlKey || e.metaKey); }
          else if (e.key === 'Backspace' && !prompt && images.length) setImages((list) => list.slice(0, -1));
        }}
        className="block w-full resize-none bg-transparent px-1.5 py-1 text-[12.5px] leading-relaxed placeholder:text-fg-subtle" />
      <div className="flex items-center gap-0.5">
        <Dropdown className="max-w-[45%] shrink-0" value={agent} options={agentOptions} onChange={setAgent} header="Agent" title="Agent that runs this prompt" menuWidth={250} />
        <Dropdown className="flex-1" value={model} options={modelOptions} onChange={setModel} header={models?.source ?? 'Model'} loading={loadingModels} title="Model" menuWidth={260} />
        {running && (prompt.trim() || images.length > 0) ? (
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

/** Chat = one agent; Orchestrate = the agent leads a team of workers (blueprint AGENT_BRIDGE/06). Fixed once a thread starts. */
function ModeToggle({ mode, locked, worker, onChange }: { mode: ChatMode; locked: boolean; worker: boolean; onChange: (m: ChatMode) => void }) {
  if (locked) {
    if (mode === 'chat' && !worker) return null;
    return (
      <span title={worker ? 'A worker in an orchestrated team' : 'This chat leads a team of agents'} className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-accent-soft px-1.5 text-[11px] font-medium text-accent-fg">
        <Network size={11} />{worker ? 'Worker' : 'Orchestrate'}
      </span>
    );
  }
  const item = (m: ChatMode, label: string, Icon: typeof Network, hint: string) => (
    // The colour sits on a span: the base stylesheet makes buttons inherit theirs.
    <button title={hint} onClick={() => onChange(m)} className={cn('flex h-[20px] items-center rounded px-1.5 text-[11px]', mode === m && (m === 'orchestrate' ? 'bg-accent-soft' : 'bg-panel-3'))}>
      <span className={cn('flex items-center gap-1 transition-colors', mode !== m ? 'text-fg-subtle hover:text-fg-muted' : m === 'orchestrate' ? 'text-accent-fg' : 'text-fg')}>
        <Icon size={11} />{label}
      </span>
    </button>
  );
  return (
    <span className="flex h-6 shrink-0 items-center rounded-md border border-line p-px">
      {item('chat', 'Chat', MessageSquare, 'One agent designs')}
      {item('orchestrate', 'Orchestrate', Network, 'The agent leads a team: it sends other agents to research or build sections in parallel')}
    </span>
  );
}
