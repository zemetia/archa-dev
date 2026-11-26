import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Check, CircleAlert, Eye, Network, PenTool, Search, Square, Type, Workflow } from 'lucide-react';
import { chatThreads, threadOf, type ChatMessage } from '@archa/protocol';
import { runOfThread, togglePanel, useStore } from '../lib/store';
import { personaBg, personaText } from './persona';
import { cn } from './controls';

/*
 * Orchestrate mode, team view (blueprint APP_UI/01 → Team view): the lead and its workers as
 * connected circles, each with its agent, task and the prompt the lead gave it. Fills the window;
 * Back / Esc returns to the canvas, clicking an agent zooms into it and opens its chat.
 */

type Status = 'working' | 'finished' | 'failed' | 'stopped';
type Member = {
  id: string; persona: string; agent: string; title: string; kind?: string; prompt: string;
  status: Status; activity: string; x: number; y: number; lead: boolean;
};

const W = 1320;
const H = 940;
const LEAD = { x: W / 2, y: H / 2 };
const LEAD_R = 58;
const WORKER_R = 42;

const AGENT_LABEL: Record<string, string> = { claude: 'Claude Code', agy: 'Antigravity', codex: 'Codex' };
const AGENT_DOT: Record<string, string> = { claude: 'bg-claude', agy: 'bg-agy', codex: 'bg-codex' };
const KIND_ICON: Record<string, typeof Bot> = { research: Search, design: PenTool, copy: Type, review: Eye };

/** Turn state of a thread from its live run and its last messages. */
function statusOf(msgs: ChatMessage[], working: boolean): Status {
  if (working) return 'working';
  const last = [...msgs].reverse().find((m) => m.role !== 'user' && m.role !== 'tool');
  if (last?.role === 'error') return 'failed';
  if (last?.role === 'status' && (last.text === 'Stopped' || last.text.startsWith('Stopped after'))) return 'stopped';
  return 'finished';
}

/** What the agent did last, in one line. */
function activityOf(msgs: ChatMessage[]): string {
  const last = [...msgs].reverse().find((m) => m.role !== 'user');
  return last ? last.text.replace(/\s+/g, ' ').slice(0, 90) : 'Starting…';
}

/**
 * Workers on an ellipse around the lead. An even team is turned half a step so nobody sits
 * straight below the lead, where its link would run through the lead's card.
 */
function ringPosition(i: number, n: number) {
  const step = (2 * Math.PI) / Math.max(n, 1);
  const a = -Math.PI / 2 + i * step + (n % 2 === 0 ? step / 2 : 0);
  return { x: LEAD.x + Math.cos(a) * 480, y: LEAD.y + Math.sin(a) * 250 };
}

