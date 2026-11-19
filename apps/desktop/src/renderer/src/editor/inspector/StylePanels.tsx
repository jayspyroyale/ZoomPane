import { Download, Music, RefreshCw, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AspectRatio, CameraCorner, ClickEffect, ZoomSpeed } from '@shared/project';
import { toSrt, transcribeMicrophone } from '@/captions/transcribe';
import { fitRect } from '@/engine/layout';
import { Timeline } from '@/engine/timeline';
import { api } from '@/lib/api';
import { percent } from '@/lib/format';
import { Button, Field, Section, Segmented, Select } from '@/ui/controls';
import { regenerateAutoZooms, removeAllZooms, speedUpTyping } from '../actions';
import { useEnv } from '../context';
import { RectEditor } from '../RectEditor';
import { useEditor } from '../store';
import { commitEdit, px, SliderField, times, ToggleField, useStyleEdit } from './common';

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: 'auto', label: 'Auto (recording)' },
  { value: '16:9', label: '16:9 Widescreen' },
  { value: '9:16', label: '9:16 Vertical' },
  { value: '1:1', label: '1:1 Square' },
  { value: '4:3', label: '4:3 Standard' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:5', label: '4:5 Social' },
];

export function FramePanel() {
  const { style, set } = useStyleEdit();
  return (
    <>
      <Section title="Canvas">
        <Field label="Aspect ratio">
          <Select className="w-full" value={style.aspect} options={ASPECTS} onChange={(aspect) => set({ aspect })} />
        </Field>
        <SliderField label="Padding" value={style.padding} min={0} max={0.25} step={0.005} format={percent} onChange={(padding) => set({ padding }, true)} />
        <SliderField label="Rounded corners" value={style.radius} min={0} max={60} step={1} format={px} onChange={(radius) => set({ radius }, true)} />
        <SliderField label="Inset" hint="A frame drawn inside the rounded corners" value={style.inset} min={0} max={40} step={1} format={px} onChange={(inset) => set({ inset }, true)} />
        {style.inset > 0 && (
          <Field label="Inset color" inline>
            <input type="color" value={style.insetColor} onChange={(e) => set({ insetColor: e.target.value }, true)} onBlur={commitEdit} className="h-7 w-10 cursor-pointer rounded bg-transparent" />
          </Field>
        )}
        <SliderField label="Motion blur" value={style.motionBlur} min={0} max={1} format={percent} onChange={(motionBlur) => set({ motionBlur }, true)} />
      </Section>
      <Section title="Crop" action={<Button size="sm" variant="ghost" onClick={() => set({ crop: { x: 0, y: 0, w: 1, h: 1 } })}>Reset</Button>}>
        <CropEditor />
      </Section>
    </>
  );
}

/** Shows the full recorded frame with a draggable crop rectangle. */
function CropEditor() {
  const env = useEnv();
  const { style, set } = useStyleEdit();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = env.loaded.data.manifest.video;
  const box = fitRect({ x: 0, y: 0, w: 288, h: 180 }, width / height);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || env.player.screen.readyState < 2) return;
      canvas.getContext('2d')!.drawImage(env.player.screen, 0, 0, canvas.width, canvas.height);
    };
    draw();
    return env.player.onFrame(draw);
  }, [env]);

  return (
    <div className="relative mx-auto" style={{ width: box.w, height: box.h }}>
      <canvas ref={canvasRef} width={Math.round(box.w * 2)} height={Math.round(box.h * 2)} className="absolute inset-0 h-full w-full rounded bg-black" />
      <div className="absolute inset-0 overflow-hidden rounded">
        <RectEditor box={{ x: 0, y: 0, w: box.w, h: box.h }} rect={style.crop} onChange={(crop) => set({ crop }, true)} onCommit={commitEdit} />
      </div>
    </div>
  );
}

