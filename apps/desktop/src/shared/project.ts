/**
 * The editable project model (project.json). Every timed item uses SOURCE time: milliseconds
 * from the first frame of screen.mp4. Cuts and speed changes live in `clips` and map source
 * time to output time, so editing them never shifts zooms, layouts or masks.
 */

export const PROJECT_VERSION = 1;

export interface Clip {
  id: string;
  start: number;
  end: number;
  /** Playback speed multiplier (1 = normal). */
  speed: number;
  /** Volume multiplier for every audio track in this clip (0..2). */
  volume: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in normalized (0..1) coordinates of the cropped source frame. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ZoomSegment {
  id: string;
  start: number;
  end: number;
  enabled: boolean;
  /** auto: follow the clicks and cursor. manual: hold on `focus`. */
  mode: 'auto' | 'manual';
  level: number;
  focus: Point;
  /** Cut straight in and out instead of animating. */
  instant: boolean;
}

export type CameraLayout = 'overlay' | 'fullscreen' | 'split' | 'hidden';

export interface LayoutSegment {
  id: string;
  start: number;
  end: number;
  layout: CameraLayout;
}

export interface MaskSegment {
  id: string;
  start: number;
  end: number;
  kind: 'blur' | 'highlight';
  rect: Rect;
  /** Blur amount or highlight dimming, 0..1. */
  strength: number;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

export type Background =
  | { kind: 'wallpaper'; id: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'color'; color: string }
  | { kind: 'image'; path: string };

export type AspectRatio = 'auto' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '4:5';

export type ClickEffect = 'none' | 'ripple' | 'pulse';

export interface CursorStyle {
  hidden: boolean;
  /** Size multiplier relative to the recorded cursor size. */
  size: number;
  /** 0 = raw movement, 1 = maximum smoothing. */
  smoothing: number;
  hideWhenIdle: boolean;
  idleSeconds: number;
  /** Glide back to the starting position at the end, for seamless loops. */
  loopPosition: boolean;
  /** Always draw the standard arrow instead of the recorded cursor shapes. */
  alwaysDefault: boolean;
  rotateWhileMoving: boolean;
  /** Freeze the cursor during the final moments (hides the trip to the stop button). */
  stopAtEnd: boolean;
  removeShakes: boolean;
  /** Ignore cursor-shape flickers shorter than ~120 ms. */
  optimizeTypes: boolean;
  clickEffect: ClickEffect;
  clickSound: boolean;
}

export type CameraCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface CameraStyle {
  corner: CameraCorner;
  /** Bubble size as a fraction of the output's shorter side. */
  size: number;
  shape: 'circle' | 'rounded' | 'square';
  mirror: boolean;
  shadow: number;
}

export type ZoomSpeed = 'slow' | 'medium' | 'fast';

export interface Style {
  background: Background;
  /** Background blur in px at 1080p. */
  backgroundBlur: number;
  /** Space around the recording as a fraction of the output's shorter side (0..0.25). */
  padding: number;
  /** Corner radius in px at 1080p. */
  radius: number;
  /** Inner frame thickness in px at 1080p. */
  inset: number;
  insetColor: string;
  /** Drop shadow strength 0..1. */
  shadow: number;
  aspect: AspectRatio;
  crop: Rect;
  /** Motion blur strength 0..1 (0 disables). */
  motionBlur: number;
  cursor: CursorStyle;
  camera: CameraStyle;
  zoom: { defaultLevel: number; speed: ZoomSpeed; auto: boolean };
  keystrokes: { enabled: boolean; size: number; showSingleKeys: boolean };
  captions: { enabled: boolean; size: number; position: 'bottom' | 'top' };
}

export interface AudioSettings {
  micVolume: number;
  systemVolume: number;
  noiseReduction: boolean;
  music: { path: string; volume: number } | null;
}

export interface Project {
  version: typeof PROJECT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  clips: Clip[];
  zooms: ZoomSegment[];
  layouts: LayoutSegment[];
  masks: MaskSegment[];
  captions: CaptionSegment[];
  /** Ids (`k<sourceMs>`) of detected keyboard shortcuts the user switched off. */
  hiddenKeystrokes: string[];
  style: Style;
  audio: AudioSettings;
}

export interface Preset {
  id: string;
  name: string;
  style: Omit<Style, 'crop'>;
}

export type ExportFormat = 'mp4' | 'gif';

export interface ExportSettings {
  format: ExportFormat;
  /** Output height in px for 16:9 (the shorter side for other aspect ratios). */
  resolution: 720 | 1080 | 1440 | 2160;
  fps: 24 | 30 | 60;
  quality: 'small' | 'balanced' | 'best';
}

export const DEFAULT_STYLE: Style = {
  background: { kind: 'wallpaper', id: 'aurora' },
  backgroundBlur: 0,
  padding: 0.08,
  radius: 14,
  inset: 0,
  insetColor: '#ffffff',
  shadow: 0.6,
  aspect: 'auto',
  crop: { x: 0, y: 0, w: 1, h: 1 },
  motionBlur: 0.5,
  cursor: {
    hidden: false,
    size: 1.6,
    smoothing: 0.6,
    hideWhenIdle: true,
    idleSeconds: 2.5,
    loopPosition: false,
    alwaysDefault: false,
    rotateWhileMoving: false,
    stopAtEnd: true,
    removeShakes: true,
    optimizeTypes: true,
    clickEffect: 'ripple',
    clickSound: false,
  },
  camera: { corner: 'bottom-right', size: 0.24, shape: 'circle', mirror: true, shadow: 0.5 },
  zoom: { defaultLevel: 2, speed: 'medium', auto: true },
  keystrokes: { enabled: false, size: 1, showSingleKeys: false },
  captions: { enabled: false, size: 1, position: 'bottom' },
};

export const DEFAULT_AUDIO: AudioSettings = {
  micVolume: 1,
  systemVolume: 0.8,
  noiseReduction: false,
  music: null,
};

export const DEFAULT_EXPORT: ExportSettings = { format: 'mp4', resolution: 1080, fps: 60, quality: 'balanced' };

export function newId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10);
}
