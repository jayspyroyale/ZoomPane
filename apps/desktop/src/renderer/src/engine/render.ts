import type { Project, Rect } from '@shared/project';
import type { RecordingManifest } from '@shared/recording';
import { renderBackground } from './backgrounds';
import { CursorTrack } from './cursor';
import { drawVectorCursor, hasVectorCursor } from './cursors';
import type { Click, InputData } from './input';
import { detectKeystrokes, type Keystroke } from './keystrokes';
import { fitRect, layoutAt, outputSize, type LayoutState, type Size } from './layout';
import { Timeline } from './timeline';
import { clamp } from './track';
import { CameraTrack, type CameraSample } from './zoom';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Image = CanvasImageSource & { width?: number; height?: number };

/** Recorded cursor size (px) at 100% display scaling. */
const BASE_CURSOR_PX = 32;
const CLICK_EFFECT_MS = 550;
const MOTION_SUBSAMPLES = 5;

export interface CustomCursorImage {
  image: CanvasImageSource;
  hotX: number;
  hotY: number;
  width: number;
  height: number;
}

/** Everything loaded once when a project opens. */
export interface RecordingData {
  manifest: RecordingManifest;
  input: InputData;
  /** Duration of screen.mp4 in ms. */
  durationMs: number;
  customCursors: Map<string, CustomCursorImage>;
  /** Camera video aspect ratio, if a camera was recorded. */
  cameraAspect: number | null;
}

export interface FrameMedia {
  screen: Image | null;
  camera: Image | null;
}

export interface SceneOptions {
  /** Shorter side of the output in px. */
  resolution: number;
  fps: number;
  watermark: boolean;
  backgroundImage: Image | null;
}

/**
 * A ready-to-draw composition: the project with its precomputed motion tracks and cached
 * layers. Build it with {@link SceneBuilder}, which reuses expensive parts between edits.
 */
export interface Scene {
  project: Project;
  data: RecordingData;
  output: Size;
  timeline: Timeline;
  cursor: CursorTrack;
  camera: CameraTrack;
  keystrokes: Keystroke[];
  clicks: Click[];
  /** Crop rect in screen.mp4 pixels. */
  cropPx: Rect;
  background: OffscreenCanvas;
  options: SceneOptions;
  shadowCache: Map<string, OffscreenCanvas>;
}

/** Rebuilds only the parts of a scene whose inputs changed (tracks are the expensive part). */
export class SceneBuilder {
  private cursorKey = '';
  private cameraKey = '';
  private backgroundKey = '';
  private keysKey = '';
  private cursor?: CursorTrack;
  private camera?: CameraTrack;
  private background?: OffscreenCanvas;
  private keystrokes: Keystroke[] = [];
  private readonly shadowCache = new Map<string, OffscreenCanvas>();

  constructor(private readonly data: RecordingData) {}

