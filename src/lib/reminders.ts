// Phone reminders (local notifications). Settings live on this phone only.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from './supabase';
import { currentMonth, todayISO, toISODate } from './dates';
import { formatINR } from './money';
import { budgetStatus } from './budgets';

export interface ReminderConfig {
  on: boolean;
  time: string; // HH:MM
  daily: boolean;
  udhaar: boolean;
  payments: boolean;
  exams: boolean;
  recurring: boolean;
  budget: boolean;
}

export const DEFAULT_REMINDERS: ReminderConfig = { on: false, time: '08:00', daily: true, udhaar: true, payments: true, exams: true, recurring: true, budget: true };

const key = (uid: string) => `reminders:${uid}`;

export const remindersSupported = () => Capacitor.isNativePlatform();

export async function getReminderConfig(uid: string): Promise<ReminderConfig> {
  try {
    const { value } = await Preferences.get({ key: key(uid) });
    return value ? { ...DEFAULT_REMINDERS, ...JSON.parse(value) } : DEFAULT_REMINDERS;
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export async function saveReminderConfig(uid: string, cfg: ReminderConfig): Promise<void> {
  await Preferences.set({ key: key(uid), value: JSON.stringify(cfg) });
}

/** Asks Android for permission (Android 13+). Returns true when allowed. */
export async function askPermission(): Promise<boolean> {
  if (!remindersSupported()) return false;
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

function at(dateISO: string, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(dateISO + 'T00:00:00');
  d.setHours(h || 8, m || 0, 0, 0);
  return d;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

interface N {
  title: string;
  body: string;
  when: Date;
  url: string;
}

/** Cancels old reminders and schedules the next 30 days again. Safe to call often. */
export async function scheduleReminders(uid: string): Promise<number> {
  if (!remindersSupported()) return 0;
  const cfg = await getReminderConfig(uid);
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => n.id >= 1000); // 900 = focus timer, leave it
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if (!cfg.on) return 0;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') return 0;

  const today = todayISO();
  const until = addDays(today, 30);
  const list: N[] = [];
  const q = await Promise.all([
    cfg.udhaar ? supabase.from('loans').select('id,person,direction,principal_paise,due_date').is('deleted_at', null).not('due_date', 'is', null).lte('due_date', until) : null,
    cfg.udhaar ? supabase.from('loan_totals').select('id,principal_repaid_paise') : null,
    cfg.payments ? supabase.from('invoices').select('id,invoice_no,amount_paise,due_date').is('deleted_at', null).eq('status', 'sent').not('due_date', 'is', null).lte('due_date', until) : null,
    cfg.payments ? supabase.from('invoice_totals').select('id,received_paise') : null,
    cfg.payments ? supabase.from('payment_requests').select('id,title,amount_paise,due_date').is('deleted_at', null).eq('status', 'pending').not('due_date', 'is', null).lte('due_date', until) : null,
    cfg.exams ? supabase.from('exams').select('id,name,exam_date').is('deleted_at', null).gte('exam_date', today).lte('exam_date', addDays(today, 37)) : null,
    cfg.recurring ? supabase.from('recurring_rules').select('id,title,amount_paise,next_date,end_date,remind_days,is_subscription').is('deleted_at', null).eq('status', 'active').lte('next_date', until) : null,
    cfg.daily ? supabase.from('tasks').select('id,due_date').is('deleted_at', null).in('status', ['pending', 'in_progress', 'waiting']).not('due_date', 'is', null).lte('due_date', until) : null,
    cfg.exams ? supabase.from('revision_queue').select('id,chapter_name,due_date').eq('status', 'pending').lte('due_date', until) : null,
  ]);
  const data = (i: number) => ((q[i] as any)?.data ?? []) as any[];

  const repaid = new Map(data(1).map((x) => [x.id, Number(x.principal_repaid_paise)]));
  for (const l of data(0)) {
    const left = Number(l.principal_paise) - (repaid.get(l.id) ?? 0);
    if (left <= 0) continue;
    const day = l.due_date < today ? today : l.due_date;
    list.push({
      title: l.direction === 'lent' ? `Udhaar due: ${l.person}` : `Repay ${l.person}`,
      body: `${formatINR(left)} ${l.direction === 'lent' ? 'to collect' : 'to pay back'}${l.due_date < today ? ' (overdue)' : ' today'}`,
      when: at(day, cfg.time),
      url: `/r/loans/${l.id}`,
    });
  }
  const got = new Map(data(3).map((x) => [x.id, Number(x.received_paise)]));
  for (const inv of data(2)) {
    const left = Number(inv.amount_paise) - (got.get(inv.id) ?? 0);
    if (left <= 0) continue;
    list.push({ title: `Invoice ${inv.invoice_no} due`, body: `${formatINR(left)} pending from client`, when: at(inv.due_date < today ? today : inv.due_date, cfg.time), url: `/r/invoices/${inv.id}` });
  }
  for (const r of data(4)) {
    list.push({ title: `Payment due: ${r.title}`, body: `${formatINR(r.amount_paise)} to receive`, when: at(r.due_date < today ? today : r.due_date, cfg.time), url: `/r/payment_requests/${r.id}` });
  }
  // revisions: one reminder per day
  const revDays = new Map<string, string[]>();
  for (const r of data(8)) {
    const day = r.due_date < today ? today : r.due_date;
    revDays.set(day, [...(revDays.get(day) ?? []), r.chapter_name]);
  }
  for (const [day, names] of revDays) {
    list.push({
      title: names.length === 1 ? `Revise ${names[0]} today` : `${names.length} revisions due today`,
      body: names.length === 1 ? 'Revise it, then tap Easy / Moderate / Difficult.' : names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : ''),
      when: at(day, cfg.time),
      url: '/revisions',
    });
  }
  for (const e of data(5)) {
    for (const before of [7, 1]) {
      const day = addDays(e.exam_date, -before);
      if (day < today || day > until) continue;
      list.push({ title: `${e.name} in ${before} day${before > 1 ? 's' : ''}`, body: before === 1 ? 'Light revision, sleep early. All the best!' : 'One week left — plan your revision.', when: at(day, cfg.time), url: '/exams' });
    }
  }
  for (const r of data(6)) {
    if (r.end_date && r.next_date > r.end_date) continue; // expired
    const due = r.next_date < today ? today : r.next_date;
    const before = Math.max(0, Number(r.remind_days ?? 1));
    const what = r.is_subscription ? 'renews' : 'is due';
    if (before > 0) {
      const early = addDays(r.next_date, -before);
      if (early >= today) list.push({ title: `${r.title} ${what} in ${before} day${before > 1 ? 's' : ''}`, body: `${formatINR(r.amount_paise)} on ${r.next_date.split('-').reverse().join('-')}`, when: at(early, cfg.time), url: '/recurring' });
    }
    list.push({ title: `${r.title} ${what} today`, body: `${formatINR(r.amount_paise)} — open the app to add or skip`, when: at(due, cfg.time), url: '/' });
  }
  if (cfg.daily) {
    const byDay = new Map<string, number>();
    for (const t of data(7)) {
      const d = t.due_date < today ? today : t.due_date;
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      const n = byDay.get(d) ?? 0;
      list.push({ title: 'Good morning 👋', body: n ? `${n} task${n > 1 ? 's' : ''} due today. Study + work plan ready?` : 'Plan your day: study slots, client work, habits.', when: at(d, cfg.time), url: '/' });
    }
  }

  // Budget crossed: one alert per budget per month, shown right away
  if (cfg.budget) {
    try {
      const month = currentMonth();
      const k = `budget-alerted:${uid}:${month}`;
      const { value } = await Preferences.get({ key: k });
      const done = new Set<string>(value ? JSON.parse(value) : []);
      const over = (await budgetStatus(month)).filter((b) => b.pct >= 100 && !done.has(b.id));
      if (over.length) {
        list.push({ title: 'Budget crossed', body: `${over.length} budget${over.length > 1 ? 's are' : ' is'} over the limit this month`, when: new Date(Date.now() + 5000), url: '/budgets' });
        over.forEach((b) => done.add(b.id));
        await Preferences.set({ key: k, value: JSON.stringify([...done]) });
      }
    } catch {
      /* ignore */
    }
  }

  const now = Date.now();
  const future = list.filter((n) => n.when.getTime() > now).sort((a, b) => a.when.getTime() - b.when.getTime()).slice(0, 60);
  if (!future.length) return 0;
  await LocalNotifications.schedule({
    notifications: future.map((n, i) => ({
      id: 1000 + i,
      title: n.title,
      body: n.body,
      schedule: { at: n.when, allowWhileIdle: true },
      extra: { url: n.url },
    })),
  });
  return future.length;
}

/** Tapping a reminder opens the related screen */
export function onReminderTap(go: (url: string) => void): () => void {
  if (!remindersSupported()) return () => {};
  const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const url = a.notification.extra?.url;
    if (typeof url === 'string') go(url);
  });
  return () => {
    h.then((x) => x.remove());
  };
}
