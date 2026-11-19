import { app, clipboard, ClipboardItem, dialog, nativeImage, shell } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { open, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ExportHandle } from '@shared/api';
import { sidecar } from './sidecar';

/** Open export files: the renderer streams encoded chunks here at explicit byte positions. */
const handles = new Map<string, { file: FileHandle; path: string }>();
let lastDir: string | null = null;

function exportsDir(): string {
  const dir = lastDir ?? join(app.getPath('videos'), 'ZoomPane Exports');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'ZoomPane export';
}

export const exporter = {
  async begin(suggestedName: string, format: 'mp4' | 'gif'): Promise<ExportHandle | null> {
    const result = await dialog.showSaveDialog({
      title: 'Export video',
      defaultPath: join(exportsDir(), `${safeName(suggestedName)}.${format}`),
      filters: [format === 'mp4' ? { name: 'MP4 video', extensions: ['mp4'] } : { name: 'GIF animation', extensions: ['gif'] }],
    });
    if (result.canceled || !result.filePath) return null;
    lastDir = join(result.filePath, '..');
    const id = crypto.randomUUID();
    handles.set(id, { file: await open(result.filePath, 'w'), path: result.filePath });
    return { id, path: result.filePath };
  },

  /** Opens `name` inside a project folder (e.g. a remuxed camera file). */
  async createInProject(dir: string, name: string): Promise<ExportHandle> {
    if (!existsSync(join(dir, 'recording.json')) || basename(name) !== name) throw new Error('Invalid project file');
    const path = join(dir, name);
    const id = crypto.randomUUID();
    handles.set(id, { file: await open(path, 'w'), path });
    return { id, path };
  },

  async write(id: string, position: number, data: Uint8Array): Promise<void> {
    const handle = handles.get(id);
    if (!handle) throw new Error('Export was closed');
    await handle.file.write(data, 0, data.byteLength, position);
  },

  async finish(id: string): Promise<void> {
    const handle = handles.get(id);
    handles.delete(id);
    await handle?.file.close();
  },

  async abort(id: string): Promise<void> {
    const handle = handles.get(id);
    handles.delete(id);
    if (!handle) return;
    await handle.file.close();
    await unlink(handle.path).catch(() => undefined);
  },

  reveal(path: string): void {
    shell.showItemInFolder(path);
  },

  /** Puts the file itself on the clipboard (CF_HDROP) so it pastes into chat apps and Explorer. */
  async copyFile(path: string): Promise<void> {
    await sidecar.call('copyFiles', { paths: [path] });
  },

  async copyImage(dataUrl: string): Promise<void> {
    const png = nativeImage.createFromDataURL(dataUrl).toPNG();
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
  },

  async saveText(suggestedName: string, text: string, extension: string): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      defaultPath: join(exportsDir(), `${safeName(suggestedName)}.${extension}`),
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, text, 'utf8');
    return result.filePath;
  },
};
