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
  /** Prints self-contained HTML pages into one PDF, a page each at its own size; resolves to an error message or null. */
  exportPdf: (args: { pages: Array<{ html: string; width: number; height: number }>; path: string }): Promise<string | null> => ipcRenderer.invoke('export:pdf', args),
  /** JPG of a canvas web page: `wide` at desktop width or the `object` as shown; asks where to save. */
  embedScreenshot: (webContentsId: number, mode: 'wide' | 'object'): Promise<{ path?: string | null; error?: string }> => ipcRenderer.invoke('embed:screenshot', { webContentsId, mode }),
  /** Foreground mask of a 1024×1024 RGB image (background removal); the model downloads on first use. */
  segment: (rgb: Uint8Array): Promise<{ mask?: Uint8Array; error?: string }> => ipcRenderer.invoke('ml:segment', { rgb }),
  onModelProgress: (cb: (p: { received: number; total: number }) => void) => {
    const h = (_e: unknown, p: { received: number; total: number }) => cb(p);
    ipcRenderer.on('model:progress', h);
    return () => { ipcRenderer.off('model:progress', h); };
  },
  pickFolder: (title: string): Promise<string | null> => ipcRenderer.invoke('dialog:folder', title),
  openFolder: (path: string): Promise<string> => ipcRenderer.invoke('shell:open-path', path),
  /** The folder this window works in (project), or null for the public window. */
  windowContext: (): Promise<{ project: string | null }> => ipcRenderer.invoke('window:context'),
  /** Opens a folder as a project in its own window (asks for one without a path); resolves to its root. */
  openProject: (path?: string): Promise<string | null> => ipcRenderer.invoke('window:open-project', path),
  onOpenIntent:(cb: (intent: { kind: string; path?: string }) => void) => {
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
