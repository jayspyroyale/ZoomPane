import { BrowserWindow, desktopCapturer, screen, type Display } from 'electron';
import type { SourceThumbnails } from '@shared/api';
import type { CaptureSources, DisplaySource, SourceSelection } from '@shared/recording';
import { sidecar } from './sidecar';

/** HWNDs of our own windows, so they never show up as recordable sources. */
function ownWindowIds(): Set<string> {
  return new Set(
    BrowserWindow.getAllWindows().map((w) => {
      const handle = w.getNativeWindowHandle();
      return (handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString();
    }),
  );
}

export async function listSources(): Promise<CaptureSources> {
  const sources = await sidecar.call<CaptureSources>('listSources');
  const own = ownWindowIds();
  return { ...sources, windows: sources.windows.filter((w) => !own.has(w.id)) };
}

/** Physical-pixel bounds of an Electron display (Electron reports DIPs). */
function physicalBounds(display: Display): { x: number; y: number } {
  const r = screen.dipToScreenRect(null, display.bounds);
  return { x: r.x, y: r.y };
}

export function electronDisplayFor(source: DisplaySource): Display {
  return (
    screen.getAllDisplays().find((d) => {
      const p = physicalBounds(d);
      return Math.abs(p.x - source.bounds.x) < 2 && Math.abs(p.y - source.bounds.y) < 2;
    }) ?? screen.getPrimaryDisplay()
  );
}

/** The Electron display a recording happens on (for placing the toolbar and countdown). */
export async function displayForSelection(selection: SourceSelection): Promise<Display> {
  const sources = await listSources();
  if (selection.kind === 'window') {
    const win = sources.windows.find((w) => w.id === selection.windowId);
    if (!win) return screen.getPrimaryDisplay();
    const center = screen.screenToDipPoint({ x: win.bounds.x + win.bounds.w / 2, y: win.bounds.y + win.bounds.h / 2 });
    return screen.getDisplayNearestPoint(center);
  }
  const display = sources.displays.find((d) => d.id === selection.displayId) ?? sources.displays[0];
  return display ? electronDisplayFor(display) : screen.getPrimaryDisplay();
}

export async function thumbnails(): Promise<SourceThumbnails> {
  const [sources, captured] = await Promise.all([
    listSources(),
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 300 } }),
  ]);
  const result: SourceThumbnails = {};
  for (const item of captured) {
    if (item.thumbnail.isEmpty()) continue;
    if (item.id.startsWith('window:')) {
      result[item.id.split(':')[1]] = item.thumbnail.toDataURL();
      continue;
    }
    const display = screen.getAllDisplays().find((d) => String(d.id) === item.display_id);
    if (!display) continue;
    const p = physicalBounds(display);
    const match = sources.displays.find((d) => Math.abs(d.bounds.x - p.x) < 2 && Math.abs(d.bounds.y - p.y) < 2);
    if (match) result[match.id] = item.thumbnail.toDataURL();
  }
  return result;
}
