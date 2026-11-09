// Summary panels shown at the top of specific record detail screens.
import { useEffect, useMemo, useState } from 'react';
import { ChapterRevisions } from './ChapterRevisions';
import { useNavigate } from 'react-router-dom';
import { FileDown, Plus, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, paiseToInput, sumPaise } from '../lib/money';
import { formatDate, todayISO } from '../lib/dates';
import { optionLabel, UPI_APPS, type TableName } from '../lib/tables';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { pdfMoney, saveFile } from '../lib/exporter';
import { copyText } from '../lib/upi';
import { Checklist } from './Checklist';
import { monthlyCost, subState, yearlyCost, SUB_STATE_LABEL } from '../lib/recurring';
import type { Row } from '../lib/db';
import { Badge, Button, Card, HeroCard, KV, List, ListRow, ProgressBar, SectionTitle, Spinner } from './ui';

export function invoiceStatus(inv: Row, received: number): { label: string; tone: 'primary' | 'amber' | 'danger' | 'muted' | 'blue' } {
  if (inv.status === 'cancelled') return { label: 'Cancelled', tone: 'muted' };
  if (inv.status === 'draft') return { label: 'Draft', tone: 'muted' };
  if (received >= inv.amount_paise) return { label: 'Paid', tone: 'primary' };
  if (inv.due_date && inv.due_date < todayISO()) return { label: received > 0 ? 'Partial · Overdue' : 'Overdue', tone: 'danger' };
  if (received > 0) return { label: 'Partial', tone: 'amber' };
  return { label: 'Sent', tone: 'blue' };
}

/** Simple interest from start date to `until` (default today), in paise, on outstanding principal. */
export function simpleInterest(principalOutstanding: number, rateBp: number, startISO: string, untilISO = todayISO()): number {
  const days = Math.max(0, (new Date(untilISO).getTime() - new Date(startISO).getTime()) / 86400000);
  // paise * (bp/10000) * days/365
  return Math.round((principalOutstanding * rateBp * days) / (10000 * 365));
}

export function DetailExtras({ table, row, nameOf, reloadKey }: { table: TableName; row: Row; nameOf: (id: string) => string; reloadKey: number }) {
  switch (table) {
    case 'invoices':
      return <InvoiceSummary row={row} nameOf={nameOf} reloadKey={reloadKey} />;
    case 'loans':
      return (
        <>
          <LoanSummary row={row} reloadKey={reloadKey} />
          {row.direction === 'lent' && <AllocationSummary table="loans" row={row} reloadKey={reloadKey} />}
        </>
      );
    case 'transfers':
      return <AllocationSummary table="transfers" row={row} reloadKey={reloadKey} />;
    case 'savings_goals':
      return <GoalSummary row={row} reloadKey={reloadKey} />;
    case 'incomes':
      return <AllocationSummary table={table} row={row} reloadKey={reloadKey} />;
    case 'expenses':
      return (
        <>
          <AllocationSummary table={table} row={row} reloadKey={reloadKey} />
          <SplitSummary row={row} reloadKey={reloadKey} />
        </>
      );
    case 'mock_tests':
      return <TestSummary row={row} />;
    case 'chapters':
      return <ChapterRevisions chapterId={row.id} reloadKey={reloadKey} />;
    case 'clients':
      return <ClientSummary row={row} reloadKey={reloadKey} />;
    case 'accounts':
      return <AccountSummary row={row} reloadKey={reloadKey} />;
    case 'recurring_rules':
      return <SubscriptionSummary row={row} reloadKey={reloadKey} />;
    case 'tasks':
      return <Checklist parentTable="tasks" parentId={row.id} />;
    case 'habits':
      return <Checklist parentTable="habits" parentId={row.id} />;
    default:
      return null;
  }
}

