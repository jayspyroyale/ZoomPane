import clsx from 'clsx';
import { AppWindow, Crop, Keyboard, Mic, Monitor, Timer, Video, Volume2, EyeOff, Circle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSettings, SourceThumbnails } from '@shared/api';
import type { CaptureSources, Microphone, RecordingOptions, SourceKind } from '@shared/recording';
import { api } from '@/lib/api';
import { Button, Segmented, Select, Spinner, Toggle } from '@/ui/controls';
import { CameraPreview } from './CameraPreview';

function acceleratorLabel(accelerator: string): string {
  return accelerator.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
}

export function RecordView({ settings, updateSettings }: { settings: AppSettings; updateSettings: (p: Partial<AppSettings>) => void }) {
  const options = settings.recording;
  const [sources, setSources] = useState<CaptureSources | null>(null);
  const [thumbs, setThumbs] = useState<SourceThumbnails>({});
  const [mics, setMics] = useState<Microphone[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [kind, setKind] = useState<SourceKind>(options.source.kind);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const setOptions = useCallback((patch: Partial<RecordingOptions>) => updateSettings({ recording: { ...options, ...patch } }), [options, updateSettings]);

  const refresh = useCallback(async () => {
    const [list, micList] = await Promise.all([api.sources.list(), api.sources.microphones()]);
    setSources(list);
    setMics(micList);
    void api.sources.thumbnails().then(setThumbs);
    const devices = await navigator.mediaDevices.enumerateDevices();
    setCameras(devices.filter((d) => d.kind === 'videoinput'));
  }, []);

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  // Pick a sensible default display/window when the saved one no longer exists.
  const selection = useMemo(() => {
    if (!sources) return null;
    const src = options.source;
    if (kind === 'window') {
      const id = src.kind === 'window' && sources.windows.some((w) => w.id === src.windowId) ? src.windowId : sources.windows[0]?.id;
      return id ? { kind: 'window' as const, windowId: id } : null;
    }
    const displayId = 'displayId' in src && sources.displays.some((d) => d.id === src.displayId) ? src.displayId : sources.displays[0]?.id;
    if (!displayId) return null;
    if (kind === 'area') return src.kind === 'area' && src.displayId === displayId ? src : null;
    return { kind: 'display' as const, displayId };
  }, [sources, options.source, kind]);

  const selectArea = async (displayId: string) => {
    const crop = await api.area.select(displayId);
    if (crop) setOptions({ source: { kind: 'area', displayId, crop } });
  };

  const start = async () => {
    if (!selection) return;
    setStarting(true);
    setError(null);
    try {
      await api.recorder.start({ ...options, source: selection });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-3">
        <div className="flex-1">
          <Segmented
            value={kind}
            onChange={setKind}
            size="sm"
            options={[
              { value: 'display', label: <><Monitor size={14} /> Display</> },
              { value: 'window', label: <><AppWindow size={14} /> Window</> },
              { value: 'area', label: <><Crop size={14} /> Area</> },
            ]}
          />
        </div>
        <button type="button" title="Refresh sources" onClick={() => void refresh()} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!sources ? (
          <div className="flex h-40 items-center justify-center text-muted">
            <Spinner />
          </div>
        ) : kind === 'window' ? (
          <div className="grid grid-cols-2 gap-2">
            {sources.windows.map((w) => (
              <SourceCard
                key={w.id}
                title={w.title}
                subtitle={w.process}
                thumbnail={thumbs[w.id]}
                selected={selection?.kind === 'window' && selection.windowId === w.id}
                onClick={() => setOptions({ source: { kind: 'window', windowId: w.id } })}
              />
            ))}
            {sources.windows.length === 0 && <p className="col-span-2 py-8 text-center text-muted">No windows to record.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {sources.displays.map((d, i) => {
              const isSelected = selection && 'displayId' in selection && selection.displayId === d.id;
              const area = kind === 'area' && selection?.kind === 'area' && isSelected ? selection.crop : null;
              return (
                <SourceCard
                  key={d.id}
                  title={`Display ${i + 1}${d.primary ? ' (main)' : ''}`}
                  subtitle={area ? `Area ${area.w} × ${area.h}` : `${d.bounds.w} × ${d.bounds.h}`}
                  thumbnail={thumbs[d.id]}
                  selected={!!isSelected && (kind !== 'area' || !!area)}
                  onClick={() => (kind === 'area' ? void selectArea(d.id) : setOptions({ source: { kind: 'display', displayId: d.id } }))}
                  badge={kind === 'area' ? (area ? 'Change area' : 'Select area') : undefined}
                />
              );
            })}
          </div>
        )}

        <div className="mt-4 space-y-1 rounded-xl bg-panel p-1.5 ring-1 ring-line">
          <DeviceRow icon={<Mic size={15} />} label="Microphone">
            <Select
              value={options.microphone.enabled ? (options.microphone.deviceId ?? 'default') : 'off'}
              onChange={(v) => setOptions({ microphone: v === 'off' ? { enabled: false, deviceId: null } : { enabled: true, deviceId: v === 'default' ? null : v } })}
              options={[{ value: 'off', label: 'No microphone' }, { value: 'default', label: 'Default microphone' }, ...mics.map((m) => ({ value: m.id, label: m.name }))]}
              className="w-52"
            />
          </DeviceRow>
          <DeviceRow icon={<Volume2 size={15} />} label="System audio">
            <Toggle checked={options.systemAudio} onChange={(v) => setOptions({ systemAudio: v })} label="System audio" />
          </DeviceRow>
          <DeviceRow icon={<Video size={15} />} label="Camera">
            <Select
              value={options.camera.enabled ? (options.camera.deviceId ?? 'default') : 'off'}
              onChange={(v) => setOptions({ camera: v === 'off' ? { enabled: false, deviceId: null } : { enabled: true, deviceId: v === 'default' ? null : v } })}
              options={[{ value: 'off', label: 'No camera' }, { value: 'default', label: 'Default camera' }, ...cameras.map((c, i) => ({ value: c.deviceId, label: c.label || `Camera ${i + 1}` }))]}
              className="w-52"
            />
          </DeviceRow>
          {options.camera.enabled && <CameraPreview deviceId={options.camera.deviceId} />}
          <DeviceRow icon={<Keyboard size={15} />} label="Record keyboard shortcuts">
            <Toggle checked={options.recordKeys} onChange={(v) => setOptions({ recordKeys: v })} label="Record keys" />
          </DeviceRow>
          <DeviceRow icon={<EyeOff size={15} />} label="Hide desktop icons">
            <Toggle checked={options.hideDesktopIcons} onChange={(v) => setOptions({ hideDesktopIcons: v })} label="Hide desktop icons" />
          </DeviceRow>
          <DeviceRow icon={<Timer size={15} />} label="Countdown">
            <Segmented
              size="sm"
              value={options.countdownSeconds}
              onChange={(v) => setOptions({ countdownSeconds: v })}
              options={[
                { value: 0, label: 'Off' },
                { value: 3, label: '3s' },
                { value: 5, label: '5s' },
              ]}
            />
          </DeviceRow>
          <DeviceRow icon={<Circle size={15} />} label="Frame rate">
            <Segmented
              size="sm"
              value={options.fps}
              onChange={(v) => setOptions({ fps: v })}
              options={[
                { value: 30, label: '30 fps' },
                { value: 60, label: '60 fps' },
              ]}
            />
          </DeviceRow>
        </div>
      </div>

      <div className="space-y-2 border-t border-line px-4 py-3">
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button variant="primary" size="lg" className="w-full" disabled={!selection || starting} onClick={() => void start()}>
          {starting ? <Spinner /> : <span className="h-3 w-3 rounded-full bg-white" />}
          {kind === 'area' && !selection ? 'Select an area first' : 'Start recording'}
        </Button>
        <p className="text-center text-xs text-faint">Start or stop anywhere with {acceleratorLabel(settings.shortcuts.toggleRecording)}</p>
      </div>
    </div>
  );
}

function SourceCard(props: { title: string; subtitle?: string; thumbnail?: string; selected: boolean; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={clsx(
        'group overflow-hidden rounded-xl bg-panel text-left ring-1 transition-all',
        props.selected ? 'ring-2 ring-accent' : 'ring-line hover:ring-faint',
      )}
    >
      <div className="relative aspect-video bg-canvas">
        {props.thumbnail ? <img src={props.thumbnail} alt="" className="h-full w-full object-contain" /> : <div className="checker h-full w-full opacity-40" />}
        {props.badge && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            {props.badge}
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="truncate text-[13px] font-medium">{props.title}</div>
        {props.subtitle && <div className="truncate text-xs text-muted">{props.subtitle}</div>}
      </div>
    </button>
  );
}

function DeviceRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-3 rounded-lg px-2.5 hover:bg-raised">
      <span className="text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {children}
    </div>
  );
}
