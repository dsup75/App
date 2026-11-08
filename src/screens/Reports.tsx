import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, FileDown, DatabaseBackup } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError, type Row } from '../lib/db';
import { currentMonth, monthRange, shiftMonth, todayISO, formatDate } from '../lib/dates';
import { formatINR, paiseToInput, sumPaise } from '../lib/money';
import { AREAS, optionLabel, PAYER_TYPES, PAYMENT_METHODS, UPI_APPS } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { exportCSV, exportPDFTable, exportXLSX, pdfMoney, saveFile } from '../lib/exporter';
import {
  Button, Card, CHART_COLORS, Chips, Donut, ErrorBox, FormRow, KV, List, ListRow, Page, ProgressBar, SectionTitle, Segmented, Spinner,
} from '../components/ui';

type Preset = 'this_month' | 'last_month' | 'last_3' | 'this_year' | 'custom';
type Tab = 'money' | 'business' | 'study';

function presetRange(p: Preset): { from: string; to: string } {
  const m = currentMonth();
  if (p === 'this_month') return monthRange(m);
  if (p === 'last_month') return monthRange(shiftMonth(m, -1));
  if (p === 'last_3') return { from: monthRange(shiftMonth(m, -2)).from, to: monthRange(m).to };
  return { from: `${m.slice(0, 4)}-01-01`, to: `${m.slice(0, 4)}-12-31` };
}

interface Data {
  lines: Row[];
  incomes: Row[];
  expenses: Row[];
  transfers: Row[];
  repayments: Row[];
  invoices: Row[];
  sessions: Row[];
  tests: Row[];
  tasksDone: number;
}

