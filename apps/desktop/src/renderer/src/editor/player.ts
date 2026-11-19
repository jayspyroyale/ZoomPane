import type { Project } from '@shared/project';
import type { RecordingManifest } from '@shared/recording';
import { Timeline } from '@/engine/timeline';
import { api } from '@/lib/api';
import type { MediaUrls } from './loadRecording';

const DRIFT_TOLERANCE_MS = 90;
const END_EPSILON_MS = 20;

interface SyncedMedia {
  el: HTMLMediaElement;
  /** Element time (ms) = source time + offset. */
  offset: number;
  kind: 'camera' | 'mic' | 'system';
}

function mediaElement<T extends HTMLMediaElement>(el: T, src: string): T {
  el.src = src;
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  (el as HTMLMediaElement & { preservesPitch: boolean }).preservesPitch = true;
  return el;
}

/**
 * Plays the edited timeline in the preview. The screen video is the master clock; the
 * camera, microphone, system audio and music follow it. Playback jumps over cuts and applies
 * each clip's speed and volume.
 */
export class Player {
  readonly screen: HTMLVideoElement;
  readonly camera: HTMLVideoElement | null = null;
  private readonly synced: SyncedMedia[] = [];
  private music: HTMLAudioElement | null = null;
  private musicPath: string | null = null;
  private timeline: Timeline;
  private project: Project;
  private raf = 0;
  private listeners = new Set<() => void>();
  private targetSource = 0;
  playing = false;

  constructor(media: MediaUrls, manifest: RecordingManifest, project: Project) {
    this.project = project;
    this.timeline = new Timeline(project.clips);
    this.screen = mediaElement(document.createElement('video'), media.screen);
    this.screen.muted = true;
    this.screen.playsInline = true;
    this.screen.addEventListener('seeked', () => this.notify());

    const videoStart = manifest.video.startMs;
    if (media.camera && manifest.camera) {
      this.camera = mediaElement(document.createElement('video'), media.camera);
      this.camera.muted = true;
      this.camera.addEventListener('seeked', () => this.notify());
      this.synced.push({ el: this.camera, offset: videoStart - manifest.camera.startMs, kind: 'camera' });
    }
    if (media.mic && manifest.microphone) {
      this.synced.push({ el: mediaElement(new Audio(), media.mic), offset: videoStart - manifest.microphone.startMs, kind: 'mic' });
    }
    if (media.system && manifest.systemAudio) {
      this.synced.push({ el: mediaElement(new Audio(), media.system), offset: videoStart - manifest.systemAudio.startMs, kind: 'system' });
    }
    this.applyVolumes(this.timeline.placed[0]?.clip.volume ?? 1);
  }

  ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.screen.readyState >= 2) return resolve();
      this.screen.addEventListener('loadeddata', () => resolve(), { once: true });
      this.screen.addEventListener('error', () => reject(new Error('Could not load the screen recording.')), { once: true });
    });
  }

  setProject(project: Project): void {
    this.project = project;
    this.timeline = new Timeline(project.clips);
    const music = project.audio.music;
    if (music?.path !== this.musicPath) {
      this.music?.pause();
      this.music = music ? mediaElement(new Audio(), api.files.mediaUrl(music.path)) : null;
      if (this.music) this.music.loop = true;
      this.musicPath = music?.path ?? null;
    }
    const clip = this.timeline.clipAtSource(this.sourceTime);
    this.applyVolumes(clip?.clip.volume ?? 1);
  }

  get sourceTime(): number {
    return this.playing ? this.screen.currentTime * 1000 : this.targetSource;
  }

  get outputTime(): number {
    return this.timeline.toOutputClamped(this.sourceTime);
  }

  get duration(): number {
    return this.timeline.duration;
  }

  onFrame(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  seekOutput(outputMs: number): void {
    const { source } = this.timeline.toSource(outputMs);
    this.seekSource(source);
  }

  private seekSource(sourceMs: number): void {
    this.targetSource = sourceMs;
    this.screen.currentTime = sourceMs / 1000;
    for (const m of this.synced) m.el.currentTime = Math.max(0, (sourceMs + m.offset) / 1000);
    this.syncMusic();
    this.notify();
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.outputTime >= this.duration - END_EPSILON_MS) this.seekOutput(0);
    const placed = this.timeline.clipAtSource(this.targetSource) ?? this.timeline.placed[0];
    if (placed && (this.targetSource < placed.clip.start || this.targetSource >= placed.clip.end)) this.seekSource(placed.clip.start);
    this.setRate(placed?.clip.speed ?? 1);
    this.playing = true;
    await Promise.allSettled([this.screen.play(), ...this.synced.map((m) => this.playIfInRange(m)), this.music?.play()]);
    this.tick();
  }

  pause(): void {
    if (!this.playing) return;
    this.targetSource = this.screen.currentTime * 1000;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.screen.pause();
    for (const m of this.synced) m.el.pause();
    this.music?.pause();
    this.notify();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }

  private playIfInRange(m: SyncedMedia): Promise<void> | undefined {
    const t = this.screen.currentTime * 1000 + m.offset;
    if (t < 0) return undefined;
    return m.el.play();
  }

  private setRate(speed: number): void {
    this.screen.playbackRate = speed;
    for (const m of this.synced) m.el.playbackRate = speed;
  }

  private applyVolumes(clipVolume: number): void {
    const { micVolume, systemVolume, music } = this.project.audio;
    for (const m of this.synced) {
      if (m.kind === 'mic') m.el.volume = Math.min(1, micVolume * clipVolume);
      if (m.kind === 'system') m.el.volume = Math.min(1, systemVolume * clipVolume);
    }
    if (this.music) this.music.volume = Math.min(1, music?.volume ?? 0);
  }

  private syncMusic(): void {
    if (this.music && Number.isFinite(this.music.duration) && this.music.duration > 0) {
      this.music.currentTime = (this.outputTime / 1000) % this.music.duration;
    }
  }

  private tick = (): void => {
    if (!this.playing) return;
    const source = this.screen.currentTime * 1000;
    const placed = this.timeline.clipAtSource(source);

    if (!placed || source >= placed.clip.end - END_EPSILON_MS) {
      // Reached the end of a clip: jump over the cut to the next one, or stop at the end.
      const next = this.timeline.placed.find((p) => p.clip.start >= source - END_EPSILON_MS && p !== placed);
      if (!next) {
        this.pause();
        this.seekOutput(this.duration);
        return;
      }
      this.seekSource(next.clip.start);
      this.setRate(next.clip.speed);
      this.applyVolumes(next.clip.volume);
    } else {
      this.applyVolumes(placed.clip.volume);
      for (const m of this.synced) {
        const expected = source + m.offset;
        if (expected < 0) continue;
        if (m.el.paused && this.playing) void m.el.play().catch(() => undefined);
        if (Math.abs(m.el.currentTime * 1000 - expected) > DRIFT_TOLERANCE_MS) m.el.currentTime = expected / 1000;
      }
    }
    this.notify();
    this.raf = requestAnimationFrame(this.tick);
  };

  destroy(): void {
    this.pause();
    this.listeners.clear();
    for (const el of [this.screen, ...this.synced.map((m) => m.el), this.music]) {
      if (!el) continue;
      el.removeAttribute('src');
      el.load();
    }
  }
}
