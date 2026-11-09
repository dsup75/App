// Focus mode (Android): during a focus session, opening a blocked app shows a block screen.
// Best method: the DeepBoost accessibility blocker (instant). Fallback: Usage access + Display over other apps (1-second check).
// On the web there is no way to block other apps, so it only reports "not supported".
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from './supabase';

export type FocusModeKind = 'block' | 'allow';

export interface FocusStatus {
  supported: boolean;
  usageAccess: boolean;
  overlay: boolean;
  accessibility: boolean;
  running: boolean;
  paused: boolean;
  endsAt: number;
  startedAt: number;
  mode: FocusModeKind;
  blockedCount: number;
  hasLastSession: boolean;
}
export interface AppInfo {
  packageName: string;
  label: string;
}
export interface FocusSessionSummary {
  startedAt: number;
  endedAt: number;
  plannedMinutes: number;
  focusedMinutes: number;
  blockedAttempts: number;
  mode: FocusModeKind;
  appsCount: number;
  endReason: string;
  method: 'accessibility' | 'usage_stats';
}

interface FocusGuardPlugin {
  getStatus(): Promise<FocusStatus>;
  openUsageSettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  openAppInfo(): Promise<void>;
  listApps(): Promise<{ apps: AppInfo[] }>;
  start(o: { mode: FocusModeKind; apps: string[]; endsAt: number }): Promise<{ method: string }>;
  pause(): Promise<void>;
  resume(o: { endsAt?: number }): Promise<void>;
  stop(o?: { reason?: string }): Promise<void>;
  takeLastSession(): Promise<{ session?: FocusSessionSummary }>;
}

const FocusGuard = registerPlugin<FocusGuardPlugin>('FocusGuard');

export const focusSupported = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FocusGuard');

const OFF: FocusStatus = {
  supported: false, usageAccess: false, overlay: false, accessibility: false, running: false, paused: false,
  endsAt: 0, startedAt: 0, mode: 'block', blockedCount: 0, hasLastSession: false,
};

export async function focusStatus(): Promise<FocusStatus> {
  if (!focusSupported()) return OFF;
  try {
    const s = await FocusGuard.getStatus();
    return { ...OFF, ...s, supported: true };
  } catch {
    return OFF;
  }
}

/** Ready to block: accessibility blocker on, or both fallback permissions. */
export const focusReady = (s: FocusStatus | null) => !!s && (s.accessibility || (s.usageAccess && s.overlay));

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
export const openAccessibilitySettings = () => FocusGuard.openAccessibilitySettings().catch(() => {});
export const openAppInfo = () => FocusGuard.openAppInfo().catch(() => {});

