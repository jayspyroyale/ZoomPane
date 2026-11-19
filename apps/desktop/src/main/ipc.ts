import { BrowserWindow, dialog, ipcMain, shell, type IpcMainEvent } from 'electron';
import { IPC, type AppSettings } from '@shared/api';
import type { Project } from '@shared/project';
import type { Bounds, Microphone, RecordingOptions } from '@shared/recording';
import { exporter } from './exporter';
import { media } from './media';
import { projects } from './projects';
import { recorder } from './recorder';
import { settings } from './settings';
import { sidecar } from './sidecar';
import { electronDisplayFor, listSources, thumbnails } from './sources';
import { updater } from './updater';
import { windows } from './windows';

async function selectArea(displayId: string): Promise<Bounds | null> {
  const display = (await listSources()).displays.find((d) => d.id === displayId);
  if (!display) return null;
  const electronDisplay = electronDisplayFor(display);
  const win = windows.showAreaSelector(electronDisplay);
  return new Promise((resolve) => {
    const onSubmit = (event: IpcMainEvent, rect: Bounds | null) => {
      if (event.sender !== win.webContents) return;
      done(rect);
    };
    const done = (rect: Bounds | null) => {
      ipcMain.removeListener(IPC.areaSubmit, onSubmit);
      if (!win.isDestroyed()) win.destroy();
      if (!rect || rect.w < 16 || rect.h < 16) return resolve(null);
      // The selector covers the display, so DIPs × scale = physical pixels relative to the display.
      const s = electronDisplay.scaleFactor;
      const even = (n: number) => Math.round((n * s) / 2) * 2;
      resolve({ x: even(rect.x), y: even(rect.y), w: even(rect.w), h: even(rect.h) });
    };
    ipcMain.on(IPC.areaSubmit, onSubmit);
    win.once('closed', () => done(null));
  });
}

const senderWindow = (event: IpcMainEvent): BrowserWindow | null => BrowserWindow.fromWebContents(event.sender);

export function registerIpc(): void {
  const handle = ipcMain.handle.bind(ipcMain);

  handle(IPC.sourcesList, () => listSources());
  handle(IPC.sourcesThumbnails, () => thumbnails());
  handle(IPC.microphones, () => sidecar.call<Microphone[]>('listMicrophones'));

  handle(IPC.recorderState, () => recorder.getState());
  handle(IPC.recorderStart, (_, options: RecordingOptions) => recorder.start(options));
  handle(IPC.recorderStop, () => recorder.stop());
  handle(IPC.recorderPause, () => recorder.pause());
  handle(IPC.recorderResume, () => recorder.resume());
  handle(IPC.recorderRestart, () => recorder.restart());
  handle(IPC.recorderCancel, () => recorder.cancel());
  handle(IPC.cameraStarted, (_, info: { width: number; height: number }) => recorder.cameraStarted(info));
  handle(IPC.cameraChunk, (_, data: ArrayBuffer) => recorder.cameraChunk(data));
  handle(IPC.cameraStopped, () => recorder.cameraStopped());

  handle(IPC.areaSelect, (_, displayId: string) => selectArea(displayId));

  handle(IPC.projectsList, () => projects.list());
  handle(IPC.projectsOpen, (_, dir: string) => projects.open(dir));
  handle(IPC.projectsSave, (_, dir: string, project: Project, thumbnail?: string) => projects.save(dir, project, thumbnail));
  handle(IPC.projectsRemove, (_, dir: string) => projects.remove(dir));
  handle(IPC.projectsReveal, (_, dir: string) => shell.openPath(dir).then(() => undefined));
  handle(IPC.projectsOpenEditor, (_, dir: string) => {
    windows.openEditor(dir);
  });
  handle(IPC.projectsBrowse, () => projects.browse());
  handle(IPC.projectsCreateFile, (_, dir: string, name: string) => exporter.createInProject(dir, name));

  handle(IPC.pickImage, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    const path = result.filePaths[0] ?? null;
    if (path) media.allow(path);
    return path;
  });
  handle(IPC.pickAudio, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }] });
    const path = result.filePaths[0] ?? null;
    if (path) media.allow(path);
    return path;
  });

  handle(IPC.exportBegin, (_, name: string, format: 'mp4' | 'gif') => exporter.begin(name, format));
  handle(IPC.exportWrite, (_, id: string, position: number, data: Uint8Array) => exporter.write(id, position, data));
  handle(IPC.exportFinish, (_, id: string) => exporter.finish(id));
  handle(IPC.exportAbort, (_, id: string) => exporter.abort(id));
  handle(IPC.exportReveal, (_, path: string) => exporter.reveal(path));
  handle(IPC.exportCopyFile, (_, path: string) => exporter.copyFile(path));
  handle(IPC.exportCopyImage, (_, dataUrl: string) => exporter.copyImage(dataUrl));
  handle(IPC.exportSaveText, (_, name: string, text: string, ext: string) => exporter.saveText(name, text, ext));

  handle(IPC.settingsGet, () => settings().get());
  handle(IPC.settingsUpdate, (_, patch: Partial<AppSettings>) => settings().update(patch));

  handle(IPC.openExternal, (_, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url);
  });
  handle(IPC.openLauncher, () => {
    windows.showLauncher();
  });
  handle(IPC.openSettings, () => windows.showSettings());
  handle(IPC.checkForUpdates, () => updater.check());
  handle(IPC.installUpdate, () => updater.install());

  ipcMain.on(IPC.windowMinimize, (e) => senderWindow(e)?.minimize());
  ipcMain.on(IPC.windowToggleMaximize, (e) => {
    const win = senderWindow(e);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on(IPC.windowClose, (e) => senderWindow(e)?.close());
  ipcMain.on(IPC.windowSetTitle, (e, title: string) => senderWindow(e)?.setTitle(title));
}
