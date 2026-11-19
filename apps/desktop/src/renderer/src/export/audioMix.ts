import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from 'mediabunny';
import type { Project } from '@shared/project';
import type { Click } from '@/engine/input';
import { Timeline } from '@/engine/timeline';
import { api } from '@/lib/api';
import type { LoadedRecording } from '@/editor/loadRecording';

export const MIX_RATE = 48_000;
const OLA_WINDOW = 2048;
const CLICK_MS = 18;

interface SourceTrack {
  sink: AudioBufferSink;
  /** Track time (ms) = source time + offset. */
  offset: number;
  gain: number;
  denoise: Denoiser | null;
}

/** High-pass (removes hum and rumble) followed by a soft downward expander (removes hiss between words). */
class Denoiser {
  private hpX = 0;
  private hpY = 0;
  private env = 0;
  private readonly hpA = Math.exp((-2 * Math.PI * 90) / MIX_RATE);
  private readonly attack = 1 - Math.exp(-1 / (0.005 * MIX_RATE));
  private readonly release = 1 - Math.exp(-1 / (0.12 * MIX_RATE));

  process(x: Float32Array): void {
    const threshold = 0.012;
    for (let i = 0; i < x.length; i++) {
      const y = this.hpA * (this.hpY + x[i] - this.hpX);
      this.hpX = x[i];
      this.hpY = y;
      const level = Math.abs(y);
      this.env += (level - this.env) * (level > this.env ? this.attack : this.release);
      const gain = this.env >= threshold ? 1 : Math.pow(this.env / threshold, 2);
      x[i] = y * gain;
    }
  }
}

async function openAudio(url: string): Promise<{ sink: AudioBufferSink; duration: number } | null> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) return null;
  return { sink: new AudioBufferSink(track), duration: await track.computeDuration() };
}

/** Reads [startS, endS) of a track as mono at {@link MIX_RATE} (linear resampling, channels averaged). */
async function readMono(sink: AudioBufferSink, startS: number, endS: number): Promise<Float32Array> {
  const out = new Float32Array(Math.max(0, Math.round((endS - startS) * MIX_RATE)));
  if (!out.length || endS <= 0) return out;
  for await (const { buffer, timestamp } of sink.buffers(Math.max(0, startS), endS)) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const rate = buffer.sampleRate;
    const first = Math.max(0, Math.ceil((timestamp - startS) * MIX_RATE));
    const last = Math.min(out.length, Math.floor((timestamp + buffer.duration - startS) * MIX_RATE));
    for (let j = first; j < last; j++) {
      const pos = (startS + j / MIX_RATE - timestamp) * rate;
      const i = Math.floor(pos);
      const f = pos - i;
      let v = 0;
      for (const ch of channels) v += (ch[i] ?? 0) * (1 - f) + (ch[i + 1] ?? ch[i] ?? 0) * f;
      out[j] = v / channels.length;
    }
  }
  return out;
}

/** Changes duration without changing pitch (overlap-add with Hann windows). */
export function timeStretch(input: Float32Array, outLength: number): Float32Array {
  if (outLength === input.length) return input;
  const out = new Float32Array(outLength);
  const norm = new Float32Array(outLength);
  const hop = OLA_WINDOW / 4;
  const ratio = input.length / Math.max(1, outLength);
  for (let o = -OLA_WINDOW; o < outLength; o += hop) {
    const src = Math.round(o * ratio);
    for (let k = 0; k < OLA_WINDOW; k++) {
      const oi = o + k;
      const si = src + k;
      if (oi < 0 || oi >= outLength || si < 0 || si >= input.length) continue;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / OLA_WINDOW);
      out[oi] += input[si] * w;
      norm[oi] += w;
    }
  }
  for (let i = 0; i < outLength; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
  return out;
}

function mixInto(target: Float32Array, source: Float32Array, at: number, gain: number): void {
  const n = Math.min(source.length, target.length - at);
  for (let i = Math.max(0, -at); i < n; i++) target[at + i] += source[i] * gain;
}

/**
 * Renders the edited soundtrack chunk by chunk in OUTPUT time: microphone, system audio,
 * background music and optional click sounds, honouring cuts, clip speed and volume.
 */
