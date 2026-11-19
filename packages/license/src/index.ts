import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';

/**
 * License tokens are `base64url(JSON payload) + "." + base64url(Ed25519 signature)`.
 * The website signs them with a private key, and the desktop app verifies them offline
 * with the embedded public key. A token is bound to one device and expires, so the app
 * refreshes it while the subscription is active.
 */

export type Plan = 'monthly' | 'yearly';

export interface LicensePayload {
  v: 1;
  /** Human-readable license key, e.g. ZP-7KQ2-M9XD-4HRT-WC3B. */
  key: string;
  plan: Plan;
  email: string;
  /** Opaque device identifier the token is bound to. */
  device: string;
  /** Issued-at and expiry, in seconds since the epoch. */
  iat: number;
  exp: number;
}

export type VerifyResult =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: 'malformed' | 'signature' | 'expired' | 'device' };

const KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I ambiguity

export function generateLicenseKey(): string {
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]);
  const groups = [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join(''));
  return `ZP-${groups.join('-')}`;
}

export function normalizeLicenseKey(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^ZP/, '');
  if (compact.length !== 16 || [...compact].some((c) => !KEY_ALPHABET.includes(c))) return null;
  return `ZP-${compact.match(/.{4}/g)!.join('-')}`;
}

export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(body), createPrivateKey(privateKeyPem)).toString('base64url');
  return `${body}.${signature}`;
}

export function verifyLicense(
  token: string,
  publicKeyPem: string,
  options: { device?: string; now?: number } = {},
): VerifyResult {
  const [body, signature, extra] = token.trim().split('.');
  if (!body || !signature || extra !== undefined) return { valid: false, reason: 'malformed' };

  let ok = false;
  try {
    ok = verify(null, Buffer.from(body), createPublicKey(publicKeyPem), Buffer.from(signature, 'base64url'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!ok) return { valid: false, reason: 'signature' };

  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LicensePayload;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (payload.v !== 1) return { valid: false, reason: 'malformed' };

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return { valid: false, reason: 'expired' };
  if (options.device !== undefined && payload.device !== options.device) return { valid: false, reason: 'device' };
  return { valid: true, payload };
}

/** Creates a new Ed25519 key pair as PEM strings (used by `scripts/generate-license-keys`). */
export function generateSigningKeys(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** Maximum number of devices one license may be active on at a time. */
export const MAX_DEVICES = 3;

/** How long a signed token stays valid offline before the app must refresh it. */
export const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;
