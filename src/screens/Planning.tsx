// Budgets and recurring entries
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, SkipForward, PencilLine, CalendarClock } from 'lucide-react';
import { friendlyError, type Row } from '../lib/db';
import { budgetStatus, type BudgetStatus } from '../lib/budgets';
import { advanceRule, approveRule, dueRules } from '../lib/recurring';
import { currentMonth, monthLabel, relativeDay } from '../lib/dates';
import { formatINR, paiseToInput } from '../lib/money';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { TableList } from '../components/TableList';
import { Button, Card, Empty, ErrorBox, IconBubble, IconButton, List, ListRow, Page, ProgressBar, SectionTitle, Spinner } from '../components/ui';

export function barColor(pct: number) {
  return pct >= 100 ? 'var(--danger)' : pct >= 80 ? '#E0A030' : undefined;
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

  const total = (rows ?? []).filter((r) => !r.category_id && !r.area)[0];

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
          text="Set a monthly limit for a category (Food, Ads, Travel…) or for all spending. You'll see a warning on Home at 80% and when you cross it."
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
                      {r.category_id ? nameOf(r.category_id) : 'All spending'}
                      {r.area ? <span className="font-normal text-muted"> · {r.area}</span> : null}
                    </p>
                    <span className={'text-[13px] ' + (r.pct >= 100 ? 'font-semibold text-danger' : 'text-muted')}>{r.pct}%</span>
                  </div>
                  <ProgressBar pct={Math.min(100, r.pct)} color={barColor(r.pct)} />
                  <p className="text-[12.5px] text-muted">
                    {formatINR(r.spent)} of {formatINR(r.limit)} · {r.spent > r.limit ? `${formatINR(r.spent - r.limit)} over` : `${formatINR(r.limit - r.spent)} left`}
                    {r.month ? ' · this month only' : ''}
                  </p>
                </Card>
              ))}
          </div>
        </>
      )}
    </Page>
  );
}

export function RecurringScreen() {
  return (
    <TableList
      table="recurring_rules"
      order="next_date"
      asc
      subtitle="Rent, subscriptions, retainers… When one is due it shows on Home as a draft — nothing is saved until you approve."
      filters={[
        { value: 'active', label: 'Active', test: (r) => r.active },
        { value: 'paused', label: 'Paused', test: (r) => !r.active },
        { value: 'all', label: 'All', test: () => true },
      ]}
    />
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
          <CalendarClock size={14} /> Recurring — due
        </span>
      </SectionTitle>
      <List>
        {rules.map((r) => (
          <div key={r.id} className="space-y-2 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <IconBubble tone={r.kind === 'incomes' ? 'income' : 'expense'}>
                <CalendarClock size={17} />
              </IconBubble>
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
            title={r.category_id ? nameOf(r.category_id) : 'All spending'}
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
