import type { Project } from '@shared/project';
import { api } from '@/lib/api';

const cache = new Map<string, Promise<ImageBitmap | null>>();

/** The decoded image for an image background (cached per path), or null for other backgrounds. */
export function backgroundImageFor(project: Project): Promise<ImageBitmap | null> {
  const bg = project.style.background;
  if (bg.kind !== 'image') return Promise.resolve(null);
  let image = cache.get(bg.path);
  if (!image) {
    image = fetch(api.files.mediaUrl(bg.path))
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b))
      .catch(() => null);
    cache.set(bg.path, image);
  }
  return image;
}
