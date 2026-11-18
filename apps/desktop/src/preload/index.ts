import { contextBridge, ipcRenderer } from 'electron';

// The core MessagePort cannot cross contextBridge, so it is forwarded with window.postMessage.
ipcRenderer.on('core-port', (e) => {
  window.postMessage({ type: 'archa:core-port' }, '*', e.ports);
});

contextBridge.exposeInMainWorld('archa', {
  platform: process.platform,
  showOpenDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open'),
  showSaveDialog: (suggested: string): Promise<string | null> => ipcRenderer.invoke('dialog:save', suggested),
  showExportDialog: (suggested: string, ext: string): Promise<string | null> => ipcRenderer.invoke('dialog:export', suggested, ext),
  pickFolder: (title: string): Promise<string | null> => ipcRenderer.invoke('dialog:folder', title),
  openFolder: (path: string): Promise<string> => ipcRenderer.invoke('shell:open-path', path),
  onOpenIntent: (cb: (intent: { kind: string; path?: string }) => void) => {
    ipcRenderer.on('open-intent', (_e, intent) => cb(intent));
  },
  // In-app browser (blueprint BROWSER): the pane reports where pages go; main pushes tab state.
  browser: {
    setBounds: (r: { x: number; y: number; width: number; height: number } | null) => ipcRenderer.send('browser:bounds', r),
    getState: () => ipcRenderer.invoke('browser:state'),
    ui: (action: string, arg?: string): Promise<string | null> => ipcRenderer.invoke('browser:ui', action, arg),
    onState: (cb: (state: unknown) => void) => {
      const h = (_e: unknown, s: unknown) => cb(s);
      ipcRenderer.on('browser:state', h);
      return () => { ipcRenderer.off('browser:state', h); };
    },
    onReveal: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('browser:reveal', h);
      return () => { ipcRenderer.off('browser:reveal', h); };
    },
    onToggle: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('browser:toggle', h);
      return () => { ipcRenderer.off('browser:toggle', h); };
    },
  },
});