function InvoiceSummary({ row, nameOf, reloadKey }: { row: Row; nameOf: (id: string) => string; reloadKey: number }) {
  const nav = useNavigate();
  const toast = useToast();
  const { settings, user } = useAuth();
  const [payments, setPayments] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase
      .from('incomes')
      .select('*')
      .eq('invoice_id', row.id)
      .is('deleted_at', null)
      .order('txn_date')
      .then(({ data }) => setPayments((data as Row[]) ?? []));
  }, [row.id, reloadKey]);

  const received = sumPaise(payments ?? []);
  const outstanding = Math.max(0, row.amount_paise - received);
  const st = invoiceStatus(row, received);

  const pdf = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const green: [number, number, number] = [30, 91, 69];
      doc.setFillColor(...green);
      doc.rect(0, 0, 595, 90, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('INVOICE', 40, 52);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`No. ${row.invoice_no}`, 555, 44, { align: 'right' });
      doc.text(`Date: ${formatDate(row.issue_date)}`, 555, 60, { align: 'right' });
      doc.setTextColor(20);
      doc.setFont('helvetica', 'bold');
      doc.text('From', 40, 125);
      doc.text('Bill to', 320, 125);
      doc.setFont('helvetica', 'normal');
      const from = [settings?.business_name || settings?.full_name || '', ...(settings?.business_details ?? '').split('\n'), user?.email ?? '']
        .filter(Boolean);
      doc.text(from, 40, 142);
      doc.text([nameOf(row.client_id)], 320, 142);
      autoTable(doc, {
        startY: 220,
        head: [['Description', 'Period', 'Amount']],
        body: [[row.title, row.period ?? '-', pdfMoney(row.amount_paise)]],
        headStyles: { fillColor: green },
        styles: { fontSize: 10, cellPadding: 7 },
        columnStyles: { 2: { halign: 'right' } },
      });
      const y = (doc as any).lastAutoTable.finalY + 24;
      const lines: [string, string][] = [
        ['Total', pdfMoney(row.amount_paise)],
        ['Received', pdfMoney(received)],
        ['Balance due', pdfMoney(outstanding)],
      ];
      lines.forEach(([k, v], i) => {
        doc.setFont('helvetica', i === 2 ? 'bold' : 'normal');
        doc.text(k, 380, y + i * 18);
        doc.text(v, 555, y + i * 18, { align: 'right' });
      });
      let y2 = y + 80;
      if (row.due_date) {
        doc.setFont('helvetica', 'normal');
        doc.text(`Due date: ${formatDate(row.due_date)}`, 40, y2);
        y2 += 18;
      }
      if (settings?.upi_id) doc.text(`Pay by UPI: ${settings.upi_id}`, 40, y2);
      if (row.notes) doc.text(doc.splitTextToSize(`Notes: ${row.notes}`, 515), 40, y2 + 24);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text('Thank you for your business.', 40, 800);
      await saveFile(`Invoice-${row.invoice_no}.pdf`.replace(/[^\w.\-]/g, '_'), doc.output('blob'));
    } catch (e) {
      toast('Could not create PDF', 'error');
    }
  };

  return (
    <HeroCard>
      <div className="flex items-center justify-between">
        <p className="text-[13px] opacity-80">{nameOf(row.client_id)}</p>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(outstanding)}</p>
      <p className="text-[12px] opacity-80">outstanding of {formatINR(row.amount_paise)}</p>
      <div className="mt-3">
        <ProgressBar pct={(received / row.amount_paise) * 100} color="var(--hero-bar)" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => nav(`/r/incomes/new?invoice_id=${row.id}&client_id=${row.client_id}&area=business&title=${encodeURIComponent(`${row.invoice_no} payment`)}`)}>
          <Plus size={15} /> Add payment
        </Button>
        <Button size="sm" onClick={pdf}>
          <FileDown size={15} /> PDF
        </Button>
      </div>
    </HeroCard>
  );
}

