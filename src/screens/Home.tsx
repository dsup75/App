import { RecurringDrafts, BudgetWarnings } from './Planning';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Circle, Timer, Flame, CalendarClock, LayoutGrid, ChevronUp, ChevronDown, RotateCcw, ListTodo, ReceiptIndianRupee, HandCoins, AlertTriangle, ChevronRight, CalendarDays, ArrowRight, GraduationCap, FileText, CircleCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { fetchBalances, friendlyError, updateRecord, type Row } from '../lib/db';
import { currentMonth, monthRange, shiftMonth, todayISO, relativeDay, toISODate } from '../lib/dates';
import { formatINR, sumPaise } from '../lib/money';
import { AREAS, optionLabel, PRIORITIES } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { RecordLine } from '../components/RecordLine';
import { HealthCarousel } from '../components/HealthCarousel';
import { HomeHeader } from '../components/HomeHeader';
import { BalanceHero } from '../components/BalanceHero';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { BalanceCarousel } from '../components/BalanceCarousel';
import { NotificationsSheet, useNotices } from '../components/Notifications';
import {
  Badge, BarChart, Button, Card, Chips, Empty, ErrorBox, List, Page, SectionTitle, SeeAll, Sheet, Skeleton, Toggle, cx,
} from '../components/ui';

type Filter = 'all' | 'personal' | 'study' | 'business';

interface Dash {
  tasks: Row[];
  incomes: Row[];
  expenses: Row[];
  sixMonths: Row[];
  transfers: Row[];
  balance: number;
  habits: Row[];
  habitLogs: Row[];
  studyMinutes: number;
  toReceive: number;
  invoiceCount: number;
  dueLoans: Row[];
  upcoming: { date: string; title: string; kind: string; to: string }[];
  followUps: number;
  nextExam: Row | null;
  revisionsDue: number;
}

