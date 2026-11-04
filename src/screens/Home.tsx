import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Circle, Settings as Gear, Eye, EyeOff, ArrowDownLeft, ArrowUpRight, Timer, Flame, CalendarClock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { fetchBalances, friendlyError, updateRecord, type Row } from '../lib/db';
import { currentMonth, greeting, monthRange, shiftMonth, todayISO, relativeDay, toISODate } from '../lib/dates';
import { formatINR, sumPaise } from '../lib/money';
import { AREAS, optionLabel, PRIORITIES } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { RecordLine } from '../components/RecordLine';
import {
  Badge, BarChart, Card, Chips, Empty, ErrorBox, HeroCard, IconBubble, IconButton, List, ListRow, Page, SectionTitle, SeeAll, Spinner, cx,
} from '../components/ui';

type Filter = 'all' | 'personal' | 'study' | 'business';

interface Dash {
  tasks: Row[];
  incomes: Row[];
  expenses: Row[];
  sixMonths: Row[];
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
      ]);
      for (const r of q.slice(0, 17) as any[]) if (r.error) throw r.error;
      const [open, doneToday, inc, exp, six, habits, logs, study, inv, invTot, reqs, loans, loanTot, events, weekTasks, fu, exams] = q as any[];
      const balances = q[17] as Awaited<ReturnType<typeof fetchBalances>>;

      const rec = new Map<string, number>((invTot.data ?? []).map((x: any) => [x.id, Number(x.received_paise)]));
      const unpaidInv = (inv.data ?? []).filter((x: any) => (rec.get(x.id) ?? 0) < x.amount_paise);
      const toReceive =
        unpaidInv.reduce((s: number, x: any) => s + x.amount_paise - (rec.get(x.id) ?? 0), 0) + sumPaise(reqs.data ?? []);
      const repaid = new Map<string, number>((loanTot.data ?? []).map((x: any) => [x.id, Number(x.principal_repaid_paise)]));
      const dueLoans = (loans.data ?? [])
        .map((l: any) => ({ ...l, remaining: l.principal_paise - (repaid.get(l.id) ?? 0) }))
        .filter((l: any) => l.remaining > 0);

      const upcoming = [
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
        balance: balances.reduce((s, b) => s + Number(b.balance_paise), 0),
        habits: habits.data ?? [],
        habitLogs: logs.data ?? [],
        studyMinutes: (study.data ?? []).reduce((s: number, x: any) => s + x.minutes, 0),
        toReceive,
        invoiceCount: unpaidInv.length + (reqs.data ?? []).length,
        dueLoans,
        upcoming,
        followUps: fu.count ?? 0,
        nextExam: (exams.data ?? [])[0] ?? null,
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
  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

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

  return (
    <Page
      title={`${greeting()}${name ? `, ${name}` : ''}`}
      subtitle={dateLabel}
      right={
        <IconButton label="Settings" onClick={() => nav('/settings')}>
          <Gear size={18} />
        </IconButton>
      }
    >
      {!d ? (
        <Spinner />
      ) : (
        <>
          <HeroCard onClick={() => nav('/finance')}>
            <div className="flex items-center justify-between">
              <p className="text-[13px] opacity-85">Total balance</p>
              <button
                aria-label={hide ? 'Show amounts' : 'Hide amounts'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHide();
                }}
                className="rounded-full bg-white/15 p-1.5"
              >
                {hide ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="mt-1 text-[30px] font-bold tracking-tight">{money(d.balance)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[14px] p-2.5" style={{ background: 'rgba(255,255,255,.12)' }}>
                <p className="flex items-center gap-1 text-[11.5px] opacity-85"><ArrowDownLeft size={13} /> Income this month</p>
                <p className="text-[16px] font-bold">{money(sumPaise(byArea(d.incomes)))}</p>
              </div>
              <div className="rounded-[14px] p-2.5" style={{ background: 'rgba(255,255,255,.12)' }}>
                <p className="flex items-center gap-1 text-[11.5px] opacity-85"><ArrowUpRight size={13} /> Spent this month</p>
                <p className="text-[16px] font-bold">{money(sumPaise(byArea(d.expenses)))}</p>
              </div>
            </div>
          </HeroCard>

          <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, ...(AREAS as { value: Filter; label: string }[])]} />

          <Card className="flex items-center gap-4">
            <Ring pct={pct} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[15px] font-bold">
                {done}/{todayTasks.length} tasks done
              </p>
              <button onClick={() => nav('/habits')} className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <Flame size={14} className="text-amber-500" /> Habits {d.habitLogs.length}/{d.habits.length} today
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

          {(d.toReceive > 0 || d.dueLoans.length > 0 || d.followUps > 0) && (
            <>
              <SectionTitle>Needs attention</SectionTitle>
              <List>
                {d.toReceive > 0 && (
                  <ListRow
                    icon={<IconBubble tone="teal"><ArrowDownLeft size={17} /></IconBubble>}
                    title="To receive from clients"
                    subtitle={`${d.invoiceCount} pending invoices / requests`}
                    right={<span className="text-[14px] font-semibold">{money(d.toReceive)}</span>}
                    onClick={() => nav('/invoices')}
                    chevron
                  />
                )}
                {d.followUps > 0 && (
                  <ListRow
                    icon={<IconBubble tone="blue"><CalendarClock size={17} /></IconBubble>}
                    title="Client follow-ups & approvals"
                    right={<Badge tone="blue">{d.followUps}</Badge>}
                    onClick={() => nav('/clients?tab=tasks')}
                    chevron
                  />
                )}
                {d.dueLoans.map((l: any) => (
                  <ListRow
                    key={l.id}
                    icon={<IconBubble tone="amber"><CalendarClock size={17} /></IconBubble>}
                    title={l.direction === 'lent' ? `${l.person} owes you` : `Pay ${l.person}`}
                    subtitle={`${l.due_date < today ? 'Overdue · ' : 'Due '}${relativeDay(l.due_date)}`}
                    right={<span className={cx('text-[14px] font-semibold', l.direction === 'lent' ? 'text-income' : 'text-expense')}>{money(l.remaining)}</span>}
                    onClick={() => nav(`/r/loans/${l.id}`)}
                  />
                ))}
              </List>
            </>
          )}

          <SectionTitle right={<SeeAll onClick={() => nav('/reports')} label="Reports" />}>Spending overview</SectionTitle>
          <Card>
            <BarChart data={sixMonthBars(byArea(d.sixMonths))} format={(v) => formatINR(v)} />
          </Card>

          {d.upcoming.length > 0 && (
            <>
              <SectionTitle right={<SeeAll onClick={() => nav('/calendar')} label="Calendar" />}>Next 7 days</SectionTitle>
              <List>
                {d.upcoming.slice(0, 6).map((u, i) => (
                  <ListRow key={i} title={u.title} subtitle={`${u.kind} · ${relativeDay(u.date)}`} onClick={() => nav(u.to)} chevron />
                ))}
              </List>
            </>
          )}

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
      )}
    </Page>
  );
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
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--primary-2)] text-white">
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
