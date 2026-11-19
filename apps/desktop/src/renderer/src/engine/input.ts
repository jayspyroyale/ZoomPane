import type { InputEvent, MouseButton, RecordingManifest } from '@shared/recording';

export interface Move {
  t: number;
  x: number;
  y: number;
}

export interface Click extends Move {
  button: MouseButton;
}

export interface KeyPress {
  t: number;
  vk: number;
  down: boolean;
}

export interface ShapeChange {
  t: number;
  id: string;
}

/**
 * Input events converted to the recording's frame: `t` is ms since the first video frame,
 * and x/y are pixels inside screen.mp4 (window recordings follow the window as it moves).
 */
export interface InputData {
  moves: Move[];
  clicks: Click[];
  keys: KeyPress[];
  shapes: ShapeChange[];
}

export function parseInputLog(text: string): InputEvent[] {
  const events: InputEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as InputEvent);
    } catch {
      // A crash can truncate the final line; skip it.
    }
  }
  return events.sort((a, b) => a.t - b.t);
}

export function buildInputData(events: InputEvent[], manifest: RecordingManifest): InputData {
  const t0 = manifest.video.startMs;
  let origin = { x: manifest.source.bounds.x, y: manifest.source.bounds.y };
  const data: InputData = { moves: [], clicks: [], keys: [], shapes: [] };

  for (const e of events) {
    const t = e.t - t0;
    switch (e.type) {
      case 'window':
        origin = { x: e.x, y: e.y };
        break;
      case 'move':
        data.moves.push({ t, x: e.x - origin.x, y: e.y - origin.y });
        break;
      case 'down':
        data.clicks.push({ t, x: e.x - origin.x, y: e.y - origin.y, button: e.button });
        // A click is also a known cursor position.
        data.moves.push({ t, x: e.x - origin.x, y: e.y - origin.y });
        break;
      case 'keydown':
      case 'keyup':
        data.keys.push({ t, vk: e.vk, down: e.type === 'keydown' });
        break;
      case 'cursor':
        data.shapes.push({ t, id: e.id });
        break;
    }
  }
  data.moves.sort((a, b) => a.t - b.t);
  return data;
}
