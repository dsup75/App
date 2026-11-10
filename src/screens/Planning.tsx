// Budgets and recurring entries
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, SkipForward, PencilLine, CalendarClock, Search } from 'lucide-react';
import { friendlyError, type Row } from '../lib/db';
import { budgetStatus, budgetTitle, type BudgetStatus } from '../lib/budgets';
import { advanceRule, approveRule, dueRules, monthlyCost, subState, yearlyCost, SUB_STATE_LABEL, type SubState } from '../lib/recurring';
import { supabase } from '../lib/supabase';
import { FREQUENCIES, optionLabel } from '../lib/tables';
import { currentMonth, formatDate, monthLabel, relativeDay, todayISO } from '../lib/dates';
import { formatINR, paiseToInput } from '../lib/money';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { EntityIcon } from '../components/EntityIcon';
import { Badge, Button, Card, Chips, Empty, ErrorBox, HeroCard, IconButton, List, ListRow, Page, ProgressBar, SectionTitle, Skeleton, Spinner } from '../components/ui';

export function barColor(pct: number) {
  return pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : undefined;
}

export function BudgetsScreen() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [rows, setRows] = useState<BudgetStatus[] | null>(null);
  const [error, setError] = useState('');
  const month = currentMonth();

  const load = useCallback(() => {
    setError('');
    budgetStatus(month)
      .then(setRows)
      .catch((e) => setError(friendlyError(e)));
  }, [month]);
  useEffect(load, [load]);

  const total = (rows ?? []).filter((r) => !r.category_id && !r.area && !r.account_id && !r.start_date)[0];

  return (
    <Page
      title="Budgets"
      subtitle={`${monthLabel(month)} · your share of spending vs limit`}
      back
      right={
        <IconButton label="Add budget" onClick={() => nav('/r/budgets/new')}>
          <Plus size={19} />
        </IconButton>
      }
    >
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty
          title="No budgets yet"
          text="Set a limit for a category (Food, Ads, Travel…), for one account, or for all spending — every month, one month, or any dates you choose. You'll see a warning on Home at 80% and when you cross it."
          action={<Button variant="primary" onClick={() => nav('/r/budgets/new')}>Add budget</Button>}
        />
      ) : (
        <>
          {total && (
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[14.5px] font-semibold">All spending</p>
                <span className="text-[13px] text-muted">{total.pct}%</span>
              </div>
              <ProgressBar pct={Math.min(100, total.pct)} color={barColor(total.pct)} />
              <p className="text-[13px] text-muted">
                {formatINR(total.spent)} of {formatINR(total.limit)} · {total.spent > total.limit ? `${formatINR(total.spent - total.limit)} over` : `${formatINR(total.limit - total.spent)} left`}
              </p>
            </Card>
          )}
          <div className="space-y-2">
            {rows
              .filter((r) => r !== total)
              .map((r) => (
                <Card key={r.id} className="space-y-2" onClick={() => nav(`/r/budgets/${r.id}`)}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[14.5px] font-semibold">
                      {budgetTitle(r, nameOf)}
                      {r.area ? <span className="font-normal text-muted"> · {r.area}</span> : null}
                    </p>
                    <span className={'text-[13px] ' + (r.pct >= 100 ? 'font-semibold text-danger' : 'text-muted')}>{r.pct}%</span>
                  </div>
                  <ProgressBar pct={Math.min(100, r.pct)} color={barColor(r.pct)} />
                  <p className="text-[12.5px] text-muted">
                    {formatINR(r.spent)} of {formatINR(r.limit)} · {r.spent > r.limit ? `${formatINR(r.spent - r.limit)} over` : `${formatINR(r.limit - r.spent)} left`}
                    {r.start_date ? ` · ${formatDate(r.from)} – ${formatDate(r.to)}` : r.month ? ' · this month only' : ''}
                  </p>
                </Card>
              ))}
          </div>
        </>
      )}
    </Page>
  );
}

type SubFilter = 'active' | 'paused' | 'cancelled' | 'expired' | 'all';

