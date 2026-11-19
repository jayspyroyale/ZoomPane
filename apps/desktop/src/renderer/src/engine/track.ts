/** Fixed simulation rate for cursor and camera motion. Any time can be sampled by interpolation. */
export const SAMPLE_HZ = 240;
export const SAMPLE_MS = 1000 / SAMPLE_HZ;

/**
 * A set of channels sampled at {@link SAMPLE_HZ} from t=0. Precomputing motion once makes
 * rendering any timestamp deterministic and independent of what was rendered before,
 * which is what seeking and export need.
 */
export class SampledTrack {
  readonly length: number;

  constructor(readonly channels: Float32Array[]) {
    this.length = channels[0]?.length ?? 0;
  }

  static create(channelCount: number, durationMs: number): SampledTrack {
    const length = Math.max(2, Math.ceil(durationMs / SAMPLE_MS) + 2);
    return new SampledTrack(Array.from({ length: channelCount }, () => new Float32Array(length)));
  }

  /** Linearly interpolated value of one channel at time `t` (ms). */
  value(channel: number, t: number): number {
    const data = this.channels[channel];
    const pos = Math.min(Math.max(t / SAMPLE_MS, 0), this.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    return i + 1 < this.length ? data[i] + (data[i + 1] - data[i]) * f : data[i];
  }
}

/**
 * Critically damped spring step (no overshoot). `omega` is the angular frequency in rad/s:
 * higher is snappier. Returns the new [position, velocity].
 */
export function springStep(x: number, v: number, target: number, omega: number, dtMs: number): [number, number] {
  const dt = dtMs / 1000;
  const exp = Math.exp(-omega * dt);
  const delta = x - target;
  const temp = (v + omega * delta) * dt;
  return [target + (delta + temp) * exp, (v - omega * temp) * exp];
}

/**
 * Zero-lag smoothing: runs a critically damped spring forwards and then backwards over a
 * sampled signal. The phase lag of each pass cancels, so smoothed motion still lines up with clicks.
 */
export function filtfilt(signal: Float32Array, omega: number): Float32Array {
  const out = new Float32Array(signal.length);
  if (signal.length === 0) return out;
  let x = signal[0];
  let v = 0;
  for (let i = 0; i < signal.length; i++) {
    [x, v] = springStep(x, v, signal[i], omega, SAMPLE_MS);
    out[i] = x;
  }
  x = out[out.length - 1];
  v = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    [x, v] = springStep(x, v, out[i], omega, SAMPLE_MS);
    out[i] = x;
  }
  return out;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
