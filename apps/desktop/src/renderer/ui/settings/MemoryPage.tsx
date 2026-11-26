import { useCallback, useEffect, useState } from 'react';
import { Brain, FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react';
import type { MemoryEntry, MemoryScope } from '@archa/protocol';
import { toast, useStore } from '../../lib/store';
import { Button, Segmented } from '../controls';
import { call, Empty, Field, FormCard, IconAction, openFolder, PageHeader, SectionTitle } from './kit';

/*
 * Settings → Memory (blueprint AGENT_BRIDGE/07). What agents carry from one chat to the next: global facts
 * (~/.archadev/memory) and the open document's (`<name>-data/memory/`). Agents add them with `remember`;
 * here the person reads, adds and removes them. Each fact is a Markdown file, so the folders can be edited by hand too.
 */

export function MemoryPage() {
  const docId = useStore((s) => s.activeDocId);
  const doc = useStore((s) => s.docs.find((d) => d.id === s.activeDocId));
  const client = useStore((s) => s.client);
  const [list, setList] = useState<MemoryEntry[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    try { setList(await client.call('memory.list', { docId: docId ?? undefined })); } catch (e) { toast((e as Error).message, 'error'); }
  }, [client, docId]);

  useEffect(() => {
    void load();
    return client?.on('memory.changed', () => void load());
  }, [client, load]);

  const global = (list ?? []).filter((m) => m.scope === 'global');
  const local = (list ?? []).filter((m) => m.scope === 'document');
  const folder = (m: MemoryEntry[]) => m[0]?.file.replace(/[\\/][^\\/]+$/, '');

  return (
    <>
      <PageHeader title="Memory"
        description="Preferences, brand rules and lessons agents keep between chats. The newest ones go with the first message of every chat; an agent saves one when you correct it or say how you always want something."
        actions={!adding && <Button variant="primary" onClick={() => setAdding(true)}><Plus size={13} />Add</Button>} />

      {!list ? (
        <div className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 size={14} className="animate-spin" />Reading memory…</div>
      ) : (
        <div className="space-y-6">
          {adding && <NewMemory docName={doc?.name} onDone={() => setAdding(false)} />}
          <Group title="Global" hint="every document, every agent" items={global} dir={folder(global)}
            empty="Nothing yet. Tell an agent “remember that I never want…”, or add one here." />
          <Group title={doc ? `This document · ${doc.name}` : 'This document'} hint={doc?.filePath ? `${doc.dataDir.replace(/\\/g, '/')}/memory` : 'saved with the file once it has one'}
            items={local} dir={doc ? `${doc.dataDir}/memory` : undefined} canOpen={!!doc?.filePath}
            empty="Brand colours, tone, content rules — anything that only holds for this design." />
        </div>
      )}
    </>
  );
}

function Group({ title, hint, items, dir, empty, canOpen = true }: { title: string; hint: string; items: MemoryEntry[]; dir?: string; empty: string; canOpen?: boolean }) {
  return (
    <div>
      <SectionTitle action={dir && canOpen && items.length > 0 && (
        <button onClick={() => void openFolder(dir)} className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg-muted"><FolderOpen size={12} />Open folder</button>
      )}>
        {title} <span className="font-normal text-fg-subtle">{items.length} · {hint}</span>
      </SectionTitle>
      {items.length ? <div className="space-y-2">{items.map((m) => <MemoryRow key={m.id} m={m} />)}</div>
        : <Empty icon={<Brain size={22} className="text-accent-fg" />} title="No memory here">{empty}</Empty>}
    </div>
  );
}

function MemoryRow({ m }: { m: MemoryEntry }) {
  const [busy, setBusy] = useState(false);
  const docId = useStore((s) => s.activeDocId);
  const forget = () => call(setBusy, async (c) => { await c.call('memory.forget', { docId: docId ?? undefined, id: m.id }); toast(`Forgot “${m.name}”`); });
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-panel-2/40 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium">{m.name}</div>
        <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg-muted">{m.text}</p>
        <div className="mt-1 text-[10.5px] text-fg-subtle">{new Date(m.updatedAt).toLocaleString()}</div>
      </div>
      <IconAction title="Forget" disabled={busy} onClick={() => void forget()}><Trash2 size={14} /></IconAction>
    </div>
  );
}

function NewMemory({ docName, onDone }: { docName?: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const [scope, setScope] = useState<MemoryScope>('global');
  const [saving, setSaving] = useState(false);
  const save = () => call(setSaving, async (c) => {
    await c.call('memory.remember', { docId: useStore.getState().activeDocId ?? undefined, scope, text: text.trim() });
    toast('Remembered');
    onDone();
  });
  return (
    <FormCard title="Add to memory" onCancel={onDone}>
      <div className="space-y-3">
        <Field label="Where it applies">
          <Segmented value={scope} onChange={setScope} options={[
            { value: 'global', label: 'Global', title: 'Every document' },
            { value: 'document', label: docName ? `Only ${docName}` : 'This document', title: 'Saved in this document’s data folder' },
          ]} />
        </Field>
        <Field label="What should agents remember?" hint="One rule or fact, written so it makes sense on its own.">
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} rows={4} autoFocus
            placeholder="e.g. Never put small labels above headings."
            className="w-full resize-y rounded-lg bg-panel-2 px-2.5 py-2 text-[12px] leading-relaxed ring-1 ring-transparent placeholder:text-fg-subtle focus:ring-accent" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-1.5">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!text.trim() || saving} onClick={save}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Remember</Button>
      </div>
    </FormCard>
  );
}
