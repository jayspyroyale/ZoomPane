import { useEffect, useRef, useState } from 'react';
import type { Bounds } from '@shared/recording';
import { api } from '@/lib/api';

/** Drag a rectangle over the display to choose the recording area. Esc cancels, Enter confirms. */
export default function AreaSelector() {
  const [rect, setRect] = useState<Bounds | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') api.area.submit(null);
      if (e.key === 'Enter' && rect) api.area.submit(rect);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rect]);

  const onDown = (e: React.PointerEvent) => {
    origin.current = { x: e.clientX, y: e.clientY };
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const o = origin.current;
    if (!o) return;
    setRect({ x: Math.min(o.x, e.clientX), y: Math.min(o.y, e.clientY), w: Math.abs(e.clientX - o.x), h: Math.abs(e.clientY - o.y) });
  };
  const onUp = () => {
    origin.current = null;
  };

  return (
    <div className="relative h-full w-full cursor-crosshair" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <mask id="hole">
            <rect width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#hole)" />
        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke="#ff6a3d" strokeWidth={2} strokeDasharray="6 4" />}
      </svg>

      {rect && rect.w > 0 && (
        <div className="pointer-events-none absolute rounded-md bg-black/80 px-2 py-1 text-xs text-white tabular-nums" style={{ left: rect.x, top: Math.max(rect.y - 30, 4) }}>
          {Math.round(rect.w * devicePixelRatio)} × {Math.round(rect.h * devicePixelRatio)}
        </div>
      )}

      <div className="absolute top-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-black/80 px-4 py-2.5 text-sm text-white shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
        <span>{rect && rect.w > 16 ? 'Adjust by dragging again, then confirm' : 'Drag to select the area to record'}</span>
        <button type="button" className="rounded-md px-2.5 py-1 text-white/70 hover:bg-white/10" onClick={() => api.area.submit(null)}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!rect || rect.w < 16 || rect.h < 16}
          className="rounded-md bg-accent px-3 py-1 font-medium disabled:opacity-40"
          onClick={() => rect && api.area.submit(rect)}
        >
          Use this area
        </button>
      </div>
    </div>
  );
}
