import { CheckCircle2, Copy, FolderOpen, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_EXPORT, type ExportSettings } from '@shared/project';
import { exportVideo, isCancelled } from '@/export/exportVideo';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { Button, Field, Segmented } from '@/ui/controls';
import { useEnv } from './context';
import { useEditor } from './store';

type Phase = { kind: 'idle' } | { kind: 'running'; progress: number } | { kind: 'done'; path: string } | { kind: 'error'; message: string };

export function ExportDialog() {
  const env = useEnv();
  const setDialog = useEditor((s) => s.setDialog);
  const [appSettings, updateSettings] = useSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const settings: ExportSettings = appSettings?.export ?? DEFAULT_EXPORT;
  const set = (patch: Partial<ExportSettings>) => updateSettings({ export: { ...settings, ...patch } });

  useEffect(() => () => abort.current?.abort(), []);

  const close = () => {
    abort.current?.abort();
    setDialog(null);
  };

  const start = async () => {
    const project = useEditor.getState().project!;
    const handle = await api.exporter.begin(project.name, settings.format);
    if (!handle) return;
    env.player.pause();
    abort.current = new AbortController();
    setPhase({ kind: 'running', progress: 0 });
    try {
      await exportVideo({
        loaded: env.loaded,
        project,
        settings,
        handle,
        signal: abort.current.signal,
        onProgress: (progress) => setPhase({ kind: 'running', progress }),
      });
      setPhase({ kind: 'done', path: handle.path });
    } catch (err) {
      setPhase(isCancelled(err) ? { kind: 'idle' } : { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      abort.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" onPointerDown={(e) => e.target === e.currentTarget && phase.kind !== 'running' && close()}>
      <div className="w-[420px] rounded-2xl bg-panel shadow-2xl ring-1 ring-line">
        <div className="flex h-12 items-center justify-between border-b border-line px-5">
          <h2 className="font-semibold">Export</h2>
          <button type="button" aria-label="Close" className="text-muted hover:text-ink" onClick={close}>
            <X size={16} />
          </button>
        </div>

        {phase.kind === 'done' ? (
          <div className="space-y-4 p-5 text-center">
            <CheckCircle2 size={36} className="mx-auto text-layout" />
            <div>
              <div className="font-medium">Export complete</div>
              <div className="mt-1 truncate text-xs text-muted" title={phase.path}>
                {phase.path}
              </div>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={() => api.exporter.reveal(phase.path)}>
                <FolderOpen size={15} /> Show in folder
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await api.exporter.copyFile(phase.path);
                  setCopied(true);
                }}
              >
                <Copy size={15} /> {copied ? 'Copied' : 'Copy to clipboard'}
              </Button>
            </div>
            <p className="text-xs text-faint">The copied file pastes straight into Slack, Teams, Discord or Explorer.</p>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <Field label="Format">
              <Segmented
                value={settings.format}
                onChange={(format) => set({ format })}
                options={[
                  { value: 'mp4', label: 'MP4 video' },
                  { value: 'gif', label: 'GIF' },
                ]}
              />
            </Field>
            <Field label="Resolution" hint={settings.format === 'gif' ? 'GIFs are capped at 720p to keep them small' : undefined}>
              <Segmented
                value={settings.resolution}
                onChange={(resolution) => set({ resolution })}
                options={[
                  { value: 720, label: '720p' },
                  { value: 1080, label: '1080p' },
                  { value: 1440, label: '1440p' },
                  { value: 2160, label: '4K' },
                ]}
              />
            </Field>
            <Field label="Frame rate">
              <Segmented
                value={settings.fps}
                onChange={(fps) => set({ fps })}
                options={[
                  { value: 24, label: '24 fps' },
                  { value: 30, label: '30 fps' },
                  { value: 60, label: '60 fps' },
                ]}
              />
            </Field>
            {settings.format === 'mp4' && (
              <Field label="Quality">
                <Segmented
                  value={settings.quality}
                  onChange={(quality) => set({ quality })}
                  options={[
                    { value: 'small', label: 'Smaller file' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'best', label: 'Best' },
                  ]}
                />
              </Field>
            )}
            {phase.kind === 'error' && <p className="rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">{phase.message}</p>}

            {phase.kind === 'running' ? (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${phase.progress * 100}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Exporting… {Math.round(phase.progress * 100)}%</span>
                  <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="w-full" onClick={start}>
                Export {settings.format.toUpperCase()}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
