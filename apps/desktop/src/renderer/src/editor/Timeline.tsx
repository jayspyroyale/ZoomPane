import clsx from 'clsx';
import { Captions, Keyboard, Pause, Play, Plus, Scissors, SquareDashed, UserSquare, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Project } from '@shared/project';
import { detectKeystrokes } from '@/engine/keystrokes';
import { Timeline as TimeMap, trimClip } from '@/engine/timeline';
import { formatTime } from '@/lib/format';
import { IconButton, Kbd } from '@/ui/controls';
import { addCaption, addLayout, addMask, addZoom, splitAtPlayhead } from './actions';
import { seek, useEnv } from './context';
import { useEditor, useProject, type Selection } from './store';

const GUTTER = 16;
const MIN_SEGMENT_OUT_MS = 250;
const TICK_STEPS_S = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

type SegmentKey = 'zooms' | 'layouts' | 'masks' | 'captions';
type SegmentKind = Exclude<NonNullable<Selection>['kind'], 'clip'>;

const SEGMENT_KIND: Record<SegmentKey, SegmentKind> = { zooms: 'zoom', layouts: 'layout', masks: 'mask', captions: 'caption' };

/** Starts a pointer drag; `onMove` receives the horizontal delta in px. */
function drag(e: ReactPointerEvent, onMove: (dx: number) => void, onEnd: () => void): void {
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const move = (ev: PointerEvent) => onMove(ev.clientX - startX);
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    onEnd();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
}