export class AudioMixer {
  private constructor(
    private readonly timeline: Timeline,
    private readonly tracks: SourceTrack[],
    private readonly music: { sink: AudioBufferSink; duration: number; volume: number } | null,
    private readonly clicks: Click[],
  ) {}

  static async create(loaded: LoadedRecording, project: Project): Promise<AudioMixer | null> {
    const { manifest } = loaded.data;
    const tracks: SourceTrack[] = [];
    const add = async (url: string | null, startMs: number | undefined, gain: number, denoise: boolean) => {
      if (!url || startMs === undefined || gain <= 0) return;
      const opened = await openAudio(url);
      if (opened) tracks.push({ sink: opened.sink, offset: manifest.video.startMs - startMs, gain, denoise: denoise ? new Denoiser() : null });
    };
    await add(loaded.media.mic, manifest.microphone?.startMs, project.audio.micVolume, project.audio.noiseReduction);
    await add(loaded.media.system, manifest.systemAudio?.startMs, project.audio.systemVolume, false);

    const musicSettings = project.audio.music;
    const opened = musicSettings && musicSettings.volume > 0 ? await openAudio(api.files.mediaUrl(musicSettings.path)) : null;
    const music = opened && musicSettings ? { ...opened, volume: musicSettings.volume } : null;
    const clicks = project.style.cursor.clickSound ? loaded.data.input.clicks : [];

    if (!tracks.length && !music && !clicks.length) return null;
    return new AudioMixer(new Timeline(project.clips), tracks, music, clicks);
  }

  get duration(): number {
    return this.timeline.duration;
  }

  /** Stereo samples for output time [startMs, endMs). */
  async render(startMs: number, endMs: number): Promise<AudioBuffer> {
    const length = Math.round(((endMs - startMs) / 1000) * MIX_RATE);
    const mix = new Float32Array(length);
    const toIndex = (outMs: number) => Math.round(((outMs - startMs) / 1000) * MIX_RATE);

    for (const p of this.timeline.placed) {
      const oS = Math.max(startMs, p.outStart);
      const oE = Math.min(endMs, p.outEnd);
      if (oE <= oS || p.clip.volume <= 0) continue;
      const srcS = p.clip.start + (oS - p.outStart) * p.clip.speed;
      const srcE = p.clip.start + (oE - p.outStart) * p.clip.speed;
      const outLength = toIndex(oE) - toIndex(oS);
      for (const track of this.tracks) {
        const raw = await readMono(track.sink, (srcS + track.offset) / 1000, (srcE + track.offset) / 1000);
        const samples = timeStretch(raw, outLength);
        track.denoise?.process(samples);
        mixInto(mix, samples, toIndex(oS), track.gain * p.clip.volume);
      }
      for (const click of this.clicks) {
        if (click.t >= srcS && click.t < srcE) mixInto(mix, clickSound(), toIndex(oS + (click.t - srcS) / p.clip.speed), 0.5);
      }
    }

    if (this.music) {
      // Background music loops for the whole video.
      const loop = this.music.duration;
      let t = startMs / 1000;
      while (t < endMs / 1000 && loop > 0) {
        const inLoop = t % loop;
        const span = Math.min(endMs / 1000 - t, loop - inLoop);
        mixInto(mix, await readMono(this.music.sink, inLoop, inLoop + span), toIndex(t * 1000), this.music.volume);
        t += span;
      }
    }

    // Soft limiter so loud mixes do not clip.
    for (let i = 0; i < length; i++) mix[i] = Math.tanh(mix[i]);
    const buffer = new AudioBuffer({ length: Math.max(1, length), numberOfChannels: 2, sampleRate: MIX_RATE });
    buffer.copyToChannel(mix, 0);
    buffer.copyToChannel(mix, 1);
    return buffer;
  }
}

let click: Float32Array | null = null;

/** A short synthesized mouse click. */
function clickSound(): Float32Array {
  if (click) return click;
  const n = Math.round((CLICK_MS / 1000) * MIX_RATE);
  click = new Float32Array(n);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    const noise = (seed / 2147483647) * 2 - 1;
    const env = Math.exp(-i / (n / 6));
    click[i] = (noise * 0.6 + Math.sin((2 * Math.PI * 2400 * i) / MIX_RATE) * 0.4) * env;
  }
  return click;
}
