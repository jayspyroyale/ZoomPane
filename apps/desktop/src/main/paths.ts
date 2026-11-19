import { app } from 'electron';
import { join } from 'node:path';

/** Locations of bundled resources in development and in the packaged app. */
export const paths = {
  get sidecar(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'bin', 'zoompane-capture.exe')
      : join(app.getAppPath(), 'resources', 'bin', 'zoompane-capture.exe');
  },
  get icon(): string {
    return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png');
  },
  get trayIcon(): string {
    return app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'build', 'tray.png');
  },
  get preload(): string {
    return join(import.meta.dirname, '../preload/index.cjs');
  },
  get rendererHtml(): string {
    return join(import.meta.dirname, '../renderer/index.html');
  },
  get defaultProjectsDir(): string {
    return join(app.getPath('videos'), 'ZoomPane');
  },
};