export function ReportsScreen() {
  const toast = useToast();
  const { nameOf } = useLookups();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [custom, setCustom] = useState(presetRange('this_month'));
  const [tab, setTab] = useState<Tab>('money');
  const [area, setArea] = useState<'all' | 'personal' | 'study' | 'business'>('all');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const range = preset === 'custom' ? custom : presetRange(preset);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    const { from, to } = range;
    try {
      const r = await Promise.all([
        supabase.from('incomes').select('*').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to).order('txn_date'),
        supabase.from('expenses').select('*').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to).order('txn_date'),
        supabase.from('transfers').select('*').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to).order('txn_date'),
        supabase.from('loan_repayments').select('*').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to),
        supabase.from('invoices').select('*').is('deleted_at', null).gte('issue_date', from).lte('issue_date', to),
        supabase.from('study_sessions').select('*').is('deleted_at', null).gte('session_date', from).lte('session_date', to),
        supabase.from('mock_tests').select('*').is('deleted_at', null).gte('test_date', from).lte('test_date', to).order('test_date'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'completed').gte('completed_at', from).lte('completed_at', to + 'T23:59:59'),
      ]);
      for (const x of r) if (x.error) throw x.error;
      // payment lines of these entries (one entry can be paid from many accounts / apps)
      const ids = [...(r[0].data as Row[]), ...(r[1].data as Row[]), ...(r[2].data as Row[])].map((x) => x.id);
      const lines: Row[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const res = await supabase
          .from('payment_lines')
          .select('id,parent_table,parent_id,direction,account_id,amount_paise,payment_app')
          .is('deleted_at', null)
          .in('parent_id', ids.slice(i, i + 150));
        if (res.error) throw res.error;
        lines.push(...((res.data as Row[]) ?? []));
      }
      setData({
        lines,
        incomes: r[0].data as Row[],
        expenses: r[1].data as Row[],
        transfers: r[2].data as Row[],
        repayments: r[3].data as Row[],
        invoices: r[4].data as Row[],
        sessions: r[5].data as Row[],
        tests: r[6].data as Row[],
        tasksDone: r[7].count ?? 0,
      });
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const f = (rows: Row[]) => (area === 'all' ? rows : rows.filter((r) => r.area === area));
  const inc = data ? f(data.incomes) : [];
  const exp = data ? f(data.expenses) : [];

  const byCategory = useMemo(() => groupSum(exp, (r) => (r.category_id ? nameOf(r.category_id) : 'Uncategorised')), [exp, nameOf]);
  const incByCategory = useMemo(() => groupSum(inc, (r) => (r.category_id ? nameOf(r.category_id) : 'Uncategorised')), [inc, nameOf]);
  const byClient = useMemo(() => groupSum(inc.filter((r) => r.client_id || r.client_name), (r) => (r.client_id ? nameOf(r.client_id) : r.client_name)), [inc, nameOf]);
  const shownLines = useMemo(() => {
    if (!data) return [] as Row[];
    const keep = new Set([...inc, ...exp, ...(area === 'all' ? data.transfers : [])].map((r) => r.id));
    return data.lines.filter((l) => keep.has(l.parent_id));
  }, [data, inc, exp, area]);
  const byAccount = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    // every payment line counts against the account it used (part cash, part GPay…)
    shownLines.forEach((l) => {
      const v = m.get(l.account_id) ?? { in: 0, out: 0 };
      if (l.direction === 'in') v.in += Number(l.amount_paise);
      else v.out += Number(l.amount_paise);
      m.set(l.account_id, v);
    });
    return [...m.entries()].map(([id, v]) => ({ name: nameOf(id), ...v })).sort((a, b) => b.in + b.out - a.in - a.out);
  }, [shownLines, nameOf]);
  const appLabel = (l: Row) => (l.payment_app ? optionLabel(UPI_APPS, l.payment_app) : 'Not set');
  const byAppOut = useMemo(() => groupSum(shownLines.filter((l) => l.parent_table === 'expenses'), appLabel), [shownLines]);
  const byAppIn = useMemo(() => groupSum(shownLines.filter((l) => l.parent_table === 'incomes'), appLabel), [shownLines]);
  const mode = (rows: Row[], m: string) => sumPaise(rows.filter((r) => (r.payment_mode ?? 'personal') === m));
  const interestIn = data ? sumPaise(data.repayments.map((r) => ({ amount_paise: r.interest_paise }))) : 0;

  const label = preset === 'custom' ? `${formatDate(range.from)} – ${formatDate(range.to)}` : `${formatDate(range.from)} – ${formatDate(range.to)}`;

  const txnRows = () =>
    [
      ...inc.map((r) => [r.txn_date + (r.txn_time ? ' ' + String(r.txn_time).slice(0, 5) : ''), 'Income', r.title, paiseToInput(r.amount_paise), nameOf(r.account_id), r.category_id ? nameOf(r.category_id) : '', optionLabel(AREAS, r.area), r.client_id ? nameOf(r.client_id) : r.client_name ?? '', r.payer_name ?? '', r.payer_type ? optionLabel(PAYER_TYPES, r.payer_type) : '', r.payment_method ? optionLabel(PAYMENT_METHODS, r.payment_method) : '', r.reference ?? '', r.notes ?? '', r.payment_app ? optionLabel(UPI_APPS, r.payment_app) : '', r.payment_mode ?? '', r.payment_link ?? '']),
      ...exp.map((r) => [r.txn_date + (r.txn_time ? ' ' + String(r.txn_time).slice(0, 5) : ''), 'Expense', r.title, paiseToInput(-r.amount_paise), nameOf(r.account_id), r.category_id ? nameOf(r.category_id) : '', optionLabel(AREAS, r.area), r.client_id ? nameOf(r.client_id) : '', '', '', r.payment_method ? optionLabel(PAYMENT_METHODS, r.payment_method) : '', r.reference ?? '', r.notes ?? '', r.payment_app ? optionLabel(UPI_APPS, r.payment_app) : '', r.payment_mode ?? '', r.payment_link ?? '']),
      ...(area === 'all' && data ? data.transfers.map((r) => [r.txn_date, 'Transfer', r.title, paiseToInput(r.amount_paise), `${nameOf(r.from_account_id)} → ${nameOf(r.to_account_id)}`, '', '', '', '', '', '', '', r.notes ?? '']) : []),
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const headers = ['Date / time', 'Type', 'Title', 'Amount (INR)', 'Account', 'Category', 'Area', 'Client', 'Payer', 'Received from', 'Method', 'Reference', 'Notes', 'App', 'Mode', 'Payment link'];
  const fname = (ext: string) => `DeepBoost-Report-${range.from}-to-${range.to}.${ext}`;

  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      const r = await fn();
      if (r === 'downloaded') toast('Downloaded');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const summary: [string, string][] = [
    ['Income', pdfMoney(sumPaise(inc))],
    ['Expenses', pdfMoney(sumPaise(exp))],
    ['Net', pdfMoney(sumPaise(inc) - sumPaise(exp))],
    ['Area', area === 'all' ? 'All' : optionLabel(AREAS, area)],
  ];

  return (
    <Page title="Reports" subtitle={label} back>
      <Chips
        value={preset}
        onChange={setPreset}
        options={[
          { value: 'this_month', label: 'This month' },
          { value: 'last_month', label: 'Last month' },
          { value: 'last_3', label: '3 months' },
          { value: 'this_year', label: 'This year' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {preset === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="From">
            <input type="date" className="field" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </FormRow>
          <FormRow label="To">
            <input type="date" className="field" value={custom.to} max={todayISO().slice(0, 4) + '-12-31'} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </FormRow>
        </div>
      )}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'money', label: 'Money' },
          { value: 'business', label: 'Business' },
          { value: 'study', label: 'Study' },
        ]}
      />

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !data ? (
        <Spinner />
      ) : tab === 'money' ? (
        <>
          <Chips value={area} onChange={setArea} options={[{ value: 'all', label: 'All' }, ...(AREAS as any)]} />
          <div className="grid grid-cols-3 gap-2">
            <KV label="Income" value={formatINR(sumPaise(inc))} tone="income" />
            <KV label="Expenses" value={formatINR(sumPaise(exp))} tone="expense" />
            <KV label="Net" value={formatINR(sumPaise(inc) - sumPaise(exp))} />
          </div>
          {exp.some((e) => Array.isArray(e.split_with) && e.split_with.length) && (
            <p className="px-1 text-[12px] text-muted">
              Your own share after splits: {formatINR(sumPaise(exp) - exp.reduce((t, e) => t + (Array.isArray(e.split_with) ? e.split_with.reduce((a: number, x: any) => a + Number(x.amount_paise), 0) : 0), 0))} (others owe you the rest).
            </p>
          )}
          {interestIn > 0 && <p className="px-1 text-[12px] text-muted">Loan interest moved in this period: {formatINR(interestIn)} (tracked separately).</p>}

          <div className="grid grid-cols-2 gap-2">
            <KV label="Personal: in / out" value={`${formatINR(mode(inc, 'personal'))} / ${formatINR(mode(exp, 'personal'))}`} />
            <KV label="Business: in / out" value={`${formatINR(mode(inc, 'business'))} / ${formatINR(mode(exp, 'business'))}`} />
          </div>

          <SectionTitle>Spending by category</SectionTitle>
          <CategoryBreakdown rows={byCategory} />
          <SectionTitle>Income by category</SectionTitle>
          <CategoryBreakdown rows={incByCategory} />

          <SectionTitle>Paid with app</SectionTitle>
          <CategoryBreakdown rows={byAppOut} />
          <SectionTitle>Received on app</SectionTitle>
          <CategoryBreakdown rows={byAppIn} />

          <SectionTitle>By account{area === 'all' ? ' (incl. transfers)' : ''}</SectionTitle>
          <List>
            {byAccount.length === 0 && <ListRow title="No entries" />}
            {byAccount.map((a) => (
              <ListRow
                key={a.name}
                title={a.name}
                right={
                  <div className="text-right text-[12.5px]">
                    <p className="font-semibold text-income">+{formatINR(a.in)}</p>
                    <p className="font-semibold text-expense">−{formatINR(a.out)}</p>
                  </div>
                }
              />
            ))}
          </List>
        </>
      ) : tab === 'business' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <KV label="Invoiced" value={formatINR(sumPaise(data.invoices.filter((i) => i.status === 'sent')))} />
            <KV label="Business income" value={formatINR(sumPaise(data.incomes.filter((i) => i.area === 'business')))} tone="income" />
            <KV label="Business expenses" value={formatINR(sumPaise(data.expenses.filter((i) => i.area === 'business')))} tone="expense" />
            <KV label="Tasks completed" value={data.tasksDone} />
          </div>
          <SectionTitle>Income by client</SectionTitle>
          <CategoryBreakdown rows={byClient} />
        </>
      ) : (
        <StudyReport sessions={data.sessions} tests={data.tests} nameOf={nameOf} />
      )}

      <SectionTitle>Export</SectionTitle>
      <Card className="space-y-2.5">
        <p className="text-[12.5px] text-muted">Exports use the selected dates and filters, and only your own data.</p>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" loading={busy === 'pdf'} onClick={() => run('pdf', () => exportPDFTable(fname('pdf'), 'DeepBoost Life — Report', label, summary, ['Date', 'Type', 'Title', 'Amount', 'Account', 'Category'], txnRows().map((r) => r.slice(0, 6) as string[])))}>
            <FileText size={15} /> PDF
          </Button>
          <Button
            size="sm"
            loading={busy === 'xlsx'}
            onClick={() =>
              run('xlsx', () =>
                exportXLSX(fname('xlsx'), [
                  { name: 'Transactions', headers, rows: txnRows() },
                  { name: 'By category', headers: ['Category', 'Spent (INR)'], rows: byCategory.map((c) => [c.name, paiseToInput(c.value)]) },
                  { name: 'By client', headers: ['Client', 'Received (INR)'], rows: byClient.map((c) => [c.name, paiseToInput(c.value)]) },
                  { name: 'Study', headers: ['Date', 'Title', 'Subject', 'Minutes'], rows: data?.sessions.map((s) => [s.session_date, s.title, s.subject_id ? nameOf(s.subject_id) : '', s.minutes]) ?? [] },
                ]),
              )
            }
          >
            <FileSpreadsheet size={15} /> Excel
          </Button>
          <Button size="sm" loading={busy === 'csv'} onClick={() => run('csv', () => exportCSV(fname('csv'), headers, txnRows()))}>
            <FileDown size={15} /> CSV
          </Button>
        </div>
        <Button size="sm" full loading={busy === 'backup'} onClick={() => run('backup', () => backupAll())}>
          <DatabaseBackup size={15} /> Full data backup (JSON)
        </Button>
      </Card>
    </Page>
  );
}

