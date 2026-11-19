import type { ExportSettings, Preset, Project } from './project';
import type { Bounds, CaptureSources, Microphone, RecorderState, RecordingManifest, RecordingOptions } from './recording';

/** The API the preload script exposes to every renderer as `window.zoompane`. */

export interface SourceThumbnails {
  /** Keyed by display id / window id (sidecar ids). Values are data URLs. */
  [id: string]: string;
}

export interface ProjectSummary {
  dir: string;
  name: string;
  createdAt: string;
  durationMs: number;
  thumbnail: string | null;
}

export interface OpenedProject {
  dir: string;
  manifest: RecordingManifest;
  /** Raw input.jsonl text. */
  input: string;
  /** Null for a fresh recording: the editor creates the initial project. */
  project: Project | null;
}

export interface Shortcuts {
  toggleRecording: string;
  togglePause: string;
  cancelRecording: string;
}

export interface AppSettings {
  projectsDir: string;
  recording: RecordingOptions;
  shortcuts: Shortcuts;
  presets: Preset[];
  defaultPresetId: string | null;
  export: ExportSettings;
  showInTaskbar: boolean;
  openEditorAfterRecording: boolean;
}

export interface ExportHandle {
  id: string;
  path: string;
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  progress?: number;
}

type Unsubscribe = () => void;

export interface ZoomPaneApi {
  version: string;

  sources: {
    list(): Promise<CaptureSources>;
    thumbnails(): Promise<SourceThumbnails>;
    microphones(): Promise<Microphone[]>;
  };

  recorder: {
    state(): Promise<RecorderState>;
    start(options: RecordingOptions): Promise<void>;
    stop(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    restart(): Promise<void>;
    cancel(): Promise<void>;
    onState(listener: (state: RecorderState) => void): Unsubscribe;
    /** Toolbar window: camera capture lifecycle requested by the main process. */
    onCameraCommand(listener: (command: { type: 'start'; deviceId: string | null } | { type: 'stop' }) => void): Unsubscribe;
    cameraStarted(info: { width: number; height: number }): Promise<void>;
    cameraChunk(data: ArrayBuffer): Promise<void>;
    cameraStopped(): Promise<void>;
  };

  area: {
    /** Opens the region selector on a display; resolves with physical-pixel bounds relative to that display. */
    select(displayId: string): Promise<Bounds | null>;
    /** Region selector window: report the result in DIPs relative to the window. */
    submit(rect: Bounds | null): void;
  };

  projects: {
    list(): Promise<ProjectSummary[]>;
    open(dir: string): Promise<OpenedProject>;
    save(dir: string, project: Project, thumbnail?: string): Promise<void>;
    remove(dir: string): Promise<void>;
    reveal(dir: string): Promise<void>;
    openEditor(dir: string): Promise<void>;
    /** Opens a new file inside a project folder for writing (use exporter.write/finish). */
    createFile(dir: string, name: string): Promise<ExportHandle>;
    /** Shows a folder picker for existing .zoompane bundles. */
    browse(): Promise<string | null>;
  };

  files: {
    /** URL that streams a local file into <video>/<img>/fetch (range requests supported). */
    mediaUrl(path: string): string;
    pickImage(): Promise<string | null>;
    pickAudio(): Promise<string | null>;
  };

  exporter: {
    begin(suggestedName: string, format: 'mp4' | 'gif'): Promise<ExportHandle | null>;
    write(id: string, position: number, data: Uint8Array): Promise<void>;
    finish(id: string): Promise<void>;
    abort(id: string): Promise<void>;
    reveal(path: string): Promise<void>;
    copyFile(path: string): Promise<void>;
    copyImage(dataUrl: string): Promise<void>;
    saveText(suggestedName: string, text: string, extension: string): Promise<string | null>;
  };

  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
    onChange(listener: (settings: AppSettings) => void): Unsubscribe;
  };

  app: {
    openExternal(url: string): Promise<void>;
    openLauncher(): Promise<void>;
    openSettings(): Promise<void>;
    checkForUpdates(): Promise<void>;
    installUpdate(): Promise<void>;
    onUpdate(listener: (status: UpdateStatus) => void): Unsubscribe;
  };

  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    setTitle(title: string): void;
  };
}

/** IPC channel names, shared by main and preload. */
export const IPC = {
  sourcesList: 'sources:list',
  sourcesThumbnails: 'sources:thumbnails',
  microphones: 'sources:microphones',
  recorderState: 'recorder:state',
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
  recorderPause: 'recorder:pause',
  recorderResume: 'recorder:resume',
  recorderRestart: 'recorder:restart',
  recorderCancel: 'recorder:cancel',
  recorderStateChanged: 'recorder:state-changed',
  cameraCommand: 'camera:command',
  cameraStarted: 'camera:started',
  cameraChunk: 'camera:chunk',
  cameraStopped: 'camera:stopped',
  areaSelect: 'area:select',
  areaSubmit: 'area:submit',
  projectsList: 'projects:list',
  projectsOpen: 'projects:open',
  projectsSave: 'projects:save',
  projectsRemove: 'projects:remove',
  projectsReveal: 'projects:reveal',
  projectsOpenEditor: 'projects:open-editor',
  projectsBrowse: 'projects:browse',
  projectsCreateFile: 'projects:create-file',
  pickImage: 'files:pick-image',
  pickAudio: 'files:pick-audio',
  exportBegin: 'export:begin',
  exportWrite: 'export:write',
  exportFinish: 'export:finish',
  exportAbort: 'export:abort',
  exportReveal: 'export:reveal',
  exportCopyFile: 'export:copy-file',
  exportCopyImage: 'export:copy-image',
  exportSaveText: 'export:save-text',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',
  openExternal: 'app:open-external',
  openLauncher: 'app:open-launcher',
  openSettings: 'app:open-settings',
  checkForUpdates: 'app:check-updates',
  installUpdate: 'app:install-update',
  updateStatus: 'app:update-status',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowSetTitle: 'window:set-title',
} as const;

export const MEDIA_SCHEME = 'zp-media';

/** Source code, releases and issue tracker. */
export const REPO_URL = 'https://github.com/jayspyroyale/ZoomPane';
