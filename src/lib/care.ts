// Health care: medicines (doses + stock), vitals, appointments, medical vault, water and sleep.
// Reminders use notification ids 100–899 only (clock uses 900–979, other reminders 1000+),
// so they never cancel or replace anything else in the app.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from './supabase';
import { todayISO, toISODate } from './dates';

/* ---------------- types ---------------- */
export type Slot = 'morning' | 'afternoon' | 'night';
export interface Medicine {
  id: string;
  name: string;
  dose: string | null;
  form: string;
  for_person: string | null;
  take_morning: boolean;
  morning_time: string | null;
  take_afternoon: boolean;
  afternoon_time: string | null;
  take_night: boolean;
  night_time: string | null;
  per_dose: number;
  food: 'before' | 'after' | 'with' | 'any';
  start_date: string;
  end_date: string | null;
  stock_qty: number | null;
  low_stock_days: number;
  reminders: boolean;
  status: 'active' | 'paused' | 'finished';
}
export interface DoseLog {
  id: string;
  medicine_id: string;
  slot: Slot | 'extra';
  taken_on: string;
  status: 'taken' | 'skipped';
  qty: number;
  taken_at: string;
}
export interface Vital {
  id: string;
  kind: 'bp' | 'sugar' | 'pulse' | 'spo2' | 'temperature';
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  sugar_mgdl: number | null;
  sugar_timing: string | null;
  spo2: number | null;
  temperature_f: number | string | null;
  measured_on: string;
  measured_time: string | null;
  for_person: string | null;
}
export interface Appointment {
  id: string;
  doctor_name: string;
  speciality: string | null;
  clinic: string | null;
  appointment_date: string;
  appointment_time: string | null;
  for_person: string | null;
  status: 'upcoming' | 'done' | 'cancelled' | 'missed';
  reminders: boolean;
  phone: string | null;
  follow_up_date: string | null;
}
export interface Wellness {
  water_goal_ml: number;
  glass_ml: number;
  sleep_goal_minutes: number;
  water_reminders: boolean;
}

export const SLOTS: { slot: Slot; label: string; on: keyof Medicine; time: keyof Medicine; def: string }[] = [
  { slot: 'morning', label: 'Morning', on: 'take_morning', time: 'morning_time', def: '08:00' },
  { slot: 'afternoon', label: 'Afternoon', on: 'take_afternoon', time: 'afternoon_time', def: '14:00' },
  { slot: 'night', label: 'Night', on: 'take_night', time: 'night_time', def: '21:00' },
];
export const FOOD_LABEL: Record<string, string> = { before: 'Before food', after: 'After food', with: 'With food', any: 'Any time' };