/* ---- saved choice (this phone only) ---- */
export interface FocusPrefs {
  on: boolean;
  mode: FocusModeKind;
  blocked: string[]; // used in 'block' mode
  allowed: string[]; // used in 'allow' mode
}
const KEY = 'focus-mode';
export function getFocusPrefs(): FocusPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') {
      const allowed = Array.isArray(v.allowed) ? v.allowed : [];
      const blocked = Array.isArray(v.blocked) ? v.blocked : [];
      // older versions only had an allowed list
      const mode: FocusModeKind = v.mode === 'allow' || v.mode === 'block' ? v.mode : allowed.length ? 'allow' : 'block';
      return { on: !!v.on, mode, blocked, allowed };
    }
  } catch {
    /* ignore */
  }
  return { on: false, mode: 'block', blocked: [], allowed: [] };
}
export function setFocusPrefs(p: FocusPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Starts blocking until endsAt if focus mode is switched on. Returns a message when it could not start. */
export async function startFocusGuard(endsAt: number, force = false): Promise<string | null> {
  const p = getFocusPrefs();
  if (!p.on && !force) return null;
  if (!focusSupported()) return 'Focus mode works in the Android app only.';
  const st = await focusStatus();
  if (!focusReady(st)) return 'Focus mode needs the DeepBoost blocker turned on (Focus mode screen → Permissions).';
  const apps = p.mode === 'allow' ? p.allowed : p.blocked;
  if (p.mode === 'block' && apps.length === 0) return 'Pick the apps to block first (Focus mode screen).';
  try {
    await FocusGuard.start({ mode: p.mode, apps, endsAt });
    return null;
  } catch (e) {
    return (e as Error).message || 'Focus mode could not start.';
  }
}

export async function pauseFocusGuard(): Promise<void> {
  if (!focusSupported()) return;
  await FocusGuard.pause().catch(() => {});
}
export async function resumeFocusGuard(endsAt?: number): Promise<void> {
  if (!focusSupported()) return;
  await FocusGuard.resume({ endsAt }).catch(() => {});
}

export async function stopFocusGuard(reason: 'stopped' | 'break' | 'completed' = 'stopped'): Promise<void> {
  if (!focusSupported()) return;
  try {
    await FocusGuard.stop({ reason });
  } catch {
    /* ignore */
  }
  await saveFinishedFocusSession();
}

/** Moves the last finished session from the phone into history (Supabase). Safe to call any time. */
export async function saveFinishedFocusSession(): Promise<boolean> {
  if (!focusSupported()) return false;
  let s: FocusSessionSummary | undefined;
  try {
    s = (await FocusGuard.takeLastSession()).session;
  } catch {
    return false;
  }
  if (!s || !s.startedAt) return false;
  const reasons = ['completed', 'stopped', 'emergency_exit', 'replaced', 'break'];
  const row = {
    started_at: new Date(s.startedAt).toISOString(),
    ended_at: new Date(s.endedAt || s.startedAt).toISOString(),
    planned_minutes: Math.max(0, Math.min(1440, Math.round(s.plannedMinutes || 0))),
    focused_minutes: Math.max(0, Math.min(1440, Math.round(s.focusedMinutes || 0))),
    blocked_attempts: Math.max(0, Math.round(s.blockedAttempts || 0)),
    mode: s.mode === 'allow' ? 'allow' : 'block',
    apps_count: Math.max(0, Math.round(s.appsCount || 0)),
    end_reason: reasons.includes(s.endReason) ? s.endReason : 'stopped',
    method: s.method === 'usage_stats' ? 'usage_stats' : 'accessibility',
  };
  const { error } = await supabase.from('focus_sessions').upsert(row, { onConflict: 'user_id,started_at', ignoreDuplicates: true });
  if (error) {
    // keep it on the phone for the next try
    try {
      const q = JSON.parse(localStorage.getItem('focus-unsaved') || '[]');
      q.push(row);
      localStorage.setItem('focus-unsaved', JSON.stringify(q.slice(-50)));
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    const q = JSON.parse(localStorage.getItem('focus-unsaved') || '[]');
    if (Array.isArray(q) && q.length) {
      const { error: e2 } = await supabase.from('focus_sessions').upsert(q, { onConflict: 'user_id,started_at', ignoreDuplicates: true });
      if (!e2) localStorage.removeItem('focus-unsaved');
    }
  } catch {
    /* ignore */
  }
  return true;
}

export interface FocusStats {
  todayMinutes: number;
  weekMinutes: number;
  weekSessions: number;
  weekBlocked: number;
  emergencyExits: number;
  recent: { started_at: string; focused_minutes: number; planned_minutes: number; blocked_attempts: number; end_reason: string }[];
}

export async function fetchFocusStats(): Promise<FocusStats | null> {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('focus_sessions')
    .select('started_at, focused_minutes, planned_minutes, blocked_attempts, end_reason')
    .is('deleted_at', null)
    .gte('started_at', since.toISOString())
    .order('started_at', { ascending: false })
    .limit(200);
  if (error || !data) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = data as FocusStats['recent'];
  return {
    todayMinutes: rows.filter((r) => new Date(r.started_at) >= today).reduce((t, r) => t + r.focused_minutes, 0),
    weekMinutes: rows.reduce((t, r) => t + r.focused_minutes, 0),
    weekSessions: rows.length,
    weekBlocked: rows.reduce((t, r) => t + r.blocked_attempts, 0),
    emergencyExits: rows.filter((r) => r.end_reason === 'emergency_exit').length,
    recent: rows.slice(0, 10),
  };
}
