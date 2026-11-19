import { Menu, Tray, app, nativeImage } from 'electron';
import type { RecorderState } from '@shared/recording';
import { paths } from './paths';
import { recorder } from './recorder';
import { windows } from './windows';

let tray: Tray | null = null;

function menuFor(state: RecorderState): Menu {
  const recording = state.status === 'recording';
  return Menu.buildFromTemplate([
    recording
      ? { label: 'Stop recording', click: () => void recorder.stop() }
      : { label: 'New recording…', click: () => windows.showLauncher(), enabled: state.status === 'idle' },
    ...(recording
      ? [
          { label: state.pausedAt === null ? 'Pause' : 'Resume', click: () => void recorder.togglePause() },
          { label: 'Restart recording', click: () => void recorder.restart() },
          { label: 'Cancel recording', click: () => void recorder.cancel() },
        ]
      : []),
    { type: 'separator' },
    { label: 'Settings…', click: () => windows.showSettings() },
    { type: 'separator' },
    { label: 'Quit ZoomPane', role: 'quit' },
  ]);
}

/** System tray icon: quick access to recording while the app runs in the background. */
export const appTray = {
  create(): void {
    const image = nativeImage.createFromPath(paths.trayIcon);
    tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(paths.icon) : image);
    tray.setToolTip(`ZoomPane ${app.getVersion()}`);
    tray.setContextMenu(menuFor(recorder.getState()));
    tray.on('click', () => {
      if (recorder.getState().status === 'recording') void recorder.stop();
      else windows.showLauncher();
    });
  },

  update(state: RecorderState): void {
    if (!tray) return;
    tray.setContextMenu(menuFor(state));
    tray.setToolTip(state.status === 'recording' ? 'ZoomPane: recording (click to stop)' : 'ZoomPane');
  },
};