  build(project: Project, options: SceneOptions): Scene {
    const { manifest, input, durationMs } = this.data;
    const timeline = new Timeline(project.clips);
    const crop = project.style.crop;
    const cropPx = {
      x: crop.x * manifest.video.width,
      y: crop.y * manifest.video.height,
      w: crop.w * manifest.video.width,
      h: crop.h * manifest.video.height,
    };
    const output = outputSize(project.style.aspect, { w: cropPx.w, h: cropPx.h }, options.resolution);

    const range = { start: timeline.sourceStart, end: timeline.sourceEnd };
    const cursorKey = JSON.stringify([project.style.cursor, range]);
    if (!this.cursor || cursorKey !== this.cursorKey) {
      this.cursor = new CursorTrack(input, project.style.cursor, range, durationMs);
      this.cursorKey = cursorKey;
      this.cameraKey = '';
    }

    const cameraKey = JSON.stringify([project.zooms, project.style.zoom.speed, crop]);
    if (!this.camera || cameraKey !== this.cameraKey) {
      const toNormalized = (x: number, y: number) => ({ x: (x - cropPx.x) / cropPx.w, y: (y - cropPx.y) / cropPx.h });
      this.camera = new CameraTrack(project.zooms, this.cursor, input.clicks, toNormalized, project.style.zoom.speed, durationMs);
      this.cameraKey = cameraKey;
    }

    const bgKey = JSON.stringify([project.style.background, project.style.backgroundBlur, output, !!options.backgroundImage]);
    if (!this.background || bgKey !== this.backgroundKey) {
      const blur = (project.style.backgroundBlur * Math.min(output.w, output.h)) / 1080;
      this.background = renderBackground(project.style.background, output, blur, options.backgroundImage as never);
      this.backgroundKey = bgKey;
    }

    const keysKey = String(project.style.keystrokes.showSingleKeys);
    if (keysKey !== this.keysKey) {
      this.keystrokes = detectKeystrokes(input.keys, project.style.keystrokes.showSingleKeys);
      this.keysKey = keysKey;
    }

    return {
      project,
      data: this.data,
      output,
      timeline,
      cursor: this.cursor,
      camera: this.camera,
      keystrokes: this.keystrokes,
      clicks: input.clicks,
      cropPx,
      background: this.background,
      options,
      shadowCache: this.shadowCache,
    };
  }
}

/** Draws the composition at SOURCE time `t` (ms) onto a canvas of size `scene.output`. */
export function drawFrame(ctx: Ctx, scene: Scene, t: number, media: FrameMedia): void {
  const { project, output } = scene;
  const style = project.style;
  const unit = Math.min(output.w, output.h) / 1080;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.drawImage(scene.background, 0, 0);

  const layout = layoutAt(t, project.layouts, {
    output,
    sourceAspect: scene.cropPx.w / scene.cropPx.h,
    padding: style.padding,
    camera: style.camera,
    hasCamera: scene.data.cameraAspect !== null,
    cameraAspect: scene.data.cameraAspect ?? 1,
  });

  const screenAlpha = 1 - layout.cameraCover;
  if (screenAlpha > 0.001) {
    const camNow = scene.camera.sample(t);
    const shutter = (1000 / scene.options.fps) * style.motionBlur;
    const camPrev = scene.camera.sample(t - shutter);
    const moving = shutter > 0 && cameraMotionPx(camPrev, camNow, layout.screen) > 1.5;

    ctx.save();
    ctx.globalAlpha = screenAlpha;
    drawShadow(ctx, scene, layout.screen, camNow, unit);
    if (moving) {
      // Temporal supersampling: average several camera positions across the shutter interval.
      for (let i = MOTION_SUBSAMPLES - 1; i >= 0; i--) {
        const k = i / (MOTION_SUBSAMPLES - 1);
        ctx.globalAlpha = screenAlpha / (MOTION_SUBSAMPLES - i);
        drawScreenLayer(ctx, scene, layout.screen, scene.camera.sample(t - shutter * k), media.screen, unit, null);
      }
      ctx.globalAlpha = screenAlpha;
      drawScreenLayer(ctx, scene, layout.screen, camNow, media.screen, unit, t, false);
    } else {
      drawScreenLayer(ctx, scene, layout.screen, camNow, media.screen, unit, t);
    }
    ctx.restore();
  }

  if (media.camera && layout.cameraOpacity > 0.001) drawCamera(ctx, scene, layout, media.camera, unit);
  drawKeystrokes(ctx, scene, t, unit);
  drawCaption(ctx, scene, t, unit);
  if (scene.options.watermark) drawWatermark(ctx, output, unit);
}

function cameraMotionPx(a: CameraSample, b: CameraSample, rect: Rect): number {
  const scaleDelta = Math.abs(a.scale - b.scale) / b.scale;
  return (scaleDelta + Math.hypot(a.x - b.x, a.y - b.y) * b.scale) * rect.w;
}

