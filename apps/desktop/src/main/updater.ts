import { app } from 'electron';
import electronUpdater from 'electron-updater';
import { IPC, type UpdateStatus } from '@shared/api';
import log from './log';
import { windows } from './windows';

const { autoUpdater } = electronUpdater;

/** First line only: update errors embed whole HTTP responses. */
const message = (e: unknown) => (e instanceof Error ? e.message.split('\n')[0] : String(e));

/** The installed build updates itself; dev runs and the portable .exe do not. */
const canUpdate = () => app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;

/** Auto-updates from GitHub Releases (configured in electron-builder.yml). */
export const updater = {
  init(): void {
    if (!canUpdate()) return;
    const send = (status: UpdateStatus) => windows.broadcast(IPC.updateStatus, status);
    autoUpdater.logger = { info: log.info, warn: log.warn, error: (e: unknown) => log.warn('updater', message(e)), debug: () => undefined };
    autoUpdater.autoDownload = true;
    autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
    autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }));
    autoUpdater.on('update-not-available', () => send({ state: 'idle' }));
    autoUpdater.on('download-progress', (p) => send({ state: 'downloading', progress: p.percent }));
    autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }));
    autoUpdater.on('error', (error) => {
      log.warn('update error', message(error));
      send({ state: 'error' });
    });
    void this.check();
    setInterval(() => void this.check(), 4 * 60 * 60 * 1000).unref();
  },

  async check(): Promise<void> {
    if (!canUpdate()) return;
    await autoUpdater.checkForUpdates().catch((e) => log.warn('update check', message(e)));
  },

  install(): void {
    autoUpdater.quitAndInstall();
  },
};
