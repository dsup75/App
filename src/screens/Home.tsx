import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Circle, ChevronRight, Settings as Gear } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { fetchBalances, fetchMoney, friendlyError, updateRecord, type Balance, type Row } from '../lib/db';
import { currentMonth, greeting, monthRange, todayISO, relativeDay } from '../lib/dates';
import { formatINR, sumPaise } from '../lib/money';
import { AREAS, optionLabel, PRIORITIES } from '../lib/tables';
import { Badge, Card, Chips, Empty, ErrorBox, IconButton, Page, SectionTitle, Spinner, cx } from '../components/ui';

type Filter = 'all' | 'personal' | 'study' | 'business';

export function Home() {
  const { settings } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<Row[]>([]);
  const [incomes, setIncomes] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const today = todayISO();

  const load = useCallback(async () => {
    setError('');
    try {
      const { from, to } = monthRange(currentMonth());
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [open, doneToday, i, e, b] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .is('deleted_at', null)
          .in('status', ['pending', 'in_progress'])
          .or(`due_date.lte.${today},due_date.is.null`)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(200),
        supabase
          .from('tasks')
          .select('*')
          .is('deleted_at', null)
          .eq('status', 'completed')
          .gte('completed_at', startOfDay.toISOString())
          .limit(200),
        fetchMoney('incomes', from, to),
        fetchMoney('expenses', from, to),
        fetchBalances(),
      ]);
      if (open.error) throw open.error;
      if (doneToday.error) throw doneToday.error;
      setTasks([...(open.data as Row[]), ...(doneToday.data as Row[])]);
      setIncomes(i);
      setExpenses(e);
      setBalances(b);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const byArea = <T extends Row>(rows: T[]) => (filter === 'all' ? rows : rows.filter((r) => r.area === filter));

  // Today's list: open tasks due today/overdue/undated + tasks completed today
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayTasks = useMemo(() => byArea(tasks), [tasks, filter]);
  const done = todayTasks.filter((t) => t.status === 'completed').length;
  const pct = todayTasks.length ? Math.round((done / todayTasks.length) * 100) : 0;

  const monthIncome = sumPaise(byArea(incomes));
  const monthExpense = sumPaise(byArea(expenses));
  const todayIncome = sumPaise(byArea(incomes).filter((r) => r.txn_date === today));
  const todayExpense = sumPaise(byArea(expenses).filter((r) => r.txn_date === today));
  const totalBalance = balances.reduce((s, b) => s + Number(b.balance_paise), 0);

  const toggle = async (t: Row) => {
    const status = t.status === 'completed' ? 'pending' : 'completed';
    setTasks((all) => all.map((x) => (x.id === t.id ? { ...x, status, completed_at: status === 'completed' ? new Date().toISOString() : null } : x)));
    try {
      await updateRecord('tasks', t.id, { status });
    } catch (e) {
      toast(friendlyError(e), 'error');
      load();
    }
  };

  const name = settings?.full_name?.split(' ')[0];
  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Page
      title={`${greeting()}${name ? `, ${name}` : ''}`}
      subtitle={dateLabel}
      right={
        <IconButton label="Settings" onClick={() => nav('/settings')}>
          <Gear size={20} />
        </IconButton>
      }
    >
      <Chips
        value={filter}
        onChange={setFilter}
        options={[{ value: 'all', label: 'All' }, ...(AREAS as { value: Filter; label: string }[])]}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <>
          <Card className="flex items-center gap-4">
            <Ring pct={pct} />
            <div className="flex-1">
              <p className="text-[13px] text-muted">Today's progress</p>
              <p className="text-[20px] font-bold">
                {done} of {todayTasks.length} done
              </p>
              <button onClick={() => nav('/tasks')} className="mt-1 flex items-center text-[13px] font-semibold text-primary">
                All tasks <ChevronRight size={14} />
              </button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-[12px] text-muted">Today's income</p>
              <p className="mt-1 text-[20px] font-bold text-income">{formatINR(todayIncome)}</p>
            </Card>
            <Card>
              <p className="text-[12px] text-muted">Today's expenses</p>
              <p className="mt-1 text-[20px] font-bold text-expense">{formatINR(todayExpense)}</p>
            </Card>
          </div>

          <SectionTitle>Today</SectionTitle>
          {todayTasks.length === 0 ? (
            <Empty title="Nothing due today" text="Tap + to add a task." />
          ) : (
            <div className="glass divide-y divide-[var(--hairline)] overflow-hidden rounded-[22px]">
              {todayTasks.slice(0, 8).map((t) => (
                <TaskLine key={t.id} task={t} today={today} onToggle={() => toggle(t)} onOpen={() => nav(`/r/tasks/${t.id}`)} />
              ))}
            </div>
          )}

          <SectionTitle right={<button onClick={() => nav('/finance')} className="text-[13px] font-semibold text-primary">Open</button>}>
            This month
          </SectionTitle>
          <Card onClick={() => nav('/finance')}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[12px] text-muted">Income</p>
                <p className="text-[16px] font-bold text-income">{formatINR(monthIncome)}</p>
              </div>
              <div>
                <p className="text-[12px] text-muted">Expenses</p>
                <p className="text-[16px] font-bold text-expense">{formatINR(monthExpense)}</p>
              </div>
              <div>
                <p className="text-[12px] text-muted">Net</p>
                <p className="text-[16px] font-bold">{formatINR(monthIncome - monthExpense)}</p>
              </div>
            </div>
            {filter === 'all' && (
              <div className="mt-3 flex items-center justify-between border-t border-[var(--hairline)] pt-3">
                <span className="text-[13px] text-muted">Total balance ({balances.length} accounts)</span>
                <span className="text-[16px] font-bold">{formatINR(totalBalance)}</span>
              </div>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

export function TaskLine({ task, today, onToggle, onOpen }: { task: Row; today: string; onToggle: () => void; onOpen: () => void }) {
  const done = task.status === 'completed';
  const overdue = !done && task.due_date && task.due_date < today;
  return (
    <div className="flex min-h-[54px] items-center gap-3 px-4 py-2.5">
      <button aria-label={done ? 'Mark not done' : 'Mark done'} onClick={onToggle} className="shrink-0 active:scale-90 transition-transform">
        {done ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-2)] text-white">
            <Check size={15} strokeWidth={3} />
          </span>
        ) : (
          <Circle size={24} className="text-muted" />
        )}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={cx('truncate text-[15px] font-medium', done && 'text-muted line-through')}>{task.title}</div>
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <span>{optionLabel(AREAS, task.area)}</span>
          {task.due_date && <span className={cx(overdue && 'text-danger')}>· {overdue ? 'Overdue · ' : ''}{relativeDay(task.due_date)}</span>}
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
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--hairline)" strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34D399" />
            <stop offset="1" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[16px] font-bold">{pct}%</span>
    </div>
  );
}
