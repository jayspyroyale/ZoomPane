/** 75_300 → "1:15" (or "1:15.3" with tenths). */
export function formatTime(ms: number, tenths = false): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  const whole = Math.floor(seconds);
  const base = `${minutes}:${String(whole).padStart(2, '0')}`;
  return tenths ? `${base}.${Math.floor((seconds - whole) * 10)}` : base;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const percent = (v: number): string => `${Math.round(v * 100)}%`;
