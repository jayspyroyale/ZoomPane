import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Rect } from '@shared/project';
import { clamp } from '@/engine/track';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const MIN_SIZE = 0.03;
const HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'ne', 'sw', 'se'];

/**
 * A draggable (and optionally resizable) rectangle in normalized coordinates of `box`
 * (pixels relative to the positioned parent). Calls onChange while dragging, onCommit at the end.
 */
export function RectEditor({
  box,
  rect,
  onChange,
  onCommit,
  resizable = true,
  color = 'var(--color-accent)',
  children,
}: {
  box: Rect;
  rect: Rect;
  onChange: (rect: Rect) => void;
  onCommit: () => void;
  resizable?: boolean;
  color?: string;
  children?: ReactNode;
}) {
  const begin = (handle: Handle) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, rect };

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.w;
      const dy = (ev.clientY - start.y) / box.h;
      onChange(applyDrag(start.rect, handle, dx, dy));
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      onCommit();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  return (
    <div
      className="absolute cursor-move rounded-[3px]"
      style={{
        left: box.x + rect.x * box.w,
        top: box.y + rect.y * box.h,
        width: rect.w * box.w,
        height: rect.h * box.h,
        outline: `2px solid ${color}`,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)',
      }}
      onPointerDown={begin('move')}
    >
      {children}
      {resizable &&
        HANDLES.map((h) => (
          <span
            key={h}
            onPointerDown={begin(h)}
            className="absolute h-3 w-3 rounded-full bg-white shadow ring-2"
            style={{
              ['--tw-ring-color' as string]: color,
              left: h.includes('w') ? -6 : undefined,
              right: h.includes('e') ? -6 : undefined,
              top: h.includes('n') ? -6 : undefined,
              bottom: h.includes('s') ? -6 : undefined,
              cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
            }}
          />
        ))}
    </div>
  );
}

function applyDrag(r: Rect, handle: Handle, dx: number, dy: number): Rect {
  if (handle === 'move') {
    return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
  }
  let { x, y, w, h } = r;
  if (handle.includes('w')) {
    const nx = clamp(x + dx, 0, x + w - MIN_SIZE);
    w += x - nx;
    x = nx;
  } else {
    w = clamp(w + dx, MIN_SIZE, 1 - x);
  }
  if (handle.includes('n')) {
    const ny = clamp(y + dy, 0, y + h - MIN_SIZE);
    h += y - ny;
    y = ny;
  } else {
    h = clamp(h + dy, MIN_SIZE, 1 - y);
  }
  return { x, y, w, h };
}