export function OrchestraView() {
  const leadId = useStore((s) => s.orchestraView);
  const chat = useStore((s) => s.chat);
  const runs = useStore((s) => s.runs);
  const live = useStore((s) => s.chatLive);
  const [hover, setHover] = useState<string | null>(null);
  const [zoomTo, setZoomTo] = useState<Member | null>(null);
  const [entered, setEntered] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const close = () => useStore.setState({ orchestraView: null });

  useEffect(() => {
    if (!leadId) return;
    setEntered(false);
    setZoomTo(null);
    const t = requestAnimationFrame(() => setEntered(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { cancelAnimationFrame(t); window.removeEventListener('keydown', onKey, true); };
  }, [leadId]);

  // The graph is drawn in a fixed W×H space and scaled to fit the window.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / W, el.clientHeight / H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [leadId]);

  const team = useMemo(() => {
    if (!leadId) return null;
    const byThread = new Map<string, ChatMessage[]>();
    for (const m of chat) {
      const id = threadOf(m);
      if (id === leadId || (m.orchestra && 'parent' in m.orchestra && m.orchestra.parent === leadId)) byThread.set(id, [...(byThread.get(id) ?? []), m]);
    }
    const leadMsgs = byThread.get(leadId) ?? [];
    const leadRun = runOfThread(runs, leadId);
    const meta = chatThreads(leadMsgs)[0];
    const lead: Member = {
      id: leadId, persona: leadRun?.persona ?? meta?.persona ?? 'Lead', agent: leadRun?.agent ?? leadMsgs[0]?.agent ?? '', title: meta?.title ?? 'Orchestration',
      prompt: leadMsgs.find((m) => m.role === 'user')?.text ?? '', status: statusOf(leadMsgs, !!leadRun),
      activity: live[leadId]?.text ? live[leadId]!.text.replace(/\s+/g, ' ').slice(-90) : activityOf(leadMsgs), ...LEAD, lead: true,
    };
    const ids = [...byThread.keys()].filter((id) => id !== leadId);
    const workers = ids.map((id, i): Member => {
      const msgs = byThread.get(id)!;
      const role = msgs.find((m) => m.orchestra && 'parent' in m.orchestra)?.orchestra as { title: string; kind?: string; prompt: string };
      const run = runOfThread(runs, id);
      return {
        id, persona: run?.persona ?? msgs.find((m) => m.persona)?.persona ?? 'Worker', agent: run?.agent ?? msgs[0]?.agent ?? '',
        title: role.title, kind: role.kind, prompt: role.prompt, status: statusOf(msgs, !!run), activity: activityOf(msgs),
        ...ringPosition(i, ids.length), lead: false,
      };
    });
    return { lead, workers };
  }, [leadId, chat, runs, live]);

  if (!leadId || !team) return null;

  /** Zoom into the agent, then open its conversation in the chat panel. */
  const open = (m: Member) => {
    if (zoomTo) return;
    setZoomTo(m);
    setTimeout(() => {
      useStore.setState({ orchestraView: null, chatThread: m.id, leftTab: 'chat' });
      togglePanel('left', true);
    }, 380);
  };

  const { lead, workers } = team;
  const working = workers.filter((w) => w.status === 'working').length;
  const done = workers.filter((w) => w.status === 'finished').length;
  const all = [lead, ...workers];
  const hovered = all.find((m) => m.id === hover);
  // Zooming: the clicked agent moves to the centre and grows past the screen.
  const zoom = zoomTo ? `translate(${(W / 2 - zoomTo.x) * 3}px, ${(H / 2 - zoomTo.y) * 3}px) scale(3)` : entered ? 'scale(1)' : 'scale(0.94)';

  return (
    <div className={cn('fixed inset-0 z-40 flex flex-col bg-app transition-opacity duration-200', entered && !zoomTo ? 'opacity-100' : zoomTo ? 'opacity-0 delay-150' : 'opacity-0')}>
      <div className="drag flex h-12 shrink-0 items-center gap-3 border-b border-line pl-3 pr-[150px]">
        <button title="Back to the canvas (Esc)" onClick={close}
          className="no-drag flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] text-fg-muted hover:bg-panel-2 hover:text-fg">
          <ArrowLeft size={14} />Back
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-fg"><Network size={14} /></span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{lead.title}</div>
          <div className="text-[11px] text-fg-subtle">
            Orchestrate · {lead.persona} leads {workers.length} worker{workers.length === 1 ? '' : 's'}
            {working > 0 && <span className="text-agent"> · {working} working</span>}
            {done > 0 && <span className="text-ok"> · {done} done</span>}
          </div>
        </div>
        <div className="flex-1" />
        <span className="no-drag hidden text-[11px] text-fg-subtle sm:block">Click an agent to open its chat</span>
      </div>

      <div ref={host} className="relative min-h-0 flex-1 overflow-hidden">
        <div style={{ width: W, height: H, left: '50%', top: '50%', transform: `translate(-50%, -50%) scale(${scale})` }} className="absolute">
          <div style={{ transform: zoom, transformOrigin: `${W / 2}px ${H / 2}px` }} className="absolute inset-0 transition-transform duration-500 ease-out">
            <svg width={W} height={H} className="absolute inset-0 overflow-visible">
              {workers.map((w) => <Link key={w.id} from={lead} to={w} />)}
            </svg>
            {all.map((m) => (
              <Node key={m.id} m={m} faded={!!hover && hover !== m.id} onOpen={() => open(m)} onHover={(on) => setHover(on ? m.id : null)} />
            ))}
            {workers.length === 0 && (
              <div style={{ left: LEAD.x, top: LEAD.y + LEAD_R + 120 }} className="absolute w-80 -translate-x-1/2 text-center text-[12px] text-fg-subtle">
                {lead.status === 'working' ? `${lead.persona} is planning the team…` : 'No workers yet. Ask the lead to split the work.'}
              </div>
            )}
          </div>
        </div>
        {hovered && !zoomTo && <PromptCard m={hovered} />}
      </div>
    </div>
  );
}

/** Lead → worker: a curved line in the worker's colour; a pulse travels along it while the worker is busy. */
function Link({ from, to }: { from: Member; to: Member }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const sx = from.x + (dx / len) * (LEAD_R + 6);
  const sy = from.y + (dy / len) * (LEAD_R + 6);
  const ex = to.x - (dx / len) * (WORKER_R + 8);
  const ey = to.y - (dy / len) * (WORKER_R + 8);
  // A slight bend so the links read as a hand-drawn web, not spokes.
  const cx = (sx + ex) / 2 - (dy / len) * 28;
  const cy = (sy + ey) / 2 + (dx / len) * 28;
  const d = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
  const busy = to.status === 'working';
  return (
    <g className={to.status === 'failed' ? 'text-danger' : personaText(to.persona)}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={busy ? 2.5 : 1.75} strokeOpacity={busy ? 0.75 : to.status === 'finished' ? 0.45 : 0.25} strokeLinecap="round" />
      {busy && (
        <circle r={4.5} fill="currentColor">
          <animateMotion dur="1.8s" repeatCount="indefinite" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

function Node({ m, faded, onOpen, onHover }: { m: Member; faded: boolean; onOpen: () => void; onHover: (on: boolean) => void }) {
  const r = m.lead ? LEAD_R : WORKER_R;
  const Icon = m.lead ? Workflow : KIND_ICON[m.kind ?? 'design'] ?? Bot;
  // Cards sit on the outer side of the ring, so they never cover the lead.
  const above = !m.lead && m.y < LEAD.y - 1;
  return (
    <div style={{ left: m.x, top: m.y }} className={cn('absolute transition-opacity duration-200', faded && 'opacity-40')}>
      <button onClick={onOpen} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onFocus={() => onHover(true)} onBlur={() => onHover(false)}
        title={`Open ${m.persona}'s chat`} style={{ width: r * 2, height: r * 2 }}
        className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none">
        {m.status === 'working' && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-25', personaBg(m.persona))} />}
        <span className={cn('absolute inset-0 rounded-full p-[3px] transition-transform duration-150 group-hover:scale-105 group-focus-visible:scale-105', m.status === 'failed' ? 'bg-danger' : personaBg(m.persona))}>
          <span className="flex h-full w-full items-center justify-center rounded-full bg-panel shadow-xl shadow-black/40">
            <Icon size={m.lead ? 30 : 22} className={m.status === 'failed' ? 'text-danger' : personaText(m.persona)} />
          </span>
        </span>
        <span title={AGENT_LABEL[m.agent] ?? m.agent} className={cn('absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-app', AGENT_DOT[m.agent] ?? 'bg-fg-subtle')} />
        <StatusBadge status={m.status} lead={m.lead} />
      </button>
      <div className={cn('pointer-events-none absolute w-[230px] -translate-x-1/2 text-center', above && '-translate-y-full', m.lead && 'rounded-xl bg-app px-2 py-1')}
        style={{ top: above ? -r - 12 : r + 12 }}>
        <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-fg">
          {m.persona}
          {m.lead && <span className="rounded-full bg-accent-soft px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-accent-fg">Lead</span>}
        </div>
        <div className="text-[11px] text-fg-subtle">{AGENT_LABEL[m.agent] ?? m.agent}{m.kind ? ` · ${m.kind}` : ''}</div>
        {!m.lead && <div className="mt-1 line-clamp-1 text-[12px] font-medium text-fg-muted">{m.title}</div>}
        <div className="mt-1 rounded-lg border border-line bg-panel px-2 py-1 text-left text-[11px] leading-snug text-fg-subtle">
          <div className="line-clamp-2"><span className="font-medium text-fg-muted">{m.lead ? 'Request' : 'Prompt'}: </span>{m.prompt || '—'}</div>
        </div>
        <div className={cn('mt-1 truncate text-[10.5px]', m.status === 'working' ? 'text-agent' : 'text-fg-subtle')}>{m.activity}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status, lead }: { status: Status; lead: boolean }) {
  if (status === 'working') return null;
  const cls = 'absolute flex h-5 w-5 items-center justify-center rounded-full ring-[3px] ring-app';
  const at = lead ? 'right-1.5 top-1.5' : 'right-0 top-0';
  if (status === 'failed') return <span className={cn(cls, at, 'bg-danger text-fg')}><CircleAlert size={11} /></span>;
  if (status === 'stopped') return <span className={cn(cls, at, 'bg-panel-3 text-fg-muted')}><Square size={8} fill="currentColor" strokeWidth={0} /></span>;
  return <span className={cn(cls, at, 'bg-ok text-app')}><Check size={11} strokeWidth={3} /></span>;
}

/** The whole prompt of the hovered agent, in the corner diagonally opposite it so it never covers that agent. */
function PromptCard({ m }: { m: Member }) {
  const corner = m.lead ? 'bottom-4 right-4' : `${m.y > LEAD.y ? 'top-4' : 'bottom-4'} ${m.x > LEAD.x ? 'left-4' : 'right-4'}`;
  return (
    <div className={cn('pointer-events-none absolute w-[320px] max-w-[calc(100%-32px)] rounded-2xl border border-line bg-panel p-3 shadow-2xl shadow-black/50', corner)}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold">
        <span className={cn('h-2 w-2 rounded-full', personaBg(m.persona))} />{m.persona}
        <span className="font-normal text-fg-subtle">· {AGENT_LABEL[m.agent] ?? m.agent}{m.lead ? ' · lead' : ''}</span>
      </div>
      {!m.lead && <div className="mb-1 text-[12px] font-medium text-fg-muted">{m.title}</div>}
      <div className="max-h-[40vh] overflow-hidden whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg-subtle">{m.prompt || '—'}</div>
    </div>
  );
}
