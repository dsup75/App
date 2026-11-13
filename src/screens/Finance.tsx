import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Landmark, Tag, Plus, QrCode, FileText, HandCoins, Target, Users, Wand2, Smartphone, CreditCard, Gauge, Search, SlidersHorizontal, X, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBalances, fetchMoney, friendlyError, type Balance, type Row } from '../lib/db';
import { currentMonth, monthLabel, monthRange, shiftMonth, toISODate, todayISO } from '../lib/dates';
import { useCustomOptions } from '../lib/options';
import { BankCardCarousel, MiniAccountCard } from '../components/BankCard';
import { Glyph } from '../components/Glyph';
import { fetchCreditAccounts, type CreditAccount } from '../lib/credit';
import { formatINR, sumPaise } from '../lib/money';
import { ACCOUNT_TYPES, UPI_APPS, optionLabel, isSpendable } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { MoneyRow, type MoneyKind } from '../components/MoneyRow';
import {
  BarChart, Button, Card, CHART_COLORS, Chips, Donut, Empty, ErrorBox, FormRow, HeroCard, IconBubble, IconButton, KV, List, ListRow, Page, SectionTitle, Segmented, SeeAll, Sheet, Skeleton, Spinner,
} from '../components/ui';
import { sixMonthBars } from './Home';
import { ReportsScreen } from './Reports';

type Tab = 'overview' | 'transactions' | 'accounts' | 'reports' | 'categories';

export function Finance() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  const [month, setMonth] = useState(currentMonth());
  const nav = useNavigate();

  return (
    <Page
      title="Finance"
      subtitle="Track • Plan • Grow"
      glyph="barchart"
      right={
        <button type="button" aria-label="Reports" onClick={() => nav('/reports')} className="glass press flex h-10 w-10 items-center justify-center rounded-full">
          <TrendingUp size={18} />
        </button>
      }
    >
      <Segmented
        value={tab === 'categories' ? 'reports' : tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'transactions', label: 'Entries' },
          { value: 'accounts', label: 'Accounts' },
          { value: 'reports', label: 'Reports' },
        ]}
      />
      {tab === 'transactions' && <MonthPicker month={month} onChange={setMonth} />}
      {tab === 'overview' && <Overview month={currentMonth()} />}
      {tab === 'transactions' && <Transactions month={month} />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'reports' && (
        <>
          <ReportsScreen embedded />
          <Button full onClick={() => setTab('categories')}>
            <Tag size={16} /> Manage categories
          </Button>
        </>
      )}
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
  { label: 'Credit', to: '/credit', icon: CreditCard, tone: 'blue' as const },
  { label: 'Smart add', to: '/smart', icon: Wand2, tone: 'primary' as const },
  { label: 'Requests', to: '/requests', icon: QrCode, tone: 'teal' as const },
  { label: 'Invoices', to: '/invoices', icon: FileText, tone: 'blue' as const },
  { label: 'Udhaar', to: '/loans', icon: HandCoins, tone: 'amber' as const },
  { label: 'Goals', to: '/goals', icon: Target, tone: 'pink' as const },
  { label: 'Split', to: '/groups', icon: Users, tone: 'violet' as const },
  { label: 'Budgets', to: '/budgets', icon: Gauge, tone: 'amber' as const },
];

