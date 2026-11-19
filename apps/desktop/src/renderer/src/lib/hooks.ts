import { useEffect, useState } from 'react';
import type { AppSettings, LicenseStatus } from '@shared/api';
import type { RecorderState } from '@shared/recording';
import { api } from './api';

export function useSettings(): [AppSettings | null, (patch: Partial<AppSettings>) => void] {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    void api.settings.get().then(setSettings);
    return api.settings.onChange(setSettings);
  }, []);
  const update = (patch: Partial<AppSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    void api.settings.update(patch);
  };
  return [settings, update];
}

export function useLicense(): LicenseStatus | null {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  useEffect(() => {
    void api.license.status().then(setStatus);
    return api.license.onChange(setStatus);
  }, []);
  return status;
}

export function useRecorderState(): RecorderState {
  const [state, setState] = useState<RecorderState>({ status: 'idle' });
  useEffect(() => {
    void api.recorder.state().then(setState);
    return api.recorder.onState(setState);
  }, []);
  return state;
}

/** Re-renders every `ms` milliseconds while `active`. */
export function useTicker(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}
