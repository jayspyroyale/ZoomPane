import { useRecorderState } from '@/lib/hooks';

/** Full-display overlay showing 3 · 2 · 1 before recording starts (excluded from capture). */
export default function Countdown() {
  const state = useRecorderState();
  const remaining = state.status === 'countdown' ? state.remaining : null;
  if (remaining === null) return null;
  return (
    <div className="flex h-full items-center justify-center">
      <div
        key={remaining}
        className="flex h-44 w-44 items-center justify-center rounded-full bg-black/70 font-display text-8xl font-semibold text-white shadow-2xl backdrop-blur animate-[pulse_1s_ease-out]"
      >
        {remaining}
      </div>
    </div>
  );
}
