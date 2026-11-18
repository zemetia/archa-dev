import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Download, FolderOpen, Loader2, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import type { Skill, SkillSource } from '@archa/protocol';
import { loadSkills, toast, useStore } from '../../lib/store';
import { Button, cn, Switch, TextInput } from '../controls';
import { BrandTile, type Brand } from './Logo';
import { call, Chip, Empty, Field, FormCard, IconAction, Notice, openFolder, PageHeader, SectionTitle } from './kit';

/*
 * Settings → Skills (blueprint AGENT_BRIDGE/05). The ArchaDev library (~/.archadev/skills) is handed to
 * chat runs; skills the agent CLIs load on their own are listed read-only and can be copied in.
 */

const SOURCE_BRAND: Record<SkillSource, Brand | null> = { archadev: null, claude: 'claude', codex: 'codex', gemini: 'agy', agents: null };

export function SkillsPage() {
  const data = useStore((s) => s.skills);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => { void loadSkills(); }, []);

  const match = (s: Skill) => !query.trim() || `${s.name} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase());
  const library = (data?.skills ?? []).filter((s) => s.source === 'archadev');
  const others = useMemo(() => (data?.sources ?? []).filter((s) => s.source !== 'archadev').map((src) => ({ ...src, skills: (data?.skills ?? []).filter((s) => s.source === src.source) })), [data]);

  const importFolder = async () => {
    const dir = await window.archa.pickFolder('Choose a skill folder (it contains SKILL.md)');
    if (!dir) return;
    await call(setImporting, async (c) => {
      const s = await c.call('skills.import', { dir });
      toast(`Added skill ${s.name}`);
    });
  };

  return (
    <>
      <PageHeader title="Skills"
        description="Skills are folders of instructions an agent loads when a task matches their description. Skills in the ArchaDev library are given to every chat run, on top of what your agent CLIs already know."
        actions={!creating && (
          <>
            <Button variant="ghost" disabled={importing} onClick={() => void importFolder()}>{importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}Import folder</Button>
            <Button variant="primary" onClick={() => setCreating(true)}><Plus size={13} />New skill</Button>
          </>
        )} />

      {!data ? (
        <div className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 size={14} className="animate-spin" />Reading skills…</div>
      ) : (
        <div className="space-y-6">
          {creating && <NewSkill onDone={() => setCreating(false)} />}

          <div className="flex h-8 items-center gap-2 rounded-lg bg-panel-2 px-2.5 ring-1 ring-transparent focus-within:ring-accent">
            <Search size={13} className="text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search skills" aria-label="Search skills"
              onKeyDown={(e) => e.stopPropagation()} className="w-full bg-transparent text-[12px] placeholder:text-fg-subtle" />
          </div>

          <div>
            <SectionTitle action={<button onClick={() => void openFolder(data.libraryDir)} className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg-muted"><FolderOpen size={12} />Open folder</button>}>
              ArchaDev library <span className="font-normal text-fg-subtle">{library.length}</span>
            </SectionTitle>
            <div className="space-y-2">
              {library.filter(match).map((s) => <SkillRow key={s.id} skill={s} />)}
              {library.length === 0 && !creating && (
                <Empty icon={<Sparkles size={22} className="text-accent-fg" />} title="No skills in the library yet"
                  action={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={13} />New skill</Button>}>
                  Write one here, import a folder with a SKILL.md, or copy one from an agent below. Enabled skills reach Claude Code chat runs.
                </Empty>
              )}
            </div>
          </div>

          {others.map((src) => <SourceGroup key={src.source} label={src.label} dir={src.dir} exists={src.exists} source={src.source} skills={src.skills.filter(match)} total={src.skills.length} />)}
        </div>
      )}
    </>
  );
}

function SkillRow({ skill: s }: { skill: Skill }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const library = s.source === 'archadev';

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && content === null) await call(() => undefined, async (c) => setContent((await c.call('skills.read', { id: s.id })).content));
  };
  const copyIn = () => call(setBusy, async (c) => { const n = await c.call('skills.import', { dir: s.dir }); toast(`Copied ${n.name} to the ArchaDev library`); });
  const remove = () => call(setBusy, async (c) => { await c.call('skills.delete', { id: s.id }); toast(`Deleted ${s.name}`); });

  return (
    <div className={cn('rounded-xl border border-line bg-panel-2/40', library && !s.enabled && 'opacity-60')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => void toggleOpen()} title={open ? 'Hide SKILL.md' : 'Show SKILL.md'} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-panel-3 hover:text-fg">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[12px] font-medium">{s.name}</span>
            {s.error && <Chip tone="warn" title={s.error}>Needs fixing</Chip>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-fg-subtle">{s.description || s.error}</p>
        </div>
        {confirm ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-fg-muted">Delete this skill folder?</span>
            <Button variant="danger" disabled={busy} onClick={remove}>Delete</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            {!library && <Button variant="ghost" disabled={busy} onClick={copyIn} title="Copy into the ArchaDev library so chat runs get it">{busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Add to ArchaDev</Button>}
            <IconAction title="Open folder" onClick={() => void openFolder(s.dir)}><FolderOpen size={14} /></IconAction>
            {library && (
              <>
                <div className="px-1.5"><Switch checked={s.enabled} label={s.enabled ? `Turn off ${s.name}` : `Turn on ${s.name}`}
                  onChange={(v) => void call(setBusy, async (c) => { await c.call('skills.update', { id: s.id, enabled: v }); })} /></div>
                <IconAction title="Delete skill" onClick={() => setConfirm(true)}><Trash2 size={14} /></IconAction>
              </>
            )}
          </div>
        )}
      </div>
      {open && (
        <div className="border-t border-line bg-app/30 px-4 py-3">
          {content === null
            ? <div className="flex items-center gap-2 text-[11.5px] text-fg-muted"><Loader2 size={12} className="animate-spin" />Reading SKILL.md…</div>
            : <pre className="max-h-72 select-text overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-fg-muted">{content}</pre>}
        </div>
      )}
    </div>
  );
}

function SourceGroup({ label, dir, exists, source, skills, total }: { label: string; dir: string; exists: boolean; source: SkillSource; skills: Skill[]; total: number }) {
  const [open, setOpen] = useState(false);
  const brand = SOURCE_BRAND[source];
  return (
    <div>
      <button onClick={() => setOpen(!open)} disabled={!total} className="mb-2 flex h-9 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-panel-2/60 disabled:hover:bg-transparent">
        {brand ? <BrandTile brand={brand} size="sm" muted={!total} /> : <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-panel-3 text-fg-subtle ring-1 ring-line"><BookOpen size={12} /></span>}
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="text-[11.5px] text-fg-subtle">{exists ? `${total} skill${total === 1 ? '' : 's'}` : 'folder not found'}</span>
        <span className="min-w-0 flex-1 truncate text-right font-mono text-[10.5px] text-fg-subtle">{dir}</span>
        {total > 0 && (open ? <ChevronDown size={14} className="text-fg-subtle" /> : <ChevronRight size={14} className="text-fg-subtle" />)}
      </button>
      {open && <div className="space-y-2">{skills.map((s) => <SkillRow key={s.id} skill={s} />)}</div>}
    </div>
  );
}

function NewSkill({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const canSave = !!slug && !!description.trim();

  const save = () => call(setSaving, async (c) => {
    const s = await c.call('skills.create', { name: slug, description: description.trim(), body });
    toast(`Created skill ${s.name}`);
    onDone();
  });

  return (
    <FormCard title="New skill" onCancel={onDone}>
      <div className="space-y-3">
        <Field label="Name" hint={slug && slug !== name.trim() ? <>Saved as <span className="font-mono">{slug}</span></> : 'Lowercase letters, digits and dashes.'}>
          <TextInput value={name} onChange={setName} autoFocus mono placeholder="e.g. brand-guidelines" />
        </Field>
        <Field label="When should the agent use it?" hint="The agent reads this to decide whether to load the skill. Be specific.">
          <TextInput value={description} onChange={setDescription} placeholder="e.g. Use when designing marketing pages for Zemetia — colours, type scale and tone of voice." />
        </Field>
        <Field label="Instructions (Markdown)">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.stopPropagation()} rows={9} spellCheck={false}
            placeholder={'# Brand guidelines\n\n- Primary colour …\n- Headings use …'}
            className="w-full resize-y rounded-lg bg-panel-2 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed ring-1 ring-transparent placeholder:text-fg-subtle focus:ring-accent" />
        </Field>
        <Notice>Saved to <span className="font-mono">~/.archadev/skills/{slug || '<name>'}/SKILL.md</span>. Add scripts or reference files to that folder afterwards.</Notice>
      </div>
      <div className="mt-4 flex justify-end gap-1.5">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!canSave || saving} onClick={save}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Create skill</Button>
      </div>
    </FormCard>
  );
}
