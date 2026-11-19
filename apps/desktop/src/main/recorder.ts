import { EventEmitter } from 'node:events';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Display } from 'electron';
import { IPC } from '@shared/api';
import type { RecorderState, RecordingManifest, RecordingOptions } from '@shared/recording';
import log from './log';
import { media } from './media';
import { settings } from './settings';
import { sidecar } from './sidecar';
import { displayForSelection } from './sources';
import { windows } from './windows';

const CAMERA_STOP_TIMEOUT_MS = 4000;

interface CameraCapture {
  file: WriteStream;
  startMs: number | null;
  width: number;
  height: number;
  stopped: Promise<void>;
  markStopped: () => void;
}

interface ActiveSession {
  dir: string;
  options: RecordingOptions;
  display: Display;
  camera: CameraCapture | null;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

/**
 * Drives one recording at a time: countdown, then capture (sidecar plus the camera in the
 * toolbar window), then finishing into a project folder and opening it in the editor.
 */
class Recorder extends EventEmitter<{ state: [RecorderState] }> {
  private state: RecorderState = { status: 'idle' };
  private session: ActiveSession | null = null;
  private cancelCountdown: (() => void) | null = null;

  getState(): RecorderState {
    return this.state;
  }

  private setState(state: RecorderState): void {
    this.state = state;
    windows.broadcast(IPC.recorderStateChanged, state);
    this.emit('state', state);
  }

  async start(options: RecordingOptions): Promise<void> {
    if (this.state.status !== 'idle') return;
    settings().update({ recording: options });
    const display = await displayForSelection(options.source);
    windows.hideLauncher();

    if (options.countdownSeconds > 0 && !(await this.countdown(display, options.countdownSeconds))) {
      this.setState({ status: 'idle' });
      windows.showLauncher();
      return;
    }

    const dir = join(settings().get().projectsDir, `Recording ${timestamp()}.zoompane`);
    await mkdir(dir, { recursive: true });
    if (options.hideDesktopIcons) await sidecar.call('setDesktopIconsHidden', { hidden: true }).catch(() => undefined);

    const source = options.source;
    try {
      await sidecar.call('start', {
        outDir: dir,
        source: {
          kind: source.kind,
          displayId: source.kind === 'window' ? null : source.displayId,
          windowId: source.kind === 'window' ? source.windowId : null,
          crop: source.kind === 'area' ? source.crop : null,
        },
        fps: options.fps,
        microphone: options.microphone,
        systemAudio: options.systemAudio,
        recordKeys: options.recordKeys,
      });
    } catch (error) {
      log.error('start failed', error);
      await this.restoreDesktop(options);
      await rm(dir, { recursive: true, force: true });
      this.setState({ status: 'idle' });
      windows.showLauncher();
      throw error;
    }

    this.session = { dir, options, display, camera: null };
    const toolbar = windows.showToolbar(display);
    if (options.camera.enabled) {
      toolbar.webContents.once('did-finish-load', () => {
        toolbar.webContents.send(IPC.cameraCommand, { type: 'start', deviceId: options.camera.deviceId });
      });
    }
    this.setState({ status: 'recording', startedAt: Date.now(), pausedMs: 0, pausedAt: null });
  }