export function CursorPanel() {
  const { style, set } = useStyleEdit();
  const c = style.cursor;
  const setCursor = (patch: Partial<typeof c>, live?: boolean) => set({ cursor: { ...c, ...patch } }, live);
  return (
    <>
      <Section title="Cursor">
        <ToggleField label="Hide cursor" checked={c.hidden} onChange={(hidden) => setCursor({ hidden })} />
        {!c.hidden && (
          <>
            <SliderField label="Size" value={c.size} min={0.5} max={4} step={0.05} format={times} onChange={(size) => setCursor({ size }, true)} />
            <SliderField label="Smooth movement" hint="Turns shaky mouse paths into smooth glides" value={c.smoothing} min={0} max={1} format={percent} onChange={(smoothing) => setCursor({ smoothing }, true)} />
            <Field label="Click effect">
              <Segmented<ClickEffect>
                size="sm"
                value={c.clickEffect}
                onChange={(clickEffect) => setCursor({ clickEffect })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'ripple', label: 'Ripple' },
                  { value: 'pulse', label: 'Pulse' },
                ]}
              />
            </Field>
            <ToggleField label="Click sound" checked={c.clickSound} onChange={(clickSound) => setCursor({ clickSound })} />
          </>
        )}
      </Section>
      {!c.hidden && (
        <Section title="Behavior">
          <ToggleField label="Hide when idle" checked={c.hideWhenIdle} onChange={(hideWhenIdle) => setCursor({ hideWhenIdle })} />
          {c.hideWhenIdle && <SliderField label="Idle after" value={c.idleSeconds} min={0.5} max={10} step={0.5} format={(v) => `${v}s`} onChange={(idleSeconds) => setCursor({ idleSeconds }, true)} />}
          <ToggleField label="Remove shakes" hint="Ignores tiny jitters" checked={c.removeShakes} onChange={(removeShakes) => setCursor({ removeShakes })} />
          <ToggleField label="Rotate while moving" checked={c.rotateWhileMoving} onChange={(rotateWhileMoving) => setCursor({ rotateWhileMoving })} />
          <ToggleField label="Always use arrow" hint="Ignore text and hand cursors" checked={c.alwaysDefault} onChange={(alwaysDefault) => setCursor({ alwaysDefault })} />
          <ToggleField label="Optimize cursor types" hint="Skip quick shape flickers" checked={c.optimizeTypes} onChange={(optimizeTypes) => setCursor({ optimizeTypes })} />
          <ToggleField label="Stop at end" hint="Hide the trip to the stop button" checked={c.stopAtEnd} onChange={(stopAtEnd) => setCursor({ stopAtEnd })} />
          <ToggleField label="Loop position" hint="Return to the start position for seamless loops" checked={c.loopPosition} onChange={(loopPosition) => setCursor({ loopPosition })} />
        </Section>
      )}
    </>
  );
}

export function ZoomPanel() {
  const env = useEnv();
  const { style, set } = useStyleEdit();
  const zooms = useEditor((s) => s.project!.zooms);
  const z = style.zoom;
  return (
    <Section title="Zoom">
      <ToggleField label="Automatic zoom" hint="Zoom in where you click" checked={z.auto} onChange={(auto) => set({ zoom: { ...z, auto } })} />
      <SliderField label="Default zoom level" value={z.defaultLevel} min={1.2} max={4} step={0.1} format={times} onChange={(defaultLevel) => set({ zoom: { ...z, defaultLevel } }, true)} />
      <Field label="Animation speed">
        <Segmented<ZoomSpeed>
          size="sm"
          value={z.speed}
          onChange={(speed) => set({ zoom: { ...z, speed } })}
          options={[
            { value: 'slow', label: 'Slow' },
            { value: 'medium', label: 'Medium' },
            { value: 'fast', label: 'Fast' },
          ]}
        />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={() => regenerateAutoZooms(env)}>
          <RefreshCw size={13} /> Regenerate auto zooms
        </Button>
        <Button size="sm" variant="danger" disabled={!zooms.length} onClick={removeAllZooms}>
          <Trash2 size={13} /> Remove all
        </Button>
      </div>
      <p className="text-xs text-muted">Add a zoom with Z, then drag it on the timeline. Manual zooms let you choose the exact area.</p>
    </Section>
  );
}

