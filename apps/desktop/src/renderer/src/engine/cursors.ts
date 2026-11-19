/**
 * Vector cursors drawn in a 32×32 design box. Each shape has its own hotspot and draws
 * crisply at any zoom level. Unknown (custom) cursors fall back to the PNG saved during recording.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface VectorCursor {
  hotX: number;
  hotY: number;
  draw: (ctx: Ctx, t: number) => void;
}

const FILL = '#ffffff';
const STROKE = '#111111';

function outlined(ctx: Ctx, path: Path2D, fill = FILL, stroke = STROKE, width = 1.6): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.stroke(path);
}

const ARROW = new Path2D('M2 2 L2 24.5 L7.6 19.3 L11.4 28 L15.3 26.3 L11.6 17.8 L19 17.8 Z');
const HAND = new Path2D(
  'M11 3.5c1.4 0 2.5 1.1 2.5 2.5v7.2c.4-.2.9-.3 1.4-.3 1.1 0 2 .6 2.4 1.5.4-.2.9-.4 1.4-.4 1.2 0 2.2.8 2.5 1.9.3-.1.7-.2 1-.2 1.4 0 2.5 1.1 2.5 2.5v5.3c0 3.9-3.1 7-7 7h-2.3c-2.3 0-4.4-1.1-5.7-3l-4.6-6.6c-.8-1.1-.5-2.6.6-3.4 1-.7 2.4-.5 3.2.4l1 1.1V6c0-1.4 1.1-2.5 2.5-2.5z',
);
const IBEAM = new Path2D('M10 3h4c1 0 1.6.4 2 1 .4-.6 1-1 2-1h4v2.4h-3.4c-.8 0-1.4.6-1.4 1.4v18.4c0 .8.6 1.4 1.4 1.4H22V29h-4c-1 0-1.6-.4-2-1-.4.6-1 1-2 1h-4v-2.4h3.4c.8 0 1.4-.6 1.4-1.4V6.8c0-.8-.6-1.4-1.4-1.4H10z');
const DOUBLE_ARROW = new Path2D('M2 16 L8 10 L8 14 L24 14 L24 10 L30 16 L24 22 L24 18 L8 18 L8 22 Z');
const CROSS = new Path2D('M14.8 3h2.4v11.8H29v2.4H17.2V29h-2.4V17.2H3v-2.4h11.8z');

function rotated(angleDeg: number, draw: (ctx: Ctx) => void): (ctx: Ctx) => void {
  return (ctx) => {
    ctx.save();
    ctx.translate(16, 16);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.translate(-16, -16);
    draw(ctx);
    ctx.restore();
  };
}

const doubleArrow = (ctx: Ctx): void => outlined(ctx, DOUBLE_ARROW);

function spinner(ctx: Ctx, t: number, cx: number, cy: number, r: number): void {
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(17,17,17,0.25)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#3b82f6';
  const a = (t / 1000) * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a, a + Math.PI * 1.2);
  ctx.stroke();
}

const CURSORS: Record<string, VectorCursor> = {
  arrow: { hotX: 2, hotY: 2, draw: (ctx) => outlined(ctx, ARROW) },
  hand: { hotX: 11, hotY: 3.5, draw: (ctx) => outlined(ctx, HAND) },
  ibeam: { hotX: 16, hotY: 16, draw: (ctx) => outlined(ctx, IBEAM, STROKE, FILL, 1.2) },
  cross: { hotX: 16, hotY: 16, draw: (ctx) => outlined(ctx, CROSS, STROKE, FILL, 1.2) },
  'size-we': { hotX: 16, hotY: 16, draw: doubleArrow },
  'size-ns': { hotX: 16, hotY: 16, draw: rotated(90, doubleArrow) },
  'size-nwse': { hotX: 16, hotY: 16, draw: rotated(45, doubleArrow) },
  'size-nesw': { hotX: 16, hotY: 16, draw: rotated(-45, doubleArrow) },
  'size-all': {
    hotX: 16,
    hotY: 16,
    draw: (ctx) => {
      doubleArrow(ctx);
      rotated(90, doubleArrow)(ctx);
    },
  },
  wait: { hotX: 16, hotY: 16, draw: (ctx, t) => spinner(ctx, t, 16, 16, 9) },
  progress: {
    hotX: 2,
    hotY: 2,
    draw: (ctx, t) => {
      outlined(ctx, ARROW);
      spinner(ctx, t, 24, 24, 5.5);
    },
  },
  no: {
    hotX: 16,
    hotY: 16,
    draw: (ctx) => {
      ctx.lineWidth = 6;
      ctx.strokeStyle = STROKE;
      ctx.beginPath();
      ctx.arc(16, 16, 10, 0, Math.PI * 2);
      ctx.moveTo(9, 9);
      ctx.lineTo(23, 23);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();
    },
  },
  help: {
    hotX: 2,
    hotY: 2,
    draw: (ctx) => {
      outlined(ctx, ARROW);
      ctx.font = 'bold 13px Segoe UI, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = FILL;
      ctx.strokeText('?', 19, 30);
      ctx.fillStyle = STROKE;
      ctx.fillText('?', 19, 30);
    },
  },
};

export const CURSOR_BOX = 32;

export function hasVectorCursor(id: string): boolean {
  return id in CURSORS;
}

/**
 * Draws a vector cursor so its hotspot lands on (x, y). `size` is the drawn height of the
 * 32-unit design box in px.
 */
export function drawVectorCursor(ctx: Ctx, id: string, x: number, y: number, size: number, rotationDeg: number, t: number): void {
  const cursor = CURSORS[id] ?? CURSORS.arrow;
  const s = size / CURSOR_BOX;
  ctx.save();
  ctx.translate(x, y);
  if (rotationDeg) ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.translate(-cursor.hotX, -cursor.hotY);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3 * s;
  ctx.shadowOffsetY = 1.5 * s;
  cursor.draw(ctx, t);
  ctx.restore();
}
