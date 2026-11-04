// Summary panels shown at the top of specific record detail screens.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, Plus, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, sumPaise } from '../lib/money';
import { formatDate, todayISO } from '../lib/dates';
import { optionLabel, UPI_APPS, type TableName } from '../lib/tables';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { pdfMoney, saveFile } from '../lib/exporter';
import { copyText } from '../lib/upi';
import type { Row } from '../lib/db';
import { Badge, Button, Card, HeroCard, KV, ProgressBar } from './ui';

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
      return <LoanSummary row={row} reloadKey={reloadKey} />;
    case 'savings_goals':
      return <GoalSummary row={row} reloadKey={reloadKey} />;
    case 'incomes':
    case 'expenses':
      return <AllocationSummary table={table} row={row} reloadKey={reloadKey} />;
    case 'mock_tests':
      return <TestSummary row={row} />;
    case 'clients':
      return <ClientSummary row={row} reloadKey={reloadKey} />;
    case 'accounts':
      return <AccountSummary row={row} reloadKey={reloadKey} />;
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
        <ProgressBar pct={(received / row.amount_paise) * 100} color="#7CE0B0" />
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
        <ProgressBar pct={(t.principal_repaid_paise / row.principal_paise) * 100} color="#7CE0B0" />
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
        <ProgressBar pct={pct} color="#7CE0B0" />
      </div>
      <p className="mt-2 text-[11px] opacity-75">Savings entries set money aside; they are not counted as new income.</p>
    </HeroCard>
  );
}

function AllocationSummary({ table, row, reloadKey }: { table: 'incomes' | 'expenses'; row: Row; reloadKey: number }) {
  const [used, setUsed] = useState<number | null>(null);
  useEffect(() => {
    supabase
      .from('allocations')
      .select('amount_paise')
      .eq(table === 'incomes' ? 'income_id' : 'expense_id', row.id)
      .is('deleted_at', null)
      .then(({ data }) => setUsed(sumPaise((data as any[]) ?? [])));
  }, [table, row.id, reloadKey]);
  if (used === null || used === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <KV label={table === 'incomes' ? 'Allocated' : 'Funded'} value={formatINR(used)} />
      <KV label={table === 'incomes' ? 'Unallocated' : 'Still unfunded'} value={formatINR(row.amount_paise - used)} />
    </div>
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
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    supabase
      .from('account_balances')
      .select('balance_paise')
      .eq('id', row.id)
      .maybeSingle()
      .then(({ data }) => setBal(data ? Number((data as any).balance_paise) : null));
  }, [row.id, reloadKey]);
  return (
    <HeroCard>
      <p className="text-[13px] opacity-80">{row.upi_app ? optionLabel(UPI_APPS, row.upi_app) : 'Current balance'}</p>
      <p className="mt-1 text-[28px] font-bold tracking-tight">{bal === null ? '—' : formatINR(bal)}</p>
      {row.upi_id && (
        <button
          onClick={() => copyText(row.upi_id).then(() => toast('UPI ID copied'))}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px]"
        >
          {row.upi_id} <Copy size={12} />
        </button>
      )}
    </HeroCard>
  );
}

export { Card };
