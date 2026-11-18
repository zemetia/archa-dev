import { useEffect, type ReactNode } from 'react';
import { Blocks, Bot, Info, Lock, Plug, Sparkles, TerminalSquare, X } from 'lucide-react';
import { loadAccounts, loadMcpServers, loadSkills, useStore, type SettingsPage } from '../lib/store';
import { cn } from './controls';
import { BrandMark } from './settings/Logo';
import { ProvidersPage } from './settings/ProvidersPage';
import { SkillsPage } from './settings/SkillsPage';
import { McpPage } from './settings/McpPage';
import { AboutPage, ConnectPage, GithubPage, IntegrationsPage } from './settings/OtherPages';

/*
 * Settings (Ctrl+,). One dialog, a grouped nav on the left, one page on the right (blueprint APP_UI/01).
 * Pages live in ./settings; each reads its own slice of the store and talks to the core host itself.
 */

type Badges = Pick<ReturnType<typeof useStore.getState>, 'accounts' | 'skills' | 'mcpServers'>;
type NavItem = { id: SettingsPage; label: string; icon: ReactNode; soon?: boolean; badge?: (s: Badges) => ReactNode };

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'AI',
    items: [
      {
        id: 'providers', label: 'AI providers', icon: <Bot size={15} />,
        badge: (s) => {
          if (!s.accounts) return null;
          const ready = s.accounts.clis.filter((c) => c.bin && (c.host.signedIn || s.accounts!.accounts.some((a) => a.agent === c.id && a.signedIn && a.enabled))).length;
          return <Count tone={ready ? 'ok' : 'warn'}>{ready}/{s.accounts.clis.length}</Count>;
        },
      },
      { id: 'skills', label: 'Skills', icon: <Sparkles size={15} />, badge: (s) => (s.skills ? <Count>{s.skills.skills.filter((k) => k.source === 'archadev' && k.enabled).length || null}</Count> : null) },
      { id: 'mcp', label: 'MCP servers', icon: <Plug size={15} />, badge: (s) => (s.mcpServers?.length ? <Count>{s.mcpServers.filter((m) => m.enabled).length}</Count> : null) },
    ],
  },
  {
    group: 'Connections',
    items: [
      { id: 'connect', label: 'Connect an agent', icon: <TerminalSquare size={15} /> },
      { id: 'github', label: 'GitHub', icon: <BrandMark brand="github" size={14} />, soon: true },
      { id: 'integrations', label: 'Integrations', icon: <Blocks size={15} />, soon: true },
    ],
  },
  { group: 'ArchaDev', items: [{ id: 'about', label: 'About', icon: <Info size={15} /> }] },
];

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const page = useStore((s) => s.settingsPage);
  const accounts = useStore((s) => s.accounts);
  const skills = useStore((s) => s.skills);
  const mcpServers = useStore((s) => s.mcpServers);
  const state: Badges = { accounts, skills, mcpServers };

  useEffect(() => {
    if (!open) return;
    void loadAccounts();
    void loadSkills();
    void loadMcpServers();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const go = (id: SettingsPage) => useStore.setState({ settingsPage: id });

  return (
    <div className="no-drag fixed inset-0 z-40 flex items-center justify-center bg-app/75 p-6 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Settings"
        className="flex h-[min(760px,calc(100vh-64px))] w-[min(1080px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <nav className="flex w-[232px] shrink-0 flex-col overflow-y-auto border-r border-line bg-app/40 p-3">
          <div className="px-2 pb-3 pt-1 text-[15px] font-semibold tracking-tight">Settings</div>
          {NAV.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.id} onClick={() => go(it.id)} aria-current={page === it.id ? 'page' : undefined}
                  className={cn('flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[12.5px] text-fg-muted hover:bg-panel-2 hover:text-fg',
                    page === it.id && 'bg-panel-3 text-fg hover:bg-panel-3')}>
                  <span className="flex w-4 justify-center">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.soon ? <span className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-subtle">Soon</span> : it.badge?.(state)}
                </button>
              ))}
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex gap-2 rounded-lg bg-panel-2/60 p-2.5 text-[11px] leading-relaxed text-fg-subtle">
            <Lock size={12} className="mt-0.5 shrink-0" />
            <span>Logins, skills and MCP secrets stay on this computer and are never written to a project or a log.</span>
          </div>
        </nav>

        <section className="relative flex min-w-0 flex-1 flex-col">
          <button onClick={close} title="Close (Esc)" className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-panel-3 hover:text-fg"><X size={16} /></button>
          <div key={page} className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-6 pr-14">
            {page === 'providers' && <ProvidersPage />}
            {page === 'skills' && <SkillsPage />}
            {page === 'mcp' && <McpPage />}
            {page === 'connect' && <ConnectPage />}
            {page === 'github' && <GithubPage onOpenMcp={() => go('mcp')} />}
            {page === 'integrations' && <IntegrationsPage />}
            {page === 'about' && <AboutPage />}
          </div>
        </section>
      </div>
    </div>
  );
}

function close() { useStore.setState({ settingsOpen: false }); }

function Count({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' }) {
  if (children === null || children === undefined) return null;
  return (
    <span className={cn('rounded-full px-1.5 text-[10.5px]', !tone && 'bg-panel-2 text-fg-subtle', tone === 'ok' && 'bg-ok/15 text-ok', tone === 'warn' && 'bg-warn/15 text-warn')}>{children}</span>
  );
}
