import { ALL_FORMATS, BufferTarget, Conversion, Input, Output, UrlSource, WebMOutputFormat } from 'mediabunny';
import type { OpenedProject } from '@shared/api';
import { DEFAULT_AUDIO, DEFAULT_STYLE, PROJECT_VERSION, newId, type Project, type Style } from '@shared/project';
import type { RecordingManifest } from '@shared/recording';
import { buildInputData, parseInputLog } from '@/engine/input';
import type { CustomCursorImage, RecordingData } from '@/engine/render';
import { initialClips } from '@/engine/timeline';
import { generateAutoZooms } from '@/engine/zoom';
import { api } from '@/lib/api';

export interface MediaUrls {
  screen: string;
  camera: string | null;
  mic: string | null;
  system: string | null;
}

export interface LoadedRecording {
  dir: string;
  data: RecordingData;
  media: MediaUrls;
  project: Project;
}

const join = (dir: string, file: string) => `${dir}\\${file}`;

function sourceDuration(m: RecordingManifest): number {
  return Math.max(0, m.stoppedMs - m.video.startMs);
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(await (await fetch(url)).blob());
  } catch {
    return null;
  }
}

/**
 * MediaRecorder writes WebM without a seek index, so the browser cannot seek in it. Remux the
 * camera once into an indexed WebM (no re-encode) and keep it next to the original.
 */
async function ensureSeekableCamera(dir: string, file: string): Promise<string> {
  const fixedName = file.replace(/\.webm$/, '.seekable.webm');
  const fixedUrl = api.files.mediaUrl(join(dir, fixedName));
  if ((await fetch(fixedUrl, { method: 'HEAD' })).ok) return fixedUrl;

  const input = new Input({ source: new UrlSource(api.files.mediaUrl(join(dir, file))), formats: ALL_FORMATS });
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const conversion = await Conversion.init({ input, output });
  await conversion.execute();
  const buffer = output.target.buffer;
  if (!buffer) return api.files.mediaUrl(join(dir, file));

  const handle = await api.projects.createFile(dir, fixedName);
  await api.exporter.write(handle.id, 0, new Uint8Array(buffer));
  await api.exporter.finish(handle.id);
  return fixedUrl;
}

export function createInitialProject(dir: string, manifest: RecordingManifest, data: RecordingData, style: Style): Project {
  const duration = data.durationMs;
  const pauses = manifest.pauses.map((p) => ({ start: p.startMs - manifest.video.startMs, end: p.endMs - manifest.video.startMs }));
  const { crop } = manifest.source;
  const now = new Date().toISOString();
  return {
    version: PROJECT_VERSION,
    id: newId('p'),
    name: dir.split(/[\\/]/).pop()!.replace(/\.zoompane$/i, ''),
    createdAt: now,
    updatedAt: now,
    clips: initialClips(duration, pauses),
    zooms: style.zoom.auto ? generateAutoZooms(data.input.clicks, duration, style.zoom.defaultLevel) : [],
    layouts: [],
    masks: [],
    captions: [],
    hiddenKeystrokes: [],
    style: {
      ...style,
      crop: crop
        ? { x: crop.x / manifest.video.width, y: crop.y / manifest.video.height, w: crop.w / manifest.video.width, h: crop.h / manifest.video.height }
        : DEFAULT_STYLE.crop,
      keystrokes: { ...style.keystrokes, enabled: style.keystrokes.enabled || data.input.keys.length > 0 },
    },
    audio: { ...DEFAULT_AUDIO },
  };
}

/** Loads a project folder: input data, cursor images, media URLs, and the saved or a fresh project. */
export async function loadRecording(opened: OpenedProject): Promise<LoadedRecording> {
  const { dir, manifest } = opened;
  const input = buildInputData(parseInputLog(opened.input), manifest);

  const customCursors = new Map<string, CustomCursorImage>();
  await Promise.all(
    manifest.customCursors.map(async (c) => {
      const image = await loadImage(api.files.mediaUrl(join(dir, c.file)));
      if (image) customCursors.set(c.id, { image, hotX: c.hotX, hotY: c.hotY, width: c.width, height: c.height });
    }),
  );

  const data: RecordingData = {
    manifest,
    input,
    durationMs: sourceDuration(manifest),
    customCursors,
    cameraAspect: manifest.camera ? manifest.camera.width / manifest.camera.height : null,
  };

  const media: MediaUrls = {
    screen: api.files.mediaUrl(join(dir, manifest.video.file)),
    camera: manifest.camera ? await ensureSeekableCamera(dir, manifest.camera.file).catch(() => api.files.mediaUrl(join(dir, manifest.camera!.file))) : null,
    mic: manifest.microphone ? api.files.mediaUrl(join(dir, manifest.microphone.file)) : null,
    system: manifest.systemAudio ? api.files.mediaUrl(join(dir, manifest.systemAudio.file)) : null,
  };

  let project = opened.project;
  if (!project) {
    const settings = await api.settings.get();
    const preset = settings.presets.find((p) => p.id === settings.defaultPresetId);
    project = createInitialProject(dir, manifest, data, preset ? { ...preset.style, crop: DEFAULT_STYLE.crop } : DEFAULT_STYLE);
  }
  return { dir, data, media, project };
}
