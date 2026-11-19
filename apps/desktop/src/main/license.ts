import { app, safeStorage } from 'electron';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { normalizeLicenseKey, verifyLicense } from '@zoompane/license';
import type { LicenseStatus } from '@shared/api';
import { LICENSE_PUBLIC_KEY } from './license-key';
import log from './log';

/** Website that sells and activates licenses. Override with MAIN_VITE_API_BASE at build time. */
export const API_BASE: string = import.meta.env.MAIN_VITE_API_BASE ?? 'https://zoompane.app';

const REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface Stored {
  deviceId: string;
  token: string | null;
}

/**
 * Holds the signed license token (encrypted with Windows DPAPI via safeStorage) and keeps it
 * fresh. The app works offline until the token expires; refreshes happen in the background.
 */
class License extends EventEmitter<{ change: [LicenseStatus] }> {
  private readonly file = join(app.getPath('userData'), 'license.dat');
  private stored: Stored = this.load();
  private status: LicenseStatus = this.evaluate();

  private load(): Stored {
    try {
      const raw = readFileSync(this.file);
      const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
      return JSON.parse(json) as Stored;
    } catch {
      return { deviceId: crypto.randomUUID(), token: null };
    }
  }

  private persist(): void {
    const json = JSON.stringify(this.stored);
    writeFileSync(this.file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : json);
  }

  private evaluate(): LicenseStatus {
    const token = this.stored.token;
    if (!token) return { state: 'unlicensed' };
    const result = verifyLicense(token, LICENSE_PUBLIC_KEY, { device: this.stored.deviceId });
    if (result.valid) {
      const p = result.payload;
      return { state: 'active', email: p.email, plan: p.plan, key: p.key, expiresAt: p.exp * 1000 };
    }
    if (result.reason === 'expired') return { state: 'expired', message: 'Your license needs to be renewed or re-checked online.' };
    return { state: 'invalid', message: 'The saved license is not valid on this device.' };
  }

  private update(): LicenseStatus {
    this.status = this.evaluate();
    this.emit('change', this.status);
    return this.status;
  }

  get current(): LicenseStatus {
    return this.status;
  }

  get isPro(): boolean {
    return this.status.state === 'active';
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Server error (${response.status})`);
    return data;
  }

  async activate(input: string): Promise<LicenseStatus> {
    const key = normalizeLicenseKey(input);
    if (!key) return { ...this.status, message: 'That does not look like a ZoomPane license key (ZP-XXXX-XXXX-XXXX-XXXX).' };
    try {
      const { token } = await this.post<{ token: string }>('/api/license/activate', {
        key,
        device: this.stored.deviceId,
        deviceName: hostname(),
      });
      const check = verifyLicense(token, LICENSE_PUBLIC_KEY, { device: this.stored.deviceId });
      if (!check.valid) throw new Error('The server returned an invalid license.');
      this.stored.token = token;
      this.persist();
      return this.update();
    } catch (error) {
      return { ...this.status, message: (error as Error).message };
    }
  }

  async deactivate(): Promise<LicenseStatus> {
    const key = this.status.key;
    if (key) {
      await this.post('/api/license/deactivate', { key, device: this.stored.deviceId }).catch((e) => log.warn('deactivate', e));
    }
    this.stored.token = null;
    this.persist();
    return this.update();
  }

  /** Re-issues the token when it nears expiry. Ends the license if the server reports it inactive. */
  async refresh(): Promise<void> {
    const key = this.status.key ?? this.decodeKey();
    if (!key) return;
    if (this.status.state === 'active' && (this.status.expiresAt ?? 0) - Date.now() > REFRESH_WITHIN_MS) return;
    try {
      const { token } = await this.post<{ token: string }>('/api/license/activate', {
        key,
        device: this.stored.deviceId,
        deviceName: hostname(),
      });
      this.stored.token = token;
    } catch (error) {
      const message = (error as Error).message;
      log.warn('license refresh', message);
      // Network problems keep the current token; an explicit rejection removes it.
      if (!/fetch|network|timeout|server error/i.test(message)) this.stored.token = null;
    }
    this.persist();
    this.update();
  }

  /** The key from an expired token (its payload is still readable). */
  private decodeKey(): string | null {
    try {
      const body = this.stored.token?.split('.')[0];
      return body ? (JSON.parse(Buffer.from(body, 'base64url').toString()) as { key: string }).key : null;
    } catch {
      return null;
    }
  }

  startBackgroundRefresh(): void {
    void this.refresh();
    setInterval(() => void this.refresh(), RECHECK_INTERVAL_MS).unref();
  }
}

let instance: License | undefined;

export function license(): License {
  instance ??= new License();
  return instance;
}
