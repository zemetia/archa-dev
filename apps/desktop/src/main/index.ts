import { isAbsolute, join, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, shell, utilityProcess, type UtilityProcess } from 'electron';
import { z } from 'zod';
import { browserCommandSchema, type MainBridgeResponse } from '@archa/protocol';
import { BrowserManager } from './browser';
import { printPagesToPdf } from './pdf';
import { embedShotArgs, saveEmbedShot } from './embed-shot';
import { segment, segmentArgs, stopMlHost } from './models';

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
const browser = new BrowserManager();

/* The core host relays agent `browser` calls here; pages live in this process (blueprint BROWSER). */
const bridgeRequest = z.object({ type: z.literal('browser'), id: z.number(), agent: z.string().max(200), cmd: browserCommandSchema });

function onCoreMessage(msg: unknown) {
  if ((msg as { type?: string })?.type !== 'browser') return;
  const parsed = bridgeRequest.safeParse(msg);
  const reply = (r: MainBridgeResponse) => core?.postMessage(r);
  if (!parsed.success) {
    const id = (msg as { id?: unknown }).id;
    if (typeof id === 'number') reply({ type: 'browser-result', id, ok: false, error: `Invalid browser command: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}` });
    return;
  }
  const { id, agent, cmd } = parsed.data;
  browser.run(cmd, agent).then(
    (r) => reply({ type: 'browser-result', id, ok: true, reply: r }),
    (e: unknown) => reply({ type: 'browser-result', id, ok: false, error: (e as Error).message }),
  );
}

// ArchaDev keeps its own agent logins (~/.archadev/profiles). Drop the config dirs and session markers a parent
// tool (Orca, another agent's terminal) hands down, so the core host and every agent it spawns see the real host login.
const INHERITED_AGENT_ENV = /^(CLAUDE_CONFIG_DIR|CODEX_HOME|CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|ORCA_.+)$/i;
const ownEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !INHERITED_AGENT_ENV.test(k)));

function startCore() {
  // Packaged builds ship the CLI under resources/cli (electron-builder extraResources).
  // Built-in design skills ship under resources/skills (electron-builder extraResources); in dev they are the repo's skills/.
  const builtinSkills = app.isPackaged ? join(process.resourcesPath, 'skills') : resolve(app.getAppPath(), '..', '..', 'skills');
  const env = app.isPackaged
    ? { ...ownEnv(), ARCHA_CLI: join(process.resourcesPath, 'cli', 'archa.cjs'), ARCHA_BUILTIN_SKILLS: builtinSkills }
    : { ...ownEnv(), ARCHA_BUILTIN_SKILLS: process.env.ARCHA_BUILTIN_SKILLS ?? builtinSkills };
  core = utilityProcess.fork(join(__dirname, 'core-host.js'), [], { serviceName: 'ArchaDev Core', stdio: 'inherit', env });
  core.on('message', onCoreMessage);
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

/**
 * Canvas web pages (embed nodes) load arbitrary sites: no preload, no Node, sandboxed, their own
 * persistent session, http(s) only. Popups open in the system browser instead of new windows.
 */
function guardWebviews(win: BrowserWindow) {
  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    params.partition = 'persist:archa-embed';
    const src = params.src ?? '';
    if (!/^https?:\/\//i.test(src) && src !== 'about:blank') e.preventDefault();
  });
  win.webContents.on('did-attach-webview', (_e, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    guest.on('will-navigate', (ev, url) => { if (!/^https?:\/\//i.test(url)) ev.preventDefault(); });
  });
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
      // Web-page nodes on the canvas are <webview> guests; will-attach-webview below locks them down.
      webviewTag: true,
    },
  });
  guardWebviews(win);
  windows.add(win);
  if (windows.size === 1) browser.setHost(win);
  win.on('closed', () => {
    windows.delete(win);
    browser.hostClosed(win);
    const next = [...windows][0];
    if (next) browser.setHost(next);
  });
  win.once('ready-to-show', () => win.show());
  // Every load (first load, reload, crash recovery) needs a fresh core port; the open intent is sent once.
  let pendingIntent = intent;
  win.webContents.on('did-finish-load', () => {
    connectWindow(win);
    if (pendingIntent.kind !== 'none') win.webContents.send('open-intent', pendingIntent);
    pendingIntent = { kind: 'none' };
  });
  // A dead renderer leaves a blank window; reload it (documents live in the core host).
  // At most once per 10 s so a renderer that dies on load cannot spin.
  let lastCrash = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`Renderer gone (${details.reason}, exit ${details.exitCode})`);
    if (details.reason === 'clean-exit' || win.isDestroyed() || Date.now() - lastCrash < 10_000) return;
    lastCrash = Date.now();
    win.webContents.reload();
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
    // One page per node, in the order given; every page keeps its own size.
    const pdfPage = z.object({ html: z.string().max(200_000_000), width: z.number().positive().max(20_000), height: z.number().positive().max(20_000) });
    const pdfArgs = z.object({ pages: z.array(pdfPage).min(1).max(500), path: z.string().min(1).max(4096) });
    ipcMain.handle('export:pdf', async (_e, args: unknown) => {
      const a = pdfArgs.safeParse(args);
      if (!a.success || !isAbsolute(a.data.path)) return 'Invalid PDF export request';
      try { await printPagesToPdf(a.data.pages, a.data.path); return null; } catch (err) { return (err as Error).message; }
    });
    ipcMain.handle('embed:screenshot', async (e, args: unknown) => {
      const a = embedShotArgs.safeParse(args);
      if (!a.success) return { error: 'Invalid screenshot request' };
      try { return { path: await saveEmbedShot(e.sender, a.data) }; } catch (err) { return { error: (err as Error).message }; }
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
    // On-device background removal: a foreground mask for a 1024×1024 RGB image (model downloaded on first use).
    ipcMain.handle('ml:segment', async (e, args: unknown) => {
      const a = segmentArgs.safeParse(args);
      if (!a.success) return { error: 'Invalid background removal request' };
      try { return { mask: await segment(a.data.rgb, e.sender) }; } catch (err) { return { error: (err as Error).message }; }
    });
    const rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable();
    ipcMain.on('browser:bounds', (e, r: unknown) => {
      const parsed = rect.safeParse(r);
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!parsed.success || !win) return;
      browser.setHost(win);
      browser.setBounds(parsed.data);
    });
    ipcMain.handle('browser:state', () => browser.state());
    const uiAction = z.enum(['navigate', 'back', 'forward', 'reload', 'stop', 'devtools', 'new', 'switch', 'close']);
    ipcMain.handle('browser:ui', async (_e, action: unknown, arg: unknown) => {
      const a = uiAction.safeParse(action);
      if (!a.success || (arg !== undefined && typeof arg !== 'string')) return 'Invalid browser action';
      try { await browser.ui(a.data, arg as string | undefined); return null; } catch (err) { return (err as Error).message; }
    });
    createWindow(parseArgv(process.argv, process.cwd()));
  });

  app.on('before-quit', () => { quitting = true; stopMlHost(); core?.postMessage({ type: 'shutdown' }); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
