import { dialog, shell } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OpenedProject, ProjectSummary } from '@shared/api';
import type { Project } from '@shared/project';
import type { RecordingManifest } from '@shared/recording';
import { media } from './media';
import { settings } from './settings';

const MANIFEST = 'recording.json';
const PROJECT = 'project.json';
const THUMBNAIL = 'thumbnail.jpg';

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function recordedDuration(m: RecordingManifest): number {
  const paused = m.pauses.reduce((sum, p) => sum + (p.endMs - p.startMs), 0);
  return Math.max(0, m.stoppedMs - m.video.startMs - paused);
}

/** Writes via a temp file + rename so a crash never leaves a half-written project. */
async function writeAtomic(path: string, data: string | Buffer): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export const projects = {
  async list(): Promise<ProjectSummary[]> {
    const root = settings().get().projectsDir;
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    const summaries = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e): Promise<ProjectSummary | null> => {
          const dir = join(root, e.name);
          const manifest = await readJson<RecordingManifest>(join(dir, MANIFEST));
          if (!manifest) return null;
          const project = await readJson<Project>(join(dir, PROJECT));
          const thumb = join(dir, THUMBNAIL);
          return {
            dir,
            name: project?.name ?? e.name.replace(/\.zoompane$/, ''),
            createdAt: manifest.createdAt,
            durationMs: recordedDuration(manifest),
            thumbnail: existsSync(thumb) ? thumb : null,
          };
        }),
    );
    return summaries.filter((s): s is ProjectSummary => s !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async open(dir: string): Promise<OpenedProject> {
    const manifest = await readJson<RecordingManifest>(join(dir, MANIFEST));
    if (!manifest) throw new Error('This folder is not a ZoomPane recording, or the recording did not finish.');
    media.allow(dir);
    const input = await readFile(join(dir, manifest.inputFile), 'utf8').catch(() => '');
    const project = await readJson<Project>(join(dir, PROJECT));
    return { dir, manifest, input, project };
  },

  async save(dir: string, project: Project, thumbnail?: string): Promise<void> {
    await writeAtomic(join(dir, PROJECT), JSON.stringify(project, null, 2));
    if (thumbnail?.startsWith('data:image/jpeg;base64,')) {
      await writeAtomic(join(dir, THUMBNAIL), Buffer.from(thumbnail.split(',')[1], 'base64'));
    }
  },

  async remove(dir: string): Promise<void> {
    if (!existsSync(join(dir, MANIFEST))) throw new Error('Not a ZoomPane project');
    await shell.trashItem(dir);
  },

  async browse(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Open a ZoomPane project',
      defaultPath: settings().get().projectsDir,
      properties: ['openDirectory'],
    });
    const dir = result.filePaths[0];
    if (!dir) return null;
    if (!existsSync(join(dir, MANIFEST))) throw new Error('That folder is not a ZoomPane project (.zoompane).');
    return dir;
  },
};