export const hhmm = (t: string | null | undefined, def = '') => (t ? String(t).slice(0, 5) : def);
export function fmt12(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

/* ---------------- medicines ---------------- */
/** is this medicine scheduled on that day (inside its start/end dates and active)? */
export function onDay(m: Medicine, day: string): boolean {
  return m.status === 'active' && m.start_date <= day && (!m.end_date || m.end_date >= day);
}
export function slotsOf(m: Medicine) {
  return SLOTS.filter((s) => !!m[s.on]).map((s) => ({ ...s, at: hhmm(m[s.time] as string | null, s.def) }));
}
export const dosesPerDay = (m: Medicine) => slotsOf(m).length * (m.per_dose || 1);

/** days of stock left (null when stock is not tracked) */
export function daysLeft(m: Medicine): number | null {
  if (m.stock_qty == null) return null;
  const perDay = dosesPerDay(m);
  if (!perDay) return null;
  return Math.floor(m.stock_qty / perDay);
}
export function stockState(m: Medicine): 'none' | 'ok' | 'low' | 'out' {
  const d = daysLeft(m);
  if (d === null || m.status !== 'active') return 'none';
  if ((m.stock_qty ?? 0) <= 0) return 'out';
  return d <= (m.low_stock_days || 5) ? 'low' : 'ok';
}

export async function fetchMedicines(): Promise<Medicine[]> {
  const { data, error } = await supabase.from('medicines').select('*').is('deleted_at', null).order('created_at');
  if (error) throw error;
  return (data ?? []) as Medicine[];
}
export async function fetchDoseLogs(from: string, to = from): Promise<DoseLog[]> {
  const { data, error } = await supabase.from('medicine_logs').select('*').is('deleted_at', null).gte('taken_on', from).lte('taken_on', to);
  if (error) throw error;
  return (data ?? []) as DoseLog[];
}
/** Mark one dose as taken or skipped. Stock goes down by itself (database trigger) for "taken". */
export async function logDose(m: Medicine, slot: Slot | 'extra', status: 'taken' | 'skipped', day = todayISO()): Promise<void> {
  const { error } = await supabase.from('medicine_logs').insert({ medicine_id: m.id, slot, status, qty: m.per_dose || 1, taken_on: day });
  if (error) throw error;
}
/** Undo = soft delete (goes to Recycle bin; stock comes back by itself) */
export async function undoDose(logId: string): Promise<void> {
  const { error } = await supabase.from('medicine_logs').update({ deleted_at: new Date().toISOString() }).eq('id', logId);
  if (error) throw error;
}
export async function addStock(m: Medicine, n: number): Promise<void> {
  const { error } = await supabase.from('medicines').update({ stock_qty: Math.max(0, (m.stock_qty ?? 0) + n) }).eq('id', m.id);
  if (error) throw error;
}

/* ---------------- vitals ---------------- */
export async function fetchVitals(kind: Vital['kind'], limit = 60): Promise<Vital[]> {
  const { data, error } = await supabase
    .from('vitals')
    .select('*')
    .is('deleted_at', null)
    .eq('kind', kind)
    .order('measured_on', { ascending: false })
    .order('measured_time', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Vital[];
}

/** General adult ranges (a guide only — your doctor's advice comes first) */
export function vitalStatus(v: Vital): { label: string; tone: 'primary' | 'amber' | 'danger' | 'blue' } {
  if (v.kind === 'bp' && v.systolic && v.diastolic) {
    const s = v.systolic, d = v.diastolic;
    if (s >= 180 || d >= 120) return { label: 'Very high', tone: 'danger' };
    if (s >= 140 || d >= 90) return { label: 'High', tone: 'danger' };
    if (s >= 130 || d >= 80) return { label: 'Slightly high', tone: 'amber' };
    if (s < 90 || d < 60) return { label: 'Low', tone: 'blue' };
    return { label: 'Normal', tone: 'primary' };
  }
  if (v.kind === 'sugar' && v.sugar_mgdl) {
    const g = v.sugar_mgdl;
    if (g < 70) return { label: 'Low', tone: 'blue' };
    if (v.sugar_timing === 'fasting') return g < 100 ? { label: 'Normal', tone: 'primary' } : g < 126 ? { label: 'Borderline', tone: 'amber' } : { label: 'High', tone: 'danger' };
    return g < 140 ? { label: 'Normal', tone: 'primary' } : g < 200 ? { label: 'Borderline', tone: 'amber' } : { label: 'High', tone: 'danger' };
  }
  if (v.kind === 'pulse' && v.pulse) return v.pulse < 60 ? { label: 'Low', tone: 'blue' } : v.pulse > 100 ? { label: 'High', tone: 'amber' } : { label: 'Normal', tone: 'primary' };
  if (v.kind === 'spo2' && v.spo2) return v.spo2 >= 95 ? { label: 'Normal', tone: 'primary' } : v.spo2 >= 91 ? { label: 'A bit low', tone: 'amber' } : { label: 'Low', tone: 'danger' };
  if (v.kind === 'temperature' && v.temperature_f != null) {
    const t = Number(v.temperature_f);
    return t >= 100.4 ? { label: 'Fever', tone: 'danger' } : t >= 99.1 ? { label: 'Slightly warm', tone: 'amber' } : t < 95 ? { label: 'Low', tone: 'blue' } : { label: 'Normal', tone: 'primary' };
  }
  return { label: '—', tone: 'blue' };
}
export function vitalValue(v: Vital): string {
  switch (v.kind) {
    case 'bp':
      return `${v.systolic}/${v.diastolic}`;
    case 'sugar':
      return String(v.sugar_mgdl);
    case 'pulse':
      return String(v.pulse);
    case 'spo2':
      return String(v.spo2);
    default:
      return String(v.temperature_f);
  }
}
export const VITAL_UNIT: Record<Vital['kind'], string> = { bp: 'mmHg', sugar: 'mg/dL', pulse: 'bpm', spo2: '%', temperature: '°F' };

/* ---------------- appointments ---------------- */
export async function fetchAppointments(): Promise<Appointment[]> {
  const { data, error } = await supabase.from('doctor_appointments').select('*').is('deleted_at', null).order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

/* ---------------- water, sleep, settings ---------------- */
export const DEFAULT_WELLNESS: Wellness = { water_goal_ml: 2500, glass_ml: 250, sleep_goal_minutes: 480, water_reminders: false };
export async function fetchWellness(): Promise<Wellness> {
  const { data } = await supabase.from('wellness_settings').select('*').maybeSingle();
  return { ...DEFAULT_WELLNESS, ...((data as Partial<Wellness>) ?? {}) };
}
export async function saveWellness(w: Partial<Wellness>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const { error } = await supabase.from('wellness_settings').upsert({ user_id: u.user.id, ...w, updated_at: new Date().toISOString() });
  if (error) throw error;
}
export async function waterByDay(from: string, to: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('water_logs').select('logged_on, ml').is('deleted_at', null).gte('logged_on', from).lte('logged_on', to);
  if (error) throw error;
  const m = new Map<string, number>();
  (data ?? []).forEach((r: any) => m.set(r.logged_on, (m.get(r.logged_on) ?? 0) + r.ml));
  return m;
}
/** minutes slept from bed time to wake time (crosses midnight) */
export function sleepMinutes(bed: string, wake: string): number {
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let d = wh * 60 + wm - (bh * 60 + bm);
  if (d <= 0) d += 1440;
  return d;
}
export const fmtDur = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

/* ---------------- reminders (ids 100–899) ---------------- */
const MED_BASE = 100; // 100..499
const APPT_BASE = 500; // 500..699
const STOCK_ID = 700;
const WATER_BASE = 800; // 800..899

const at = (day: string, time: string) => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
};

/** Cancels the care reminders and schedules the next 2 days again. Safe to call often. */
export async function scheduleCareReminders(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= MED_BASE && n.id < 900);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return 0;

    const today = todayISO();
    const [meds, appts, logs, well] = await Promise.all([
      fetchMedicines().catch(() => [] as Medicine[]),
      fetchAppointments().catch(() => [] as Appointment[]),
      fetchDoseLogs(today).catch(() => [] as DoseLog[]),
      fetchWellness().catch(() => DEFAULT_WELLNESS),
    ]);
    const now = Date.now();
    const out: any[] = [];

    // medicine doses: today + tomorrow, skipping doses already marked today
    let id = MED_BASE;
    for (const day of [today, addDays(today, 1)]) {
      for (const m of meds) {
        if (!m.reminders || !onDay(m, day)) continue;
        for (const s of slotsOf(m)) {
          const when = at(day, s.at);
          if (when.getTime() <= now || id >= APPT_BASE) continue;
          if (day === today && logs.some((l) => l.medicine_id === m.id && l.slot === s.slot)) continue;
          out.push({
            id: id++,
            title: `💊 ${m.name}${m.dose ? ' ' + m.dose : ''}`,
            body: `${s.label} dose · ${m.per_dose || 1} ${m.form === 'syrup' ? 'dose' : m.form} · ${FOOD_LABEL[m.food] ?? ''}`,
            schedule: { at: when, allowWhileIdle: true },
            extra: { url: '/care/medicines' },
          });
        }
      }
    }

    // appointments: 1 day before (7 PM) and 2 hours before
    let aid = APPT_BASE;
    for (const a of appts) {
      if (a.status !== 'upcoming' || !a.reminders || aid >= STOCK_ID - 1) continue;
      const visit = at(a.appointment_date, hhmm(a.appointment_time, '10:00'));
      const dayBefore = at(addDays(a.appointment_date, -1), '19:00');
      const twoHours = new Date(visit.getTime() - 2 * 3600000);
      const label = `${a.doctor_name}${a.speciality ? ' (' + a.speciality + ')' : ''}`;
      if (dayBefore.getTime() > now && dayBefore.getTime() - now < 40 * 86400000)
        out.push({ id: aid++, title: '🩺 Doctor visit tomorrow', body: `${label}${a.appointment_time ? ' at ' + fmt12(a.appointment_time) : ''}${a.clinic ? ' · ' + a.clinic : ''}`, schedule: { at: dayBefore, allowWhileIdle: true }, extra: { url: '/care/appointments' } });
      if (twoHours.getTime() > now && twoHours.getTime() - now < 40 * 86400000)
        out.push({ id: aid++, title: '🩺 Doctor visit in 2 hours', body: `${label}${a.clinic ? ' · ' + a.clinic : ''}`, schedule: { at: twoHours, allowWhileIdle: true }, extra: { url: '/care/appointments' } });
    }

    // low stock: one note tomorrow 10 AM
    const low = meds.filter((m) => ['low', 'out'].includes(stockState(m)));
    if (low.length) {
      out.push({
        id: STOCK_ID,
        title: '💊 Medicine stock running low',
        body: low.map((m) => `${m.name}: ${daysLeft(m) ?? 0} day(s) left`).join(' · ').slice(0, 220),
        schedule: { at: at(addDays(today, 1), '10:00'), allowWhileIdle: true },
        extra: { url: '/care/medicines' },
      });
    }

    // water: every 2 hours, 9 AM – 9 PM, today + tomorrow
    if (well.water_reminders) {
      let wid = WATER_BASE;
      for (const day of [today, addDays(today, 1)])
        for (const h of [9, 11, 13, 15, 17, 19, 21]) {
          const when = at(day, `${h}:00`);
          if (when.getTime() > now) out.push({ id: wid++, title: '💧 Time to drink water', body: `One glass (${well.glass_ml} ml). Goal ${well.water_goal_ml / 1000} L today.`, schedule: { at: when, allowWhileIdle: true }, extra: { url: '/care/water' } });
        }
    }

    if (out.length) await LocalNotifications.schedule({ notifications: out });
    return out.length;
  } catch {
    return 0;
  }
}

/** asks once for notification permission (needed for dose / visit reminders) */
export async function careNotifyPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch {
    return false;
  }
}
