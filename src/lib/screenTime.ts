// Screen time from Android usage events (Usage access). App-wise data stays on this phone;
// only the daily total + unlock count is saved to your account (your choice in setup).
import { Capacitor } from '@capacitor/core';
import { focusGuardPlugin } from './focusGuard';
import { supabase } from './supabase';
import { toISODate } from './dates';

export interface AppUsage {
  packageName: string;
  label: string;
  ms: number;
}
export interface Usage {
  totalMs: number;
  unlocks: number | null;
  apps: AppUsage[];
}

const FocusGuard = focusGuardPlugin as unknown as {
  getUsage(o: { start: number; end: number }): Promise<{ totalMs: number; unlocks: number; apps: AppUsage[] }>;
  getStatus(): Promise<{ usageAccess: boolean }>;
  openUsageSettings(): Promise<void>;
};

export const screenTimeSupported = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FocusGuard');

export async function hasUsageAccess(): Promise<boolean> {
  if (!screenTimeSupported()) return false;
  try {
    return !!(await FocusGuard.getStatus()).usageAccess;
  } catch {
    return false;
  }
}
export const openUsageAccess = () => FocusGuard.openUsageSettings().catch(() => {});

const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export async function usageForDay(day: Date): Promise<Usage | null> {
  if (!screenTimeSupported()) return null;
  const s = dayStart(day);
  const e = new Date(s.getTime() + 86400000);
  try {
    const r = await FocusGuard.getUsage({ start: s.getTime(), end: Math.min(e.getTime(), Date.now()) });
    return { totalMs: r.totalMs, unlocks: r.unlocks >= 0 ? r.unlocks : null, apps: r.apps ?? [] };
  } catch {
    return null;
  }
}

export async function usageForRange(days: number): Promise<Usage | null> {
  if (!screenTimeSupported()) return null;
  const s = dayStart(new Date(Date.now() - (days - 1) * 86400000));
  try {
    const r = await FocusGuard.getUsage({ start: s.getTime(), end: Date.now() });
    return { totalMs: r.totalMs, unlocks: r.unlocks >= 0 ? r.unlocks : null, apps: r.apps ?? [] };
  } catch {
    return null;
  }
}

/** Saves today's and yesterday's totals (only totals — never which apps). */
export async function syncScreenTimeTotals(): Promise<void> {
  if (!(await hasUsageAccess())) return;
  const rows = [];
  for (const back of [1, 0]) {
    const d = new Date(Date.now() - back * 86400000);
    const u = await usageForDay(d);
    if (!u) continue;
    rows.push({ day: toISODate(d), total_minutes: Math.min(1440, Math.round(u.totalMs / 60000)), unlocks: u.unlocks, updated_at: new Date().toISOString() });
  }
  if (rows.length) await supabase.from('screen_time_daily').upsert(rows, { onConflict: 'user_id,day' });
}

export async function savedTotals(days: number): Promise<{ day: string; total_minutes: number; unlocks: number | null }[]> {
  const from = toISODate(new Date(Date.now() - (days - 1) * 86400000));
  const { data } = await supabase.from('screen_time_daily').select('day,total_minutes,unlocks').gte('day', from).order('day');
  return (data ?? []) as { day: string; total_minutes: number; unlocks: number | null }[];
}

export const fmtMinutes = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${Math.round(min % 60)}m` : `${Math.round(min)}m`);

/* goal + alert (this phone) */
const GOAL_KEY = 'screen-goal';
export function getScreenGoal(): { minutes: number; alert: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(GOAL_KEY) || 'null');
    if (v && v.minutes > 0) return { minutes: v.minutes, alert: !!v.alert };
  } catch {
    /* ignore */
  }
  return { minutes: 180, alert: false };
}
export function setScreenGoal(g: { minutes: number; alert: boolean }) {
  try {
    localStorage.setItem(GOAL_KEY, JSON.stringify(g));
  } catch {
    /* ignore */
  }
}

/** Once a day: if the goal alert is on and today's use is over the goal, show a notification. */
export async function checkScreenGoalAlert(): Promise<void> {
  const g = getScreenGoal();
  if (!g.alert || !(await hasUsageAccess())) return;
  const key = `screen-alert-${toISODate(new Date())}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {
    return;
  }
  const u = await usageForDay(new Date());
  if (!u || u.totalMs / 60000 <= g.minutes) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{ id: 990001, title: 'Screen time goal crossed', body: `${fmtMinutes(u.totalMs / 60000)} today (goal ${fmtMinutes(g.minutes)}).`, schedule: { at: new Date(Date.now() + 2000) }, extra: { url: '/screen-time' } }],
    });
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}
