import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import {
  ALL_FORMATS,
  AudioBufferSource,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  StreamTarget,
  UrlSource,
  VideoSampleSink,
  type StreamTargetChunk,
  type VideoSample,
} from 'mediabunny';
import type { ExportHandle } from '@shared/api';
import type { ExportSettings, Project } from '@shared/project';
import { drawFrame, SceneBuilder } from '@/engine/render';
import { Timeline } from '@/engine/timeline';
import { api } from '@/lib/api';
import { backgroundImageFor } from '@/editor/backgroundImage';
import type { LoadedRecording } from '@/editor/loadRecording';
import { AudioMixer } from './audioMix';

const AUDIO_CHUNK_MS = 5000;
const GIF_MAX_FPS = 24;
const GIF_MAX_SHORT_SIDE = 720;

export interface ExportJob {
  loaded: LoadedRecording;
  project: Project;
  settings: ExportSettings;
  watermark: boolean;
  handle: ExportHandle;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

const QUALITY = { small: QUALITY_MEDIUM, balanced: QUALITY_HIGH, best: QUALITY_VERY_HIGH } as const;

class Cancelled extends Error {
  constructor() {
    super('Export cancelled');
  }
}

export const isCancelled = (err: unknown): boolean => err instanceof Cancelled;

/** Decodes recorded video frames at the requested source times (ms), in order. */
async function frameReader(url: string, offsetMs: number, times: number[]): Promise<AsyncIterator<VideoSample | null>> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('The recording has no video track.');
  const first = await track.getFirstTimestamp();
  const sink = new VideoSampleSink(track);
  return sink.samplesAtTimestamps(times.map((t) => first + Math.max(0, t + offsetMs) / 1000))[Symbol.asyncIterator]();
}

/**
 * Renders every output frame with the same compositor as the preview. `draw` receives the
 * canvas after each frame is composed.
 */
async function renderFrames(job: ExportJob, resolution: number, fps: number, draw: (canvas: OffscreenCanvas, index: number) => Promise<void>, progressShare: number): Promise<void> {
  const { loaded, project } = job;
  const scene = new SceneBuilder(loaded.data).build(project, { resolution, fps, watermark: job.watermark, backgroundImage: await backgroundImageFor(project) });
  const timeline = new Timeline(project.clips);
  const frameCount = Math.max(1, Math.round((timeline.duration / 1000) * fps));
  const sourceTimes = Array.from({ length: frameCount }, (_, i) => timeline.toSource((i * 1000) / fps).source);

  const { manifest } = loaded.data;
  const screen = await frameReader(loaded.media.screen, 0, sourceTimes);
  const camera = loaded.media.camera && manifest.camera ? await frameReader(loaded.media.camera, manifest.video.startMs - manifest.camera.startMs, sourceTimes).catch(() => null) : null;

  const canvas = new OffscreenCanvas(scene.output.w, scene.output.h);
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  for (let i = 0; i < frameCount; i++) {
    if (job.signal.aborted) throw new Cancelled();
    const screenSample = (await screen.next()).value ?? null;
    const cameraSample = camera ? ((await camera.next()).value ?? null) : null;
    try {
      drawFrame(ctx, scene, sourceTimes[i], {
        screen: screenSample?.toCanvasImageSource() ?? null,
        camera: cameraSample?.toCanvasImageSource() ?? null,
      });
    } finally {
      screenSample?.close();
      cameraSample?.close();
    }
    await draw(canvas, i);
    job.onProgress(((i + 1) / frameCount) * progressShare);
  }
  await screen.return?.();
  await camera?.return?.();
}

async function exportMp4(job: ExportJob): Promise<void> {
  const { settings } = job;
  const writable = new WritableStream<StreamTargetChunk>({
    write: (chunk) => api.exporter.write(job.handle.id, chunk.position, chunk.data),
  });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(writable, { chunked: true }) });

  let videoSource: CanvasSource | null = null;
  const mixer = await AudioMixer.create(job.loaded, job.project);
  const audioSource = mixer ? new AudioBufferSource({ codec: 'aac', bitrate: 192_000 }) : null;

  try {
    await renderFrames(
      job,
      settings.resolution,
      settings.fps,
      async (canvas, i) => {
        if (!videoSource) {
          videoSource = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY[settings.quality], keyFrameInterval: 2 });
          output.addVideoTrack(videoSource, { frameRate: settings.fps });
          if (audioSource) output.addAudioTrack(audioSource);
          await output.start();
        }
        await videoSource.add(i / settings.fps, 1 / settings.fps);
      },
      mixer ? 0.9 : 1,
    );

    if (mixer && audioSource) {
      for (let t = 0; t < mixer.duration; t += AUDIO_CHUNK_MS) {
        if (job.signal.aborted) throw new Cancelled();
        await audioSource.add(await mixer.render(t, Math.min(mixer.duration, t + AUDIO_CHUNK_MS)));
        job.onProgress(0.9 + 0.1 * Math.min(1, (t + AUDIO_CHUNK_MS) / mixer.duration));
      }
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => undefined);
    throw err;
  }
}

async function exportGif(job: ExportJob): Promise<void> {
  const fps = Math.min(job.settings.fps, GIF_MAX_FPS);
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  await renderFrames(
    job,
    Math.min(job.settings.resolution, GIF_MAX_SHORT_SIDE),
    fps,
    async (canvas) => {
      const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay });
    },
    0.97,
  );
  gif.finish();
  await api.exporter.write(job.handle.id, 0, gif.bytes());
}

/** Renders the project into the file opened by `job.handle`. Removes the file on failure or cancel. */
export async function exportVideo(job: ExportJob): Promise<void> {
  try {
    if (job.settings.format === 'gif') await exportGif(job);
    else await exportMp4(job);
    await api.exporter.finish(job.handle.id);
    job.onProgress(1);
  } catch (err) {
    await api.exporter.abort(job.handle.id);
    throw err;
  }
}
