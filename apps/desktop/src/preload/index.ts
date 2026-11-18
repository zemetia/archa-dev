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
});
