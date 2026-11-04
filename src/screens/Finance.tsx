import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Landmark, Tag, Plus } from 'lucide-react';
import { fetchBalances, fetchMoney, friendlyError, type Balance, type Row } from '../lib/db';
import { currentMonth, monthLabel, monthRange, shiftMonth } from '../lib/dates';
import { formatINR, sumPaise } from '../lib/money';
import { ACCOUNT_TYPES, optionLabel } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { MoneyRow, type MoneyKind } from '../components/MoneyRow';
import { Button, Card, Chips, Empty, ErrorBox, IconBubble, IconButton, List, ListRow, Page, SectionTitle, Segmented, Spinner } from '../components/ui';

type Tab = 'overview' | 'transactions' | 'accounts' | 'categories';

export function Finance() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  const [month, setMonth] = useState(currentMonth());

  return (
    <Page title="Finance">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'transactions', label: 'Entries' },
          { value: 'accounts', label: 'Accounts' },
          { value: 'categories', label: 'Categories' },
        ]}
      />
      {(tab === 'overview' || tab === 'transactions') && <MonthPicker month={month} onChange={setMonth} />}
      {tab === 'overview' && <Overview month={month} />}
      {tab === 'transactions' && <Transactions month={month} />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'categories' && <Categories />}
    </Page>
  );
}

function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <IconButton label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={20} />
      </IconButton>
      <span className="text-[16px] font-semibold">{monthLabel(month)}</span>
      <IconButton label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={20} />
      </IconButton>
    </div>
  );
}

function useMonthData(month: string) {
  const [data, setData] = useState<{ incomes: Row[]; expenses: Row[]; transfers: Row[] } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      const { from, to } = monthRange(month);
      const [incomes, expenses, transfers] = await Promise.all([
        fetchMoney('incomes', from, to),
        fetchMoney('expenses', from, to),
        fetchMoney('transfers', from, to),
      ]);
      setData({ incomes, expenses, transfers });
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

function Overview({ month }: { month: string }) {
  const nav = useNavigate();
  const { data, error, reload } = useMonthData(month);
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const { nameOf } = useLookups();

  useEffect(() => {
    fetchBalances().then(setBalances).catch(() => setBalances([]));
  }, []);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  const inc = sumPaise(data.incomes);
  const exp = sumPaise(data.expenses);
  const total = (balances ?? []).reduce((s, b) => s + Number(b.balance_paise), 0);
  const recent = [
    ...data.incomes.map((r) => ({ kind: 'incomes' as MoneyKind, r })),
    ...data.expenses.map((r) => ({ kind: 'expenses' as MoneyKind, r })),
    ...data.transfers.map((r) => ({ kind: 'transfers' as MoneyKind, r })),
  ]
    .sort((a, b) => (b.r.txn_date + b.r.created_at).localeCompare(a.r.txn_date + a.r.created_at))
    .slice(0, 6);

  return (
    <>
      <Card>
        <p className="text-[13px] text-muted">Net this month</p>
        <p className="text-[34px] font-bold tracking-tight">{formatINR(inc - exp)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[var(--hairline)] p-3">
            <p className="text-[12px] text-muted">Income</p>
            <p className="text-[17px] font-bold text-income">{formatINR(inc)}</p>
          </div>
          <div className="rounded-2xl bg-[var(--hairline)] p-3">
            <p className="text-[12px] text-muted">Expenses</p>
            <p className="text-[17px] font-bold text-expense">{formatINR(exp)}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">Transfers between your accounts are not counted as income or expense.</p>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" onClick={() => nav('/r/incomes/new')}>+ Income</Button>
        <Button size="sm" onClick={() => nav('/r/expenses/new')}>+ Expense</Button>
        <Button size="sm" onClick={() => nav('/r/transfers/new')}>Transfer</Button>
      </div>

      <SectionTitle>Accounts · {formatINR(total)}</SectionTitle>
      {!balances ? (
        <Spinner />
      ) : (
        <List>
          {balances.map((b) => (
            <ListRow
              key={b.id}
              icon={<IconBubble tone="amber"><Landmark size={18} /></IconBubble>}
              title={b.name}
              subtitle={optionLabel(ACCOUNT_TYPES, b.type)}
              right={<span className="font-semibold">{formatINR(b.balance_paise)}</span>}
              onClick={() => nav(`/r/accounts/${b.id}`)}
            />
          ))}
        </List>
      )}

      <SectionTitle>Recent</SectionTitle>
      {recent.length === 0 ? (
        <Empty title="No entries this month" text="Add income or an expense to get started." />
      ) : (
        <List>
          {recent.map(({ kind, r }) => (
            <MoneyRow key={kind + r.id} kind={kind} row={r} nameOf={nameOf} />
          ))}
        </List>
      )}
    </>
  );
}

function Transactions({ month }: { month: string }) {
  const { data, error, reload } = useMonthData(month);
  const { nameOf } = useLookups();
  const [type, setType] = useState<'all' | MoneyKind>('all');

  const rows = useMemo(() => {
    if (!data) return [];
    const all = [
      ...(type === 'all' || type === 'incomes' ? data.incomes.map((r) => ({ kind: 'incomes' as MoneyKind, r })) : []),
      ...(type === 'all' || type === 'expenses' ? data.expenses.map((r) => ({ kind: 'expenses' as MoneyKind, r })) : []),
      ...(type === 'all' || type === 'transfers' ? data.transfers.map((r) => ({ kind: 'transfers' as MoneyKind, r })) : []),
    ];
    return all.sort((a, b) => (b.r.txn_date + b.r.created_at).localeCompare(a.r.txn_date + a.r.created_at));
  }, [data, type]);

  return (
    <>
      <Chips
        value={type}
        onChange={setType}
        options={[
          { value: 'all', label: 'All' },
          { value: 'incomes', label: 'Income' },
          { value: 'expenses', label: 'Expenses' },
          { value: 'transfers', label: 'Transfers' },
        ]}
      />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title="No entries" text="Nothing recorded for this month." />
      ) : (
        <List>
          {rows.map(({ kind, r }) => (
            <MoneyRow key={kind + r.id} kind={kind} row={r} nameOf={nameOf} />
          ))}
        </List>
      )}
    </>
  );
}

