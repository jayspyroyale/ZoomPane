import { Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useRecorderState, useTicker } from '@/lib/hooks';
import { startCameraRecorder } from './cameraRecorder';

/** Floating recording controls. Excluded from capture, so it never appears in the video. */
export default function Toolbar() {
  const state = useRecorderState();
  const recording = state.status === 'recording';
  const paused = recording && state.pausedAt !== null;
  const now = useTicker(recording && !paused, 200);

  useEffect(() => {
    let stop: (() => Promise<void>) | null = null;
    return api.recorder.onCameraCommand(async (command) => {
      if (command.type === 'start') stop = await startCameraRecorder(command.deviceId);
      else {
        await stop?.();
        stop = null;
      }
    });
  }, []);

  const elapsed = recording ? (state.pausedAt ?? now) - state.startedAt - state.pausedMs : 0;

  return (
    <div className="flex h-full items-center justify-center p-2">
      <div className="drag flex h-14 items-center gap-1 rounded-2xl bg-[#111114]/95 px-2 shadow-[0_8px_30px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => api.recorder.stop()}
          disabled={!recording}
          className="no-drag flex h-10 items-center gap-2 rounded-xl bg-accent px-3.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          title="Stop and edit"
        >
          <Square size={14} fill="currentColor" />
          <span className="w-12 text-left tabular-nums">{state.status === 'finishing' ? '…' : formatTime(elapsed)}</span>
        </button>
        <span className={`mx-1.5 h-2.5 w-2.5 rounded-full ${paused ? 'bg-mask' : 'bg-danger animate-pulse'}`} />
        <ToolButton label={paused ? 'Resume' : 'Pause'} onClick={() => (paused ? api.recorder.resume() : api.recorder.pause())} disabled={!recording}>
          {paused ? <Play size={17} /> : <Pause size={17} />}
        </ToolButton>
        <ToolButton label="Restart" onClick={() => api.recorder.restart()} disabled={!recording}>
          <RotateCcw size={17} />
        </ToolButton>
        <ToolButton label="Discard" onClick={() => api.recorder.cancel()} disabled={!recording}>
          <Trash2 size={17} />
        </ToolButton>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="no-drag flex h-10 w-10 items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
