import { app, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '@shared/api';
import { registerIpc } from './ipc';
import log from './log';
import { media } from './media';
import { recorder } from './recorder';
import { settings } from './settings';
import { registerShortcuts } from './shortcuts';
import { sidecar } from './sidecar';
import { appTray } from './tray';
import { updater } from './updater';
import { windows } from './windows';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  media.registerScheme();
  app.setAppUserModelId('app.zoompane.desktop');

  app.on('second-instance', (_, argv) => handleArgs(argv));
  app.whenReady().then(startup).catch((error) => {
    log.error('startup failed', error);
    dialog.showErrorBox('ZoomPane could not start', String(error));
    app.quit();
  });
}

/** Opens a `.zoompane` folder passed on the command line, or the launcher. */
function handleArgs(argv: string[]): void {
  const projectDir = argv.slice(1).find((a) => a.toLowerCase().endsWith('.zoompane') && existsSync(join(a, 'recording.json')));
  if (projectDir) {
    windows.openEditor(projectDir);
    return;
  }
  windows.showLauncher();
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

  recorder.on('state', (state) => appTray.update(state));

  updater.init();
  handleArgs(process.argv);
}

// Having a listener stops Electron quitting when the last window closes: ZoomPane stays
// resident in the tray so the global recording shortcut keeps working.
app.on('window-all-closed', () => undefined);

app.on('before-quit', () => {
  sidecar.dispose();
});