function LoanSummary({ row, reloadKey }: { row: Row; reloadKey: number }) {
  const [t, setT] = useState<{ principal_repaid_paise: number; interest_paid_paise: number } | null>(null);
  useEffect(() => {
    supabase
      .from('loan_totals')
      .select('*')
      .eq('id', row.id)
      .maybeSingle()
      .then(({ data }) => setT((data as any) ?? { principal_repaid_paise: 0, interest_paid_paise: 0 }));
  }, [row.id, reloadKey]);
  if (!t) return null;
  const remaining = Math.max(0, row.principal_paise - t.principal_repaid_paise);
  const accrued = row.interest_type === 'simple' ? simpleInterest(remaining, row.interest_rate_bp, row.start_date) : 0;
  const settled = remaining === 0;
  const overdue = !settled && row.due_date && row.due_date < todayISO();
  const status = settled ? 'Settled' : overdue ? 'Overdue' : t.principal_repaid_paise > 0 ? 'Partially paid' : 'Pending';
  return (
    <HeroCard>
      <div className="flex items-center justify-between">
        <p className="text-[13px] opacity-80">{row.direction === 'lent' ? `${row.person} owes you` : `You owe ${row.person}`}</p>
        <Badge tone={settled ? 'primary' : overdue ? 'danger' : 'amber'}>{status}</Badge>
      </div>
      <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(remaining)}</p>
      <p className="text-[12px] opacity-80">principal remaining of {formatINR(row.principal_paise)}</p>
      <div className="mt-3">
        <ProgressBar pct={(t.principal_repaid_paise / row.principal_paise) * 100} color="var(--hero-bar)" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-xl bg-white/10 p-2">
          <p className="opacity-75">Interest paid</p>
          <p className="text-[14px] font-semibold">{formatINR(t.interest_paid_paise)}</p>
        </div>
        <div className="rounded-xl bg-white/10 p-2">
          <p className="opacity-75">Interest till today</p>
          <p className="text-[14px] font-semibold">{row.interest_type === 'simple' ? formatINR(accrued) : '—'}</p>
        </div>
      </div>
      {row.interest_type === 'simple' && (
        <p className="mt-2 text-[11px] opacity-75">
          Simple interest = remaining principal × {(row.interest_rate_bp / 100).toFixed(2)}% × days since {formatDate(row.start_date)} ÷ 365.
          Principal is not counted as income or expense.
        </p>
      )}
    </HeroCard>
  );
}

function GoalSummary({ row, reloadKey }: { row: Row; reloadKey: number }) {
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    supabase
      .from('savings_totals')
      .select('saved_paise')
      .eq('id', row.id)
      .maybeSingle()
      .then(({ data }) => setSaved(Number((data as any)?.saved_paise ?? 0)));
  }, [row.id, reloadKey]);
  if (saved === null) return null;
  const pct = Math.round((saved / row.target_paise) * 100);
  return (
    <HeroCard>
      <p className="text-[13px] opacity-80">Saved so far</p>
      <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(saved)}</p>
      <p className="text-[12px] opacity-80">
        {pct}% of {formatINR(row.target_paise)}
        {row.target_date ? ` · by ${formatDate(row.target_date)}` : ''}
      </p>
      <div className="mt-3">
        <ProgressBar pct={pct} color="var(--hero-bar)" />
      </div>
      <p className="mt-2 text-[11px] opacity-75">Goal entries set money aside; they are not counted as new income.</p>
    </HeroCard>
  );
}

type AllocTable = 'incomes' | 'expenses' | 'loans' | 'transfers';
const ALLOC_COL: Record<AllocTable, string> = { incomes: 'income_id', expenses: 'expense_id', loans: 'loan_id', transfers: 'transfer_id' };

