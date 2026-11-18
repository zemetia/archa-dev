import type { ReactNode } from 'react';
import { ArrowRight, FolderOpen, GitBranch, GitPullRequest, MessageSquare, Palette } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Button } from '../controls';
import { BrandMark, BrandTile, type Brand } from './Logo';
import { CodeLine, Notice, openFolder, PageHeader, SectionTitle, SoonChip } from './kit';

/* Settings pages that are mostly read-only: connecting outside agents, upcoming integrations, about. */

const q = (s: string) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

/** Listen mode (blueprint AGENT_BRIDGE): an agent started in a terminal connects to `archa mcp`. */
export function ConnectPage() {
  const info = useStore((s) => s.info);
  const cmd = info?.mcpCommand ?? ['archa', 'mcp'];
  const line = cmd.map(q).join(' ');
  const json = JSON.stringify({ mcpServers: { archadev: { command: cmd[0], args: cmd.slice(1) } } }, null, 2);
  const rows: Array<{ brand: Brand; label: string; text: string }> = [
    { brand: 'claude', label: 'Claude Code', text: `claude mcp add --scope user archadev -- ${line}` },
    { brand: 'codex', label: 'Codex', text: `codex mcp add archadev -- ${line}` },
  ];
  return (
    <>
      <PageHeader title="Connect an agent"
        description="Chat runs inside ArchaDev are wired up for you. To design from an agent you start yourself — in a terminal, an IDE or Orca — register ArchaDev's MCP server with it once. The app must be open while the agent works." />
      <div className="space-y-6">
        <div>
          <SectionTitle>One command</SectionTitle>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start gap-3">
                <BrandTile brand={r.brand} size="md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="text-[12.5px] font-medium">{r.label}</div>
                  <CodeLine text={r.text} label={`${r.label} command copied`} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle><BrandMark brand="agy" size={14} />Antigravity and any other MCP client</SectionTitle>
          <p className="mb-2 text-[11.5px] text-fg-muted">Add this to the client's MCP config (for agy: <span className="font-mono">~/.gemini/antigravity/mcp_config.json</span>).</p>
          <CodeLine text={json} label="MCP config copied" />
        </div>
        <Notice>The server talks to this app over a local pipe with a per-session token. Nothing is exposed to the network.</Notice>
      </div>
    </>
  );
}

const GITHUB_PLANS: Array<{ icon: ReactNode; title: string; text: string }> = [
  { icon: <GitBranch size={15} />, title: 'Designs in your repo', text: 'Commit .archa files and exports to a branch, with history you can diff.' },
  { icon: <GitPullRequest size={15} />, title: 'Pull requests from the canvas', text: 'Let an agent turn a frame into code and open a PR for review.' },
  { icon: <Palette size={15} />, title: 'Token sync', text: 'Keep design variables and the code\'s theme file in step, both ways.' },
  { icon: <MessageSquare size={15} />, title: 'Review comments', text: 'See PR review comments pinned to the frames they are about.' },
];

export function GithubPage({ onOpenMcp }: { onOpenMcp: () => void }) {
  return (
    <>
      <div className="mb-6 flex items-start gap-4 rounded-2xl border border-line bg-panel-2/40 p-6">
        <BrandTile brand="github" size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h2 className="text-[17px] font-semibold tracking-tight">GitHub</h2><SoonChip /></div>
          <p className="mt-1 max-w-[560px] text-[12px] leading-relaxed text-fg-muted">Connect a GitHub account to keep designs next to the code they describe. Sign-in will use GitHub's device flow; the token stays in the system keyring.</p>
          <div className="mt-4 flex gap-1.5">
            <Button variant="primary" disabled title="Coming soon"><BrandMark brand="github" size={13} className="bg-white" />Connect GitHub</Button>
          </div>
        </div>
      </div>
      <SectionTitle>Planned</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-2">
        {GITHUB_PLANS.map((p) => (
          <div key={p.title} className="rounded-xl border border-line bg-panel-2/30 p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-medium"><span className="text-accent-fg">{p.icon}</span>{p.title}</div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-subtle">{p.text}</p>
          </div>
        ))}
      </div>
      <Notice>
        <div className="flex items-center gap-3">
          <span className="flex-1">Until then, chat agents can already work with GitHub through the GitHub MCP server.</span>
          <Button variant="ghost" onClick={onOpenMcp}>Set up GitHub MCP<ArrowRight size={13} /></Button>
        </div>
      </Notice>
    </>
  );
}

const INTEGRATIONS: Array<{ brand: Brand; label: string; text: string }> = [
  { brand: 'figma', label: 'Figma', text: 'Import frames and styles from a Figma file.' },
  { brand: 'vercel', label: 'Vercel', text: 'Preview generated code on a deploy URL.' },
  { brand: 'linear', label: 'Linear', text: 'Link frames to issues and post design updates.' },
  { brand: 'notion', label: 'Notion', text: 'Pull specs from a page as agent context.' },
  { brand: 'slack', label: 'Slack', text: 'Share frames and get pinged when an agent finishes.' },
];

export function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="Other tools ArchaDev will connect to. Most of them already have an MCP server you can add today under MCP servers." />
      <div className="grid grid-cols-2 gap-2">
        {INTEGRATIONS.map((i) => (
          <div key={i.label} className="flex items-start gap-3 rounded-xl border border-line bg-panel-2/30 p-4">
            <BrandTile brand={i.brand} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="text-[12.5px] font-medium">{i.label}</span><SoonChip /></div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-fg-subtle">{i.text}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function AboutPage() {
  const info = useStore((s) => s.info);
  const skills = useStore((s) => s.skills);
  const home = skills?.libraryDir.replace(/[\\/]skills$/, '');
  const rows: Array<{ label: string; value: string; open?: string }> = [
    { label: 'Version', value: info?.version ?? '…' },
    { label: 'Data folder', value: home ?? '~/.archadev', open: home },
    { label: 'archa CLI', value: info?.cliPath ?? '…' },
    { label: 'Agent runners', value: info?.agents.map((a) => `${a.label}${a.available ? '' : ' (not found)'}`).join(', ') ?? '…' },
  ];
  return (
    <>
      <PageHeader title="About ArchaDev" description="A local-first design tool your coding agents can work in. Everything — documents, logins, skills, MCP servers — stays on this computer." />
      <div className="divide-y divide-line rounded-xl border border-line bg-panel-2/30">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-4 px-4 py-3">
            <span className="w-32 shrink-0 text-[12px] text-fg-muted">{r.label}</span>
            <span className="min-w-0 flex-1 select-text truncate font-mono text-[11.5px]">{r.value}</span>
            {r.open && <button onClick={() => void openFolder(r.open!)} title="Open folder" className="text-fg-subtle hover:text-fg"><FolderOpen size={14} /></button>}
          </div>
        ))}
      </div>
    </>
  );
}
