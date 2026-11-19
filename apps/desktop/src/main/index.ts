import { app, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '@shared/api';
import { registerIpc } from './ipc';
import { license } from './license';
import log from './log';
import { media } from './media';
import { recorder } from './recorder';
import { settings } from './settings';
import { registerShortcuts } from './shortcuts';
import { sidecar } from './sidecar';
import { appTray } from './tray';
import { updater } from './updater';
import { windows } from './windows';

const PROTOCOL = 'zoompane';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  media.registerScheme();
  app.setAppUserModelId('app.zoompane.desktop');
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  app.on('second-instance', (_, argv) => void handleArgs(argv));
  app.whenReady().then(startup).catch((error) => {
    log.error('startup failed', error);
    dialog.showErrorBox('ZoomPane could not start', String(error));
    app.quit();
  });
}

/** Handles `zoompane://activate?key=…` links and `.zoompane` folders passed on the command line. */
async function handleArgs(argv: string[]): Promise<boolean> {
  const link = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (link) {
    const url = new URL(link);
    if (url.hostname === 'activate') {
      const key = url.searchParams.get('key') ?? '';
      const status = await license().activate(key);
      windows.showSettings();
      if (status.state !== 'active') dialog.showErrorBox('Activation failed', status.message ?? 'Unknown error');
      return true;
    }
  }
  const projectDir = argv.slice(1).find((a) => a.toLowerCase().endsWith('.zoompane') && existsSync(join(a, 'recording.json')));
  if (projectDir) {
    windows.openEditor(projectDir);
    return true;
  }
  windows.showLauncher();
  return false;
}

async function startup(): Promise<void> {
  media.handle();
  registerIpc();
  appTray.create();

  registerShortcuts(settings().get().shortcuts);
  settings().on('change', (value) => {
    registerShortcuts(value.shortcuts);
    windows.broadcast(IPC.settingsChanged, value);
  });
  license().on('change', (status) => windows.broadcast(IPC.licenseChanged, status));
  license().startBackgroundRefresh();

  recorder.on('state', (state) => appTray.update(state));

  updater.init();
  await handleArgs(process.argv);
}

// Having a listener stops Electron quitting when the last window closes: ZoomPane stays
// resident in the tray so the global recording shortcut keeps working.
app.on('window-all-closed', () => undefined);

app.on('before-quit', () => {
  sidecar.dispose();
});
