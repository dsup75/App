// Clock: countdown timer, stopwatch, alarms and world clock.
// Everything keeps running from saved start times, so closing the app does not stop it;
// timer end and alarms ring as phone notifications (with sound) even when the app is closed.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const native = () => Capacitor.isNativePlatform();
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full / blocked */
  }
};

/* ---------------- notifications ---------------- */
const TIMER_ID = 901;
const ALARM_BASE = 910; // 910..979 (10 alarms × 7 days) — reminders use 1000+

export async function clockPermission(): Promise<boolean> {
  if (!native()) return false;
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

/** Android 12+: "Alarms & reminders" lets alarms ring at the exact minute. */
export async function exactAlarmAllowed(): Promise<boolean | null> {
  if (!native()) return null;
  try {
    const r = await (LocalNotifications as any).checkExactNotificationSetting?.();
    return r ? r.exact_alarm === 'granted' : null;
  } catch {
    return null;
  }
}
export async function openExactAlarmSetting(): Promise<void> {
  try {
    await (LocalNotifications as any).changeExactNotificationSetting?.();
  } catch {
    /* older Android: not needed */
  }
}

/** A short beep + vibration while the app is open */
export function ring(times = 3) {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    /* no vibration */
  }
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    }
    setTimeout(() => ctx.close?.(), times * 450 + 300);
  } catch {
    /* no audio */
  }
}

/* ---------------- countdown timer ---------------- */
export interface TimerState {
  total: number; // ms
  endAt: number | null; // running → when it ends
  left: number | null; // paused → ms left
  label: string;
}
const TK = 'clock-timer';
export const getTimer = (): TimerState | null => read<TimerState | null>(TK, null);
export function timerLeft(t: TimerState, now = Date.now()) {
  if (t.endAt) return Math.max(0, t.endAt - now);
  return t.left ?? t.total;
}
async function notifyAt(id: number, at: Date, title: string, body: string, url = '/clock') {
  if (!native()) return;
  try {
    if (!(await clockPermission())) return;
    await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
    await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at, allowWhileIdle: true }, extra: { url } }] });
  } catch {
    /* ignore */
  }
}
const cancel = async (ids: number[]) => {
  if (!native() || !ids.length) return;
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    /* ignore */
  }
};

export async function startTimer(ms: number, label: string): Promise<TimerState> {
  const t: TimerState = { total: ms, endAt: Date.now() + ms, left: null, label };
  write(TK, t);
  await notifyAt(TIMER_ID, new Date(t.endAt!), "⏰ Time's up", label || 'Your timer has finished');
  return t;
}
export async function pauseTimer(t: TimerState): Promise<TimerState> {
  const n: TimerState = { ...t, left: timerLeft(t), endAt: null };
  write(TK, n);
  await cancel([TIMER_ID]);
  return n;
}
export async function resumeTimer(t: TimerState): Promise<TimerState> {
  const n: TimerState = { ...t, endAt: Date.now() + (t.left ?? t.total), left: null };
  write(TK, n);
  await notifyAt(TIMER_ID, new Date(n.endAt!), "⏰ Time's up", n.label || 'Your timer has finished');
  return n;
}
export async function addToTimer(t: TimerState, ms: number): Promise<TimerState> {
  const n: TimerState = t.endAt ? { ...t, total: t.total + ms, endAt: t.endAt + ms } : { ...t, total: t.total + ms, left: (t.left ?? t.total) + ms };
  write(TK, n);
  if (n.endAt) await notifyAt(TIMER_ID, new Date(n.endAt), "⏰ Time's up", n.label || 'Your timer has finished');
  return n;
}
export async function clearTimer() {
  try {
    localStorage.removeItem(TK);
  } catch {
    /* ignore */
  }
  await cancel([TIMER_ID]);
}

/* ---------------- stopwatch ---------------- */
export interface StopwatchState {
  startAt: number | null; // running since
  acc: number; // ms before the last start
  laps: number[]; // total time at each lap
}
const SK = 'clock-stopwatch';
export const getStopwatch = (): StopwatchState => read<StopwatchState>(SK, { startAt: null, acc: 0, laps: [] });
export const saveStopwatch = (s: StopwatchState) => write(SK, s);
export const swElapsed = (s: StopwatchState, now = Date.now()) => s.acc + (s.startAt ? now - s.startAt : 0);

/* ---------------- alarms ---------------- */
export interface Alarm {
  id: string;
  time: string; // HH:MM
  label: string;
  days: number[]; // 0 = Sun … 6 = Sat; empty = once
  on: boolean;
  /** for a one-time alarm: when it was set (it switches off after ringing) */
  setAt?: number;
}
const AK = 'clock-alarms';
export const getAlarms = (): Alarm[] => read<Alarm[]>(AK, []);
export const MAX_ALARMS = 10;

