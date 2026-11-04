import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Landmark, Tag, Plus, QrCode, FileText, HandCoins, Target, Users, Wand2, Smartphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBalances, fetchMoney, friendlyError, type Balance, type Row } from '../lib/db';
import { currentMonth, monthLabel, monthRange, shiftMonth } from '../lib/dates';
import { formatINR, sumPaise } from '../lib/money';
import { ACCOUNT_TYPES, UPI_APPS, optionLabel } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { MoneyRow, type MoneyKind } from '../components/MoneyRow';
import {
  BarChart, Button, Card, CHART_COLORS, Chips, Donut, Empty, ErrorBox, HeroCard, IconBubble, IconButton, List, ListRow, Page, SectionTitle, Segmented, SeeAll, Spinner,
} from '../components/ui';
import { sixMonthBars } from './Home';

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
        <ChevronLeft size={18} />
      </IconButton>
      <span className="text-[15px] font-semibold">{monthLabel(month)}</span>
      <IconButton label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={18} />
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
      const [incomes, expenses, transfers] = await Promise.all([fetchMoney('incomes', from, to), fetchMoney('expenses', from, to), fetchMoney('transfers', from, to)]);
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

const TOOLS = [
  { label: 'Smart add', to: '/smart', icon: Wand2, tone: 'primary' as const },
  { label: 'Requests', to: '/requests', icon: QrCode, tone: 'teal' as const },
  { label: 'Invoices', to: '/invoices', icon: FileText, tone: 'blue' as const },
  { label: 'Udhaar', to: '/loans', icon: HandCoins, tone: 'amber' as const },
  { label: 'Goals', to: '/goals', icon: Target, tone: 'pink' as const },
  { label: 'Split', to: '/groups', icon: Users, tone: 'violet' as const },
];

