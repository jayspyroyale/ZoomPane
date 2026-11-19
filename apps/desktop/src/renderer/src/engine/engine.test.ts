import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '@shared/project';
import { CursorTrack } from './cursor';
import type { InputData } from './input';
import { detectKeystrokes, detectTypingBursts } from './keystrokes';
import { fitRect, layoutAt, outputSize } from './layout';
import { initialClips, removeClip, speedUpRanges, splitClips, Timeline, trimClip } from './timeline';
import { filtfilt } from './track';
import { CameraTrack, generateAutoZooms } from './zoom';

describe('Timeline', () => {
  it('maps source and output time through cuts and speed changes', () => {
    let clips = splitClips(initialClips(10_000), 4_000);
    clips = splitClips(clips, 6_000);
    clips = removeClip(clips, clips[1].id); // cut 4s..6s
    clips = clips.map((c, i) => (i === 1 ? { ...c, speed: 2 } : c)); // 6s..10s at 2x
    const tl = new Timeline(clips);

    expect(tl.duration).toBe(6_000);
    expect(tl.toOutput(2_000)).toBe(2_000);
    expect(tl.toOutput(5_000)).toBeNull();
    expect(tl.toOutput(8_000)).toBe(5_000);
    expect(tl.toSource(5_000).source).toBe(8_000);
    expect(tl.toOutputClamped(5_000)).toBe(4_000);
  });

  it('turns pauses into cuts', () => {
    const tl = new Timeline(initialClips(10_000, [{ start: 3_000, end: 5_000 }]));
    expect(tl.duration).toBe(8_000);
  });

  it('limits trims by neighbours', () => {
    const clips = splitClips(initialClips(10_000), 5_000);
    const trimmed = trimClip(clips, clips[0].id, 'end', 7_000, 10_000);
    expect(trimmed[0].end).toBe(5_000);
    expect(trimClip(clips, clips[1].id, 'end', 12_000, 10_000)[1].end).toBe(10_000);
  });

  it('speeds up ranges by splitting', () => {
    const clips = speedUpRanges(initialClips(10_000), [{ start: 2_000, end: 4_000 }], 4);
    expect(clips.map((c) => [c.start, c.end, c.speed])).toEqual([
      [0, 2_000, 1],
      [2_000, 4_000, 4],
      [4_000, 10_000, 1],
    ]);
  });
});

describe('auto zoom', () => {
  it('clusters nearby clicks into one segment and separates distant ones', () => {
    const click = (t: number) => ({ t, x: 100, y: 100, button: 'left' as const });
    const zooms = generateAutoZooms([click(1_000), click(2_500), click(12_000)], 20_000, 2);
    expect(zooms).toHaveLength(2);
    expect(zooms[0].start).toBe(300);
    expect(zooms[0].end).toBe(4_300);
    expect(zooms[1].start).toBe(11_300);
  });
});

function input(moves: [number, number, number][]): InputData {
  return { moves: moves.map(([t, x, y]) => ({ t, x, y })), clicks: [], keys: [], shapes: [] };
}

describe('cursor', () => {
  it('smooths without lagging behind the raw path', () => {
    const raw = new Float32Array(400).map((_, i) => (i < 200 ? 0 : 100));
    const smooth = filtfilt(raw, 10);
    expect(smooth[199]).toBeGreaterThan(5);
    expect(smooth[199]).toBeLessThan(95);
    expect(smooth[0]).toBeCloseTo(0, 0);
    expect(smooth[399]).toBeCloseTo(100, 0);
  });

  it('hides when idle and freezes at the end', () => {
    const style = { ...DEFAULT_STYLE.cursor, smoothing: 0, idleSeconds: 1, stopAtEnd: true };
    const track = new CursorTrack(input([[0, 10, 10], [100, 50, 50], [9_000, 300, 300]]), style, { start: 0, end: 10_000 }, 10_000);
    expect(track.sample(500).opacity).toBe(1);
    expect(track.sample(4_000).opacity).toBe(0);
    expect(track.sample(9_900).x).toBe(track.sample(9_300).x);
  });
});

describe('camera', () => {
  it('zooms in during a segment and back out after', () => {
    const cursor = new CursorTrack(input([[0, 960, 540]]), DEFAULT_STYLE.cursor, { start: 0, end: 10_000 }, 10_000);
    const zooms = generateAutoZooms([{ t: 3_000, x: 960, y: 540, button: 'left' }], 10_000, 2);
    const cam = new CameraTrack(zooms, cursor, [], (x, y) => ({ x: x / 1920, y: y / 1080 }), 'medium', 10_000);
    expect(cam.sample(1_000).scale).toBeCloseTo(1, 2);
    expect(cam.sample(4_000).scale).toBeGreaterThan(1.8);
    expect(cam.sample(9_900).scale).toBeLessThan(1.1);
  });
});

describe('keystrokes', () => {
  const key = (t: number, vk: number, down = true) => ({ t, vk, down });
  it('detects shortcuts but not typing', () => {
    const keys = [key(0, 0x11), key(10, 0x43), key(20, 0x43, false), key(30, 0x11, false), key(1_000, 0x48), key(1_100, 0x49)];
    const strokes = detectKeystrokes(keys, true);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].keys).toEqual(['Ctrl', 'C']);
  });

  it('finds typing bursts', () => {
    const keys = Array.from({ length: 10 }, (_, i) => key(5_000 + i * 200, 0x41));
    expect(detectTypingBursts(keys)).toEqual([{ start: 5_000, end: 6_950 }]);
  });
});

describe('layout', () => {
  it('computes output sizes for aspect ratios', () => {
    expect(outputSize('auto', { w: 2560, h: 1440 }, 1080)).toEqual({ w: 1920, h: 1080 });
    expect(outputSize('9:16', { w: 2560, h: 1440 }, 1080)).toEqual({ w: 1080, h: 1920 });
    expect(fitRect({ x: 0, y: 0, w: 200, h: 100 }, 1)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
  });

  it('animates between camera layouts', () => {
    const inputs = { output: { w: 1920, h: 1080 }, sourceAspect: 16 / 9, padding: 0.1, camera: DEFAULT_STYLE.camera, hasCamera: true, cameraAspect: 16 / 9 };
    const segments = [{ id: 'a', start: 1_000, end: 5_000, layout: 'fullscreen' as const }];
    expect(layoutAt(500, segments, inputs).cameraCover).toBe(0);
    const mid = layoutAt(1_200, segments, inputs).cameraCover;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(layoutAt(3_000, segments, inputs).cameraCover).toBe(1);
  });
});
