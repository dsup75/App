// Focus mode (Android): while a focus session runs, opening a non-allowed app brings DeepBoost Life back.
// On the web there is no way to block other apps, so it only reports "not supported".
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface FocusStatus {
  supported: boolean;
  usageAccess: boolean;
  overlay: boolean;
  running: boolean;
  endsAt: number;
}
export interface AppInfo {
  packageName: string;
  label: string;
}

interface FocusGuardPlugin {
  getStatus(): Promise<FocusStatus>;
  openUsageSettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  listApps(): Promise<{ apps: AppInfo[] }>;
  start(o: { allowed: string[]; endsAt: number }): Promise<void>;
  stop(): Promise<void>;
}

const FocusGuard = registerPlugin<FocusGuardPlugin>('FocusGuard');

export const focusSupported = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FocusGuard');

const OFF: FocusStatus = { supported: false, usageAccess: false, overlay: false, running: false, endsAt: 0 };

export async function focusStatus(): Promise<FocusStatus> {
  if (!focusSupported()) return OFF;
  try {
    return { ...(await FocusGuard.getStatus()), supported: true };
  } catch {
    return OFF;
  }
}

export async function listInstalledApps(): Promise<AppInfo[]> {
  if (!focusSupported()) return [];
  try {
    return (await FocusGuard.listApps()).apps ?? [];
  } catch {
    return [];
  }
}

export const openUsageSettings = () => FocusGuard.openUsageSettings().catch(() => {});
export const openOverlaySettings = () => FocusGuard.openOverlaySettings().catch(() => {});

/* ---- saved choice (this phone only) ---- */
export interface FocusPrefs {
  on: boolean;
  allowed: string[];
}
const KEY = 'focus-mode';
export function getFocusPrefs(): FocusPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && Array.isArray(v.allowed)) return { on: !!v.on, allowed: v.allowed };
  } catch {
    /* ignore */
  }
  return { on: false, allowed: [] };
}
export function setFocusPrefs(p: FocusPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Starts blocking until endsAt if focus mode is switched on. Returns a message when it could not start. */
export async function startFocusGuard(endsAt: number): Promise<string | null> {
  const p = getFocusPrefs();
  if (!p.on) return null;
  if (!focusSupported()) return 'Focus mode works in the Android app only.';
  const st = await focusStatus();
  if (!st.usageAccess || !st.overlay) return 'Focus mode needs Usage access and Display over other apps (Focus mode screen).';
  try {
    await FocusGuard.start({ allowed: p.allowed, endsAt });
    return null;
  } catch (e) {
    return (e as Error).message || 'Focus mode could not start.';
  }
}

export async function stopFocusGuard(): Promise<void> {
  if (!focusSupported()) return;
  try {
    await FocusGuard.stop();
  } catch {
    /* ignore */
  }
}
