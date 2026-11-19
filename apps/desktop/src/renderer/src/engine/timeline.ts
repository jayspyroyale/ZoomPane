import { newId, type Clip } from '@shared/project';

/** Clips shorter than this are dropped by edits, so the timeline never holds slivers. */
export const MIN_CLIP_MS = 100;

export interface PlacedClip {
  clip: Clip;
  index: number;
  /** Output-time span of this clip. */
  outStart: number;
  outEnd: number;
}

/**
 * Maps between SOURCE time (position in the raw recording) and OUTPUT time (position in the
 * edited video). Clips are kept in source order and never overlap; the gaps between them are cuts.
 */
export class Timeline {
  readonly placed: PlacedClip[];
  readonly duration: number;

  constructor(readonly clips: readonly Clip[]) {
    let out = 0;
    this.placed = clips.map((clip, index) => {
      const length = (clip.end - clip.start) / clip.speed;
      const placed = { clip, index, outStart: out, outEnd: out + length };
      out += length;
      return placed;
    });
    this.duration = out;
  }

  /** Output time for a source time, or null when the source time was cut. */
  toOutput(sourceMs: number): number | null {
    for (const p of this.placed) {
      if (sourceMs >= p.clip.start && sourceMs <= p.clip.end) {
        return p.outStart + (sourceMs - p.clip.start) / p.clip.speed;
      }
    }
    return null;
  }

  /** Like {@link toOutput} but snaps cut times to the next kept moment (for drawing timeline items). */
  toOutputClamped(sourceMs: number): number {
    for (const p of this.placed) {
      if (sourceMs < p.clip.start) return p.outStart;
      if (sourceMs <= p.clip.end) return p.outStart + (sourceMs - p.clip.start) / p.clip.speed;
    }
    return this.duration;
  }

  /** Source time and clip for an output time (clamped to the timeline). */
  toSource(outputMs: number): { source: number; placed: PlacedClip } {
    const t = Math.min(Math.max(outputMs, 0), this.duration);
    const placed = this.placed.find((p) => t < p.outEnd) ?? this.placed[this.placed.length - 1];
    return { source: placed.clip.start + (t - placed.outStart) * placed.clip.speed, placed };
  }

  clipAtSource(sourceMs: number): PlacedClip | undefined {
    return this.placed.find((p) => sourceMs >= p.clip.start && sourceMs < p.clip.end);
  }

  /** Last kept source time; the end of the edited video. */
  get sourceEnd(): number {
    return this.clips.length ? this.clips[this.clips.length - 1].end : 0;
  }

  get sourceStart(): number {
    return this.clips.length ? this.clips[0].start : 0;
  }
}

export function initialClips(durationMs: number, pauses: { start: number; end: number }[] = []): Clip[] {
  const clips: Clip[] = [];
  let cursor = 0;
  for (const pause of [...pauses].sort((a, b) => a.start - b.start)) {
    if (pause.start - cursor >= MIN_CLIP_MS) clips.push(makeClip(cursor, pause.start));
    cursor = Math.max(cursor, pause.end);
  }
  if (durationMs - cursor >= MIN_CLIP_MS) clips.push(makeClip(cursor, durationMs));
  return clips.length ? clips : [makeClip(0, Math.max(durationMs, MIN_CLIP_MS))];
}

function makeClip(start: number, end: number, from?: Clip): Clip {
  return { id: newId('c'), start, end, speed: from?.speed ?? 1, volume: from?.volume ?? 1 };
}

/** Splits the clip containing `sourceMs` into two. No-op near clip edges. */
export function splitClips(clips: Clip[], sourceMs: number): Clip[] {
  return clips.flatMap((c) => {
    if (sourceMs - c.start < MIN_CLIP_MS || c.end - sourceMs < MIN_CLIP_MS) return [c];
    return [{ ...c, end: sourceMs }, makeClip(sourceMs, c.end, c)];
  });
}

/** Removes a clip (a cut). The last remaining clip cannot be removed. */
export function removeClip(clips: Clip[], id: string): Clip[] {
  return clips.length <= 1 ? clips : clips.filter((c) => c.id !== id);
}

export function updateClip(clips: Clip[], id: string, patch: Partial<Omit<Clip, 'id'>>): Clip[] {
  return clips.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

/**
 * Moves one edge of a clip (trimming). The edge is limited by its neighbours and the source
 * duration, and the clip keeps at least {@link MIN_CLIP_MS}.
 */
export function trimClip(clips: Clip[], id: string, edge: 'start' | 'end', sourceMs: number, sourceDuration: number): Clip[] {
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return clips;
  const clip = clips[i];
  const next = [...clips];
  if (edge === 'start') {
    const min = i > 0 ? clips[i - 1].end : 0;
    next[i] = { ...clip, start: Math.min(Math.max(sourceMs, min), clip.end - MIN_CLIP_MS) };
  } else {
    const max = i < clips.length - 1 ? clips[i + 1].start : sourceDuration;
    next[i] = { ...clip, end: Math.max(Math.min(sourceMs, max), clip.start + MIN_CLIP_MS) };
  }
  return next;
}

/** Splits clips around the given source ranges and gives those ranges a new speed. */
export function speedUpRanges(clips: Clip[], ranges: { start: number; end: number }[], speed: number): Clip[] {
  let result = clips;
  for (const range of ranges) {
    result = splitClips(splitClips(result, range.start), range.end);
    result = result.map((c) => (c.start >= range.start - 1 && c.end <= range.end + 1 ? { ...c, speed } : c));
  }
  return result;
}
