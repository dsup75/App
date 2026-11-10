// App lock: PIN (hashed with PBKDF2) + optional native fingerprint.
// Note: this protects the app screen on the device. Your data on the server
// is protected separately by your login + Supabase Row Level Security.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export interface LockConfig {
  hash: string;
  salt: string;
  length: 4 | 6;
  biometric: boolean;
  /** also accept the phone's own screen lock (PIN / pattern / password) in the system prompt */
  deviceCredential?: boolean;
  timeoutSec: number; // 0 = lock immediately when app goes to background
  failCount: number;
  lockoutUntil: number;
}

const key = (userId: string) => `applock:${userId}`;

export async function loadLock(userId: string): Promise<LockConfig | null> {
  const { value } = await Preferences.get({ key: key(userId) });
  if (!value) return null;
  try {
    return JSON.parse(value) as LockConfig;
  } catch {
    return null;
  }
}

export async function saveLock(userId: string, cfg: LockConfig): Promise<void> {
  await Preferences.set({ key: key(userId), value: JSON.stringify(cfg) });
}

export async function clearLock(userId: string): Promise<void> {
  await Preferences.remove({ key: key(userId) });
}

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    material,
    256,
  );
  return { hash: b64(bits), salt: b64(salt) };
}

export async function verifyPin(pin: string, cfg: LockConfig): Promise<boolean> {
  const { hash } = await hashPin(pin, cfg.salt);
  if (hash.length !== cfg.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ cfg.hash.charCodeAt(i);
  return diff === 0;
}

export type BioKind = 'face' | 'fingerprint' | 'iris';
export interface BioInfo {
  available: boolean;
  kinds: BioKind[];
  strong: boolean;
  deviceSecure: boolean;
}

/** What this phone offers to apps. Face unlock shows here only if the phone maker lets apps use it. */
export async function biometricInfo(): Promise<BioInfo> {
  const none: BioInfo = { available: false, kinds: [], strong: false, deviceSecure: false };
  if (!Capacitor.isNativePlatform()) return none;
  try {
    const { BiometricAuth, BiometryType } = await import('@aparajita/capacitor-biometric-auth');
    const info = await BiometricAuth.checkBiometry();
    const types = (info.biometryTypes?.length ? info.biometryTypes : [info.biometryType]) as number[];
    const kinds: BioKind[] = [];
    for (const t of types) {
      if (t === BiometryType.faceId || t === BiometryType.faceAuthentication) kinds.push('face');
      else if (t === BiometryType.touchId || t === BiometryType.fingerprintAuthentication) kinds.push('fingerprint');
      else if (t === BiometryType.irisAuthentication) kinds.push('iris');
    }
    return { available: !!info.isAvailable, kinds: [...new Set(kinds)], strong: !!info.strongBiometryIsAvailable, deviceSecure: !!info.deviceIsSecure };
  } catch {
    return none;
  }
}

export async function biometricAvailable(): Promise<boolean> {
  const i = await biometricInfo();
  return i.available || i.deviceSecure;
}

export function bioLabel(kinds: BioKind[]): string {
  if (kinds.includes('face') && kinds.includes('fingerprint')) return 'Face or fingerprint';
  if (kinds.includes('face')) return 'Face unlock';
  if (kinds.includes('iris')) return 'Iris unlock';
  return 'Fingerprint';
}

/**
 * Shows the phone's own unlock sheet (face / fingerprint, like Face ID on iPhone).
 * "Weak" biometrics are allowed so face unlock works on phones that offer it to apps,
 * and no extra "Confirm" tap is needed after the face is recognised.
 */
export async function biometricPrompt(reason = 'Unlock DeepBoost Life', allowDeviceCredential = false): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { BiometricAuth, AndroidBiometryStrength } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Use PIN',
      allowDeviceCredential,
      iosFallbackTitle: 'Use PIN',
      androidTitle: 'DeepBoost Life',
      androidSubtitle: reason,
      androidConfirmationRequired: false,
      androidBiometryStrength: AndroidBiometryStrength.weak,
    });
    return true;
  } catch {
    return false;
  }
}

export const LOCK_TIMEOUTS = [
  { value: 0, label: 'Immediately' },
  { value: 30, label: 'After 30 seconds' },
  { value: 60, label: 'After 1 minute' },
  { value: 300, label: 'After 5 minutes' },
  { value: 900, label: 'After 15 minutes' },
];
