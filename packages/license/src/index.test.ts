import { describe, expect, it } from 'vitest';
import {
  generateLicenseKey,
  generateSigningKeys,
  normalizeLicenseKey,
  signLicense,
  verifyLicense,
  type LicensePayload,
} from './index.ts';

const keys = generateSigningKeys();
const payload: LicensePayload = {
  v: 1,
  key: 'ZP-AAAA-BBBB-CCCC-DDDD',
  plan: 'yearly',
  email: 'buyer@example.com',
  device: 'device-1',
  iat: 1_000,
  exp: 2_000,
};

describe('license keys', () => {
  it('generates normalizable keys', () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^ZP-[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
    expect(normalizeLicenseKey(key.toLowerCase().replaceAll('-', ' '))).toBe(key);
  });

  it('rejects malformed keys', () => {
    expect(normalizeLicenseKey('ZP-1234')).toBeNull();
    expect(normalizeLicenseKey('ZP-OOOO-AAAA-BBBB-CCCC')).toBeNull();
  });
});

describe('license tokens', () => {
  const token = signLicense(payload, keys.privateKey);

  it('verifies a valid token', () => {
    expect(verifyLicense(token, keys.publicKey, { device: 'device-1', now: 1_500 })).toEqual({ valid: true, payload });
  });

  it('rejects expired tokens, other devices and tampering', () => {
    expect(verifyLicense(token, keys.publicKey, { now: 2_000 })).toEqual({ valid: false, reason: 'expired' });
    expect(verifyLicense(token, keys.publicKey, { device: 'other', now: 1_500 })).toEqual({ valid: false, reason: 'device' });
    const forged = Buffer.from(JSON.stringify({ ...payload, plan: 'monthly' })).toString('base64url') + '.' + token.split('.')[1];
    expect(verifyLicense(forged, keys.publicKey, { now: 1_500 })).toEqual({ valid: false, reason: 'signature' });
    expect(verifyLicense(token, generateSigningKeys().publicKey, { now: 1_500 })).toEqual({ valid: false, reason: 'signature' });
    expect(verifyLicense('garbage', keys.publicKey)).toEqual({ valid: false, reason: 'malformed' });
  });
});