export function CameraPanel() {
  const { style, set } = useStyleEdit();
  const c = style.camera;
  const setCam = (patch: Partial<typeof c>, live?: boolean) => set({ camera: { ...c, ...patch } }, live);
  return (
    <Section title="Camera">
      <Field label="Position">
        <Segmented<CameraCorner>
          size="sm"
          value={c.corner}
          onChange={(corner) => setCam({ corner })}
          options={[
            { value: 'top-left', label: '↖' , title: 'Top left' },
            { value: 'top-right', label: '↗', title: 'Top right' },
            { value: 'bottom-left', label: '↙', title: 'Bottom left' },
            { value: 'bottom-right', label: '↘', title: 'Bottom right' },
          ]}
        />
      </Field>
      <Field label="Shape">
        <Segmented
          size="sm"
          value={c.shape}
          onChange={(shape) => setCam({ shape })}
          options={[
            { value: 'circle', label: 'Circle' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'square', label: 'Square' },
          ]}
        />
      </Field>
      <SliderField label="Size" value={c.size} min={0.1} max={0.5} step={0.01} format={percent} onChange={(size) => setCam({ size }, true)} />
      <SliderField label="Shadow" value={c.shadow} min={0} max={1} format={percent} onChange={(shadow) => setCam({ shadow }, true)} />
      <ToggleField label="Mirror" checked={c.mirror} onChange={(mirror) => setCam({ mirror })} />
      <p className="text-xs text-muted">Use layout segments (L) to go fullscreen, split screen or hide the camera at specific moments.</p>
    </Section>
  );
}

export function AudioPanel() {
  const env = useEnv();
  const audio = useEditor((s) => s.project!.audio);
  const edit = useEditor((s) => s.edit);
  const preview = useEditor((s) => s.preview);
  const set = (patch: Partial<typeof audio>, live?: boolean) => (live ? preview : edit)((p) => ({ ...p, audio: { ...p.audio, ...patch } }));
  const { manifest } = env.loaded.data;

  const pickMusic = async () => {
    const path = await api.files.pickAudio();
    if (path) set({ music: { path, volume: audio.music?.volume ?? 0.25 } });
  };

  return (
    <>
      <Section title="Recording">
        {manifest.microphone ? (
          <SliderField label="Microphone" value={audio.micVolume} min={0} max={2} format={percent} onChange={(micVolume) => set({ micVolume }, true)} />
        ) : (
          <p className="text-xs text-muted">No microphone was recorded.</p>
        )}
        {manifest.systemAudio && <SliderField label="System audio" value={audio.systemVolume} min={0} max={2} format={percent} onChange={(systemVolume) => set({ systemVolume }, true)} />}
        {manifest.microphone && <ToggleField label="Reduce noise" hint="Removes hum and background hiss from your voice" checked={audio.noiseReduction} onChange={(noiseReduction) => set({ noiseReduction })} />}
      </Section>
      <Section title="Background music">
        {audio.music ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <Music size={14} className="text-muted" />
              <span className="min-w-0 flex-1 truncate">{audio.music.path.split(/[\\/]/).pop()}</span>
              <button type="button" aria-label="Remove music" className="text-muted hover:text-ink" onClick={() => set({ music: null })}>
                <X size={14} />
              </button>
            </div>
            <SliderField label="Volume" value={audio.music.volume} min={0} max={1} format={percent} onChange={(volume) => set({ music: { ...audio.music!, volume } }, true)} />
          </>
        ) : (
          <Button size="sm" onClick={pickMusic}>
            <Music size={14} /> Add music…
          </Button>
        )}
      </Section>
    </>
  );
}

