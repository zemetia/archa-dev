import { useEffect } from 'react';
import { updateSettings, useStore } from '../../lib/store';
import { NumberField, Switch } from '../controls';
import { Notice, PageHeader, SectionTitle } from './kit';

/* Settings → General: auto-save (core host, blueprint FILE_FORMATS/02 → Auto-save) and projects. */

export function GeneralPage() {
  const settings = useStore((s) => s.settings);
  const project = useStore((s) => s.project);

  useEffect(() => {
    const client = useStore.getState().client;
    void client?.call('settings.get').then((settings) => useStore.setState({ settings }));
  }, []);

  const autosave = settings?.autosave;
  return (
    <>
      <PageHeader title="General" description="How ArchaDev keeps your work." />
      <div className="space-y-6">
        <div>
          <SectionTitle action={autosave && <Switch label="Auto-save" checked={autosave.enabled} onChange={(enabled) => void updateSettings({ autosave: { ...autosave, enabled } })} />}>
            Auto-save
          </SectionTitle>
          <p className="mb-3 max-w-[620px] text-[12px] leading-relaxed text-fg-muted">
            Saves every open design with unsaved changes when an agent finishes its work, and on a timer. Designs in a project
            save into its <span className="font-mono">.design</span> folder; an untitled design outside a project is kept in
            ArchaDev's own folder and reopens next time.
          </p>
          <div className="w-[220px]">
            <NumberField label="Every" suffix="seconds" value={autosave?.seconds ?? null} min={5} max={3600} disabled={!autosave?.enabled}
              onCommit={(seconds) => autosave && void updateSettings({ autosave: { ...autosave, seconds: Math.round(seconds) } })} />
          </div>
        </div>
        <div>
          <SectionTitle>Projects</SectionTitle>
          <p className="mb-3 max-w-[620px] text-[12px] leading-relaxed text-fg-muted">
            Right-click a folder in Explorer and choose <span className="font-medium text-fg">Open this folder with Archa</span>, or use
            File → Open folder… (Ctrl+Shift+O). The folder gets a <span className="font-mono">.design</span> folder for its
            <span className="font-mono"> .archa</span> files and opens in its own window. Each window reopens the files it had open.
          </p>
          {project && <Notice>This window works in <span className="font-mono">{project}</span>.</Notice>}
        </div>
      </div>
    </>
  );
}