export function RecurringScreen() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<SubFilter>('active');
  const [kind, setKind] = useState<'all' | 'subs' | 'expenses' | 'incomes'>('all');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setError('');
    supabase
      .from('recurring_rules')
      .select('*')
      .is('deleted_at', null)
      .order('next_date')
      .then(({ data, error }) => (error ? setError(friendlyError(error)) : setRows((data as Row[]) ?? [])));
  }, []);
  useEffect(load, [load]);

  const all = rows ?? [];
  const live = all.filter((r) => subState(r) === 'active');
  const monthOut = live.filter((r) => r.kind === 'expenses').reduce((t, r) => t + monthlyCost(r), 0);
  const yearOut = live.filter((r) => r.kind === 'expenses').reduce((t, r) => t + yearlyCost(r), 0);
  const monthIn = live.filter((r) => r.kind === 'incomes').reduce((t, r) => t + monthlyCost(r), 0);
  const list = all
    .filter((r) => filter === 'all' || subState(r) === filter)
    .filter((r) => (kind === 'all' ? true : kind === 'subs' ? r.is_subscription : r.kind === kind))
    .filter((r) => !q.trim() || `${r.title} ${r.notes ?? ''} ${nameOf(r.account_id)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const tone: Record<SubState, 'primary' | 'amber' | 'muted' | 'danger'> = { active: 'primary', paused: 'amber', cancelled: 'muted', expired: 'danger' };

  return (
    <Page
      title="Subscriptions"
      subtitle="Subscriptions, rent, retainers… When one is due it shows on Home — nothing is saved until you approve."
      back
      right={
        <IconButton label="Add subscription" onClick={() => nav('/r/recurring_rules/new')}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <HeroCard>
        <p className="text-[13px] opacity-80">Active subscriptions & bills</p>
        <p className="mt-1 text-[28px] font-bold tracking-tight">
          {formatINR(monthOut)}
          <span className="text-[14px] font-medium opacity-80"> / month</span>
        </p>
        <p className="text-[12.5px] opacity-80">
          {formatINR(yearOut)} a year · {live.filter((r) => r.kind === 'expenses').length} active
          {monthIn ? ` · income ${formatINR(monthIn)}/month` : ''}
        </p>
      </HeroCard>

      <div className="glass flex items-center gap-2 rounded-[14px] px-3">
        <Search size={16} className="text-muted" />
        <input className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] outline-none" placeholder="Search subscriptions" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: `Active (${all.filter((r) => subState(r) === 'active').length})` },
          { value: 'paused', label: 'Paused' },
          { value: 'expired', label: 'Expired' },
          { value: 'cancelled', label: 'Cancelled' },
          { value: 'all', label: 'All' },
        ]}
      />
      <Chips
        value={kind}
        onChange={setKind}
        options={[
          { value: 'all', label: 'Everything' },
          { value: 'subs', label: 'Subscriptions' },
          { value: 'expenses', label: 'Bills / money out' },
          { value: 'incomes', label: 'Money in' },
        ]}
      />

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Skeleton rows={4} />
      ) : !list.length ? (
        <Empty
          title={all.length ? 'Nothing here' : 'No subscriptions yet'}
          text={all.length ? 'Try another filter.' : 'Add Netflix, Canva, phone recharge, rent or a client retainer. You get a reminder before each payment.'}
          action={!all.length && <Button variant="primary" onClick={() => nav('/r/recurring_rules/new')}>Add subscription</Button>}
        />
      ) : (
        <div className="land-2 space-y-2">
          {list.map((r) => {
            const st = subState(r);
            const days = Math.round((new Date(r.next_date + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / 86400000);
            return (
              <Card key={r.id} className="space-y-1.5" onClick={() => nav(`/r/recurring_rules/${r.id}`)}>
                <div className="flex items-center gap-3">
                  <EntityIcon table="recurring_rules" id={r.id} fallback={CalendarClock} fallbackTone={r.kind === 'incomes' ? 'income' : 'teal'} brandName={r.title} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{r.title}</p>
                    <p className="text-[12.5px] text-muted">
                      {optionLabel(FREQUENCIES, r.frequency)} · {nameOf(r.account_id)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={'text-[15px] font-semibold ' + (r.kind === 'incomes' ? 'text-income' : '')}>{formatINR(r.amount_paise)}</p>
                    <Badge tone={tone[st]}>{SUB_STATE_LABEL[st]}</Badge>
                  </div>
                </div>
                {st === 'active' && (
                  <p className={'text-[12.5px] ' + (days < 0 ? 'font-semibold text-danger' : days <= (r.remind_days ?? 1) ? 'font-semibold text-warn' : 'text-muted')}>
                    {days < 0 ? `Overdue by ${-days} day${days < -1 ? 's' : ''}` : days === 0 ? 'Due today' : `Next payment in ${days} day${days > 1 ? 's' : ''}`} · {formatDate(r.next_date)}
                  </p>
                )}
                {st === 'expired' && <p className="text-[12.5px] text-muted">Ended on {formatDate(r.end_date)}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}

/** Home card: due recurring entries → Add / Skip / Edit */
export function RecurringDrafts({ onChanged }: { onChanged?: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const { nameOf } = useLookups();
  const [rules, setRules] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    dueRules()
      .then(setRules)
      .catch(() => setRules([]));
  }, []);
  useEffect(load, [load]);

  if (!rules.length) return null;

  const run = async (rule: Row, fn: () => Promise<unknown>, msg: string) => {
    setBusy(rule.id);
    try {
      await fn();
      toast(msg);
      load();
      onChanged?.();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const edit = (r: Row) => {
    const q = new URLSearchParams({
      from_rule: r.id,
      title: r.title,
      amount_paise: paiseToInput(Number(r.amount_paise)),
      account_id: r.account_id,
      txn_date: r.next_date,
      due_for: r.next_date,
      payment_mode: r.payment_mode,
      area: r.area,
    });
    if (r.category_id) q.set('category_id', r.category_id);
    if (r.client_id) q.set('client_id', r.client_id);
    if (r.payment_app) q.set('payment_app', r.payment_app);
    nav(`/r/${r.kind}/new?${q.toString()}`);
  };

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={14} /> Due now — subscriptions & bills
        </span>
      </SectionTitle>
      <List>
        {rules.map((r) => (
          <div key={r.id} className="space-y-2 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <EntityIcon table="recurring_rules" id={r.id} fallback={CalendarClock} fallbackTone={r.kind === 'incomes' ? 'income' : 'expense'} brandName={r.title} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">{r.title}</p>
                <p className="text-[12.5px] text-muted">
                  Due {relativeDay(r.next_date)} · {nameOf(r.account_id)}
                </p>
              </div>
              <span className={'text-[14.5px] font-semibold ' + (r.kind === 'incomes' ? 'text-income' : 'text-expense')}>{formatINR(r.amount_paise)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => run(r, () => approveRule(r), 'Entry added')}>
                <Check size={14} /> Add
              </Button>
              <Button size="sm" onClick={() => edit(r)}>
                <PencilLine size={14} /> Edit
              </Button>
              <Button size="sm" onClick={() => run(r, () => advanceRule(r), 'Skipped this time')}>
                <SkipForward size={14} /> Skip
              </Button>
            </div>
          </div>
        ))}
      </List>
    </>
  );
}

/** Home card: budgets at 80% or more */
export function BudgetWarnings() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [rows, setRows] = useState<BudgetStatus[]>([]);
  useEffect(() => {
    budgetStatus()
      .then((r) => setRows(r.filter((x) => x.pct >= 80)))
      .catch(() => setRows([]));
  }, []);
  if (!rows.length) return null;
  return (
    <>
      <SectionTitle>Budget alerts</SectionTitle>
      <List>
        {rows.map((r) => (
          <ListRow
            key={r.id}
            title={budgetTitle(r, nameOf)}
            subtitle={
              <span className="block space-y-1.5 pt-1">
                <ProgressBar pct={Math.min(100, r.pct)} color={barColor(r.pct)} />
                <span className="block text-[12.5px]">
                  {formatINR(r.spent)} of {formatINR(r.limit)} {r.pct >= 100 ? `· ${formatINR(r.spent - r.limit)} over` : `· ${r.pct}% used`}
                </span>
              </span>
            }
            onClick={() => nav('/budgets')}
            chevron
          />
        ))}
      </List>
    </>
  );
}
