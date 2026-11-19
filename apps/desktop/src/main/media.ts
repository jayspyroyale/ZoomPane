import { protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { MEDIA_SCHEME } from '@shared/api';
import { settings } from './settings';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json',
};

const allowed = new Set<string>();

const key = (path: string): string => normalize(path).toLowerCase();

function isAllowed(path: string): boolean {
  const target = key(path);
  const roots = [key(settings().get().projectsDir), ...allowed];
  return roots.some((root) => target === root || target.startsWith(root.endsWith(sep) ? root : root + sep));
}

/**
 * `zp-media://file/<encoded absolute path>` serves local media to renderers, with HTTP range
 * support for <video> seeking. Only the projects folder and paths the user picked are served.
 */
export const media = {
  /** Must run before the app is ready. */
  registerScheme(): void {
    protocol.registerSchemesAsPrivileged([
      { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
    ]);
  },

  allow(path: string): void {
    allowed.add(key(path));
  },

  handle(): void {
    protocol.handle(MEDIA_SCHEME, async (request) => {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (!isAllowed(path)) return new Response('Forbidden', { status: 403 });

      let size: number;
      try {
        size = (await stat(path)).size;
      } catch {
        return new Response('Not found', { status: 404 });
      }

      const headers = new Headers({
        'Content-Type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });

      const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('Range') ?? '');
      if (!range || size === 0) {
        headers.set('Content-Length', String(size));
        return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { status: 200, headers });
      }

      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, Math.min(start, size - 1));
      end = Math.max(start, Math.min(end, size - 1));
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, { status: 206, headers });
    });
  },
};
