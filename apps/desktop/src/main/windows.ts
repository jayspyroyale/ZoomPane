import { BrowserWindow, screen, shell, type BrowserWindowConstructorOptions, type Display } from 'electron';
import { paths } from './paths';
import { settings } from './settings';

export type Route = 'launcher' | 'editor' | 'toolbar' | 'countdown' | 'area' | 'settings';

const BASE: BrowserWindowConstructorOptions = {
  show: false,
  frame: false,
  backgroundColor: '#0c0c0f',
  autoHideMenuBar: true,
  webPreferences: {
    preload: paths.preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: false,
  },
};

function load(win: BrowserWindow, route: Route, query: Record<string, string> = {}): void {
  const hash = `/${route}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}#${hash}`);
  else void win.loadFile(paths.rendererHtml, { hash });
}

function create(route: Route, options: BrowserWindowConstructorOptions, query?: Record<string, string>): BrowserWindow {
  const win = new BrowserWindow({ ...BASE, ...options, webPreferences: { ...BASE.webPreferences, ...options.webPreferences } });
  // Never let web content open new Electron windows; send links to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) event.preventDefault();
  });
  load(win, route, query);
  return win;
}

/** Windows that sit on top of the recording are hidden from capture (WDA_EXCLUDEFROMCAPTURE). */
function overlay(win: BrowserWindow): BrowserWindow {
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  return win;
}

let launcher: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let toolbar: BrowserWindow | null = null;
let countdown: BrowserWindow | null = null;
const editors = new Map<string, BrowserWindow>();

export const windows = {
  showLauncher(): BrowserWindow {
    if (launcher && !launcher.isDestroyed()) {
      launcher.show();
      launcher.focus();
      return launcher;
    }
    launcher = create('launcher', {
      width: 480,
      height: 720,
      resizable: false,
      maximizable: false,
      title: 'ZoomPane',
      skipTaskbar: !settings().get().showInTaskbar,
    });
    launcher.once('ready-to-show', () => launcher?.show());
    launcher.on('closed', () => (launcher = null));
    return launcher;
  },

  hideLauncher(): void {
    launcher?.hide();
  },

  showSettings(): void {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus();
      return;
    }
    settingsWindow = create('settings', { width: 720, height: 620, resizable: false, maximizable: false, title: 'ZoomPane Settings' });
    settingsWindow.once('ready-to-show', () => settingsWindow?.show());
    settingsWindow.on('closed', () => (settingsWindow = null));
  },

  openEditor(dir: string): BrowserWindow {
    const existing = editors.get(dir);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }
    const win = create('editor', { width: 1480, height: 920, minWidth: 1100, minHeight: 700, title: 'ZoomPane' }, { dir });
    win.once('ready-to-show', () => {
      win.maximize();
      win.show();
    });
    win.on('closed', () => editors.delete(dir));
    editors.set(dir, win);
    return win;
  },

  /** Recording controls: a small pill at the bottom of the recorded display. */
  showToolbar(display: Display): BrowserWindow {
    toolbar?.destroy();
    const width = 420;
    const height = 72;
    const area = display.workArea;
    toolbar = overlay(
      create('toolbar', {
        width,
        height,
        x: Math.round(area.x + (area.width - width) / 2),
        y: area.y + area.height - height - 24,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        skipTaskbar: true,
        focusable: true,
        hasShadow: false,
        // Keep timers and the camera recorder running while the window is in the background.
        webPreferences: { backgroundThrottling: false },
      }),
    );
    toolbar.once('ready-to-show', () => toolbar?.showInactive());
    toolbar.on('closed', () => (toolbar = null));
    return toolbar;
  },

  get toolbar(): BrowserWindow | null {
    return toolbar && !toolbar.isDestroyed() ? toolbar : null;
  },

  closeToolbar(): void {
    toolbar?.destroy();
    toolbar = null;
  },

  showCountdown(display: Display): void {
    countdown?.destroy();
    const { x, y, width, height } = display.bounds;
    countdown = overlay(
      create('countdown', { x, y, width, height, transparent: true, backgroundColor: '#00000000', skipTaskbar: true, focusable: false, hasShadow: false }),
    );
    countdown.setIgnoreMouseEvents(true);
    countdown.once('ready-to-show', () => countdown?.showInactive());
    countdown.on('closed', () => (countdown = null));
  },

  closeCountdown(): void {
    countdown?.destroy();
    countdown = null;
  },

  /** Full-display transparent window for dragging out a recording region. */
  showAreaSelector(display: Display): BrowserWindow {
    const { x, y, width, height } = display.bounds;
    const win = overlay(
      create('area', { x, y, width, height, transparent: true, backgroundColor: '#00000000', skipTaskbar: true, resizable: false, hasShadow: false }),
    );
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
    return win;
  },

  broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  },

  displayForPoint(point: { x: number; y: number }): Display {
    return screen.getDisplayNearestPoint(point);
  },
};