function AllocationSummary({ table, row, reloadKey }: { table: AllocTable; row: Row; reloadKey: number }) {
  const nav = useNavigate();
  const [links, setLinks] = useState<any[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase
      .from('allocations')
      .select('id,income_id,expense_id,loan_id,transfer_id,amount_paise')
      .eq(ALLOC_COL[table], row.id)
      .is('deleted_at', null)
      .then(async ({ data }) => {
        const list = (data as any[]) ?? [];
        // titles of the other side
        const want: Record<string, string[]> = { incomes: [], expenses: [], loans: [], transfers: [] };
        for (const l of list) {
          if (table !== 'incomes') want.incomes.push(l.income_id);
          else if (l.expense_id) want.expenses.push(l.expense_id);
          else if (l.loan_id) want.loans.push(l.loan_id);
          else if (l.transfer_id) want.transfers.push(l.transfer_id);
        }
        const m = new Map<string, string>();
        await Promise.all(
          Object.entries(want)
            .filter(([, ids]) => ids.length)
            .map(async ([t, ids]) => {
              const { data: rows } = await supabase.from(t).select(t === 'loans' ? 'id,person' : 'id,title').in('id', ids);
              ((rows as any[]) ?? []).forEach((r) => m.set(r.id, r.title ?? r.person));
            }),
        );
        setNames(m);
        setLinks(list);
      });
  }, [table, row.id, reloadKey]);
  if (links === null) return null;
  const total = Number(table === 'loans' ? row.principal_paise : row.amount_paise) || 0;
  const used = sumPaise(links);
  if (table !== 'incomes' && used === 0) return null;
  const left = total - used;
  const pct = total ? Math.round((used / total) * 100) : 0;
  const spent = sumPaise(links.filter((l) => l.expense_id));
  const lent = sumPaise(links.filter((l) => l.loan_id));
  const moved = sumPaise(links.filter((l) => l.transfer_id));
  const target = (l: any) =>
    table !== 'incomes'
      ? { to: `/r/incomes/${l.income_id}`, kind: 'Income', id: l.income_id }
      : l.expense_id
        ? { to: `/r/expenses/${l.expense_id}`, kind: 'Expense', id: l.expense_id }
        : l.loan_id
          ? { to: `/r/loans/${l.loan_id}`, kind: 'Udhaar given', id: l.loan_id }
          : { to: `/r/transfers/${l.transfer_id}`, kind: 'Moved to other account', id: l.transfer_id };
  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold">{table === 'incomes' ? 'Where this income went' : 'Paid out of income'}</p>
        <span className="text-[12.5px] text-muted">{pct}% {table === 'incomes' ? 'used' : 'covered'}</span>
      </div>
      <ProgressBar pct={pct} color={left === 0 ? 'var(--primary-2)' : undefined} />
      {table === 'incomes' ? (
        <div className="grid grid-cols-2 gap-2">
          <KV label="Spent" value={formatINR(spent)} />
          <KV label="Udhaar given" value={formatINR(lent)} />
          <KV label="Moved (transfer)" value={formatINR(moved)} />
          <KV label="Still left" value={formatINR(left)} tone="income" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <KV label="From income" value={formatINR(used)} />
          <KV label="Not linked yet" value={formatINR(left)} />
        </div>
      )}
      {links.length > 0 && (
        <div className="space-y-1 pt-1">
          {links.map((l) => {
            const tg = target(l);
            return (
              <button key={l.id} onClick={() => nav(tg.to)} className="flex w-full items-center justify-between gap-2 text-left text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="text-muted">{tg.kind}: </span>
                  {names.get(tg.id) ?? '…'}
                </span>
                <span className="shrink-0 font-semibold">{formatINR(l.amount_paise)}</span>
              </button>
            );
          })}
        </div>
      )}
      {table === 'incomes' && used === 0 && (
        <p className="text-[12px] text-muted">Not used yet. When you add an expense, udhaar or transfer, turn on "Paid out of which income?" and pick this income.</p>
      )}
    </Card>
  );
}

