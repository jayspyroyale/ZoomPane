import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Project, Rect } from '@shared/project';
import { fitRect, outputSize } from '@/engine/layout';
import { drawFrame, recordingRectAt } from '@/engine/render';
import { clamp } from '@/engine/track';
import { clampFocus } from '@/engine/zoom';
import { backgroundImageFor } from './backgroundImage';
import { useEnv } from './context';
import { RectEditor } from './RectEditor';
import { useEditor, useProject } from './store';

const RESOLUTION_STEP = 90;

function useElementSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The live composition. Shows drag handles for the selected mask or manual zoom. */
export function Preview({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const env = useEnv();
  const project = useProject();
  const selection = useEditor((s) => s.selection);
  useEditor((s) => s.playhead); // re-render overlays as the playhead moves
  const containerRef = useRef<HTMLDivElement>(null);
  const box = useElementSize(containerRef);

  const mask = selection?.kind === 'mask' ? project.masks.find((m) => m.id === selection.id) : undefined;
  const zoom = selection?.kind === 'zoom' ? project.zooms.find((z) => z.id === selection.id && z.mode === 'manual') : undefined;
  // While placing a mask or zoom focus, show the whole (unzoomed) recording.
  const editing = !!(mask || zoom);
  const viewProject = useMemo<Project>(() => (editing ? { ...project, zooms: [] } : project), [project, editing]);

  const [backgroundImage, setBackgroundImage] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    let live = true;
    void backgroundImageFor(project).then((img) => live && setBackgroundImage(img));
    return () => {
      live = false;
    };
  }, [project]);

  // Fit the output into the available space; render at the displayed pixel density.
  const { manifest } = env.loaded.data;
  const crop = project.style.crop;
  const unitSize = outputSize(project.style.aspect, { w: crop.w * manifest.video.width, h: crop.h * manifest.video.height }, 1000);
  const fitted = box.w > 0 ? fitRect({ x: 0, y: 0, w: box.w, h: box.h }, unitSize.w / unitSize.h) : null;
  const displayShort = fitted ? Math.min(fitted.w, fitted.h) * window.devicePixelRatio : 720;
  const resolution = clamp(Math.round(displayShort / RESOLUTION_STEP) * RESOLUTION_STEP, 360, 1080);

  const scene = useMemo(
    () => env.builder.build(viewProject, { resolution, fps: 60, watermark: env.watermark, backgroundImage }),
    [env, viewProject, resolution, backgroundImage],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== scene.output.w || canvas.height !== scene.output.h) {
      canvas.width = scene.output.w;
      canvas.height = scene.output.h;
    }
    const { screen, camera } = env.player;
    drawFrame(canvas.getContext('2d')!, scene, env.player.sourceTime, {
      screen: screen.readyState >= 2 ? screen : null,
      camera: camera && camera.readyState >= 2 ? camera : null,
    });
  }, [canvasRef, env, scene]);

  useEffect(() => {
    draw();
    return env.player.onFrame(draw);
  }, [draw, env]);

  const preview = useEditor((s) => s.preview);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);

  let recordingBox: Rect | null = null;
  if (fitted && editing) {
    const r = recordingRectAt(scene, env.player.sourceTime);
    const k = fitted.w / scene.output.w;
    recordingBox = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
  }

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1" onPointerDown={() => editing && select(null)}>
      {fitted && (
        <div className="absolute overflow-hidden rounded-md shadow-2xl ring-1 ring-line" style={{ left: fitted.x, top: fitted.y, width: fitted.w, height: fitted.h }}>
          <canvas ref={canvasRef} className="h-full w-full" />
          {recordingBox && mask && (
            <RectEditor
              box={recordingBox}
              rect={mask.rect}
              color="var(--color-mask)"
              onChange={(rect) => preview((p) => ({ ...p, masks: p.masks.map((m) => (m.id === mask.id ? { ...m, rect } : m)) }))}
              onCommit={commit}
            />
          )}
          {recordingBox && zoom && (
            <RectEditor
              box={recordingBox}
              resizable={false}
              color="var(--color-zoom)"
              rect={{ x: zoom.focus.x - 0.5 / zoom.level, y: zoom.focus.y - 0.5 / zoom.level, w: 1 / zoom.level, h: 1 / zoom.level }}
              onChange={(r) => {
                const focus = clampFocus({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, zoom.level);
                preview((p) => ({ ...p, zooms: p.zooms.map((z) => (z.id === zoom.id ? { ...z, focus } : z)) }));
              }}
              onCommit={commit}
            >
              <span className="absolute -top-6 left-0 rounded bg-zoom px-1.5 py-0.5 text-[11px] font-medium text-white">Zoom area · {zoom.level.toFixed(1)}×</span>
            </RectEditor>
          )}
        </div>
      )}
    </div>
  );
}
