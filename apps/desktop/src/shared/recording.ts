/**
 * Types for the raw recording written by the capture sidecar (recording.json + input.jsonl).
 * All `*Ms` / `t` timestamps share one QPC-based millisecond clock; subtract `video.startMs`
 * to get time within screen.mp4.
 */

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SourceKind = 'display' | 'window' | 'area';

export interface DisplaySource {
  id: string;
  name: string;
  bounds: Bounds;
  scale: number;
  primary: boolean;
}

export interface WindowSource {
  id: string;
  title: string;
  process: string;
  bounds: Bounds;
  minimized: boolean;
}

export interface CaptureSources {
  displays: DisplaySource[];
  windows: WindowSource[];
}

export interface Microphone {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface AudioTrack {
  file: string;
  startMs: number;
  sampleRate: number;
  channels: number;
  device: string;
}

export interface CameraTrack {
  file: string;
  startMs: number;
  width: number;
  height: number;
}

export interface CustomCursor {
  id: string;
  file: string;
  hotX: number;
  hotY: number;
  width: number;
  height: number;
}

export interface RecordingManifest {
  version: 1;
  createdAt: string;
  source: {
    kind: SourceKind;
    /** Physical-pixel bounds of the display (display/area) or the window at start (window). */
    bounds: Bounds;
    scale: number;
    /** Area recordings: region within the display, in physical pixels relative to the display. */
    crop?: Bounds;
    title?: string;
  };
  video: { file: string; width: number; height: number; fps: number; startMs: number };
  microphone?: AudioTrack;
  systemAudio?: AudioTrack;
  camera?: CameraTrack;
  inputFile: string;
  customCursors: CustomCursor[];
  pauses: { startMs: number; endMs: number }[];
  stoppedMs: number;
}

export type MouseButton = 'left' | 'right' | 'middle';

export type InputEvent =
  | { type: 'move'; t: number; x: number; y: number }
  | { type: 'down' | 'up'; t: number; button: MouseButton; x: number; y: number }
  | { type: 'wheel'; t: number; dx: number; dy: number; x: number; y: number }
  | { type: 'keydown' | 'keyup'; t: number; vk: number }
  | { type: 'cursor'; t: number; id: string }
  | { type: 'window'; t: number; x: number; y: number; w: number; h: number };

/** What the user picked in the launcher. */
export type SourceSelection =
  | { kind: 'display'; displayId: string }
  | { kind: 'window'; windowId: string }
  | { kind: 'area'; displayId: string; crop: Bounds };

export interface RecordingOptions {
  source: SourceSelection;
  fps: 30 | 60;
  microphone: { enabled: boolean; deviceId: string | null };
  systemAudio: boolean;
  camera: { enabled: boolean; deviceId: string | null };
  recordKeys: boolean;
  countdownSeconds: 0 | 3 | 5;
  hideDesktopIcons: boolean;
}

export type RecorderState =
  | { status: 'idle' }
  | { status: 'countdown'; remaining: number }
  | { status: 'recording'; startedAt: number; pausedMs: number; pausedAt: number | null }
  | { status: 'finishing' };