/** the next times this alarm rings (up to 7), from now */
export function nextRings(a: Alarm, from = new Date()): Date[] {
  const [h, m] = a.time.split(':').map(Number);
  const out: Date[] = [];
  for (let i = 0; i < 8 && out.length < (a.days.length ? 7 : 1); i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, h, m, 0, 0);
    if (d <= from) continue;
    if (a.days.length && !a.days.includes(d.getDay())) continue;
    out.push(d);
  }
  return out;
}

/** Saves the alarms and schedules each one's next rings (call on app open too). */
export async function saveAlarms(list: Alarm[]): Promise<void> {
  write(AK, list.slice(0, MAX_ALARMS));
  await rescheduleAlarms();
}
export async function rescheduleAlarms(): Promise<void> {
  if (!native()) return;
  const all = Array.from({ length: 70 }, (_, i) => ALARM_BASE + i);
  await cancel(all);
  const list = getAlarms();
  if (!list.some((a) => a.on)) return;
  if (!(await clockPermission())) return;
  const notifications: any[] = [];
  list.slice(0, MAX_ALARMS).forEach((a, ai) => {
    if (!a.on) return;
    nextRings(a).forEach((d, k) =>
      notifications.push({
        id: ALARM_BASE + ai * 7 + k,
        title: `⏰ ${a.label || 'Alarm'}`,
        body: `It's ${a.time}`,
        schedule: { at: d, allowWhileIdle: true },
        extra: { url: '/clock?tab=alarm' },
      }),
    );
  });
  if (notifications.length) await LocalNotifications.schedule({ notifications }).catch(() => {});
}
/** a one-time alarm that has rung switches itself off */
export function expireOnceAlarms() {
  const now = Date.now();
  const list = getAlarms();
  let changed = false;
  const out = list.map((a) => {
    if (!a.on || a.days.length) return a;
    const [h, m] = a.time.split(':').map(Number);
    const setAt = a.setAt;
    if (!setAt) return a;
    const d = new Date(setAt);
    let ringAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
    if (ringAt <= setAt) ringAt += 86400000;
    if (ringAt < now) {
      changed = true;
      return { ...a, on: false };
    }
    return a;
  });
  if (changed) write(AK, out);
}

/* ---------------- world clock ---------------- */
export const CITIES: { name: string; tz: string }[] = [
  { name: 'New Delhi', tz: 'Asia/Kolkata' },
  { name: 'Dubai', tz: 'Asia/Dubai' },
  { name: 'London', tz: 'Europe/London' },
  { name: 'New York', tz: 'America/New_York' },
  { name: 'Los Angeles', tz: 'America/Los_Angeles' },
  { name: 'Toronto', tz: 'America/Toronto' },
  { name: 'Singapore', tz: 'Asia/Singapore' },
  { name: 'Tokyo', tz: 'Asia/Tokyo' },
  { name: 'Sydney', tz: 'Australia/Sydney' },
  { name: 'Berlin', tz: 'Europe/Berlin' },
  { name: 'Paris', tz: 'Europe/Paris' },
  { name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { name: 'Kathmandu', tz: 'Asia/Kathmandu' },
  { name: 'Dhaka', tz: 'Asia/Dhaka' },
  { name: 'Riyadh', tz: 'Asia/Riyadh' },
  { name: 'Moscow', tz: 'Europe/Moscow' },
  { name: 'São Paulo', tz: 'America/Sao_Paulo' },
  { name: 'Johannesburg', tz: 'Africa/Johannesburg' },
];
const WK = 'clock-world';
export const getWorld = (): string[] => read<string[]>(WK, ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York']);
export const saveWorld = (l: string[]) => write(WK, l);

/** "12:05", "AM", "Thu", offset vs India in hours */
export function cityTime(tz: string, now = new Date()) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: tz, ...o }).format(now);
  const hm = f({ hour: 'numeric', minute: '2-digit', hour12: true });
  const day = f({ weekday: 'short' });
  const local = (z: string) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: z, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  };
  const diffH = (local(tz) - local('Asia/Kolkata')) / 3600000;
  return { hm, day, diffH };
}

/* ---------------- formatting ---------------- */
export function fmtClock(ms: number, cs = false): string {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const c = Math.floor((t % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (h ? `${h}:${pad(m)}` : pad(m)) + `:${pad(s)}` + (cs ? `.${pad(c)}` : '');
}