function Overview({ month }: { month: string }) {
  const nav = useNavigate();
  const { data, error, reload } = useMonthData(month);
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [six, setSix] = useState<Row[]>([]);
  const { nameOf } = useLookups();

  useEffect(() => {
    fetchBalances().then(setBalances).catch(() => setBalances([]));
  }, []);
  useEffect(() => {
    const from = monthRange(shiftMonth(currentMonth(), -5)).from;
    supabase
      .from('expenses')
      .select('amount_paise,txn_date')
      .is('deleted_at', null)
      .gte('txn_date', from)
      .then(({ data }) => setSix((data as Row[]) ?? []));
  }, []);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    (data?.expenses ?? []).forEach((e) => {
      const k = e.category_id ? nameOf(e.category_id) : 'Other';
      m.set(k, (m.get(k) ?? 0) + e.amount_paise);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data, nameOf]);

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
      <HeroCard>
        <p className="text-[13px] opacity-80">Total balance</p>
        <p className="mt-1 text-[30px] font-bold tracking-tight">{formatINR(total)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-[14px] p-2.5" style={{ background: 'rgba(255,255,255,.12)' }}>
            <p className="text-[11.5px] opacity-80">Income</p>
            <p className="text-[16px] font-bold">{formatINR(inc)}</p>
          </div>
          <div className="rounded-[14px] p-2.5" style={{ background: 'rgba(255,255,255,.12)' }}>
            <p className="text-[11.5px] opacity-80">Expenses</p>
            <p className="text-[16px] font-bold">{formatINR(exp)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button size="sm" onClick={() => nav('/r/incomes/new')}>+ Income</Button>
          <Button size="sm" onClick={() => nav('/r/expenses/new')}>+ Expense</Button>
          <Button size="sm" onClick={() => nav('/r/transfers/new')}>Transfer</Button>
        </div>
      </HeroCard>

      <div className="grid grid-cols-3 gap-2">
        {TOOLS.map(({ label, to, icon: Icon, tone }) => (
          <button key={to} onClick={() => nav(to)} className="glass flex flex-col items-center gap-1.5 rounded-[16px] py-3 transition-transform active:scale-95">
            <IconBubble tone={tone} size={34}>
              <Icon size={17} />
            </IconBubble>
            <span className="text-[12px] font-semibold">{label}</span>
          </button>
        ))}
      </div>

      <SectionTitle>Spending overview</SectionTitle>
      <Card>
        <BarChart data={sixMonthBars(six)} format={(v) => formatINR(v)} />
      </Card>

      {byCat.length > 0 && (
        <>
          <SectionTitle right={<SeeAll onClick={() => nav('/reports')} label="Reports" />}>Top categories</SectionTitle>
          <Card className="flex items-center gap-4">
            <Donut
              size={112}
              parts={byCat.map(([, v], i) => ({ value: v, color: CHART_COLORS[i % CHART_COLORS.length] }))}
              center={
                <>
                  <span className="text-[12.5px] font-bold">{formatINR(exp)}</span>
                  <span className="text-[10px] text-muted">Spent</span>
                </>
              }
            />
            <div className="min-w-0 flex-1 space-y-1">
              {byCat.slice(0, 6).map(([k, v], i) => (
                <div key={k} className="flex items-center gap-1.5 text-[12px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="flex-1 truncate">{k}</span>
                  <span className="text-muted">{Math.round((v / exp) * 100)}%</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <SectionTitle right={<SeeAll onClick={() => nav('/finance?tab=accounts')} />}>Accounts & UPI apps</SectionTitle>
      {!balances ? <Spinner /> : <AccountList rows={balances} />}

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

function AccountList({ rows }: { rows: Balance[] }) {
  const nav = useNavigate();
  return (
    <List>
      {rows.map((b) => (
        <ListRow
          key={b.id}
          icon={
            <IconBubble tone={b.upi_app ? 'teal' : b.type === 'cash' ? 'income' : 'amber'}>
              {b.upi_app || b.type === 'upi' ? <Smartphone size={17} /> : <Landmark size={17} />}
            </IconBubble>
          }
          title={b.name}
          subtitle={b.upi_app ? `${optionLabel(UPI_APPS, b.upi_app)}${b.upi_id ? ` · ${b.upi_id}` : ''}` : optionLabel(ACCOUNT_TYPES, b.type)}
          right={<span className="text-[14px] font-semibold">{formatINR(b.balance_paise)}</span>}
          onClick={() => nav(`/r/accounts/${b.id}`)}
        />
      ))}
    </List>
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

  // group by date
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    rows.forEach((x) => m.set(x.r.txn_date, [...(m.get(x.r.txn_date) ?? []), x]));
    return [...m.entries()];
  }, [rows]);

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
        groups.map(([date, items]) => (
          <div key={date} className="space-y-2">
            <p className="px-0.5 pt-1 text-[13px] font-semibold text-muted">
              {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <List>
              {items.map(({ kind, r }) => (
                <MoneyRow key={kind + r.id} kind={kind} row={r} nameOf={nameOf} />
              ))}
            </List>
          </div>
        ))
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
  const upi = rows.filter((r) => r.upi_app || r.type === 'upi');
  const other = rows.filter((r) => !(r.upi_app || r.type === 'upi'));
  return (
    <>
      <HeroCard>
        <p className="text-[13px] opacity-80">All accounts</p>
        <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(rows.reduce((s, r) => s + Number(r.balance_paise), 0))}</p>
      </HeroCard>
      {upi.length > 0 && (
        <>
          <SectionTitle>UPI apps</SectionTitle>
          <AccountList rows={upi} />
        </>
      )}
      <SectionTitle>Bank, cash & wallets</SectionTitle>
      {other.length ? <AccountList rows={other} /> : <p className="px-1 text-[13px] text-muted">None</p>}
      <p className="px-1 text-[12px] text-muted">Balance = opening + income − expenses ± transfers ± udhaar. Add each UPI app (GPay, PhonePe, Paytm…) as its own account to track it separately.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => nav('/r/accounts/new?type=upi&upi_app=gpay')}>
          <Smartphone size={16} /> Add UPI app
        </Button>
        <Button onClick={() => nav('/r/accounts/new')}>
          <Plus size={16} /> Add account
        </Button>
      </div>
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
        <Plus size={16} /> Add category
      </Button>
    </>
  );
}