function groupSum(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + Number(r.amount_paise)));
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function CategoryBreakdown({ rows }: { rows: { name: string; value: number }[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length) return <p className="px-1 text-[13px] text-muted">No data for this period.</p>;
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((s, r) => s + r.value, 0);
  const parts = [...top, ...(rest ? [{ name: 'Others', value: rest }] : [])];
  return (
    <Card>
      <div className="flex items-center gap-4">
        <Donut
          parts={parts.map((p, i) => ({ value: p.value, color: CHART_COLORS[i % CHART_COLORS.length] }))}
          size={120}
          center={
            <>
              <span className="text-[13px] font-bold">{formatINR(total)}</span>
              <span className="text-[10px] text-muted">Total</span>
            </>
          }
        />
        <div className="min-w-0 flex-1 space-y-1">
          {parts.map((p, i) => (
            <div key={p.name} className="flex items-center gap-1.5 text-[12px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-muted">{Math.round((p.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {parts.map((p, i) => (
          <div key={p.name}>
            <div className="mb-1 flex justify-between text-[13px]">
              <span className="font-medium">{p.name}</span>
              <span className="font-semibold">{formatINR(p.value)}</span>
            </div>
            <ProgressBar pct={(p.value / total) * 100} color={CHART_COLORS[i % CHART_COLORS.length]} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function StudyReport({ sessions, tests, nameOf }: { sessions: Row[]; tests: Row[]; nameOf: (id: string) => string }) {
  const minutes = sessions.reduce((s, x) => s + x.minutes, 0);
  const bySubject = groupSum(
    sessions.map((s) => ({ ...s, amount_paise: s.minutes })),
    (r) => (r.subject_id ? nameOf(r.subject_id) : 'General'),
  );
  const avg = tests.length ? Math.round(tests.reduce((s, t) => s + (t.obtained_marks / t.total_marks) * 100, 0) / tests.length) : 0;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <KV label="Study time" value={`${Math.floor(minutes / 60)}h ${minutes % 60}m`} />
        <KV label="Sessions" value={sessions.length} />
        <KV label="Avg test %" value={tests.length ? `${avg}%` : '—'} />
      </div>
      <SectionTitle>Minutes by subject</SectionTitle>
      <Card className="space-y-2.5">
        {bySubject.length === 0 && <p className="text-[13px] text-muted">No study sessions in this period.</p>}
        {bySubject.map((b, i) => (
          <div key={b.name}>
            <div className="mb-1 flex justify-between text-[13px]">
              <span className="font-medium">{b.name}</span>
              <span className="font-semibold">{b.value} min</span>
            </div>
            <ProgressBar pct={(b.value / Math.max(1, bySubject[0].value)) * 100} color={CHART_COLORS[i % CHART_COLORS.length]} />
          </div>
        ))}
      </Card>
      {tests.length > 0 && (
        <>
          <SectionTitle>Test trend</SectionTitle>
          <List>
            {tests.map((t) => (
              <ListRow key={t.id} title={t.name} subtitle={formatDate(t.test_date)} right={<span className="text-[14px] font-semibold">{Math.round((t.obtained_marks / t.total_marks) * 100)}%</span>} />
            ))}
          </List>
        </>
      )}
    </>
  );
}

const BACKUP_TABLES = [
  'accounts', 'categories', 'incomes', 'expenses', 'transfers', 'payment_requests', 'clients', 'projects', 'campaigns', 'invoices',
  'allocations', 'money_source_links', 'loans', 'loan_repayments', 'savings_goals', 'savings_entries', 'groups', 'group_members', 'group_expenses',
  'group_settlements', 'tasks', 'habits', 'habit_logs', 'events', 'notes', 'shopping_items', 'subjects', 'chapters',
  'study_sessions', 'mock_tests', 'exams', 'user_settings',
];

async function backupAll() {
  const out: Record<string, unknown> = { app: 'DeepBoost Life', exported_at: new Date().toISOString() };
  for (const t of BACKUP_TABLES) {
    const { data, error } = await supabase.from(t).select('*').limit(20000);
    if (error) {
      // The optional lineage table is absent until its additive migration is applied.
      if (t === 'money_source_links' && /relation .* does not exist|schema cache/i.test(error.message ?? '')) continue;
      throw error;
    }
    out[t] = t === 'user_settings' ? (data ?? []).map((r: any) => ({ ...r, sync_key: r.sync_key ? '(hidden)' : null })) : data;
  }
  return saveFile(`DeepBoost-Backup-${todayISO()}.json`, new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
}