function SplitSummary({ row, reloadKey }: { row: Row; reloadKey: number }) {
  const nav = useNavigate();
  const [got, setGot] = useState<Row[]>([]);
  const people: { name: string; amount_paise: number }[] = Array.isArray(row.split_with) ? row.split_with : [];
  useEffect(() => {
    if (!people.length) return;
    supabase
      .from('incomes')
      .select('id,payer_name,amount_paise')
      .eq('split_expense_id', row.id)
      .is('deleted_at', null)
      .then(({ data }) => setGot((data as Row[]) ?? []));
  }, [row.id, reloadKey, people.length]);
  if (!people.length) return null;
  const others = people.reduce((s, p) => s + Number(p.amount_paise), 0);
  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[14.5px] font-semibold">Split</p>
        <span className="text-[12.5px] text-muted">Your share {formatINR(row.amount_paise - others)}</span>
      </div>
      {people.map((p) => {
        const received = got.filter((g) => (g.payer_name ?? '').toLowerCase() === p.name.toLowerCase()).reduce((s, g) => s + Number(g.amount_paise), 0);
        const due = Math.max(0, Number(p.amount_paise) - received);
        return (
          <div key={p.name} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{p.name}</p>
              <p className="text-[12px] text-muted">
                Share {formatINR(p.amount_paise)}
                {received ? ` · got ${formatINR(received)}` : ''}
              </p>
            </div>
            {due === 0 ? (
              <Badge tone="primary">Settled</Badge>
            ) : (
              <Button
                size="sm"
                onClick={() =>
                  nav(
                    `/r/incomes/new?${new URLSearchParams({
                      split_expense_id: row.id,
                      payer_name: p.name,
                      payer_type: 'other',
                      amount_paise: paiseToInput(due),
                      title: `${p.name} — share of ${row.title}`,
                      payment_mode: row.payment_mode ?? 'personal',
                      area: row.area ?? 'personal',
                    }).toString()}`,
                  )
                }
              >
                Got {formatINR(due)}
              </Button>
            )}
          </div>
        );
      })}
      <p className="text-[11.5px] text-muted">When someone pays back, tap their button — it is saved as income linked to this expense.</p>
    </Card>
  );
}

function TestSummary({ row }: { row: Row }) {
  const attempted = row.correct + row.incorrect;
  const accuracy = attempted ? Math.round((row.correct / attempted) * 100) : 0;
  const pct = Math.round((row.obtained_marks / row.total_marks) * 100);
  return (
    <HeroCard>
      <p className="text-[13px] opacity-80">Score</p>
      <p className="mt-1 text-[30px] font-bold tracking-tight">
        {row.obtained_marks}
        <span className="text-[16px] opacity-75"> / {row.total_marks}</span>
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[12px]">
        <div className="rounded-xl bg-white/10 p-2">
          <p className="opacity-75">Percent</p>
          <p className="text-[15px] font-semibold">{pct}%</p>
        </div>
        <div className="rounded-xl bg-white/10 p-2">
          <p className="opacity-75">Accuracy</p>
          <p className="text-[15px] font-semibold">{accuracy}%</p>
        </div>
        <div className="rounded-xl bg-white/10 p-2">
          <p className="opacity-75">Attempted</p>
          <p className="text-[15px] font-semibold">{attempted}</p>
        </div>
      </div>
    </HeroCard>
  );
}

function ClientSummary({ row, reloadKey }: { row: Row; reloadKey: number }) {
  const [s, setS] = useState<{ billed: number; received: number; openTasks: number } | null>(null);
  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('amount_paise,status').eq('client_id', row.id).is('deleted_at', null),
      supabase.from('incomes').select('amount_paise').eq('client_id', row.id).is('deleted_at', null),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('client_id', row.id).is('deleted_at', null).in('status', ['pending', 'in_progress', 'waiting']),
    ]).then(([inv, inc, t]) =>
      setS({
        billed: sumPaise(((inv.data as any[]) ?? []).filter((x) => x.status !== 'cancelled' && x.status !== 'draft')),
        received: sumPaise((inc.data as any[]) ?? []),
        openTasks: t.count ?? 0,
      }),
    );
  }, [row.id, reloadKey]);
  if (!s) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      <KV label="Billed" value={formatINR(s.billed)} />
      <KV label="Received" value={formatINR(s.received)} tone="income" />
      <KV label="Open tasks" value={s.openTasks} />
    </div>
  );
}