/** Applies the zoom transform so that drawing into (0, 0, rect.w, rect.h) lands on the zoomed screen. */
function applyCamera(ctx: Ctx, rect: Rect, cam: CameraSample): void {
  ctx.translate(rect.x + rect.w / 2 - cam.x * cam.scale * rect.w, rect.y + rect.h / 2 - cam.y * cam.scale * rect.h);
  ctx.scale(cam.scale, cam.scale);
}

function drawShadow(ctx: Ctx, scene: Scene, rect: Rect, cam: CameraSample, unit: number): void {
  const strength = scene.project.style.shadow;
  if (strength <= 0) return;
  const radius = scene.project.style.radius * unit;
  const blur = 40 * unit * (0.4 + strength);
  const margin = Math.ceil(blur * 2);
  const key = [Math.round(rect.w), Math.round(rect.h), radius, strength, unit].join(':');
  let shadow = scene.shadowCache.get(key);
  if (!shadow) {
    if (scene.shadowCache.size > 8) scene.shadowCache.clear();
    shadow = new OffscreenCanvas(Math.ceil(rect.w + margin * 2), Math.ceil(rect.h + margin * 2));
    const s = shadow.getContext('2d')!;
    s.shadowColor = `rgba(0,0,0,${0.35 + strength * 0.4})`;
    s.shadowBlur = blur;
    s.shadowOffsetY = blur * 0.35;
    s.fillStyle = '#000';
    s.beginPath();
    s.roundRect(margin, margin, rect.w, rect.h, radius);
    s.fill();
    scene.shadowCache.set(key, shadow);
  }
  ctx.save();
  applyCamera(ctx, rect, cam);
  ctx.drawImage(shadow, -margin, -margin);
  ctx.restore();
}

/**
 * Draws the recording inside its rounded frame under the zoom transform. `overlaysAt` (source
 * time) also draws masks, click effects and the cursor; pass null for motion-blur subsamples.
 * `drawImage` is false when the subsamples already painted the screen.
 */
