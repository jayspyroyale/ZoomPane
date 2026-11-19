import { newId, type CaptionSegment } from '@shared/project';
import type { RecordingManifest } from '@shared/recording';
import type { WorkerMessage, WorkerRequest } from './whisper.worker';

const SAMPLE_RATE = 16_000;
const MAX_CAPTION_CHARS = 64;

async function decodeMono16k(url: string): Promise<Float32Array> {
  const data = await (await fetch(url)).arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(data).finally(() => void ctx.close());
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** Splits long sentences into caption-sized pieces, sharing the time span by length. */
function splitLong(segment: { start: number; end: number; text: string }): { start: number; end: number; text: string }[] {
  const words = segment.text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + word.length + 1 > MAX_CAPTION_CHARS) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const total = lines.reduce((n, l) => n + l.length, 0);
  let t = segment.start;
  return lines.map((text) => {
    const span = ((segment.end - segment.start) * text.length) / total;
    const piece = { start: t, end: t + span, text };
    t += span;
    return piece;
  });
}

/**
 * Transcribes the microphone track locally and returns captions in SOURCE time.
 * `onProgress` receives the stage and a 0..1 fraction (download happens only the first time).
 */
export async function transcribeMicrophone(
  micUrl: string,
  manifest: RecordingManifest,
  onProgress: (stage: 'download' | 'transcribe', progress: number) => void,
): Promise<CaptionSegment[]> {
  if (!manifest.microphone) throw new Error('This recording has no microphone audio.');
  const audio = await decodeMono16k(micUrl);
  const offset = manifest.video.startMs - manifest.microphone.startMs;

  const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  try {
    const segments = await new Promise<{ start: number; end: number; text: string }[]>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.stage, m.progress);
        else if (m.type === 'done') resolve(m.segments);
        else reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Transcription failed'));
      worker.postMessage({ audio, language: null } satisfies WorkerRequest, [audio.buffer]);
    });
    return segments.flatMap(splitLong).map((s) => ({ id: newId('t'), start: Math.max(0, s.start - offset), end: s.end - offset, text: s.text }));
  } finally {
    worker.terminate();
  }
}

/** SubRip text for the captions, in OUTPUT time. */
export function toSrt(captions: CaptionSegment[], toOutput: (sourceMs: number) => number): string {
  const stamp = (ms: number) => {
    const t = Math.max(0, Math.round(ms));
    const h = Math.floor(t / 3_600_000);
    const m = Math.floor(t / 60_000) % 60;
    const s = Math.floor(t / 1000) % 60;
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(t % 1000, 3)}`;
  };
  return captions
    .map((c) => ({ start: toOutput(c.start), end: toOutput(c.end), text: c.text }))
    .filter((c) => c.end - c.start > 50)
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`)
    .join('\n');
}
