import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, MEDIA_SCHEME, type ZoomPaneApi } from '@shared/api';

// Channel payloads are typed by ZoomPaneApi; the main-process handlers implement the same contract.
const invoke = (channel: string, ...args: unknown[]): Promise<any> => ipcRenderer.invoke(channel, ...args);

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_: IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: ZoomPaneApi = {
  version: __APP_VERSION__,

  sources: {
    list: () => invoke(IPC.sourcesList),
    thumbnails: () => invoke(IPC.sourcesThumbnails),
    microphones: () => invoke(IPC.microphones),
  },

  recorder: {
    state: () => invoke(IPC.recorderState),
    start: (options) => invoke(IPC.recorderStart, options),
    stop: () => invoke(IPC.recorderStop),
    pause: () => invoke(IPC.recorderPause),
    resume: () => invoke(IPC.recorderResume),
    restart: () => invoke(IPC.recorderRestart),
    cancel: () => invoke(IPC.recorderCancel),
    onState: (listener) => subscribe(IPC.recorderStateChanged, listener),
    onCameraCommand: (listener) => subscribe(IPC.cameraCommand, listener),
    cameraStarted: (info) => invoke(IPC.cameraStarted, info),
    cameraChunk: (data) => invoke(IPC.cameraChunk, data),
    cameraStopped: () => invoke(IPC.cameraStopped),
  },

  area: {
    select: (displayId) => invoke(IPC.areaSelect, displayId),
    submit: (rect) => ipcRenderer.send(IPC.areaSubmit, rect),
  },

  projects: {
    list: () => invoke(IPC.projectsList),
    open: (dir) => invoke(IPC.projectsOpen, dir),
    save: (dir, project, thumbnail) => invoke(IPC.projectsSave, dir, project, thumbnail),
    remove: (dir) => invoke(IPC.projectsRemove, dir),
    reveal: (dir) => invoke(IPC.projectsReveal, dir),
    openEditor: (dir) => invoke(IPC.projectsOpenEditor, dir),
    browse: () => invoke(IPC.projectsBrowse),
    createFile: (dir, name) => invoke(IPC.projectsCreateFile, dir, name),
  },

  files: {
    mediaUrl: (path) => `${MEDIA_SCHEME}://file/${encodeURIComponent(path)}`,
    pickImage: () => invoke(IPC.pickImage),
    pickAudio: () => invoke(IPC.pickAudio),
  },

  exporter: {
    begin: (name, format) => invoke(IPC.exportBegin, name, format),
    write: (id, position, data) => invoke(IPC.exportWrite, id, position, data),
    finish: (id) => invoke(IPC.exportFinish, id),
    abort: (id) => invoke(IPC.exportAbort, id),
    reveal: (path) => invoke(IPC.exportReveal, path),
    copyFile: (path) => invoke(IPC.exportCopyFile, path),
    copyImage: (dataUrl) => invoke(IPC.exportCopyImage, dataUrl),
    saveText: (name, text, ext) => invoke(IPC.exportSaveText, name, text, ext),
  },

  settings: {
    get: () => invoke(IPC.settingsGet),
    update: (patch) => invoke(IPC.settingsUpdate, patch),
    onChange: (listener) => subscribe(IPC.settingsChanged, listener),
  },

  app: {
    openExternal: (url) => invoke(IPC.openExternal, url),
    openLauncher: () => invoke(IPC.openLauncher),
    openSettings: () => invoke(IPC.openSettings),
    checkForUpdates: () => invoke(IPC.checkForUpdates),
    installUpdate: () => invoke(IPC.installUpdate),
    onUpdate: (listener) => subscribe(IPC.updateStatus, listener),
  },

  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    setTitle: (title) => ipcRenderer.send(IPC.windowSetTitle, title),
  },
};

contextBridge.exposeInMainWorld('zoompane', api);
