// Health Connect (Android) — reads today's steps, calories, distance, heart rate and last night's sleep.
// A smartwatch app (e.g. Da Fit) only shows up here if it shares its data with Health Connect.
// Nothing is ever made up: anything that can't be read is returned as null.
import { Capacitor } from '@capacitor/core';

export interface HealthToday {
  steps: number | null;
  calories: number | null; // kcal
  distanceKm: number | null;
  heartRateAvg: number | null; // bpm
  heartRateLatest: number | null;
  sleepMinutes: number | null; // last night
  readAt: string;
}

export type HealthState = 'web' | 'not_installed' | 'ready' | 'error';

async function plugin(): Promise<any | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  try {
    const mod: any = await import('@capgo/capacitor-health');
    return mod.Health ?? mod.CapacitorHealth ?? null;
  } catch {
    return null;
  }
}

export async function healthAvailable(): Promise<HealthState> {
  const H = await plugin();
  if (!H) return 'web';
  try {
    const r = H.isAvailable ? await H.isAvailable() : H.isHealthAvailable ? await H.isHealthAvailable() : { available: false };
    return r?.available ? 'ready' : 'not_installed';
  } catch {
    return 'error';
  }
}

export async function openHealthConnect(): Promise<void> {
  const H = await plugin();
  try {
    if (H?.openHealthConnectSettings) await H.openHealthConnectSettings();
    else if (H?.showHealthConnectInPlayStore) await H.showHealthConnectInPlayStore();
  } catch {
    /* ignore */
  }
}

export async function requestHealthAccess(): Promise<boolean> {
  const H = await plugin();
  if (!H) return false;
  try {
    if (H.requestAuthorization) {
      const r = await H.requestAuthorization({ read: ['steps', 'calories', 'distance', 'heartRate', 'sleep'], write: [] });
      return (r?.readAuthorized?.length ?? 0) > 0;
    }
    if (H.requestHealthPermissions) {
      const r = await H.requestHealthPermissions({ permissions: ['READ_STEPS', 'READ_ACTIVE_CALORIES', 'READ_DISTANCE', 'READ_HEART_RATE'] });
      return r?.permissions ? Object.values(r.permissions).some(Boolean) : true;
    }
  } catch {
    return false;
  }
  return false;
}

const sumOf = (rows: any[] | undefined) => (rows?.length ? rows.reduce((t, x) => t + (Number(x?.value) || 0), 0) : null);

async function aggregated(H: any, dataType: string, startDate: string, endDate: string): Promise<number | null> {
  try {
    const r = await H.queryAggregated({ dataType, startDate, endDate, bucket: 'day' });
    return sumOf(r?.samples ?? r?.aggregatedData);
  } catch {
    return null;
  }
}

async function samples(H: any, dataType: string, startDate: string, endDate: string): Promise<any[] | null> {
  if (!H.readSamples) return null;
  try {
    const r = await H.readSamples({ dataType, startDate, endDate, limit: 500 });
    return r?.samples ?? null;
  } catch {
    return null;
  }
}

export async function readToday(): Promise<HealthToday> {
  const H = await plugin();
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const s = start.toISOString();
  const e = now.toISOString();
  const empty: HealthToday = { steps: null, calories: null, distanceKm: null, heartRateAvg: null, heartRateLatest: null, sleepMinutes: null, readAt: e };
  if (!H) return empty;

  const [steps, calories, distance, hr, sleep] = await Promise.all([
    aggregated(H, 'steps', s, e),
    aggregated(H, 'calories', s, e),
    aggregated(H, 'distance', s, e),
    samples(H, 'heartRate', s, e),
    samples(H, 'sleep', new Date(start.getTime() - 12 * 3600000).toISOString(), e),
  ]);

  const hrVals = (hr ?? []).map((x) => Number(x?.value)).filter((v) => v > 0);
  const sleepMin = sleep?.length
    ? Math.round(
        sleep
          .filter((x) => !/awake/i.test(String(x?.sleepState ?? '')))
          .reduce((t, x) => t + Math.max(0, new Date(x.endDate).getTime() - new Date(x.startDate).getTime()), 0) / 60000,
      )
    : null;

  return {
    steps: steps === null ? null : Math.round(steps),
    calories: calories === null ? null : Math.round(calories),
    distanceKm: distance === null ? null : Math.round((distance / 1000) * 100) / 100,
    heartRateAvg: hrVals.length ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : null,
    heartRateLatest: hrVals.length ? Math.round(hrVals[hrVals.length - 1]) : null,
    sleepMinutes: sleepMin,
    readAt: e,
  };
}