function Accounts() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Balance[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    fetchBalances()
      .then(setRows)
      .catch((e) => setError(friendlyError(e)));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!rows) return <Spinner />;
  return (
    <>
      <List>
        {rows.map((b) => (
          <ListRow
            key={b.id}
            icon={<IconBubble tone="amber"><Landmark size={18} /></IconBubble>}
            title={b.name}
            subtitle={`${optionLabel(ACCOUNT_TYPES, b.type)} · Opening ${formatINR(b.opening_balance_paise)}`}
            right={<span className="font-semibold">{formatINR(b.balance_paise)}</span>}
            onClick={() => nav(`/r/accounts/${b.id}`)}
            chevron
          />
        ))}
      </List>
      <p className="px-1 text-[12px] text-muted">Balance = opening balance + income − expenses ± transfers.</p>
      <Button full onClick={() => nav('/r/accounts/new')}>
        <Plus size={18} /> Add account
      </Button>
    </>
  );
}

function Categories() {
  const nav = useNavigate();
  const { categories, loaded } = useLookups();
  if (!loaded) return <Spinner />;
  const active = categories.filter((c) => !c.deleted_at);
  const group = (kind: 'income' | 'expense') => active.filter((c) => c.kind === kind);
  return (
    <>
      {(['income', 'expense'] as const).map((k) => (
        <div key={k} className="space-y-2">
          <SectionTitle>{k === 'income' ? 'Income categories' : 'Expense categories'}</SectionTitle>
          <List>
            {group(k).map((c) => (
              <ListRow
                key={c.id}
                icon={<IconBubble tone={k === 'income' ? 'income' : 'expense'}><Tag size={16} /></IconBubble>}
                title={c.name}
                onClick={() => nav(`/r/categories/${c.id}`)}
                chevron
              />
            ))}
            {group(k).length === 0 && <ListRow title="No categories yet" />}
          </List>
        </div>
      ))}
      <Button full onClick={() => nav('/r/categories/new')}>
        <Plus size={18} /> Add category
      </Button>
    </>
  );
}