export function Home() {
  const { settings } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const { nameOf } = useLookups();
  const [filter, setFilter] = useState<Filter>('all');
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  const [hide, setHide] = useState(() => {
    try {
      return localStorage.getItem('hide-balance') === '1';
    } catch {
      return false;
    }
  });
  const today = todayISO();
  const { accounts, loaded: lookupsLoaded } = useLookups();
  const setupNeeded = lookupsLoaded && !accounts.some((a) => !a.deleted_at);
  const [layout, setLayoutState] = useState(loadLayout);
  const notices = useNotices();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const setLayout = (l: typeof DEFAULT_LAYOUT) => {
    setLayoutState(l);
    try {
      localStorage.setItem('home-layout', JSON.stringify(l));
    } catch {
      /* ignore */
    }
  };
  const move = (id: HomeSection, dir: -1 | 1) => {
    const o = [...layout.order];
    const i = o.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setLayout({ ...layout, order: o });
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const { from, to } = monthRange(currentMonth());
      const sixFrom = monthRange(shiftMonth(currentMonth(), -5)).from;
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const week = toISODate(in7);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const raw = await loadDashboard({ today, from, to, sixFrom, week, dayStart: startOfDay.toISOString() }, async () => {
        const q = await Promise.all([
        supabase.from('tasks').select('*').is('deleted_at', null).in('status', ['pending', 'in_progress', 'waiting']).or(`due_date.lte.${today},due_date.is.null`).order('due_date', { ascending: true, nullsFirst: false }).limit(200),
        supabase.from('tasks').select('*').is('deleted_at', null).eq('status', 'completed').gte('completed_at', startOfDay.toISOString()).limit(200),
        supabase.from('incomes').select('*').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to).order('txn_date', { ascending: false }),
        supabase.from('expenses').select('*').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to).order('txn_date', { ascending: false }),
        supabase.from('expenses').select('amount_paise,txn_date,area').is('deleted_at', null).gte('txn_date', sixFrom).lte('txn_date', to),
        supabase.from('habits').select('*').is('deleted_at', null),
        supabase.from('habit_logs').select('habit_id,log_date').eq('log_date', today),
        supabase.from('study_sessions').select('minutes').is('deleted_at', null).eq('session_date', today),
        supabase.from('invoices').select('id,amount_paise,due_date,invoice_no,client_id').is('deleted_at', null).eq('status', 'sent'),
        supabase.from('invoice_totals').select('id,received_paise'),
        supabase.from('payment_requests').select('amount_paise,due_date,title,id').is('deleted_at', null).eq('status', 'pending'),
        supabase.from('loans').select('*').is('deleted_at', null).not('due_date', 'is', null).lte('due_date', week),
        supabase.from('loan_totals').select('id,principal_repaid_paise'),
        supabase.from('events').select('id,title,event_date').is('deleted_at', null).gte('event_date', today).lte('event_date', week),
        supabase.from('tasks').select('id,title,due_date').is('deleted_at', null).in('status', ['pending', 'in_progress', 'waiting']).gt('due_date', today).lte('due_date', week),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('client_id', 'is', null).in('status', ['pending', 'in_progress', 'waiting']).in('task_type', ['follow_up', 'approval']),
        supabase.from('exams').select('*').is('deleted_at', null).gte('exam_date', today).order('exam_date').limit(1),
        fetchBalances(),
        supabase.from('transfers').select('amount_paise').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to),
      ]);
      for (const r of q.slice(0, 17) as any[]) if (r.error) throw r.error;
      const [open, doneToday, inc, exp, six, habits, logs, study, inv, invTot, reqs, loans, loanTot, events, weekTasks, fu, exams] = q as any[];
      const balances = q[17] as Awaited<ReturnType<typeof fetchBalances>>;
      const transfers = ((q[18] as any).data ?? []) as Row[];

        return { open, doneToday, inc, exp, six, habits, logs, study, inv, invTot, reqs, loans, loanTot, events, weekTasks, fu, exams, balances, transfers };
      });
      const { open, doneToday, inc, exp, six, habits, logs, study, inv, invTot, reqs, loans, loanTot, events, weekTasks, fu, exams, balances, transfers } = raw;
      const rec = new Map<string, number>((invTot.data ?? []).map((x: any) => [x.id, Number(x.received_paise)]));
      const unpaidInv = (inv.data ?? []).filter((x: any) => (rec.get(x.id) ?? 0) < x.amount_paise);
      const toReceive =
        unpaidInv.reduce((s: number, x: any) => s + x.amount_paise - (rec.get(x.id) ?? 0), 0) + sumPaise(reqs.data ?? []);
      const repaid = new Map<string, number>((loanTot.data ?? []).map((x: any) => [x.id, Number(x.principal_repaid_paise)]));
      const dueLoans = (loans.data ?? [])
        .map((l: any) => ({ ...l, remaining: l.principal_paise - (repaid.get(l.id) ?? 0) }))
        .filter((l: any) => l.remaining > 0);

      let revs: { id: string; chapter_name: string; subject_name: string | null; due_date: string }[] = [];
      try {
        const rq = await supabase.from('revision_queue').select('id,chapter_name,subject_name,due_date').eq('status', 'pending').lte('due_date', week).order('due_date').limit(100);
        if (!rq.error) revs = (rq.data ?? []) as typeof revs;
      } catch {
        /* revisions are optional on Home */
      }
      const upcoming = [
        ...revs.filter((r) => r.due_date > today).map((r) => ({ date: r.due_date, title: `Revise ${r.chapter_name}`, kind: r.subject_name ? `Revision · ${r.subject_name}` : 'Revision', to: '/revisions' })),
        ...(weekTasks.data ?? []).map((t: any) => ({ date: t.due_date, title: t.title, kind: 'Task', to: `/r/tasks/${t.id}` })),
        ...(events.data ?? []).map((e: any) => ({ date: e.event_date, title: e.title, kind: 'Event', to: `/r/events/${e.id}` })),
        ...unpaidInv.filter((x: any) => x.due_date && x.due_date <= week).map((x: any) => ({ date: x.due_date, title: `Invoice ${x.invoice_no}`, kind: 'Invoice due', to: `/r/invoices/${x.id}` })),
        ...(reqs.data ?? []).filter((x: any) => x.due_date && x.due_date <= week).map((x: any) => ({ date: x.due_date, title: x.title, kind: 'Payment due', to: `/r/payment_requests/${x.id}` })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      setD({
        tasks: [...(open.data ?? []), ...(doneToday.data ?? [])],
        incomes: inc.data ?? [],
        expenses: exp.data ?? [],
        sixMonths: six.data ?? [],
        transfers,
        balance: balances.reduce((s: number, b: any) => s + Number(b.balance_paise), 0),
        habits: habits.data ?? [],
        habitLogs: logs.data ?? [],
        studyMinutes: (study.data ?? []).reduce((s: number, x: any) => s + x.minutes, 0),
        toReceive,
        invoiceCount: unpaidInv.length + (reqs.data ?? []).length,
        dueLoans,
        upcoming,
        followUps: fu.count ?? 0,
        nextExam: (exams.data ?? [])[0] ?? null,
        revisionsDue: revs.filter((r) => r.due_date <= today).length,
      });
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const byArea = <T extends Row>(rows: T[]) => (filter === 'all' ? rows : rows.filter((r) => r.area === filter));
  const todayTasks = useMemo(() => (d ? byArea(d.tasks) : []), [d, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Page title="Home"><ErrorBox message={error} onRetry={load} /></Page>;

  const name = settings?.full_name?.split(' ')[0];

  const overdueTasks = d ? d.tasks.filter((t) => t.status !== 'completed' && t.due_date && t.due_date < today).length : 0;
  const done = todayTasks.filter((t) => t.status === 'completed').length;
  const pct = todayTasks.length ? Math.round((done / todayTasks.length) * 100) : 0;

  const toggle = async (t: Row) => {
    const status = t.status === 'completed' ? 'pending' : 'completed';
    setD((x) => x && { ...x, tasks: x.tasks.map((y) => (y.id === t.id ? { ...y, status } : y)) });
    try {
      await updateRecord('tasks', t.id, { status });
    } catch (e) {
      toast(friendlyError(e), 'error');
      load();
    }
  };

  const toggleHide = () => {
    setHide((h) => {
      try {
        localStorage.setItem('hide-balance', h ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !h;
    });
  };
  const money = (p: number) => (hide ? '₹ • • • •' : formatINR(p));

  const sections: Record<HomeSection, ReactNode> = d
    ? {
        summary: (
          <>
          <Card className="flex items-center gap-4">
            <Ring pct={pct} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[15px] font-bold">
                {done}/{todayTasks.length} tasks done
              </p>
              <button onClick={() => nav('/habits')} className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <Flame size={14} className="text-warn" /> Habits {d.habitLogs.length}/{d.habits.length} today
              </button>
              <button onClick={() => nav('/study')} className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <Timer size={14} className="text-primary" /> Studied {Math.floor(d.studyMinutes / 60)}h {d.studyMinutes % 60}m today
              </button>
              {d.nextExam && (
                <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <CalendarClock size={14} className="text-danger" /> {d.nextExam.name} in {daysUntil(d.nextExam.exam_date)} days
                </p>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2.5">
            <Card onClick={() => nav('/finance?tab=transactions')} className="!p-3.5">
              <p className="text-[12px] text-muted">Today's income</p>
              <p className="mt-0.5 text-[17px] font-bold text-income">{money(sumPaise(byArea(d.incomes).filter((r) => r.txn_date === today)))}</p>
            </Card>
            <Card onClick={() => nav('/finance?tab=transactions')} className="!p-3.5">
              <p className="text-[12px] text-muted">Today's expenses</p>
              <p className="mt-0.5 text-[17px] font-bold text-expense">{money(sumPaise(byArea(d.expenses).filter((r) => r.txn_date === today)))}</p>
            </Card>
          </div>
          </>
        ),
        health: (
          <>
          <HealthCarousel />
          </>
        ),
        timeline: (
          <>
          <ActivityTimeline compact />
          </>
        ),
        drafts: (
          <>
          <RecurringDrafts onChanged={load} />
          </>
        ),
        budget: (
          <>
          <BudgetWarnings />
          </>
        ),
        today: (
          <>
          <SectionTitle right={<SeeAll onClick={() => nav('/tasks')} />}>Today</SectionTitle>
          {todayTasks.length === 0 ? (
            <Empty title="Nothing due today" text="Tap + to add a task." />
          ) : (
            <div className="glass divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]">
              {todayTasks.slice(0, 7).map((t) => (
                <TaskLine key={t.id} task={t} today={today} onToggle={() => toggle(t)} onOpen={() => nav(`/r/tasks/${t.id}`)} extra={t.client_id ? nameOf(t.client_id) : undefined} />
              ))}
            </div>
          )}
          </>
        ),
        attention: (
          <>
          {(() => {
            const chips = [
              { n: d.invoiceCount, label: 'Pending Payments', icon: <ReceiptIndianRupee size={18} />, tint: 'var(--tone-blue)', to: '/invoices' },
              { n: overdueTasks, label: 'Overdue Tasks', icon: <ListTodo size={18} />, tint: 'var(--tone-amber)', to: '/tasks' },
              { n: d.revisionsDue, label: 'Due Revisions', icon: <RotateCcw size={18} />, tint: 'var(--tone-violet)', to: '/revisions' },
              { n: d.dueLoans.length, label: 'Udhaar Due', icon: <HandCoins size={18} />, tint: 'var(--tone-pink)', to: '/loans' },
              { n: d.followUps, label: 'Follow-ups', icon: <CalendarClock size={18} />, tint: 'var(--tone-teal)', to: '/clients?tab=tasks' },
            ].filter((c) => c.n > 0);
            if (!chips.length) return null;
            const total = chips.reduce((t, c) => t + c.n, 0);
            return (
              <div className="glass space-y-3 rounded-[24px] p-3.5">
                <button type="button" className="flex w-full items-center gap-2" onClick={() => { setNoticeOpen(true); notices.reload(); }}>
                  <AlertTriangle size={22} className="shrink-0" style={{ color: 'var(--tone-amber-solid)', fill: 'var(--tone-amber-bg)' }} />
                  <span className="min-w-0 flex-1 text-left text-[17px] font-bold">Need Attention</span>
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--danger)] px-2 text-[13px] font-bold text-white">{total}</span>
                  <ChevronRight size={18} className="text-muted" />
                </button>
                <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
                  {chips.map((c) => (
                    <button key={c.label} type="button" onClick={() => nav(c.to)} className="tint-card press flex items-center gap-2 rounded-[16px] p-2.5 text-left" style={{ ['--tint' as string]: c.tint }}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-white" style={{ background: c.tint }}>{c.icon}</span>
                      <span className="text-[19px] font-bold" style={{ color: c.tint }}>{c.n}</span>
                      <span className="min-w-0 text-[11.5px] font-medium leading-tight">{c.label}</span>
                    </button>
                  ))}
                </div>
                {d.toReceive > 0 && (
                  <p className="px-1 text-[12px] text-muted">
                    To receive from clients: <b className="text-fg">{money(d.toReceive)}</b>
                  </p>
                )}
              </div>
            );
          })()}
          </>
        ),
        spending: (
          <>
          <SectionTitle right={<SeeAll onClick={() => nav('/reports')} label="Reports" />}>Spending overview</SectionTitle>
          <Card>
            <BarChart data={sixMonthBars(byArea(d.sixMonths) as (Row & { amount_paise: number; txn_date: string })[])} format={(v) => formatINR(v)} />
          </Card>
          </>
        ),
        upcoming: (
          <>
          {d.upcoming.length > 0 && (
            <div className="glass space-y-3 rounded-[24px] p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white" style={{ background: 'var(--tone-blue)' }}>
                  <CalendarDays size={17} />
                </span>
                <p className="min-w-0 flex-1 text-[17px] font-bold">Upcoming</p>
                <button type="button" onClick={() => nav('/calendar')} className="glass press flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold">
                  See All <ArrowRight size={13} />
                </button>
              </div>
              <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {d.upcoming.slice(0, 10).map((u, i) => {
                  const k = /revision/i.test(u.kind) ? 'var(--tone-violet)' : /exam|test/i.test(u.kind) ? 'var(--tone-blue)' : /event|birthday/i.test(u.kind) ? 'var(--tone-pink)' : /task/i.test(u.kind) ? 'var(--tone-income)' : 'var(--tone-amber)';
                  const I = /revision/i.test(u.kind) ? GraduationCap : /exam|test/i.test(u.kind) ? FileText : /event|birthday/i.test(u.kind) ? CalendarDays : /task/i.test(u.kind) ? CircleCheck : CalendarClock;
                  return (
                    <button key={i} type="button" onClick={() => nav(u.to)} className="tint-card press w-[44%] min-w-[140px] shrink-0 rounded-[18px] p-3 text-left" style={{ ['--tint' as string]: k }}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] text-white" style={{ background: k }}>
                        <I size={18} />
                      </span>
                      <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-tight">{u.title}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted">{u.kind} · {relativeDay(u.date)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </>
        ),
        recent: (
          <>
          <SectionTitle right={<SeeAll onClick={() => nav('/finance?tab=transactions')} />}>Recent transactions</SectionTitle>
          {d.incomes.length + d.expenses.length === 0 ? (
            <Empty title="No transactions this month" />
          ) : (
            <List>
              {[...byArea(d.incomes).map((r) => ({ t: 'incomes' as const, r })), ...byArea(d.expenses).map((r) => ({ t: 'expenses' as const, r }))]
                .sort((a, b) => (b.r.txn_date + b.r.created_at).localeCompare(a.r.txn_date + a.r.created_at))
                .slice(0, 5)
                .map(({ t, r }) => (
                  <RecordLine key={t + r.id} table={t} row={r} nameOf={nameOf} />
                ))}
            </List>
          )}
          </>
        ),
      }
    : ({} as Record<HomeSection, ReactNode>);

  return (
    <Page
      title="Home"
      header={
        <HomeHeader
          name={name}
          unread={notices.unread}
          onBell={() => {
            setNoticeOpen(true);
            notices.reload();
          }}
        />
      }
    >
      <NotificationsSheet
        open={noticeOpen}
        onClose={() => {
          setNoticeOpen(false);
          notices.markSeen();
        }}
        items={notices.items}
        seen={notices.seen}
      />
      {!d ? (
        <Skeleton rows={5} />
      ) : (
        <>
          <BalanceCarousel hide={hide}>
          <BalanceHero total={d.balance} monthIn={sumPaise(byArea(d.incomes))} monthOut={sumPaise(byArea(d.expenses))} hide={hide} onToggleHide={toggleHide} />
          </BalanceCarousel>

          <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, ...(AREAS as { value: Filter; label: string }[])]} />

          {setupNeeded && (
            <Card className="space-y-2">
              <p className="text-[15px] font-semibold">Let's set up your app</p>
              <p className="text-[13px] text-muted">Add your accounts (bank, UPI apps, cash) with opening balance, pick categories and add clients. Takes 2 minutes.</p>
              <Button variant="primary" size="sm" onClick={() => nav('/setup')}>Start setup</Button>
            </Card>
          )}

          <div className="land-2 space-y-3.5">
            {layout.order
              .filter((id) => !layout.hidden.includes(id))
              .map((id) => (
                <section key={id} className="space-y-3.5">
                  {sections[id]}
                </section>
              ))}
          </div>

          <button onClick={() => setCustomize(true)} className="mx-auto flex items-center gap-1.5 py-2 text-[13px] font-semibold text-primary">
            <LayoutGrid size={14} /> Customise Home
          </button>
        </>
      )}

      <Sheet open={customize} onClose={() => setCustomize(false)} title="Customise Home">
        <List>
          {layout.order.map((id, i) => (
            <div key={id} className="flex items-center gap-2 px-3.5 py-2.5">
              <Toggle
                checked={!layout.hidden.includes(id)}
                onChange={(v) => setLayout({ ...layout, hidden: v ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id] })}
              />
              <span className="min-w-0 flex-1 text-[14px]">{SECTION_LABELS[id]}</span>
              <button aria-label="Move up" disabled={i === 0} onClick={() => move(id, -1)} className="p-1.5 text-muted disabled:opacity-30">
                <ChevronUp size={17} />
              </button>
              <button aria-label="Move down" disabled={i === layout.order.length - 1} onClick={() => move(id, 1)} className="p-1.5 text-muted disabled:opacity-30">
                <ChevronDown size={17} />
              </button>
            </div>
          ))}
        </List>
        <Button full className="mt-3" onClick={() => setLayout(DEFAULT_LAYOUT)}>Reset to default</Button>
      </Sheet>
    </Page>
  );
}

/** One server call for the whole Home screen; falls back to separate queries if the server function is missing */
async function loadDashboard(
  p: { today: string; from: string; to: string; sixFrom: string; week: string; dayStart: string },
  legacy: () => Promise<any>,
): Promise<any> {
  const { data, error } = await supabase.rpc('home_dashboard', {
    p_today: p.today,
    p_from: p.from,
    p_to: p.to,
    p_six_from: p.sixFrom,
    p_week: p.week,
    p_day_start: p.dayStart,
  });
  if (error || !data) return legacy();
  const x = data as any;
  const wrap = (v: any) => ({ data: v ?? [] });
  return {
    open: wrap(x.open),
    doneToday: wrap(x.done_today),
    inc: wrap(x.incomes),
    exp: wrap(x.expenses),
    six: wrap(x.six),
    habits: wrap(x.habits),
    logs: wrap(x.habit_logs),
    study: wrap([{ minutes: Number(x.study_minutes) || 0 }]),
    inv: wrap(x.invoices),
    invTot: wrap((x.invoices ?? []).map((i: any) => ({ id: i.id, received_paise: i.received_paise }))),
    reqs: wrap(x.requests),
    loans: wrap(x.loans),
    loanTot: wrap((x.loans ?? []).map((l: any) => ({ id: l.id, principal_repaid_paise: l.principal_repaid_paise }))),
    events: wrap(x.events),
    weekTasks: wrap(x.week_tasks),
    fu: { count: Number(x.follow_ups) || 0 },
    exams: wrap(x.next_exam ? [x.next_exam] : []),
    balances: [{ balance_paise: Number(x.balance) || 0 }],
    transfers: x.transfers ?? [],
  };
}

type HomeSection = 'health' | 'summary' | 'drafts' | 'budget' | 'today' | 'attention' | 'spending' | 'upcoming' | 'timeline' | 'recent';
const SECTION_LABELS: Record<HomeSection, string> = {
  health: 'Health & connected devices',
  timeline: 'Activity timeline',
  summary: 'Today summary (tasks, habits, study)',
  drafts: 'Due subscriptions & bills',
  budget: 'Budget alerts',
  today: "Today's tasks",
  attention: 'Needs attention',
  spending: 'Spending overview',
  upcoming: 'Next 7 days',
  recent: 'Recent transactions',
};
const DEFAULT_LAYOUT: { order: HomeSection[]; hidden: HomeSection[] } = {
  order: ['health', 'attention', 'upcoming', 'timeline', 'summary', 'drafts', 'today', 'budget', 'spending', 'recent'],
  hidden: [],
};
function loadLayout() {
  try {
    const v = JSON.parse(localStorage.getItem('home-layout') || 'null');
    if (v?.order) {
      // layouts saved before Dashboard 2.0: Health goes first, Timeline right after "Next 7 days"
      const saved: HomeSection[] = v.order.filter((k: HomeSection) => k in SECTION_LABELS);
      if (!saved.includes('health')) saved.unshift('health');
      if (!saved.includes('timeline')) saved.splice(saved.includes('upcoming') ? saved.indexOf('upcoming') + 1 : saved.length, 0, 'timeline');
      const order = [...saved, ...DEFAULT_LAYOUT.order.filter((k) => !saved.includes(k))];
      return { order, hidden: (v.hidden ?? []).filter((k: HomeSection) => k in SECTION_LABELS) } as typeof DEFAULT_LAYOUT;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT;
}

function daysUntil(iso: string) {
  const a = new Date(todayISO() + 'T00:00:00').getTime();
  const b = new Date(iso + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

export function sixMonthBars(rows: { amount_paise: number; txn_date: string }[]) {
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(currentMonth(), -i));
  return months.map((m, i) => ({
    label: new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString('en-IN', { month: 'short' }),
    value: sumPaise(rows.filter((r) => r.txn_date.startsWith(m))),
    highlight: i === 5,
  }));
}

export function TaskLine({
  task,
  today,
  onToggle,
  onOpen,
  extra,
}: {
  task: Row;
  today: string;
  onToggle: () => void;
  onOpen: () => void;
  extra?: string;
}) {
  const done = task.status === 'completed';
  const overdue = !done && task.due_date && task.due_date < today;
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-3.5 py-2">
      <button aria-label={done ? 'Mark not done' : 'Mark done'} onClick={onToggle} className="shrink-0 transition-transform active:scale-90">
        {done ? (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--primary-2)] text-[var(--on-primary)]">
            <Check size={14} strokeWidth={3} />
          </span>
        ) : (
          <Circle size={22} className="text-muted" />
        )}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={cx('truncate text-[14.5px] font-medium', done && 'text-muted line-through')}>{task.title}</div>
        <div className="flex items-center gap-1.5 truncate text-[12px] text-muted">
          <span>{extra ?? optionLabel(AREAS, task.area)}</span>
          {task.status === 'waiting' && <span>· Waiting for client</span>}
          {task.due_date && (
            <span className={cx(overdue && 'text-danger')}>
              · {overdue ? 'Overdue · ' : ''}
              {relativeDay(task.due_date)}
            </span>
          )}
        </div>
      </button>
      {(task.priority === 'high' || task.priority === 'urgent') && !done && (
        <Badge tone={task.priority === 'urgent' ? 'danger' : 'amber'}>{optionLabel(PRIORITIES, task.priority)}</Badge>
      )}
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--hairline)" strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="var(--primary-2)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold">{pct}%</span>
    </div>
  );
}
