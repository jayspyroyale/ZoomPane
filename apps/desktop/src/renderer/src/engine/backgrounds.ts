import type { Background } from '@shared/project';
import type { Size } from './layout';

/** An original procedural wallpaper: a base gradient with soft colour blobs. */
interface Wallpaper {
  id: string;
  name: string;
  base: [string, string];
  blobs: { color: string; x: number; y: number; r: number }[];
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'aurora', name: 'Aurora', base: ['#0b1026', '#1b1f4b'], blobs: [{ color: '#22d3ee', x: 0.2, y: 0.25, r: 0.55 }, { color: '#a855f7', x: 0.8, y: 0.3, r: 0.5 }, { color: '#10b981', x: 0.55, y: 0.95, r: 0.6 }] },
  { id: 'sunset', name: 'Sunset', base: ['#2a0f2e', '#ff7a59'], blobs: [{ color: '#ffb347', x: 0.75, y: 0.8, r: 0.6 }, { color: '#e1306c', x: 0.15, y: 0.2, r: 0.5 }] },
  { id: 'lagoon', name: 'Lagoon', base: ['#032b44', '#0a6c74'], blobs: [{ color: '#5eead4', x: 0.85, y: 0.15, r: 0.45 }, { color: '#2563eb', x: 0.1, y: 0.9, r: 0.6 }] },
  { id: 'peach', name: 'Peach', base: ['#fde2e4', '#fad2b4'], blobs: [{ color: '#f9a8d4', x: 0.15, y: 0.15, r: 0.5 }, { color: '#fdba74', x: 0.9, y: 0.85, r: 0.55 }] },
  { id: 'forest', name: 'Forest', base: ['#071a12', '#12372a'], blobs: [{ color: '#84cc16', x: 0.8, y: 0.2, r: 0.45 }, { color: '#0d9488', x: 0.2, y: 0.85, r: 0.6 }] },
  { id: 'ember', name: 'Ember', base: ['#1a0a05', '#5c1a0b'], blobs: [{ color: '#f97316', x: 0.3, y: 0.7, r: 0.55 }, { color: '#facc15', x: 0.85, y: 0.15, r: 0.35 }] },
  { id: 'candy', name: 'Candy', base: ['#c084fc', '#f0abfc'], blobs: [{ color: '#60a5fa', x: 0.1, y: 0.8, r: 0.55 }, { color: '#fb7185', x: 0.9, y: 0.2, r: 0.5 }] },
  { id: 'dusk', name: 'Dusk', base: ['#141e30', '#35577d'], blobs: [{ color: '#f472b6', x: 0.85, y: 0.9, r: 0.5 }, { color: '#818cf8', x: 0.2, y: 0.1, r: 0.5 }] },
  { id: 'mint', name: 'Mint', base: ['#e0fff4', '#b8f2e6'], blobs: [{ color: '#7dd3fc', x: 0.85, y: 0.25, r: 0.5 }, { color: '#86efac', x: 0.15, y: 0.85, r: 0.55 }] },
  { id: 'graphite', name: 'Graphite', base: ['#0f0f12', '#26262c'], blobs: [{ color: '#52525b', x: 0.25, y: 0.2, r: 0.55 }, { color: '#3f3f46', x: 0.8, y: 0.85, r: 0.5 }] },
  { id: 'citrus', name: 'Citrus', base: ['#fff7cc', '#ffd166'], blobs: [{ color: '#06d6a0', x: 0.1, y: 0.9, r: 0.5 }, { color: '#ef476f', x: 0.95, y: 0.1, r: 0.4 }] },
  { id: 'nebula', name: 'Nebula', base: ['#0d0221', '#261447'], blobs: [{ color: '#ff3864', x: 0.75, y: 0.35, r: 0.4 }, { color: '#2de2e6', x: 0.25, y: 0.75, r: 0.45 }, { color: '#f6019d', x: 0.5, y: 0.05, r: 0.3 }] },
];

export const GRADIENT_PRESETS: { from: string; to: string; angle: number }[] = [
  { from: '#6366f1', to: '#ec4899', angle: 135 },
  { from: '#06b6d4', to: '#3b82f6', angle: 135 },
  { from: '#f59e0b', to: '#ef4444', angle: 135 },
  { from: '#10b981', to: '#14b8a6', angle: 160 },
  { from: '#1e293b', to: '#0f172a', angle: 180 },
  { from: '#f472b6', to: '#fb923c', angle: 120 },
  { from: '#a3e635', to: '#22c55e', angle: 140 },
  { from: '#e2e8f0', to: '#94a3b8', angle: 180 },
];

export const COLOR_PRESETS = ['#0f172a', '#111111', '#ffffff', '#f1f5f9', '#1d4ed8', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#facc15'];

type Ctx2D = OffscreenCanvasRenderingContext2D;

function linearGradient(ctx: Ctx2D, size: Size, from: string, to: string, angleDeg: number): CanvasGradient {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  const r = Math.hypot(size.w, size.h) / 2;
  const cx = size.w / 2;
  const cy = size.h / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

function paintWallpaper(ctx: Ctx2D, size: Size, wp: Wallpaper): void {
  ctx.fillStyle = linearGradient(ctx, size, wp.base[0], wp.base[1], 160);
  ctx.fillRect(0, 0, size.w, size.h);
  const span = Math.max(size.w, size.h);
  ctx.globalCompositeOperation = 'screen';
  for (const blob of wp.blobs) {
    const x = blob.x * size.w;
    const y = blob.y * size.h;
    const r = blob.r * span;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, blob.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size.w, size.h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawCover(ctx: Ctx2D, image: CanvasImageSource & { width: number; height: number }, size: Size): void {
  const scale = Math.max(size.w / image.width, size.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (size.w - w) / 2, (size.h - h) / 2, w, h);
}

/** Renders a background once per output size; the compositor then blits it every frame. */
export function renderBackground(
  background: Background,
  size: Size,
  blurPx: number,
  image: (CanvasImageSource & { width: number; height: number }) | null,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.w, size.h);
  const ctx = canvas.getContext('2d')!;
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  // Over-draw slightly so blurred edges do not fade to transparent.
  const pad = blurPx * 2;
  if (pad) {
    ctx.translate(-pad, -pad);
    size = { w: size.w + pad * 2, h: size.h + pad * 2 };
  }
  switch (background.kind) {
    case 'wallpaper':
      paintWallpaper(ctx, size, WALLPAPERS.find((w) => w.id === background.id) ?? WALLPAPERS[0]);
      break;
    case 'gradient':
      ctx.fillStyle = linearGradient(ctx, size, background.from, background.to, background.angle);
      ctx.fillRect(0, 0, size.w, size.h);
      break;
    case 'color':
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, size.w, size.h);
      break;
    case 'image':
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, size.w, size.h);
      if (image) drawCover(ctx, image, size);
      break;
  }
  return canvas;
}
