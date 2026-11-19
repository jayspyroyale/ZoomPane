import type { CursorStyle } from '@shared/project';
import type { Click, InputData, Move, ShapeChange } from './input';
import { clamp, easeInOut, filtfilt, lerp, SAMPLE_MS, SampledTrack } from './track';

const SHAKE_PX = 3;
const SHAPE_FLICKER_MS = 120;
const CLICK_PIN_MS = 70;
const IDLE_FADE_MS = 250;
const LOOP_MS = 900;
const STOP_AT_END_MS = 700;
const MAX_TILT_DEG = 16;

export interface CursorSample {
  x: number;
  y: number;
  /** 0..1 */
  opacity: number;
  /** Degrees. */
  rotation: number;
  shape: string;
  /** Speed in frame px per ms, used for motion blur. */
  vx: number;
  vy: number;
}

/** Precomputed cursor motion for a whole recording. Channels: x, y, rawX, rawY. */
export class CursorTrack {
  private readonly track: SampledTrack;
  private readonly shapes: ShapeChange[];
  private readonly shapeTimes: number[];
  private readonly lastMoveTimes: number[];

  constructor(
    input: InputData,
    private readonly style: CursorStyle,
    private readonly range: { start: number; end: number },
    durationMs: number,
  ) {
    const moves = style.removeShakes ? removeShakes(input.moves) : input.moves;
    this.track = buildTrack(moves, input.clicks, style.smoothing, durationMs);
    this.shapes = style.optimizeTypes ? removeFlicker(input.shapes) : input.shapes;
    this.shapeTimes = this.shapes.map((s) => s.t);
    this.lastMoveTimes = significantMoveTimes(moves);
  }

  get hasData(): boolean {
    return this.lastMoveTimes.length > 0;
  }

  sample(t: number): CursorSample {
    const { start, end } = this.range;
    let time = t;
    if (this.style.stopAtEnd && time > end - STOP_AT_END_MS) time = Math.max(start, end - STOP_AT_END_MS);

    let x = this.track.value(0, time);
    let y = this.track.value(1, time);
    if (this.style.loopPosition && t > end - LOOP_MS) {
      const k = easeInOut(clamp((t - (end - LOOP_MS)) / LOOP_MS, 0, 1));
      x = lerp(x, this.track.value(0, start), k);
      y = lerp(y, this.track.value(1, start), k);
    }

    const vx = (this.track.value(0, time + SAMPLE_MS) - this.track.value(0, time - SAMPLE_MS)) / (2 * SAMPLE_MS);
    const vy = (this.track.value(1, time + SAMPLE_MS) - this.track.value(1, time - SAMPLE_MS)) / (2 * SAMPLE_MS);
    const rotation = this.style.rotateWhileMoving ? clamp(vx * 6, -MAX_TILT_DEG, MAX_TILT_DEG) : 0;

    const shape = this.shapeAt(t);
    let opacity = shape === 'hidden' || this.style.hidden ? 0 : 1;
    if (opacity > 0 && this.style.hideWhenIdle) opacity *= this.idleVisibility(t);

    return { x, y, opacity, rotation, shape: this.style.alwaysDefault ? 'arrow' : shape, vx, vy };
  }

  /** Fades out after `idleSeconds` without movement and back in shortly before the next movement. */
  private idleVisibility(t: number): number {
    const idleMs = this.style.idleSeconds * 1000;
    const times = this.lastMoveTimes;
    if (!times.length) return 1;
    const i = upperBound(times, t) - 1;
    const prev = i >= 0 ? times[i] : -Infinity;
    const next = i + 1 < times.length ? times[i + 1] : Infinity;
    const sincePrev = t - prev;
    if (sincePrev < idleMs) return 1;
    const fadeOut = 1 - clamp((sincePrev - idleMs) / IDLE_FADE_MS, 0, 1);
    const fadeIn = 1 - clamp((next - t) / IDLE_FADE_MS, 0, 1);
    return Math.max(fadeOut, fadeIn);
  }

  private shapeAt(t: number): string {
    const i = upperBound(this.shapeTimes, t) - 1;
    return i >= 0 ? this.shapes[i].id : 'arrow';
  }
}

function upperBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function removeShakes(moves: Move[]): Move[] {
  const kept: Move[] = [];
  for (const m of moves) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(m.x - last.x, m.y - last.y) >= SHAKE_PX) kept.push(m);
  }
  return kept;
}

function removeFlicker(shapes: ShapeChange[]): ShapeChange[] {
  const kept: ShapeChange[] = [];
  shapes.forEach((s, i) => {
    const next = shapes[i + 1];
    if (next && next.t - s.t < SHAPE_FLICKER_MS) return;
    if (kept[kept.length - 1]?.id !== s.id) kept.push(s);
  });
  return kept;
}

/** Times where the cursor actually moved (ignores sub-pixel noise), for idle detection. */
function significantMoveTimes(moves: Move[]): number[] {
  const times: number[] = [];
  let last: Move | undefined;
  for (const m of moves) {
    if (!last || Math.hypot(m.x - last.x, m.y - last.y) >= 2) {
      times.push(m.t);
      last = m;
    }
  }
  return times;
}

/**
 * Resamples raw moves onto the fixed grid, smooths them with zero lag, then pins the
 * cursor to the exact raw position around clicks so ripples land where the user clicked.
 */
function buildTrack(moves: Move[], clicks: Click[], smoothing: number, durationMs: number): SampledTrack {
  const track = SampledTrack.create(4, durationMs);
  const [sx, sy, rx, ry] = track.channels;
  const first = moves[0] ?? { t: 0, x: 0, y: 0 };

  let j = 0;
  for (let i = 0; i < track.length; i++) {
    const t = i * SAMPLE_MS;
    while (j + 1 < moves.length && moves[j + 1].t <= t) j++;
    const a = moves[j] ?? first;
    const b = moves[j + 1];
    let x = a.x;
    let y = a.y;
    // Interpolate only across short gaps; a long gap means the cursor was resting at `a`.
    if (b && t > a.t && b.t - a.t <= 60) {
      const f = (t - a.t) / (b.t - a.t);
      x = lerp(a.x, b.x, f);
      y = lerp(a.y, b.y, f);
    }
    if (t < first.t) {
      x = first.x;
      y = first.y;
    }
    rx[i] = x;
    ry[i] = y;
  }

  if (smoothing <= 0.01) {
    sx.set(rx);
    sy.set(ry);
    return track;
  }

  const omega = lerp(40, 7, clamp(smoothing, 0, 1));
  sx.set(filtfilt(rx, omega));
  sy.set(filtfilt(ry, omega));

  for (const click of clicks) {
    const from = Math.max(0, Math.floor((click.t - CLICK_PIN_MS * 3) / SAMPLE_MS));
    const to = Math.min(track.length - 1, Math.ceil((click.t + CLICK_PIN_MS * 3) / SAMPLE_MS));
    for (let i = from; i <= to; i++) {
      const d = (i * SAMPLE_MS - click.t) / CLICK_PIN_MS;
      const w = Math.exp(-d * d);
      sx[i] = lerp(sx[i], rx[i], w);
      sy[i] = lerp(sy[i], ry[i], w);
    }
  }
  return track;
}
