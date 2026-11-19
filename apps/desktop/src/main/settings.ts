import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettings } from '@shared/api';
import { DEFAULT_EXPORT } from '@shared/project';
import { paths } from './paths';

const DEFAULTS = (): AppSettings => ({
  projectsDir: paths.defaultProjectsDir,
  recording: {
    source: { kind: 'display', displayId: '' },
    fps: 60,
    microphone: { enabled: true, deviceId: null },
    systemAudio: false,
    camera: { enabled: false, deviceId: null },
    recordKeys: true,
    countdownSeconds: 3,
    hideDesktopIcons: false,
  },
  shortcuts: {
    toggleRecording: 'CommandOrControl+Shift+2',
    togglePause: 'CommandOrControl+Shift+3',
    cancelRecording: 'CommandOrControl+Shift+4',
  },
  presets: [],
  defaultPresetId: null,
  export: DEFAULT_EXPORT,
  showInTaskbar: true,
  openEditorAfterRecording: true,
});

/** Persistent app settings stored as JSON in the user-data folder. */
class SettingsStore extends EventEmitter<{ change: [AppSettings] }> {
  private readonly file = join(app.getPath('userData'), 'settings.json');
  private value: AppSettings;

  constructor() {
    super();
    this.value = this.load();
  }

  private load(): AppSettings {
    const defaults = DEFAULTS();
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>;
      return {
        ...defaults,
        ...saved,
        recording: { ...defaults.recording, ...saved.recording },
        shortcuts: { ...defaults.shortcuts, ...saved.shortcuts },
        export: { ...defaults.export, ...saved.export },
      };
    } catch {
      return defaults;
    }
  }

  get(): AppSettings {
    return this.value;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.value = { ...this.value, ...patch };
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.value, null, 2));
    this.emit('change', this.value);
    return this.value;
  }
}

let store: SettingsStore | undefined;

export function settings(): SettingsStore {
  store ??= new SettingsStore();
  return store;
}