function drawScreenLayer(
  ctx: Ctx,
  scene: Scene,
  rect: Rect,
  cam: CameraSample,
  screen: Image | null,
  unit: number,
  overlaysAt: number | null,
  drawImage = true,
): void {
  const style = scene.project.style;
  const crop = scene.cropPx;
  const radius = style.radius * unit;
  const insetPx = style.inset * unit;
  const inner = insetPx > 0 ? fitRect({ x: insetPx, y: insetPx, w: rect.w - 2 * insetPx, h: rect.h - 2 * insetPx }, crop.w / crop.h) : { x: 0, y: 0, w: rect.w, h: rect.h };

  ctx.save();
  applyCamera(ctx, rect, cam);
  ctx.beginPath();
  ctx.roundRect(0, 0, rect.w, rect.h, radius);
  ctx.clip();

  if (drawImage) {
    if (insetPx > 0) {
      ctx.fillStyle = style.insetColor;
      ctx.fillRect(0, 0, rect.w, rect.h);
    }
    if (screen) {
      ctx.drawImage(screen, crop.x, crop.y, crop.w, crop.h, inner.x, inner.y, inner.w, inner.h);
    } else {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
  }

  if (overlaysAt !== null) {
    const t = overlaysAt;
    drawMasks(ctx, scene, t, screen, inner);
    const toLocal = (x: number, y: number) => ({
      x: inner.x + ((x - crop.x) / crop.w) * inner.w,
      y: inner.y + ((y - crop.y) / crop.h) * inner.h,
    });
    const pxPerSource = inner.w / crop.w;
    drawClicks(ctx, scene, t, toLocal, pxPerSource);
    drawCursor(ctx, scene, t, toLocal, pxPerSource);
  }
  ctx.restore();
}

function drawMasks(ctx: Ctx, scene: Scene, t: number, screen: Image | null, inner: Rect): void {
  const crop = scene.cropPx;
  for (const mask of scene.project.masks) {
    if (t < mask.start || t >= mask.end) continue;
    const r = { x: inner.x + mask.rect.x * inner.w, y: inner.y + mask.rect.y * inner.h, w: mask.rect.w * inner.w, h: mask.rect.h * inner.h };
    if (mask.kind === 'blur' && screen) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 6);
      ctx.clip();
      ctx.filter = `blur(${4 + mask.strength * 24}px)`;
      ctx.drawImage(screen, crop.x, crop.y, crop.w, crop.h, inner.x, inner.y, inner.w, inner.h);
      ctx.restore();
    } else if (mask.kind === 'highlight') {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.25 + mask.strength * 0.5})`;
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.w, inner.h);
      ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fill('evenodd');
      ctx.restore();
    }
  }
}

function cursorPixelSize(scene: Scene, pxPerSource: number): number {
  return BASE_CURSOR_PX * scene.data.manifest.source.scale * scene.project.style.cursor.size * pxPerSource;
}

function drawClicks(ctx: Ctx, scene: Scene, t: number, toLocal: (x: number, y: number) => { x: number; y: number }, pxPerSource: number): void {
  const effect = scene.project.style.cursor.clickEffect;
  if (effect === 'none' || scene.project.style.cursor.hidden) return;
  const size = cursorPixelSize(scene, pxPerSource);
  for (const click of scene.clicks) {
    const age = t - click.t;
    if (age < 0 || age > CLICK_EFFECT_MS) continue;
    const p = age / CLICK_EFFECT_MS;
    const at = scene.cursor.sample(click.t);
    const { x, y } = toLocal(at.x, at.y);
    ctx.save();
    if (effect === 'ripple') {
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - p)})`;
      ctx.lineWidth = size * 0.08 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(x, y, size * (0.25 + p * 0.75), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(59,130,246,${0.35 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(x, y, size * (0.3 + 0.35 * Math.sin(p * Math.PI)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawCursor(ctx: Ctx, scene: Scene, t: number, toLocal: (x: number, y: number) => { x: number; y: number }, pxPerSource: number): void {
  const sample = scene.cursor.sample(t);
  if (sample.opacity <= 0.01 || !scene.cursor.hasData) return;
  const size = cursorPixelSize(scene, pxPerSource);
  const { x, y } = toLocal(sample.x, sample.y);

  // Cursor motion blur: a short trail of fainter copies along the velocity.
  const blur = scene.project.style.motionBlur;
  const speed = Math.hypot(sample.vx, sample.vy) * pxPerSource; // local px per ms
  const trail = blur > 0 && speed > 0.6 ? 4 : 0;
  const shutter = (1000 / scene.options.fps) * blur;
  for (let i = trail; i >= 0; i--) {
    const back = (i / Math.max(trail, 1)) * shutter;
    const px = x - sample.vx * pxPerSource * back;
    const py = y - sample.vy * pxPerSource * back;
    ctx.globalAlpha = sample.opacity * (i === 0 ? 1 : 0.18);
    drawCursorShape(ctx, scene, sample.shape, px, py, size, sample.rotation, t);
  }
  ctx.globalAlpha = 1;
}

function drawCursorShape(ctx: Ctx, scene: Scene, shape: string, x: number, y: number, size: number, rotation: number, t: number): void {
  if (hasVectorCursor(shape)) {
    drawVectorCursor(ctx, shape, x, y, size, rotation, t);
    return;
  }
  const custom = scene.data.customCursors.get(shape);
  if (!custom) {
    drawVectorCursor(ctx, 'arrow', x, y, size, rotation, t);
    return;
  }
  // Saved PNGs are at the recording's scale; size them relative to the standard 32 px cursor.
  const s = size / (BASE_CURSOR_PX * scene.data.manifest.source.scale);
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(custom.image, -custom.hotX * s, -custom.hotY * s, custom.width * s, custom.height * s);
  ctx.restore();
}

function drawCamera(ctx: Ctx, scene: Scene, layout: LayoutState, camera: Image, unit: number): void {
  const r = layout.camera;
  const style = scene.project.style.camera;
  const cw = (camera as { videoWidth?: number }).videoWidth ?? camera.width ?? 1;
  const ch = (camera as { videoHeight?: number }).videoHeight ?? camera.height ?? 1;
  // Cover-crop the camera into its rect.
  const scale = Math.max(r.w / cw, r.h / ch);
  const sw = r.w / scale;
  const sh = r.h / scale;

  ctx.save();
  ctx.globalAlpha = layout.cameraOpacity;
  if (style.shadow > 0 && layout.cameraCover < 0.99) {
    ctx.shadowColor = `rgba(0,0,0,${0.25 + style.shadow * 0.4})`;
    ctx.shadowBlur = 30 * unit;
    ctx.shadowOffsetY = 8 * unit;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, layout.cameraRadius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, layout.cameraRadius);
  ctx.clip();
  if (style.mirror) {
    ctx.translate(r.x * 2 + r.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(camera, (cw - sw) / 2, (ch - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function fadeFor(t: number, start: number, end: number, fadeIn = 120, fadeOut = 200): number {
  return clamp(Math.min((t - start) / fadeIn, (end - t) / fadeOut), 0, 1);
}

function drawKeystrokes(ctx: Ctx, scene: Scene, t: number, unit: number): void {
  const opts = scene.project.style.keystrokes;
  if (!opts.enabled) return;
  const hidden = new Set(scene.project.hiddenKeystrokes);
  const k = scene.keystrokes.find((s) => t >= s.start && t < s.end && !hidden.has(s.id));
  if (!k) return;
  const alpha = fadeFor(t, k.start, k.end);
  const s = unit * opts.size;
  const font = `600 ${Math.round(30 * s)}px "Segoe UI", system-ui, sans-serif`;
  ctx.save();
  ctx.font = font;
  const padX = 16 * s;
  const gap = 10 * s;
  const capH = 54 * s;
  const widths = k.keys.map((key) => Math.max(ctx.measureText(key).width + padX * 2, capH));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  let x = (scene.output.w - total) / 2;
  const y = scene.output.h - capH - 40 * unit - (scene.project.style.captions.enabled ? 120 * unit : 0);
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  k.keys.forEach((key, i) => {
    ctx.fillStyle = 'rgba(17,17,20,0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y + (1 - alpha) * 12 * s, widths[i], capH, 12 * s);
    ctx.fill();
    ctx.fillStyle = '#fafafa';
    ctx.fillText(key, x + widths[i] / 2, y + capH / 2 + (1 - alpha) * 12 * s);
    x += widths[i] + gap;
  });
  ctx.restore();
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(-2);
}

function drawCaption(ctx: Ctx, scene: Scene, t: number, unit: number): void {
  const opts = scene.project.style.captions;
  if (!opts.enabled) return;
  const caption = scene.project.captions.find((c) => t >= c.start && t < c.end);
  if (!caption) return;
  const s = unit * opts.size;
  ctx.save();
  ctx.font = `600 ${Math.round(40 * s)}px "Segoe UI", system-ui, sans-serif`;
  const lines = wrapLines(ctx, caption.text, scene.output.w * 0.8);
  const lineH = 52 * s;
  const boxH = lines.length * lineH + 28 * s;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48 * s;
  const x = (scene.output.w - boxW) / 2;
  const y = opts.position === 'top' ? 40 * unit : scene.output.h - boxH - 40 * unit;
  ctx.globalAlpha = fadeFor(t, caption.start, caption.end, 100, 100);
  ctx.fillStyle = 'rgba(10,10,12,0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 14 * s);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, scene.output.w / 2, y + 14 * s + lineH * (i + 0.5)));
  ctx.restore();
}

function drawWatermark(ctx: Ctx, output: Size, unit: number): void {
  const text = 'Made with ZoomPane';
  ctx.save();
  ctx.font = `600 ${Math.round(22 * unit)}px "Segoe UI", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 28 * unit;
  const h = 40 * unit;
  const x = output.w - w - 24 * unit;
  const y = output.h - h - 24 * unit;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 14 * unit, y + h / 2);
  ctx.restore();
}