function Overview({ month }: { month: string }) {
  const nav = useNavigate();
  const { data, error, reload } = useMonthData(month);
  const [balances, setBalances] = useState<CreditAccount[] | null>(null);
  const [six, setSix] = useState<{ amount_paise: number; txn_date: string }[]>([]);
  const [sixIn, setSixIn] = useState<{ amount_paise: number; txn_date: string }[]>([]);
  const { nameOf } = useLookups();

  useEffect(() => {
    fetchCreditAccounts().then(setBalances).catch(() => setBalances([]));
    const from = monthRange(shiftMonth(currentMonth(), -5)).from;
    supabase
      .from('incomes')
      .select('amount_paise,txn_date')
      .is('deleted_at', null)
      .gte('txn_date', from)
      .then(({ data }) => setSixIn((data as { amount_paise: number; txn_date: string }[] | null) ?? []));
  }, []);
  useEffect(() => {
    const from = monthRange(shiftMonth(currentMonth(), -5)).from;
    supabase
      .from('expenses')
      .select('amount_paise,txn_date')
      .is('deleted_at', null)
      .gte('txn_date', from)
      .then(({ data }) => setSix((data as { amount_paise: number; txn_date: string }[] | null) ?? []));
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
  const total = (balances ?? []).filter((b) => isSpendable(b.type)).reduce((s, b) => s + Number(b.balance_paise), 0);
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
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <p className="mt-1 text-[30px] font-bold leading-tight tracking-tight">{formatINR(total)}</p>
            <p className="text-[15px] font-medium opacity-90">Total Balance</p>
            {inc - exp !== 0 && (
              <p className="mt-1 text-[14px] font-semibold" style={{ color: inc - exp >= 0 ? 'var(--tone-income)' : 'var(--tone-expense)' }}>
                {inc - exp >= 0 ? '↑' : '↓'} {total - (inc - exp) > 0 ? `${Math.abs(Math.round(((inc - exp) / (total - (inc - exp))) * 1000) / 10)}%` : formatINR(Math.abs(inc - exp))}
              </p>
            )}
          </div>
          <MiniBars values={sixMonthBars(sixIn).map((b) => b.value)} />
        </div>
      </HeroCard>

      <SectionTitle right={<SeeAll onClick={() => nav('/finance?tab=accounts')} />}>Your Accounts</SectionTitle>
      {!balances ? (
        <Spinner />
      ) : (
        <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {balances
            .filter((b) => isSpendable(b.type) || b.type === 'credit_card' || b.type === 'pay_later')
            .sort((x, y) => Number(!!(y.card_network || y.card_last4)) - Number(!!(x.card_network || x.card_last4)) || y.balance_paise - x.balance_paise)
            .map((b) => (
              <MiniAccountCard key={b.id} a={b} onClick={() => nav(`/r/accounts/${b.id}`)} />
            ))}
          <button type="button" onClick={() => nav('/r/accounts/new')} className="glass press flex h-[132px] w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[16px]">
            <Plus size={26} className="text-primary" />
            <span className="text-[12.5px] font-semibold">Add Account</span>
          </button>
        </div>
      )}


      <SectionTitle right={<SeeAll onClick={() => nav('/finance?tab=transactions')} />}>Recent Transactions</SectionTitle>
      {recent.length === 0 ? (
        <Empty title="No entries this month" text="Add income or an expense to get started." />
      ) : (
        <List>
          {recent.map(({ kind, r }) => (
            <MoneyRow key={kind + r.id} kind={kind} row={r} nameOf={nameOf} />
          ))}
        </List>
      )}

      <button type="button" onClick={() => nav('/budgets')} className="tint-card press flex w-full items-center gap-3 rounded-[18px] p-3 text-left" style={{ ['--tint' as string]: 'var(--tone-pink)' }}>
        <Glyph name="target" size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">Set a budget for this month</span>
          <span className="block text-[12px] text-muted">Stay on track — get an alert at 80%</span>
        </span>
        <span className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--on-primary,#fff)]">Set now</span>
      </button>
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

type RangeKey = 'month' | 'today' | 'week' | 'last7' | 'custom';
type SortKey = 'new' | 'old' | 'high' | 'low';

function weekStart(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return toISODate(x);
}

function rangeOf(key: RangeKey, month: string, custom: { from: string; to: string }) {
  const today = todayISO();
  if (key === 'today') return { from: today, to: today };
  if (key === 'week') return { from: weekStart(), to: today };
  if (key === 'last7') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return { from: toISODate(d), to: today };
  }
  if (key === 'custom') return custom;
  return monthRange(month);
}

function Transactions({ month }: { month: string }) {
  const { nameOf, categories, accounts } = useLookups();
  const { labelOf } = useCustomOptions();
  const [params] = useSearchParams();
  const [type, setType] = useState<'all' | MoneyKind>(() => (params.get('type') as MoneyKind) || 'all');
  const [range, setRange] = useState<RangeKey>('month');
  const [custom, setCustom] = useState(() => monthRange(month));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('new');
  const [f, setF] = useState({ category: '', account: '', app: '', mode: '', area: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState<{ incomes: Row[]; expenses: Row[]; transfers: Row[] } | null>(null);
  const [error, setError] = useState('');
  const [quick, setQuick] = useState<{ today: number; week: number; month: number } | null>(null);
  const r = rangeOf(range, month, custom);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      const [incomes, expenses, transfers] = await Promise.all([fetchMoney('incomes', r.from, r.to), fetchMoney('expenses', r.from, r.to), fetchMoney('transfers', r.from, r.to)]);
      setData({ incomes, expenses, transfers });
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [r.from, r.to]);
  useEffect(() => {
    load();
  }, [load]);

  // Spent today / this week / this month (always the real current period)
  useEffect(() => {
    const today = todayISO();
    const m = monthRange(currentMonth()).from;
    const w = weekStart();
    const from = w < m ? w : m;
    supabase
      .from('expenses')
      .select('amount_paise,txn_date')
      .is('deleted_at', null)
      .gte('txn_date', from)
      .lte('txn_date', today)
      .then(({ data: d }) => {
        const rows = (d as { amount_paise: number; txn_date: string }[] | null) ?? [];
        const sum = (fn: (x: { amount_paise: number; txn_date: string }) => boolean) => rows.filter(fn).reduce((t, x) => t + Number(x.amount_paise), 0);
        setQuick({ today: sum((x) => x.txn_date === today), week: sum((x) => x.txn_date >= w), month: sum((x) => x.txn_date >= m) });
      });
  }, [data]);

  const activeFilters = Object.values(f).filter(Boolean).length;

  const rows = useMemo(() => {
    if (!data) return [];
    let all = [
      ...(type === 'all' || type === 'incomes' ? data.incomes.map((x) => ({ kind: 'incomes' as MoneyKind, r: x })) : []),
      ...(type === 'all' || type === 'expenses' ? data.expenses.map((x) => ({ kind: 'expenses' as MoneyKind, r: x })) : []),
      ...(type === 'all' || type === 'transfers' ? data.transfers.map((x) => ({ kind: 'transfers' as MoneyKind, r: x })) : []),
    ];
    if (f.category) all = all.filter((x) => x.r.category_id === f.category);
    if (f.account) all = all.filter((x) => x.r.account_id === f.account || x.r.from_account_id === f.account || x.r.to_account_id === f.account);
    if (f.app) all = all.filter((x) => x.r.payment_app === f.app);
    if (f.mode) all = all.filter((x) => (x.r.payment_mode ?? 'personal') === f.mode);
    if (f.area) all = all.filter((x) => x.r.area === f.area);
    const s = q.trim().toLowerCase();
    if (s) {
      all = all.filter(({ r: x }) =>
        [x.title, x.notes, x.payer_name, x.reference, x.client_name, nameOf(x.category_id), nameOf(x.account_id), nameOf(x.client_id), String(Number(x.amount_paise) / 100)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(s),
      );
    }
    const key = (x: { r: Row }) => `${x.r.txn_date}${x.r.txn_time ?? ''}${x.r.created_at}`;
    if (sort === 'new') all.sort((a, b) => key(b).localeCompare(key(a)));
    if (sort === 'old') all.sort((a, b) => key(a).localeCompare(key(b)));
    if (sort === 'high') all.sort((a, b) => Number(b.r.amount_paise) - Number(a.r.amount_paise));
    if (sort === 'low') all.sort((a, b) => Number(a.r.amount_paise) - Number(b.r.amount_paise));
    return all;
  }, [data, type, f, q, sort, nameOf]);

  const totIn = rows.filter((x) => x.kind === 'incomes').reduce((t, x) => t + Number(x.r.amount_paise), 0);
  const totOut = rows.filter((x) => x.kind === 'expenses').reduce((t, x) => t + Number(x.r.amount_paise), 0);

  // group by date (only when sorted by date)
  const groups = useMemo(() => {
    if (sort === 'high' || sort === 'low') return [['', rows] as [string, typeof rows]];
    const m = new Map<string, typeof rows>();
    rows.forEach((x) => m.set(x.r.txn_date, [...(m.get(x.r.txn_date) ?? []), x]));
    return [...m.entries()];
  }, [rows, sort]);

  const cats = categories.filter((c) => !c.deleted_at);
  const accs = accounts.filter((a) => !a.deleted_at);

  return (
    <>
      {quick && (
        <div className="grid grid-cols-3 gap-2">
          <KV label="Spent today" value={formatINR(quick.today)} tone="expense" />
          <KV label="This week" value={formatINR(quick.week)} tone="expense" />
          <KV label="This month" value={formatINR(quick.month)} tone="expense" />
        </div>
      )}

      <div className="flex gap-2">
        <div className="glass flex min-w-0 flex-1 items-center gap-2 rounded-[14px] px-3">
          <Search size={16} className="shrink-0 text-muted" />
          <input className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] outline-none" placeholder="Search title, person, UTR, amount…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button aria-label="Clear search" onClick={() => setQ('')} className="text-muted">
              <X size={15} />
            </button>
          )}
        </div>
        <button onClick={() => setShowFilters(true)} className="liquid relative flex h-[42px] items-center gap-1.5 rounded-[14px] px-3 text-[13px] font-semibold">
          <SlidersHorizontal size={15} /> Filter
          {activeFilters > 0 && <span className="rounded-full bg-[var(--primary)] px-1.5 text-[11px] text-[var(--on-primary)]">{activeFilters}</span>}
        </button>
      </div>

      <Chips
        value={range}
        onChange={setRange}
        options={[
          { value: 'month', label: monthLabel(month) },
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'This week' },
          { value: 'last7', label: 'Last 7 days' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {range === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="From">
            <input type="date" className="field" value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
          </FormRow>
          <FormRow label="To">
            <input type="date" className="field" value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </FormRow>
        </div>
      )}
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

      {data && rows.length > 0 && (
        <div className="flex items-center justify-between px-0.5 text-[12.5px]">
          <span className="text-muted">{rows.length} entries</span>
          <span>
            <span className="font-semibold text-income">+{formatINR(totIn)}</span> · <span className="font-semibold text-expense">−{formatINR(totOut)}</span> · Net{' '}
            <span className="font-semibold">{formatINR(totIn - totOut)}</span>
          </span>
        </div>
      )}

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !data ? (
        <Skeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty
          title="No entries"
          text={q || activeFilters ? 'Nothing matches your search or filters.' : 'Nothing recorded for this period.'}
          action={(q || activeFilters > 0) && <Button size="sm" onClick={() => { setQ(''); setF({ category: '', account: '', app: '', mode: '', area: '' }); }}>Clear search & filters</Button>}
        />
      ) : (
        groups.map(([date, items]) => (
          <div key={date || 'all'} className="space-y-2">
            {date && (
              <div className="flex items-center justify-between px-0.5 pt-1 text-[13px] font-semibold text-muted">
                <span>{new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                {items.some((x) => x.kind === 'expenses') && <span className="font-normal">−{formatINR(items.filter((x) => x.kind === 'expenses').reduce((t, x) => t + Number(x.r.amount_paise), 0))}</span>}
              </div>
            )}
            <List>
              {items.map(({ kind, r: row }) => (
                <MoneyRow key={kind + row.id} kind={kind} row={row} nameOf={nameOf} />
              ))}
            </List>
          </div>
        ))
      )}

      <Sheet open={showFilters} onClose={() => setShowFilters(false)} title="Filter & sort">
        <div className="space-y-3">
          <FormRow label="Sort">
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { value: 'new', label: 'Latest' },
                { value: 'old', label: 'Oldest' },
                { value: 'high', label: '₹ High' },
                { value: 'low', label: '₹ Low' },
              ]}
            />
          </FormRow>
          <FormRow label="Category">
            <select className="field" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Account">
            <select className="field" value={f.account} onChange={(e) => setF((x) => ({ ...x, account: e.target.value }))}>
              <option value="">All accounts</option>
              {accs.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="App">
            <select className="field" value={f.app} onChange={(e) => setF((x) => ({ ...x, app: e.target.value }))}>
              <option value="">All apps</option>
              {UPI_APPS.map((o) => (
                <option key={o.value} value={o.value}>{labelOf('payment_app', o.value)}</option>
              ))}
            </select>
          </FormRow>
          <div className="grid grid-cols-2 gap-2">
            <FormRow label="Mode">
              <select className="field" value={f.mode} onChange={(e) => setF((x) => ({ ...x, mode: e.target.value }))}>
                <option value="">Any</option>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </FormRow>
            <FormRow label="Area">
              <select className="field" value={f.area} onChange={(e) => setF((x) => ({ ...x, area: e.target.value }))}>
                <option value="">Any</option>
                <option value="personal">Personal</option>
                <option value="study">Study</option>
                <option value="business">Business</option>
              </select>
            </FormRow>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button full onClick={() => setF({ category: '', account: '', app: '', mode: '', area: '' })}>Clear</Button>
            <Button full variant="primary" onClick={() => setShowFilters(false)}>Show {rows.length}</Button>
          </div>
        </div>
      </Sheet>
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
  const spendable = rows.filter((r) => isSpendable(r.type));
  const upi = spendable.filter((r) => r.upi_app || r.type === 'upi');
  const other = spendable.filter((r) => !(r.upi_app || r.type === 'upi'));
  const credit = rows.filter((r) => r.type === 'credit_card' || r.type === 'pay_later');
  const loans = rows.filter((r) => r.type === 'loan');
  const invest = rows.filter((r) => r.type === 'investment');
  const dues = [...credit, ...loans].reduce((s, r) => s + Math.max(0, -Number(r.balance_paise)), 0);
  return (
    <>
      <HeroCard>
        <p className="text-[13px] opacity-80">Money in your accounts</p>
        <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(spendable.reduce((s, r) => s + Number(r.balance_paise), 0))}</p>
        {(dues > 0 || invest.length > 0) && (
          <p className="mt-1 text-[12.5px] opacity-85">
            {dues > 0 ? `Cards & loans due ${formatINR(dues)}` : ''}
            {dues > 0 && invest.length ? ' · ' : ''}
            {invest.length ? `Invested ${formatINR(invest.reduce((s, r) => s + Number(r.balance_paise), 0))}` : ''}
          </p>
        )}
      </HeroCard>
      <BankCardCarousel rows={[...spendable, ...credit]} />
      {upi.length > 0 && (
        <>
          <SectionTitle>UPI apps</SectionTitle>
          <AccountList rows={upi} />
        </>
      )}
      <SectionTitle>Bank, cash & wallets</SectionTitle>
      {other.length ? <AccountList rows={other} /> : <p className="px-1 text-[13px] text-muted">None</p>}
      {(credit.length > 0 || loans.length > 0 || invest.length > 0) && (
        <>
          <SectionTitle right={<button type="button" className="text-[13px] font-semibold text-primary" onClick={() => nav('/credit')}>Open Credit & Loans</button>}>Cards, loans & investments</SectionTitle>
          <AccountList rows={[...credit, ...loans, ...invest]} />
        </>
      )}
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

/** six small rising bars (income per month) beside the balance */
function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  if (!values.some((v) => v > 0)) return null;
  return (
    <div className="flex h-[64px] shrink-0 items-end gap-[5px]" aria-label="Income, last 6 months">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[9px] rounded-t-[3px]"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: i === values.length - 1 ? 'linear-gradient(180deg,#86efac,#16a34a)' : 'linear-gradient(180deg,#93c5fd,#2563eb)', opacity: 0.6 + (0.4 * (i + 1)) / values.length }}
        />
      ))}
    </div>
  );
}