  /** Shows the countdown; resolves false if it was cancelled. */
  private countdown(display: Display, seconds: number): Promise<boolean> {
    windows.showCountdown(display);
    return new Promise((resolve) => {
      let remaining = seconds;
      this.setState({ status: 'countdown', remaining });
      const timer = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
          this.setState({ status: 'countdown', remaining });
          return;
        }
        finish(true);
      }, 1000);
      const finish = (ok: boolean) => {
        clearInterval(timer);
        this.cancelCountdown = null;
        windows.closeCountdown();
        resolve(ok);
      };
      this.cancelCountdown = () => finish(false);
    });
  }

  async pause(): Promise<void> {
    if (this.state.status !== 'recording' || this.state.pausedAt !== null) return;
    await sidecar.call('pause');
    this.setState({ ...this.state, pausedAt: Date.now() });
  }

  async resume(): Promise<void> {
    if (this.state.status !== 'recording' || this.state.pausedAt === null) return;
    await sidecar.call('resume');
    this.setState({ ...this.state, pausedMs: this.state.pausedMs + (Date.now() - this.state.pausedAt), pausedAt: null });
  }

  async togglePause(): Promise<void> {
    if (this.state.status === 'recording') await (this.state.pausedAt === null ? this.pause() : this.resume());
  }

  async stop(): Promise<void> {
    const session = this.session;
    if (this.state.status !== 'recording' || !session) return;
    this.setState({ status: 'finishing' });

    let manifest: RecordingManifest;
    try {
      manifest = await sidecar.call<RecordingManifest>('stop');
      const camera = await this.stopCamera(session);
      if (camera) manifest = { ...manifest, camera };
      await writeFile(join(session.dir, 'recording.json'), JSON.stringify(manifest, null, 2));
    } catch (error) {
      log.error('stop failed', error);
    } finally {
      await this.restoreDesktop(session.options);
      windows.closeToolbar();
      this.session = null;
      this.setState({ status: 'idle' });
    }

    media.allow(session.dir);
    if (settings().get().openEditorAfterRecording) windows.openEditor(session.dir);
    else windows.showLauncher();
  }

  /** Discards the recording in progress (or the countdown). */
  async cancel(): Promise<void> {
    if (this.state.status === 'countdown') {
      this.cancelCountdown?.();
      return;
    }
    const session = this.session;
    if (this.state.status !== 'recording' || !session) return;
    this.setState({ status: 'finishing' });
    try {
      await sidecar.call('stop');
      await this.stopCamera(session);
    } catch (error) {
      log.warn('cancel', error);
    }
    await this.restoreDesktop(session.options);
    windows.closeToolbar();
    this.session = null;
    await rm(session.dir, { recursive: true, force: true }).catch((e) => log.warn('cleanup', e));
    this.setState({ status: 'idle' });
  }

  /** Throws away the current take and starts again with the same options. */
  async restart(): Promise<void> {
    const options = this.session?.options;
    if (!options) return;
    await this.cancel();
    await this.start(options);
  }

  async toggle(): Promise<void> {
    if (this.state.status === 'recording') await this.stop();
    else if (this.state.status === 'countdown') await this.cancel();
    else if (this.state.status === 'idle') await this.start(settings().get().recording);
  }

  private async restoreDesktop(options: RecordingOptions): Promise<void> {
    if (options.hideDesktopIcons) await sidecar.call('setDesktopIconsHidden', { hidden: false }).catch(() => undefined);
  }

  // Camera capture runs in the toolbar window (MediaRecorder) and streams chunks here.

  async cameraStarted(info: { width: number; height: number }): Promise<void> {
    const session = this.session;
    if (!session) return;
    let markStopped!: () => void;
    const stopped = new Promise<void>((resolve) => (markStopped = resolve));
    const { ms } = await sidecar.call<{ ms: number }>('clock');
    session.camera = { file: createWriteStream(join(session.dir, 'camera.webm')), startMs: ms, ...info, stopped, markStopped };
  }

  cameraChunk(data: ArrayBuffer): void {
    this.session?.camera?.file.write(Buffer.from(data));
  }

  cameraStopped(): void {
    this.session?.camera?.markStopped();
  }

  private async stopCamera(session: ActiveSession): Promise<RecordingManifest['camera']> {
    const camera = session.camera;
    if (!camera) return undefined;
    windows.toolbar?.webContents.send(IPC.cameraCommand, { type: 'stop' });
    await Promise.race([camera.stopped, new Promise((r) => setTimeout(r, CAMERA_STOP_TIMEOUT_MS))]);
    await new Promise<void>((resolve) => camera.file.end(resolve));
    if (camera.startMs === null) return undefined;
    return { file: 'camera.webm', startMs: camera.startMs, width: camera.width, height: camera.height };
  }
}

export const recorder = new Recorder();
