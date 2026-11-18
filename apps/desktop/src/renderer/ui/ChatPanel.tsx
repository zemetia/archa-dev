import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Copy, Loader2, Settings, Square, UserRound, Wrench } from 'lucide-react';
import { select, toast, useStore } from '../lib/store';
import { cn } from './controls';

/*
 * Agent-first panel: launch a local agent on this canvas (launch mode) and see what
 * any connected agent does (listen mode). Blueprint AGENT_BRIDGE.
 */
export function ChatPanel() {
  const info = useStore((s) => s.info);
  const chat = useStore((s) => s.chat);
  const activity = useStore((s) => s.activity);
  const docId = useStore((s) => s.activeDocId);
  const running = useStore((s) => s.runningRun);
  const agents = useStore((s) => s.agents);
  const client = useStore((s) => s.client);
  const [prompt, setPrompt] = useState('');
  const [agent, setAgent] = useState('claude');
  const [model, setModel] = useState('');
  const [account, setAccount] = useState('');
  const accounts = useStore((s) => s.accounts?.accounts);
  const end = useRef<HTMLDivElement>(null);

  const available = info?.agents.find((a) => a.id === agent);
  // Saved login profiles for this agent ('' = its default account, 'host' = this computer's login).
  const agentAccounts = (accounts ?? []).filter((a) => a.agent === agent && a.enabled);
  const defaultAccount = agentAccounts.find((a) => a.isDefault);
  useEffect(() => { if (account && account !== 'host' && !agentAccounts.some((a) => a.id === account)) setAccount(''); }, [account, agentAccounts]);
  // Listen-mode agents (connected through `archa mcp` from a terminal) show up as activity.
  const items = useMemo(() => {
    const listen = activity.filter((a) => a.docId === docId && a.author.kind === 'agent' && !chat.some((c) => Math.abs(c.ts - a.ts) < 50))
      .map((a) => ({ id: a.id, ts: a.ts, role: a.tool === 'say' ? 'agent' as const : 'tool' as const, agent: a.author.name ?? a.author.id, text: a.tool === 'say' ? a.text : `${a.tool} · ${a.text}`, nodeIds: a.nodeIds }));
    return [...chat.map((c) => ({ ...c, nodeIds: [] as string[] })), ...listen].sort((a, b) => a.ts - b.ts);
  }, [chat, activity, docId]);

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [items.length]);

  const send = async () => {
    if (!client || !docId || !prompt.trim() || running) return;
    try {
      await client.call('chat.send', { docId, agent, model: model || undefined, account: account || undefined, prompt: prompt.trim() });
      setPrompt('');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const mcpLine = info ? `claude mcp add archadev -- ${info.mcpCommand.map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' ')}` : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {items.length === 0 && (
          <div className="space-y-3 px-1 pt-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><Bot size={16} className="text-accent" />Design with your local agent</div>
            <p className="text-[12px] leading-relaxed text-fg-muted">Describe a screen below and ArchaDev runs your installed agent on this canvas. It builds with auto-layout frames, screenshots its own work and fixes what the checks report — you watch it live.</p>
            <p className="text-[12px] leading-relaxed text-fg-muted">Prefer your own terminal? Connect Claude Code once, then ask it to design in ArchaDev:</p>
            {mcpLine && (
              <button onClick={() => { void navigator.clipboard.writeText(mcpLine); toast('Copied'); }}
                className="group flex w-full items-start gap-2 rounded-lg bg-panel-2 p-2 text-left font-mono text-[10.5px] leading-relaxed text-fg-muted hover:text-fg">
                <span className="min-w-0 flex-1 break-all">{mcpLine}</span><Copy size={12} className="mt-0.5 shrink-0" />
              </button>
            )}
          </div>
        )}
        {items.map((m) => (
          <div key={m.id}>
            {m.role === 'user' && <div className="ml-6 rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed text-fg">{m.text}</div>}
            {m.role === 'agent' && <div className="whitespace-pre-wrap px-1 text-[12.5px] leading-relaxed text-fg"><span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-agent">{m.agent}</span>{m.text}</div>}
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
        {running && <div className="flex items-center gap-2 px-1 text-[12px] text-agent"><Loader2 size={13} className="animate-spin" />Working on the canvas…</div>}
        <div ref={end} />
      </div>

      <div className="border-t border-line p-3">
        {agents.length > 0 && <div className="mb-2 truncate text-[11px] text-fg-subtle">Connected: {agents.map((a) => a.name).join(', ')}</div>}
        <div className="rounded-xl bg-panel-2 ring-1 ring-transparent focus-within:ring-accent">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe what to design…"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[12.5px] leading-relaxed placeholder:text-fg-subtle" />
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-7 rounded-md bg-transparent px-1 text-[11.5px] text-fg-muted hover:bg-panel-3">
              {(info?.agents ?? []).map((a) => <option key={a.id} value={a.id} className="bg-panel">{a.label}{a.available ? '' : ' (not found)'}</option>)}
            </select>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="h-7 rounded-md bg-transparent px-1 text-[11.5px] text-fg-muted hover:bg-panel-3">
              <option value="" className="bg-panel">Default model</option>
              {(available?.models ?? []).map((m) => <option key={m} value={m} className="bg-panel">{m}</option>)}
            </select>
            <div className="flex-1" />
            {running ? (
              <button title="Stop" onClick={() => void client?.call('chat.stop', { runId: running })} className="flex h-7 w-7 items-center justify-center rounded-full bg-fg text-panel"><Square size={11} fill="currentColor" /></button>
            ) : (
              <button title="Send (Enter)" disabled={!prompt.trim() || !available?.available} onClick={() => void send()}
                className={cn('flex h-7 w-7 items-center justify-center rounded-full bg-fg text-panel', (!prompt.trim() || !available?.available) && 'opacity-30')}>
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-fg-subtle">
          <UserRound size={11} className="shrink-0" />
          {agentAccounts.length > 0 ? (
            <select value={account} onChange={(e) => setAccount(e.target.value)} title="Account this run signs in as"
              className="h-6 min-w-0 flex-1 truncate rounded-md bg-transparent px-1 text-[11px] text-fg-muted hover:bg-panel-3">
              <option value="" className="bg-panel">Default · {defaultAccount ? defaultAccount.email || defaultAccount.name : "this computer's login"}</option>
              <option value="host" className="bg-panel">This computer's login</option>
              {agentAccounts.map((a) => <option key={a.id} value={a.id} className="bg-panel">{a.email || a.name}{a.signedIn ? '' : ' (not signed in)'}</option>)}
            </select>
          ) : <span className="min-w-0 flex-1 truncate px-1">This computer's login</span>}
          <button title="Manage agent accounts" onClick={() => useStore.setState({ settingsOpen: true })}
            className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 hover:bg-panel-3 hover:text-fg-muted"><Settings size={11} />Accounts</button>
        </div>
        {available && !available.available && <p className="mt-2 text-[11px] text-warn">{available.label} CLI not found on PATH, or the archa CLI is not built (pnpm cli).</p>}
      </div>
    </div>
  );
}