function AccountSummary({ row, reloadKey }: { row: Row; reloadKey: number }) {
  const toast = useToast();
  const nav = useNavigate();
  const [bal, setBal] = useState<number | null>(null);
  const [moves, setMoves] = useState<any[] | null>(null);
  const [limit, setLimit] = useState(60);
  useEffect(() => {
    supabase
      .from('account_balances')
      .select('balance_paise')
      .eq('id', row.id)
      .maybeSingle()
      .then(({ data }) => setBal(data ? Number((data as any).balance_paise) : null));
    supabase
      .from('account_movements')
      .select('id,parent_table,parent_id,direction,amount_paise,signed_paise,payment_app,txn_date,txn_time,reference,party_name,title,created_at')
      .eq('account_id', row.id)
      .gte('txn_date', row.opening_date ?? '1900-01-01')
      .order('txn_date', { ascending: false })
      .order('txn_time', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(2000)
      .then(({ data }) => setMoves((data as any[]) ?? []));
  }, [row.id, reloadKey]);

  // running balance: newest row shows the current balance, going back in time
  const rows = useMemo(() => {
    if (!moves || bal === null) return [];
    let run = bal;
    return moves.map((m) => {
      const after = run;
      run -= Number(m.signed_paise);
      return { ...m, after };
    });
  }, [moves, bal]);
  const totIn = (moves ?? []).filter((m) => m.direction === 'in').reduce((s, m) => s + Number(m.amount_paise), 0);
  const totOut = (moves ?? []).filter((m) => m.direction === 'out').reduce((s, m) => s + Number(m.amount_paise), 0);
  const KIND: Record<string, string> = { incomes: 'Income', expenses: 'Expense', loans: 'Udhaar', loan_repayments: 'Repayment', transfers: 'Transfer' };

  return (
    <>
      <HeroCard>
        <p className="text-[13px] opacity-80">{row.upi_app ? optionLabel(UPI_APPS, row.upi_app) : 'Current balance'}</p>
        <p className="mt-1 text-[28px] font-bold tracking-tight">{bal === null ? '—' : formatINR(bal)}</p>
        <p className="mt-1 text-[12px] opacity-80">
          Opening {formatINR(row.opening_balance_paise)}
          {row.opening_date ? ` on ${formatDate(row.opening_date)}` : ''} · In {formatINR(totIn)} · Out {formatINR(totOut)}
        </p>
        {row.upi_id && (
          <button
            onClick={() => copyText(row.upi_id).then(() => toast('UPI ID copied'))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px]"
          >
            {row.upi_id} <Copy size={12} />
          </button>
        )}
      </HeroCard>
      <Button full onClick={() => nav(`/money-tools/reconcile?account=${row.id}`)}>
        Check balance with bank (reconcile)
      </Button>
      <SectionTitle right={<span className="text-[12.5px] text-muted">{moves?.length ?? 0} entries</span>}>Statement</SectionTitle>
      {row.opening_date && <p className="-mt-1 px-1 text-[12px] text-muted">Entries before {formatDate(row.opening_date)} are not counted (opening balance date). Change it in Edit.</p>}
      {moves === null ? (
        <Spinner />
      ) : !rows.length ? (
        <Card><p className="text-[13.5px] text-muted">No money in or out of this account yet.</p></Card>
      ) : (
        <List>
          {rows.slice(0, limit).map((m) => (
            <ListRow
              key={m.id}
              title={m.title || KIND[m.parent_table]}
              subtitle={`${KIND[m.parent_table] ?? ''} · ${formatDate(m.txn_date)}${m.txn_time ? ' ' + String(m.txn_time).slice(0, 5) : ''}${m.party_name ? ' · ' + m.party_name : ''}${m.reference ? ' · UTR ' + m.reference : ''}`}
              right={
                <div className="text-right">
                  <p className={'text-[14px] font-semibold ' + (m.direction === 'in' ? 'text-income' : 'text-expense')}>
                    {m.direction === 'in' ? '+' : '−'}
                    {formatINR(m.amount_paise)}
                  </p>
                  <p className="text-[11.5px] text-muted">Bal {formatINR(m.after)}</p>
                </div>
              }
              onClick={() => nav(`/r/${m.parent_table}/${m.parent_id}`)}
            />
          ))}
        </List>
      )}
      {rows.length > limit && (
        <Button full onClick={() => setLimit((l) => l + 100)}>
          Show more
        </Button>
      )}
    </>
  );
}

function SubscriptionSummary({ row, reloadKey }: { row: Row; reloadKey: number }) {
  const nav = useNavigate();
  const toast = useToast();
  const [paid, setPaid] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>(row.status);
  useEffect(() => {
    setStatus(row.status);
    supabase
      .from(row.kind)
      .select('id,title,amount_paise,txn_date,due_for')
      .eq('recurring_rule_id', row.id)
      .is('deleted_at', null)
      .order('txn_date', { ascending: false })
      .then(({ data }) => setPaid((data as Row[]) ?? []));
  }, [row.id, row.kind, row.status, reloadKey]);
  const st = subState({ ...row, status });
  const setTo = async (next: 'active' | 'paused' | 'cancelled') => {
    setBusy(true);
    const { error } = await supabase.from('recurring_rules').update({ status: next }).eq('id', row.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    setStatus(next);
    toast(next === 'active' ? 'Resumed' : next === 'paused' ? 'Paused' : 'Cancelled — no more reminders');
  };
  const total = sumPaise(paid ?? []);
  return (
    <>
      <HeroCard>
        <p className="text-[13px] opacity-80">{SUB_STATE_LABEL[st]} · {row.frequency === 'weekly' ? 'every week' : row.frequency === 'yearly' ? 'every year' : 'every month'}</p>
        <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(row.amount_paise)}</p>
        <p className="text-[12.5px] opacity-80">
          {formatINR(monthlyCost(row))}/month · {formatINR(yearlyCost(row))}/year
          {st === 'active' ? ` · next ${formatDate(row.next_date)}` : ''}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {status !== 'active' ? (
            <Button size="sm" loading={busy} onClick={() => setTo('active')}>Resume</Button>
          ) : (
            <Button size="sm" loading={busy} onClick={() => setTo('paused')}>Pause</Button>
          )}
          {status !== 'cancelled' && (
            <Button size="sm" loading={busy} onClick={() => setTo('cancelled')}>Cancel subscription</Button>
          )}
        </div>
      </HeroCard>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold">Payment history</p>
          <span className="text-[12.5px] text-muted">{paid?.length ?? 0} · {formatINR(total)}</span>
        </div>
        {paid === null ? null : !paid.length ? (
          <p className="text-[13px] text-muted">No payments added yet. When it is due, tap Add on Home.</p>
        ) : (
          paid.map((p) => (
            <button key={p.id} onClick={() => nav(`/r/${row.kind}/${p.id}`)} className="flex w-full items-center justify-between text-left text-[13.5px]">
              <span>
                {formatDate(p.txn_date)}
                {p.due_for && p.due_for !== p.txn_date ? <span className="text-muted"> · for {formatDate(p.due_for)}</span> : null}
              </span>
              <span className="font-semibold">{formatINR(p.amount_paise)}</span>
            </button>
          ))
        )}
      </Card>
    </>
  );
}

export { Card };
