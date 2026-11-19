import { newId, type Point, type ZoomSegment, type ZoomSpeed } from '@shared/project';
import type { CursorTrack } from './cursor';
import type { Click } from './input';
import { clamp, SAMPLE_MS, SampledTrack, springStep } from './track';

const LEAD_IN_MS = 700;
const HOLD_AFTER_MS = 1800;
const CLUSTER_GAP_MS = 3000;
const MERGE_GAP_MS = 1200;
const MIN_ZOOM_MS = 2000;
/** Auto zoom re-centres once the cursor leaves this fraction of the visible area. */
const SAFE_AREA = 0.7;

const SPEED_OMEGA: Record<ZoomSpeed, number> = { slow: 4.5, medium: 7, fast: 11 };

/** Creates auto-zoom segments around clusters of clicks. */
export function generateAutoZooms(clicks: Click[], durationMs: number, level: number): ZoomSegment[] {
  const sorted = clicks.filter((c) => c.button !== 'middle').sort((a, b) => a.t - b.t);
  const spans: { start: number; end: number }[] = [];
  for (const click of sorted) {
    const last = spans[spans.length - 1];
    if (last && click.t - (last.end - HOLD_AFTER_MS) <= CLUSTER_GAP_MS) {
      last.end = click.t + HOLD_AFTER_MS;
    } else {
      spans.push({ start: click.t - LEAD_IN_MS, end: click.t + HOLD_AFTER_MS });
    }
  }

  const merged: { start: number; end: number }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start - last.end < MERGE_GAP_MS) last.end = span.end;
    else merged.push({ ...span });
  }

  return merged
    .map((s) => {
      const start = clamp(s.start, 0, durationMs);
      const end = clamp(Math.max(s.end, start + MIN_ZOOM_MS), 0, durationMs);
      return { start, end };
    })
    .filter((s) => s.end - s.start >= 500)
    .map((s) => createZoom(s.start, s.end, level));
}

export function createZoom(start: number, end: number, level: number, mode: ZoomSegment['mode'] = 'auto'): ZoomSegment {
  return { id: newId('z'), start, end, enabled: true, mode, level, focus: { x: 0.5, y: 0.5 }, instant: false };
}

export interface CameraSample {
  scale: number;
  /** Focus in normalized crop coordinates; the visible area is centred here. */
  x: number;
  y: number;
}

/** Visible area of the crop for a camera state, in normalized coordinates. */
export function cameraViewport(c: CameraSample): { x: number; y: number; w: number; h: number } {
  const w = 1 / c.scale;
  return { x: c.x - w / 2, y: c.y - w / 2, w, h: w };
}

/** Keeps the visible area inside the recording. */
export function clampFocus(p: Point, scale: number): Point {
  const half = 0.5 / Math.max(scale, 1);
  return { x: clamp(p.x, half, 1 - half), y: clamp(p.y, half, 1 - half) };
}

/**
 * Simulates the virtual camera (zoom level and focus) over the whole recording with
 * critically damped springs. Channels: scale, x, y.
 */
export class CameraTrack {
  private readonly track: SampledTrack;

  constructor(
    zooms: ZoomSegment[],
    cursor: CursorTrack,
    clicks: Click[],
    toNormalized: (x: number, y: number) => Point,
    speed: ZoomSpeed,
    durationMs: number,
  ) {
    this.track = SampledTrack.create(3, durationMs);
    const [scaleCh, xCh, yCh] = this.track.channels;
    const active = zooms.filter((z) => z.enabled).sort((a, b) => a.start - b.start);
    const omega = SPEED_OMEGA[speed];

    let scale = 1;
    let vs = 0;
    let fx = 0.5;
    let vx = 0;
    let fy = 0.5;
    let vy = 0;
    let follow: Point = { x: 0.5, y: 0.5 };
    let current: ZoomSegment | undefined;

    for (let i = 0; i < this.track.length; i++) {
      const t = i * SAMPLE_MS;
      const zoom = active.find((z) => t >= z.start && t < z.end);
      let targetScale = 1;
      let target: Point = { x: 0.5, y: 0.5 };

      if (zoom) {
        targetScale = Math.max(zoom.level, 1);
        if (zoom.mode === 'manual') {
          target = zoom.focus;
        } else {
          const c = cursor.sample(t);
          const pos = toNormalized(c.x, c.y);
          if (zoom !== current) {
            // Aim at the first click in the segment, falling back to the cursor.
            const firstClick = clicks.find((k) => k.t >= zoom.start && k.t < zoom.end);
            follow = firstClick ? toNormalized(firstClick.x, firstClick.y) : pos;
          } else {
            const safe = (0.5 / targetScale) * SAFE_AREA;
            if (Math.abs(pos.x - follow.x) > safe || Math.abs(pos.y - follow.y) > safe) follow = pos;
          }
          target = follow;
        }
        target = clampFocus(target, targetScale);
      }

      if (zoom?.instant || (current?.instant && !zoom)) {
        scale = targetScale;
        fx = target.x;
        fy = target.y;
        vs = vx = vy = 0;
      } else {
        [scale, vs] = springStep(scale, vs, targetScale, omega, SAMPLE_MS);
        [fx, vx] = springStep(fx, vx, target.x, omega, SAMPLE_MS);
        [fy, vy] = springStep(fy, vy, target.y, omega, SAMPLE_MS);
      }
      current = zoom;

      const clamped = clampFocus({ x: fx, y: fy }, scale);
      scaleCh[i] = scale;
      xCh[i] = clamped.x;
      yCh[i] = clamped.y;
    }
  }

  sample(t: number): CameraSample {
    return { scale: this.track.value(0, t), x: this.track.value(1, t), y: this.track.value(2, t) };
  }
}
