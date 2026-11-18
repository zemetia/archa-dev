import { join, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, shell, utilityProcess, type UtilityProcess } from 'electron';

/* Main process: windows, argv, dialogs, core host lifecycle. Holds no document state (blueprint ARCHITECTURE/01). */

type OpenIntent = { kind: 'file'; path: string } | { kind: 'project'; path: string } | { kind: 'none' };

function parseArgv(argv: string[], cwd: string): OpenIntent {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = flag('--file');
  if (file) return { kind: 'file', path: resolve(cwd, file) };
  const project = flag('--project');
  if (project) return { kind: 'project', path: resolve(cwd, project) };
  const bare = args.find((a) => !a.startsWith('-') && a !== '.');
  if (bare && existsSync(resolve(cwd, bare))) {
    const p = resolve(cwd, bare);
    return statSync(p).isDirectory() ? { kind: 'project', path: p } : { kind: 'file', path: p };
  }
  return { kind: 'none' };
}

let core: UtilityProcess | null = null;
let restarts = 0;
const windows = new Set<BrowserWindow>();

function startCore() {
  core = utilityProcess.fork(join(__dirname, 'core-host.js'), [], { serviceName: 'ArchaDev Core', stdio: 'inherit' });
  core.on('exit', (code) => {
    core = null;
    if (code !== 0 && !quitting && restarts < 3) {
      restarts++;
      setTimeout(() => {
        startCore();
        for (const w of windows) connectWindow(w);
      }, 500 * restarts);
    }
  });
}

function connectWindow(win: BrowserWindow) {
  if (!core) return;
  const { port1, port2 } = new MessageChannelMain();
  core.postMessage({ type: 'connect', windowId: win.id }, [port1]);
  win.webContents.postMessage('core-port', null, [port2]);
}

function createWindow(intent: OpenIntent = { kind: 'none' }) {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0e0e10',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? true : { color: '#0e0e10', symbolColor: '#a1a1aa', height: 40 },
    title: 'ArchaDev',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windows.add(win);
  win.on('closed', () => windows.delete(win));
  win.once('ready-to-show', () => win.show());
  win.webContents.once('did-finish-load', () => {
    connectWindow(win);
    if (intent.kind !== 'none') win.webContents.send('open-intent', intent);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return win;
}

let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    const intent = parseArgv(argv, cwd);
    const win = [...windows][0];
    if (win && intent.kind !== 'none') {
      win.webContents.send('open-intent', intent);
      if (win.isMinimized()) win.restore();
      win.focus();
    } else createWindow(intent);
  });

  app.whenReady().then(() => {
    startCore();
    ipcMain.handle('dialog:open', async (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)!;
      const r = await dialog.showOpenDialog(win, { filters: [{ name: 'ArchaDev', extensions: ['archa'] }], properties: ['openFile'] });
      return r.canceled ? null : r.filePaths[0];
    });
    ipcMain.handle('dialog:save', async (e, suggested: string) => {
      const win = BrowserWindow.fromWebContents(e.sender)!;
      const r = await dialog.showSaveDialog(win, { defaultPath: suggested, filters: [{ name: 'ArchaDev', extensions: ['archa'] }] });
      return r.canceled ? null : r.filePath;
    });
    ipcMain.handle('dialog:export', async (e, suggested: string, ext: string) => {
      const win = BrowserWindow.fromWebContents(e.sender)!;
      const r = await dialog.showSaveDialog(win, { defaultPath: suggested, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      return r.canceled ? null : r.filePath;
    });
    ipcMain.handle('dialog:folder', async (e, title: string) => {
      const win = BrowserWindow.fromWebContents(e.sender)!;
      const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'showHiddenFiles'] });
      return r.canceled ? null : r.filePaths[0];
    });
    ipcMain.handle('shell:open-path', async (_e, path: string) => {
      if (typeof path !== 'string' || !existsSync(path) || !statSync(path).isDirectory()) return 'Folder not found';
      return shell.openPath(path);
    });
    createWindow(parseArgv(process.argv, process.cwd()));
  });

  app.on('before-quit', () => { quitting = true; core?.postMessage({ type: 'shutdown' }); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