export function KeysPanel() {
  const env = useEnv();
  const { style, set } = useStyleEdit();
  const k = style.keystrokes;
  const [result, setResult] = useState<string | null>(null);
  const hasKeys = env.loaded.data.input.keys.length > 0;
  return (
    <>
      <Section title="Keyboard shortcuts">
        {!hasKeys && <p className="text-xs text-muted">No key presses were recorded. Turn on “Record keystrokes” before recording.</p>}
        <ToggleField label="Show shortcuts" hint="Displays shortcuts like Ctrl + C on screen" checked={k.enabled} onChange={(enabled) => set({ keystrokes: { ...k, enabled } })} />
        <ToggleField label="Include single keys" hint="Also show Enter, Tab, arrows…" checked={k.showSingleKeys} onChange={(showSingleKeys) => set({ keystrokes: { ...k, showSingleKeys } })} />
        <SliderField label="Size" value={k.size} min={0.6} max={2} step={0.05} format={times} onChange={(size) => set({ keystrokes: { ...k, size } }, true)} />
        <p className="text-xs text-muted">Click a shortcut on the timeline to hide it.</p>
      </Section>
      <Section title="Typing">
        <Button size="sm" disabled={!hasKeys} onClick={() => setResult(`${speedUpTyping(env)} typing section(s) sped up 4×.`)}>
          <Wand2 size={14} /> Speed up typing
        </Button>
        {result && <p className="text-xs text-muted">{result}</p>}
      </Section>
    </>
  );
}

export function CaptionsPanel() {
  const env = useEnv();
  const project = useEditor((s) => s.project!);
  const edit = useEditor((s) => s.edit);
  const { style, set } = useStyleEdit();
  const c = style.captions;
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!env.loaded.media.mic) return;
    setBusy(true);
    setStatus('Preparing…');
    try {
      const captions = await transcribeMicrophone(env.loaded.media.mic, env.loaded.data.manifest, (stage, p) =>
        setStatus(stage === 'download' ? `Downloading speech model (first time only)… ${Math.round(p * 100)}%` : 'Transcribing…'),
      );
      edit((p) => ({ ...p, captions, style: { ...p.style, captions: { ...p.style.captions, enabled: true } } }));
      setStatus(captions.length ? `Created ${captions.length} captions.` : 'No speech was found.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Transcription failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportSrt = async () => {
    const map = new Timeline(project.clips);
    await api.exporter.saveText(project.name, toSrt(project.captions, (t) => map.toOutputClamped(t)), 'srt');
  };

  return (
    <>
      <Section title="Captions">
        <Button size="sm" variant="primary" disabled={busy || !env.loaded.media.mic} onClick={generate}>
          <Sparkles size={14} /> {project.captions.length ? 'Regenerate captions' : 'Generate captions'}
        </Button>
        {!env.loaded.media.mic && <p className="text-xs text-muted">Captions are made from the microphone track, and this recording has none.</p>}
        {status && <p className="text-xs text-muted">{status}</p>}
        <p className="text-xs text-faint">Speech recognition runs on this PC. Your audio is never uploaded.</p>
      </Section>
      <Section title="Appearance">
        <ToggleField label="Show captions" checked={c.enabled} onChange={(enabled) => set({ captions: { ...c, enabled } })} />
        <SliderField label="Size" value={c.size} min={0.6} max={2} step={0.05} format={times} onChange={(size) => set({ captions: { ...c, size } }, true)} />
        <Field label="Position">
          <Segmented
            size="sm"
            value={c.position}
            onChange={(position) => set({ captions: { ...c, position } })}
            options={[
              { value: 'bottom', label: 'Bottom' },
              { value: 'top', label: 'Top' },
            ]}
          />
        </Field>
        <Button size="sm" disabled={!project.captions.length} onClick={exportSrt}>
          <Download size={14} /> Export .srt
        </Button>
      </Section>
    </>
  );
}
