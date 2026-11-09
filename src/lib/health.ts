// Health Connect (Android) — reads today's steps, calories, distance, heart rate and last night's sleep.
// Native code: native/health-connect (local Capacitor plugin, read-only).
// A smartwatch app (e.g. Da Fit) only shows up here if it shares its data with Health Connect.
// Nothing is ever made up: anything that can't be read is returned as null.
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface HealthToday {
  steps: number | null;
  calories: number | null; // kcal
  distanceKm: number | null;
  heartRateAvg: number | null; // bpm
  heartRateLatest: number | null;
  sleepMinutes: number | null; // last night
  weightKg: number | null; // latest in the last 30 days
  weightAt: string | null;
  bodyFatPct: number | null;
  permissions: Record<string, boolean>;
  readAt: string;
}

export type HealthState = 'web' | 'not_installed' | 'needs_update' | 'ready' | 'error';

interface HealthConnectPlugin {
  isAvailable(): Promise<{ available: boolean; needsUpdate?: boolean }>;
  checkAccess(): Promise<{ permissions: Record<string, boolean>; anyGranted: boolean }>;
  requestAccess(): Promise<{ permissions: Record<string, boolean>; anyGranted: boolean }>;
  openSettings(): Promise<void>;
  readToday(o: { startDate: string; endDate: string; sleepStartDate: string }): Promise<{
    steps: number | null;
    calories: number | null;
    distanceMeters: number | null;
    heartRateAvg: number | null;
    heartRateLatest: number | null;
    sleepMinutes: number | null;
    weightKg?: number | null;
    weightAt?: string | null;
    bodyFatPct?: number | null;
    permissions: Record<string, boolean>;
  }>;
}

const HC = registerPlugin<HealthConnectPlugin>('HealthConnect');
const isAndroid = () => Capacitor.getPlatform() === 'android';

export async function healthAvailable(): Promise<HealthState> {
  if (!isAndroid()) return 'web';
  try {
    const r = await HC.isAvailable();
    if (r?.available) return 'ready';
    return r?.needsUpdate ? 'needs_update' : 'not_installed';
  } catch {
    return 'error';
  }
}

export async function openHealthConnect(): Promise<void> {
  if (!isAndroid()) return;
  try {
    await HC.openSettings();
  } catch {
    /* ignore */
  }
}

export async function requestHealthAccess(): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const r = await HC.requestAccess();
    return Boolean(r?.anyGranted);
  } catch {
    return false;
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function readToday(): Promise<HealthToday> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const sleepStart = new Date(start.getTime() - 12 * 3600000); // from 12 noon yesterday
  const e = now.toISOString();
  const empty: HealthToday = { steps: null, calories: null, distanceKm: null, heartRateAvg: null, heartRateLatest: null, sleepMinutes: null, weightKg: null, weightAt: null, bodyFatPct: null, permissions: {}, readAt: e };
  if (!isAndroid()) return empty;
  try {
    const r = await HC.readToday({ startDate: start.toISOString(), endDate: e, sleepStartDate: sleepStart.toISOString() });
    const steps = num(r.steps);
    const kcal = num(r.calories);
    const m = num(r.distanceMeters);
    const avg = num(r.heartRateAvg);
    const last = num(r.heartRateLatest);
    const sleep = num(r.sleepMinutes);
    return {
      steps: steps === null ? null : Math.round(steps),
      calories: kcal === null ? null : Math.round(kcal),
      distanceKm: m === null ? null : Math.round((m / 1000) * 100) / 100,
      heartRateAvg: avg === null ? null : Math.round(avg),
      heartRateLatest: last === null ? null : Math.round(last),
      sleepMinutes: sleep === null ? null : Math.round(sleep),
      weightKg: num(r.weightKg) === null ? null : Math.round(num(r.weightKg)! * 100) / 100,
      weightAt: typeof r.weightAt === 'string' ? r.weightAt : null,
      bodyFatPct: num(r.bodyFatPct) === null ? null : Math.round(num(r.bodyFatPct)! * 10) / 10,
      permissions: r.permissions ?? {},
      readAt: e,
    };
  } catch {
    return empty;
  }
}

/** Keeps a daily copy (for history and the dashboard) of what Health Connect returned. Never invents values. */
export async function saveHealthSnapshot(d: HealthToday): Promise<void> {
  const { supabase } = await import('./supabase');
  const { todayISO } = await import('./dates');
  const any = [d.steps, d.calories, d.distanceKm, d.heartRateAvg, d.sleepMinutes].some((v) => v !== null);
  if (any) {
    await supabase.from('activity_daily').upsert(
      {
        day: todayISO(),
        source: 'health_connect',
        steps: d.steps,
        distance_m: d.distanceKm === null ? null : Math.round(d.distanceKm * 1000),
        calories_kcal: d.calories,
        heart_rate_avg: d.heartRateAvg,
        sleep_minutes: d.sleepMinutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,day,source' },
    );
  }
  if (d.weightKg !== null && d.weightAt && d.weightKg >= 10 && d.weightKg <= 400) {
    await supabase
      .from('body_measurements')
      .upsert(
        { measured_at: d.weightAt, weight_kg: d.weightKg, body_fat_pct: d.bodyFatPct, source: 'health_connect' },
        { onConflict: 'user_id,measured_at,source', ignoreDuplicates: true },
      );
  }
}