export function TimelinePanel() {
  const env = useEnv();
  const project = useProject();
  const { playhead, playing, pxPerSecond, setPxPerSecond } = useEditor();
  const map = useMemo(() => new TimeMap(project.clips), [project.clips]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);

  const xOf = (outMs: number) => GUTTER + (outMs / 1000) * pxPerSecond;
  const outAt = (clientX: number) => {
    const el = scrollRef.current!;
    return ((clientX - el.getBoundingClientRect().left + el.scrollLeft - GUTTER) / pxPerSecond) * 1000;
  };
  const width = xOf(map.duration) + GUTTER * 4;

  // Fit the whole recording on first show.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || fitted.current || map.duration <= 0) return;
    fitted.current = true;
    setPxPerSecond((el.clientWidth - GUTTER * 3) / (map.duration / 1000));
  }, [map.duration, setPxPerSecond]);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = xOf(playhead);
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - 40;
  });

  const scrub = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    useEditor.getState().select(null);
    const start = outAt(e.clientX);
    seek(env, start);
    drag(e, (dx) => seek(env, start + (dx / pxPerSecond) * 1000), () => undefined);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    setPxPerSecond(pxPerSecond * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const hasCamera = !!env.loaded.data.manifest.camera;
  const hasKeys = env.loaded.data.input.keys.length > 0;

  return (
    <div className="flex h-full flex-col border-t border-line bg-panel">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
        <IconButton label={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={() => env.player.toggle()}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </IconButton>
        <div className="w-28 text-xs tabular-nums text-muted">
          <span className="text-ink">{formatTime(playhead, true)}</span> / {formatTime(map.duration)}
        </div>
        <div className="mx-1 h-5 w-px bg-line" />
        <ToolButton icon={<Scissors size={14} />} label="Split" shortcut="S" onClick={() => splitAtPlayhead(env)} />
        <ToolButton icon={<Plus size={14} />} label="Zoom" shortcut="Z" onClick={() => addZoom(env)} />
        <ToolButton icon={<SquareDashed size={14} />} label="Mask" shortcut="M" onClick={() => addMask(env)} />
        {hasCamera && <ToolButton icon={<UserSquare size={14} />} label="Layout" shortcut="L" onClick={() => addLayout(env)} />}
        <ToolButton icon={<Captions size={14} />} label="Caption" onClick={() => addCaption(env)} />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Zoom out timeline" onClick={() => setPxPerSecond(pxPerSecond / 1.4)}>
            <ZoomOut size={15} />
          </IconButton>
          <IconButton label="Zoom in timeline" onClick={() => setPxPerSecond(pxPerSecond * 1.4)}>
            <ZoomIn size={15} />
          </IconButton>
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto" onWheel={onWheel}>
        <div className="relative pb-3" style={{ width }}>
          <Ruler duration={map.duration} pxPerSecond={pxPerSecond} xOf={xOf} onPointerDown={scrub} />
          <div className="space-y-1.5 pt-1" onPointerDown={scrub}>
            <ClipTrack map={map} xOf={xOf} />
            <SegmentTrack field="zooms" map={map} xOf={xOf} color="bg-zoom" label={(z) => `${z.level.toFixed(1)}× ${z.mode === 'manual' ? 'manual' : 'auto'}`} dim={(z) => !z.enabled} />
            {hasCamera && <SegmentTrack field="layouts" map={map} xOf={xOf} color="bg-layout" label={(l) => layoutLabel[l.layout]} />}
            {project.masks.length > 0 && <SegmentTrack field="masks" map={map} xOf={xOf} color="bg-mask" label={(m) => (m.kind === 'blur' ? 'Blur' : 'Highlight')} />}
            {project.captions.length > 0 && <SegmentTrack field="captions" map={map} xOf={xOf} color="bg-caption" label={(c) => c.text} />}
            {hasKeys && <KeysTrack map={map} xOf={xOf} />}
          </div>
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: xOf(playhead) }}>
            <div className="absolute -top-0 -left-[5px] h-3 w-[11px] rounded-b-sm bg-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}

const layoutLabel = { overlay: 'Camera overlay', fullscreen: 'Camera fullscreen', split: 'Split screen', hidden: 'Camera hidden' } as const;

function ToolButton({ icon, label, shortcut, onClick }: { icon: ReactNode; label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted transition-colors hover:bg-hover hover:text-ink"
    >
      {icon}
      {label}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  );
}

function Ruler({ duration, pxPerSecond, xOf, onPointerDown }: { duration: number; pxPerSecond: number; xOf: (ms: number) => number; onPointerDown: (e: ReactPointerEvent) => void }) {
  const step = TICK_STEPS_S.find((s) => s * pxPerSecond >= 70) ?? 600;
  const ticks: number[] = [];
  for (let s = 0; s * 1000 <= duration + 1; s += step) ticks.push(s);
  return (
    <div className="relative h-6 cursor-ew-resize border-b border-line" onPointerDown={onPointerDown}>
      {ticks.map((s) => (
        <div key={s} className="absolute top-0 h-full border-l border-line pl-1 text-[10px] leading-6 text-faint tabular-nums" style={{ left: xOf(s * 1000) }}>
          {formatTime(s * 1000, step < 1)}
        </div>
      ))}
    </div>
  );
}

function ClipTrack({ map, xOf }: { map: TimeMap; xOf: (ms: number) => number }) {
  const env = useEnv();
  const { selection, select, preview, commit, pxPerSecond } = useEditor();
  const duration = env.loaded.data.durationMs;

  const trim = (e: ReactPointerEvent, id: string, edge: 'start' | 'end') => {
    const clips = map.clips.slice();
    const clip = clips.find((c) => c.id === id)!;
    const from = edge === 'start' ? clip.start : clip.end;
    select({ kind: 'clip', id });
    drag(
      e,
      (dx) => {
        const sourceDelta = (dx / pxPerSecond) * 1000 * clip.speed;
        preview((p) => ({ ...p, clips: trimClip(clips, id, edge, from + sourceDelta, duration) }));
      },
      commit,
    );
  };

  return (
    <div className="relative h-14">
      {map.placed.map(({ clip, outStart, outEnd }) => {
        const selected = selection?.kind === 'clip' && selection.id === clip.id;
        return (
          <div
            key={clip.id}
            onPointerDown={(e) => {
              e.stopPropagation();
              select({ kind: 'clip', id: clip.id });
            }}
            className={clsx(
              'group absolute top-0 flex h-full items-center overflow-hidden rounded-lg bg-[#2b2b36] px-3 text-xs ring-inset',
              selected ? 'ring-2 ring-accent' : 'ring-1 ring-white/5 hover:ring-white/20',
            )}
            style={{ left: xOf(outStart) + 1, width: Math.max(4, xOf(outEnd) - xOf(outStart) - 2) }}
          >
            <span className="truncate text-muted">
              {clip.speed !== 1 && <span className="mr-1.5 rounded bg-accent-soft px-1 text-accent">{clip.speed}×</span>}
              {clip.volume === 0 ? 'Muted' : formatTime((clip.end - clip.start) / clip.speed, true)}
            </span>
            <TrimHandle side="left" onPointerDown={(e) => trim(e, clip.id, 'start')} />
            <TrimHandle side="right" onPointerDown={(e) => trim(e, clip.id, 'end')} />
          </div>
        );
      })}
    </div>
  );
}

function TrimHandle({ side, onPointerDown }: { side: 'left' | 'right'; onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      className={clsx('absolute top-0 h-full w-2 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/15', side === 'left' ? 'left-0' : 'right-0')}
    />
  );
}

type SegmentOf<K extends SegmentKey> = Project[K][number];

function SegmentTrack<K extends SegmentKey>({
  field,
  map,
  xOf,
  color,
  label,
  dim,
}: {
  field: K;
  map: TimeMap;
  xOf: (ms: number) => number;
  color: string;
  label: (item: SegmentOf<K>) => string;
  dim?: (item: SegmentOf<K>) => boolean;
}) {
  const env = useEnv();
  const project = useProject();
  const { selection, select, preview, commit, pxPerSecond } = useEditor();
  const kind = SEGMENT_KIND[field];
  const items = project[field] as SegmentOf<K>[];

  const begin = (e: ReactPointerEvent, item: SegmentOf<K>, mode: 'move' | 'start' | 'end') => {
    select({ kind, id: item.id } as Selection);
    const outStart = map.toOutputClamped(item.start);
    const outEnd = map.toOutputClamped(item.end);
    // Clicking a segment also moves the playhead into it, so the preview shows its effect.
    const now = env.player.outputTime;
    if (now < outStart || now >= outEnd) seek(env, outStart);
    drag(
      e,
      (dx) => {
        let d = (dx / pxPerSecond) * 1000;
        let s = outStart;
        let en = outEnd;
        if (mode === 'move') {
          d = Math.min(Math.max(d, -outStart), map.duration - outEnd);
          s += d;
          en += d;
        } else if (mode === 'start') s = Math.min(Math.max(0, s + d), en - MIN_SEGMENT_OUT_MS);
        else en = Math.max(Math.min(map.duration, en + d), s + MIN_SEGMENT_OUT_MS);
        const span = { start: map.toSource(s).source, end: map.toSource(en).source };
        preview((p) => ({ ...p, [field]: (p[field] as SegmentOf<K>[]).map((it) => (it.id === item.id ? { ...it, ...span } : it)) }));
      },
      commit,
    );
  };

  return (
    <div className="relative h-8">
      {items.map((item) => {
        const left = xOf(map.toOutputClamped(item.start));
        const w = xOf(map.toOutputClamped(item.end)) - left;
        if (w < 2) return null;
        const selected = selection?.kind === kind && selection.id === item.id;
        return (
          <div
            key={item.id}
            onPointerDown={(e) => begin(e, item, 'move')}
            className={clsx(
              'group absolute top-0 flex h-full cursor-grab items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white active:cursor-grabbing',
              color,
              selected ? 'ring-2 ring-white' : 'opacity-85 hover:opacity-100',
              dim?.(item) && 'opacity-40',
            )}
            style={{ left: left + 1, width: Math.max(6, w - 2) }}
          >
            <span className="truncate">{label(item)}</span>
            <TrimHandle side="left" onPointerDown={(e) => begin(e, item, 'start')} />
            <TrimHandle side="right" onPointerDown={(e) => begin(e, item, 'end')} />
          </div>
        );
      })}
    </div>
  );
}

function KeysTrack({ map, xOf }: { map: TimeMap; xOf: (ms: number) => number }) {
  const env = useEnv();
  const project = useProject();
  const edit = useEditor((s) => s.edit);
  const keystrokes = useMemo(
    () => detectKeystrokes(env.loaded.data.input.keys, project.style.keystrokes.showSingleKeys),
    [env, project.style.keystrokes.showSingleKeys],
  );
  const hidden = new Set(project.hiddenKeystrokes);
  if (!project.style.keystrokes.enabled || !keystrokes.length) return null;

  const toggle = (id: string) =>
    edit((p) => ({
      ...p,
      hiddenKeystrokes: p.hiddenKeystrokes.includes(id) ? p.hiddenKeystrokes.filter((h) => h !== id) : [...p.hiddenKeystrokes, id],
    }));

  return (
    <div className="relative h-7">
      {keystrokes.map((k) => {
        const out = map.toOutput(k.start);
        if (out === null) return null;
        return (
          <button
            type="button"
            key={k.id}
            title={hidden.has(k.id) ? 'Hidden – click to show' : 'Click to hide this shortcut'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggle(k.id)}
            className={clsx(
              'absolute top-0.5 flex h-6 items-center gap-1 rounded-md bg-keys/85 px-1.5 text-[10px] font-medium whitespace-nowrap text-white',
              hidden.has(k.id) && 'opacity-35 line-through',
            )}
            style={{ left: xOf(out) }}
          >
            <Keyboard size={11} />
            {k.keys.join(' + ')}
          </button>
        );
      })}
    </div>
  );
}
