import type { AspectRatio, CameraLayout, CameraStyle, LayoutSegment, Rect } from '@shared/project';
import { clamp, easeInOut, lerp } from './track';

export const LAYOUT_TRANSITION_MS = 450;

export interface Size {
  w: number;
  h: number;
}

const ASPECTS: Record<Exclude<AspectRatio, 'auto'>, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '4:5': 4 / 5,
};

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

/** Output size: `shortSide` px on the shorter edge, with the chosen (or source) aspect ratio. */
export function outputSize(aspect: AspectRatio, source: Size, shortSide: number): Size {
  const ratio = aspect === 'auto' ? source.w / source.h : ASPECTS[aspect];
  return ratio >= 1 ? { w: even(shortSide * ratio), h: even(shortSide) } : { w: even(shortSide), h: even(shortSide / ratio) };
}

/** Largest rect with `aspect` that fits inside `box`, centred. */
export function fitRect(box: Rect, aspect: number): Rect {
  let w = box.w;
  let h = w / aspect;
  if (h > box.h) {
    h = box.h;
    w = h * aspect;
  }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export interface LayoutState {
  /** Where the recording is drawn (before zoom), in output px. */
  screen: Rect;
  /** Where the camera is drawn, in output px. */
  camera: Rect;
  /** Camera corner radius in px. */
  cameraRadius: number;
  cameraOpacity: number;
  /** How much of the output the camera covers, 0..1; used to fade the screen under a fullscreen camera. */
  cameraCover: number;
}

interface LayoutInputs {
  output: Size;
  sourceAspect: number;
  padding: number;
  camera: CameraStyle;
  hasCamera: boolean;
  cameraAspect: number;
}

function stateFor(layout: CameraLayout, p: LayoutInputs): LayoutState {
  const { w, h } = p.output;
  const short = Math.min(w, h);
  const pad = p.padding * short;
  const full: Rect = { x: 0, y: 0, w, h };
  const padded: Rect = { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad };

  if (!p.hasCamera || layout === 'hidden') {
    const screen = fitRect(padded, p.sourceAspect);
    return { screen, camera: bubbleRect(p, pad), cameraRadius: 0, cameraOpacity: 0, cameraCover: 0 };
  }

  if (layout === 'fullscreen') {
    return { screen: fitRect(padded, p.sourceAspect), camera: full, cameraRadius: 0, cameraOpacity: 1, cameraCover: 1 };
  }

  if (layout === 'split') {
    const landscape = w >= h;
    const gap = Math.max(pad, short * 0.03);
    if (landscape) {
      const camW = (w - 3 * gap) * 0.36;
      const screenBox = { x: gap, y: gap, w: w - 3 * gap - camW, h: h - 2 * gap };
      const screen = fitRect(screenBox, p.sourceAspect);
      const camera = { x: w - gap - camW, y: screen.y, w: camW, h: screen.h };
      return { screen, camera, cameraRadius: short * 0.03, cameraOpacity: 1, cameraCover: 0 };
    }
    const camH = (h - 3 * gap) * 0.4;
    const screen = fitRect({ x: gap, y: gap, w: w - 2 * gap, h: h - 3 * gap - camH }, p.sourceAspect);
    const camera = { x: gap, y: h - gap - camH, w: w - 2 * gap, h: camH };
    return { screen, camera, cameraRadius: short * 0.03, cameraOpacity: 1, cameraCover: 0 };
  }

  const camera = bubbleRect(p, pad);
  const radius = p.camera.shape === 'circle' ? camera.w / 2 : p.camera.shape === 'rounded' ? camera.w * 0.18 : 0;
  return { screen: fitRect(padded, p.sourceAspect), camera, cameraRadius: radius, cameraOpacity: 1, cameraCover: 0 };
}

function bubbleRect(p: LayoutInputs, pad: number): Rect {
  const { w, h } = p.output;
  const short = Math.min(w, h);
  const size = clamp(p.camera.size, 0.08, 0.6) * short;
  const margin = Math.max(pad * 0.5, short * 0.03);
  const left = p.camera.corner.endsWith('left');
  const top = p.camera.corner.startsWith('top');
  return { x: left ? margin : w - margin - size, y: top ? margin : h - margin - size, w: size, h: size };
}

function mix(a: LayoutState, b: LayoutState, k: number): LayoutState {
  const r = (x: Rect, y: Rect): Rect => ({ x: lerp(x.x, y.x, k), y: lerp(x.y, y.y, k), w: lerp(x.w, y.w, k), h: lerp(x.h, y.h, k) });
  return {
    screen: r(a.screen, b.screen),
    camera: r(a.camera, b.camera),
    cameraRadius: lerp(a.cameraRadius, b.cameraRadius, k),
    cameraOpacity: lerp(a.cameraOpacity, b.cameraOpacity, k),
    cameraCover: lerp(a.cameraCover, b.cameraCover, k),
  };
}

/** Camera layout at source time `t`, animating between layouts at segment boundaries. */
export function layoutAt(t: number, segments: LayoutSegment[], inputs: LayoutInputs): LayoutState {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const layoutOf = (time: number): CameraLayout => sorted.find((s) => time >= s.start && time < s.end)?.layout ?? 'overlay';

  const current = layoutOf(t);
  // Find the most recent boundary at or before t where the layout changed.
  const boundaries = sorted.flatMap((s) => [s.start, s.end]).filter((b) => b <= t && b > t - LAYOUT_TRANSITION_MS);
  const boundary = boundaries.length ? Math.max(...boundaries) : null;
  if (boundary === null) return stateFor(current, inputs);

  const previous = layoutOf(boundary - 1);
  if (previous === current) return stateFor(current, inputs);
  const k = easeInOut(clamp((t - boundary) / LAYOUT_TRANSITION_MS, 0, 1));
  return mix(stateFor(previous, inputs), stateFor(current, inputs), k);
}
