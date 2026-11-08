import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, BadgeDollarSign, CircleDollarSign, Link2, ShieldCheck, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMoneyJourney, getUnallocatedSummary, type MoneyJourneyNode as LegacyMoneyJourneyNode, type UnallocatedSummary } from '../lib/moneyTools';
import { fetchBalances, type Balance } from '../lib/db';
import { getMoneySourceJourney, type MoneyJourneyNode as SourceMoneyJourneyNode, type MoneySourceTable } from '../lib/moneySourceLinks';
import { formatINR, parseRupeesToPaise } from '../lib/money';
import { Card, Empty, Page, SectionTitle, Spinner } from '../components/ui';

interface AuditEntry { id: string; field: string; table_name: string; record_id: string; old_value: unknown; new_value: unknown; changed_at: string; }
interface JourneyTarget { id: string; table: MoneySourceTable; title: string; amount_paise: number; txn_date: string | null; }
interface ReconciliationRow {
  id: string;
  account_id: string;
  actual_balance_paise: number;
  app_balance_paise: number;
  difference_paise: number;
  notes: string | null;
  as_of_date: string;
  created_at: string;
}

export function MoneyTools() {
  const nav = useNavigate();
  const [summary, setSummary] = useState<UnallocatedSummary | null>(null);
  const [journey, setJourney] = useState<(LegacyMoneyJourneyNode | SourceMoneyJourneyNode)[]>([]);
  const [journeyTargets, setJourneyTargets] = useState<JourneyTarget[]>([]);
  const [selectedJourneyKey, setSelectedJourneyKey] = useState('');
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [recons, setRecons] = useState<ReconciliationRow[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [actualBalance, setActualBalance] = useState('');
  const [reconciliationNote, setReconciliationNote] = useState('');
  const [reconciliationError, setReconciliationError] = useState('');
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getUnallocatedSummary(),
      supabase.from('edit_history').select('id,field,table_name,record_id,old_value,new_value,changed_at').in('table_name', ['incomes', 'expenses', 'transfers', 'loans', 'loan_repayments', 'payment_lines']).order('changed_at', { ascending: false }).limit(20),
      supabase.from('reconciliations').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('incomes').select('id,title,amount_paise,txn_date').is('deleted_at', null).order('txn_date', { ascending: false }).limit(100),
      supabase.from('expenses').select('id,title,amount_paise,txn_date').is('deleted_at', null).order('txn_date', { ascending: false }).limit(100),
      supabase.from('transfers').select('id,title,amount_paise,txn_date').is('deleted_at', null).order('txn_date', { ascending: false }).limit(100),
      supabase.from('loans').select('id,person,principal_paise,start_date').is('deleted_at', null).order('start_date', { ascending: false }).limit(100),
      fetchBalances(),
    ])
      .then(([summaryData, auditRes, reconRes, incomeRes, expenseRes, transferRes, loanRes, balanceRows]) => {
        setSummary(summaryData);
        setAudit((auditRes.data as AuditEntry[]) ?? []);
        setRecons((reconRes.data as ReconciliationRow[]) ?? []);
        setBalances(balanceRows);
        setSelectedAccount((current) => current || balanceRows[0]?.id || '');

        const targets: JourneyTarget[] = [
          ...((incomeRes.data as any[]) ?? []).map((row) => ({ id: row.id, table: 'incomes' as const, title: row.title, amount_paise: Number(row.amount_paise), txn_date: row.txn_date })),
          ...((expenseRes.data as any[]) ?? []).map((row) => ({ id: row.id, table: 'expenses' as const, title: row.title, amount_paise: Number(row.amount_paise), txn_date: row.txn_date })),
          ...((transferRes.data as any[]) ?? []).map((row) => ({ id: row.id, table: 'transfers' as const, title: row.title || 'Transfer', amount_paise: Number(row.amount_paise), txn_date: row.txn_date })),
          ...((loanRes.data as any[]) ?? []).map((row) => ({ id: row.id, table: 'loans' as const, title: row.person || 'Loan', amount_paise: Number(row.principal_paise), txn_date: row.start_date })),
        ].sort((a, b) => (b.txn_date ?? '').localeCompare(a.txn_date ?? ''));
        setJourneyTargets(targets);
        setSelectedJourneyKey((current) => current || (targets[0] ? `${targets[0].table}:${targets[0].id}` : ''));

      })
      .catch(() => {
        setSummary({ received_paise: 0, allocated_paise: 0, transferred_paise: 0, remaining_paise: 0 });
        setAudit([]);
        setRecons([]);
        setJourney([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedJourneyKey) {
      setJourney([]);
      return;
    }
    const [table, id] = selectedJourneyKey.split(':');
    if (!id) return;
    let live = true;
    setJourneyLoading(true);
    Promise.all([
      getMoneyJourney(table, id).catch(() => []),
      getMoneySourceJourney(table as MoneySourceTable, id).catch(() => []),
    ]).then(([legacy, universal]) => {
      if (!live) return;
      const unique = new Map<string, LegacyMoneyJourneyNode | SourceMoneyJourneyNode>();
      [...legacy, ...universal].forEach((node) => unique.set(`${node.table}:${node.id}`, node));
      setJourney([...unique.values()]);
    }).finally(() => live && setJourneyLoading(false));
    return () => { live = false; };
  }, [selectedJourneyKey]);

  const journeyRows = useMemo(() => journey.slice(0, 20), [journey]);
  const selectedBalance = balances.find((account) => account.id === selectedAccount);
  const actualPaise = parseRupeesToPaise(actualBalance);
  const reconciliationDifference = selectedBalance && actualPaise !== null
    ? actualPaise - Number(selectedBalance.balance_paise)
    : null;

  const saveReconciliation = async () => {
    if (!selectedBalance || actualPaise === null || actualPaise < 0) {
      setReconciliationError('Choose an account and enter a valid actual balance.');
      return;
    }
    setSavingReconciliation(true);
    setReconciliationError('');
    try {
      const calculated = Number(selectedBalance.balance_paise);
      const difference = actualPaise - calculated;
      const { data, error } = await supabase.from('reconciliations').insert({
        account_id: selectedBalance.id,
        actual_balance_paise: actualPaise,
        app_balance_paise: calculated,
        notes: reconciliationNote.trim() || null,
        as_of_date: new Date().toISOString().slice(0, 10),
      }).select('*').single();
      if (error) throw error;
      setRecons((current) => [data as ReconciliationRow, ...current].slice(0, 20));
      setActualBalance('');
      setReconciliationNote('');
    } catch (error) {
      setReconciliationError(error instanceof Error ? error.message : 'Could not save reconciliation.');
    } finally {
      setSavingReconciliation(false);
    }
  };

  return (
    <Page title="Money tools" back>
      {loading ? (
        <Spinner label="Loading money tools" />
      ) : (
        <>
          <SectionTitle>Unallocated money</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3">
              <div className="mb-1 flex items-center gap-2 text-[12px] text-muted"><CircleDollarSign size={15} /> Received</div>
              <div className="text-[18px] font-bold">{formatINR(summary?.received_paise ?? 0)}</div>
            </Card>
            <Card className="p-3">
              <div className="mb-1 flex items-center gap-2 text-[12px] text-muted"><Link2 size={15} /> Allocated</div>
              <div className="text-[18px] font-bold">{formatINR(summary?.allocated_paise ?? 0)}</div>
            </Card>
            <Card className="p-3">
              <div className="mb-1 flex items-center gap-2 text-[12px] text-muted"><ArrowRightLeft size={15} /> Transferred</div>
              <div className="text-[18px] font-bold">{formatINR(summary?.transferred_paise ?? 0)}</div>
            </Card>
            <Card className="p-3">
              <div className="mb-1 flex items-center gap-2 text-[12px] text-muted"><BadgeDollarSign size={15} /> Remaining</div>
              <div className="text-[18px] font-bold">{formatINR(summary?.remaining_paise ?? 0)}</div>
            </Card>
          </div>

          <SectionTitle>Money journey</SectionTitle>
          <select className="field" value={selectedJourneyKey} onChange={(event) => setSelectedJourneyKey(event.target.value)}>
            <option value="">Choose a money record</option>
            {journeyTargets.map((target) => (
              <option key={target.table + ':' + target.id} value={target.table + ':' + target.id}>
                {target.table} · {target.title} · {formatINR(target.amount_paise)}{target.txn_date ? ' · ' + target.txn_date : ''}
              </option>
            ))}
          </select>
          {journeyLoading ? <Spinner label="Loading money journey" /> : journeyRows.length === 0 ? (
            <Empty title="No source trail yet" text="Link an expense or transfer to a source to see the journey here." />
          ) : (
            <div className="space-y-2">
              {journeyRows.map((node, idx) => (
                <Card key={`${node.table}-${node.id}-${idx}`} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{node.title}</div>
                      <div className="text-[12px] text-muted">{node.table} · {node.txn_date ?? 'No date'}</div>
                    </div>
                    <div className="text-[13px] font-semibold">{formatINR(node.amount_paise)}</div>
                  </div>
                  {node.sourceRelation && <div className="mt-2 text-[12px] text-muted">Relation: {node.sourceRelation}</div>}
                </Card>
              ))}
            </div>
          )}

          <div id="account-reconciliation"><SectionTitle>Reconciliation</SectionTitle></div>
          <Card className="space-y-3 p-3.5">
            <p className="text-[12px] text-muted">Compare the balance shown in the app with your bank, UPI or cash balance. This saves a review snapshot only and never changes your account balance.</p>
            <select className="field" value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}>
              <option value="">Choose account</option>
              {balances.map((account) => <option key={account.id} value={account.id}>{account.name} · App {formatINR(account.balance_paise)}</option>)}
            </select>
            <input className="field" inputMode="decimal" placeholder="Actual balance (₹)" value={actualBalance} onChange={(event) => setActualBalance(event.target.value)} />
            <input className="field" placeholder="Reason / note (optional)" value={reconciliationNote} onChange={(event) => setReconciliationNote(event.target.value)} />
            {reconciliationDifference !== null && (
              <div className="rounded-xl bg-[var(--card-2)] p-3 text-[13px]">
                <div className="flex justify-between"><span className="text-muted">Difference</span><strong>{formatINR(reconciliationDifference)}</strong></div>
                <p className="mt-1 text-[11px] text-muted">{reconciliationDifference === 0 ? 'Balances match.' : 'This difference is recorded for review; no balance adjustment will be posted.'}</p>
              </div>
            )}
            {reconciliationError && <p className="text-[12px] text-danger">{reconciliationError}</p>}
            <button type="button" className="liquid h-10 w-full rounded-full text-[13px] font-semibold disabled:opacity-50" disabled={savingReconciliation || !selectedBalance || actualPaise === null} onClick={saveReconciliation}>
              {savingReconciliation ? 'Saving…' : 'Save reconciliation'}
            </button>
          </Card>
          {recons.length === 0 ? (
            <Empty title="No reconciliations" text="Record account mismatches and explanations from the account detail view." />
          ) : (
            <div className="space-y-2">
              {recons.slice(0, 5).map((row) => (
                <Card key={row.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{balances.find((account) => account.id === row.account_id)?.name ?? 'Account'} · {formatINR(row.difference_paise)}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">{Number(row.difference_paise) === 0 ? 'Matched' : 'Review needed'}</span>
                  </div>
                  <div className="mt-2 text-[12px] text-muted">
                    Actual: {formatINR(row.actual_balance_paise)} · App balance: {formatINR(row.app_balance_paise)} · {row.as_of_date}
                  </div>
                  {row.notes && <div className="mt-2 text-[12px] text-muted">{row.notes}</div>}
                </Card>
              ))}
            </div>
          )}

          <SectionTitle>Audit log</SectionTitle>
          {audit.length === 0 ? (
            <Empty title="No activity yet" text="Create, edit, delete, restore, and reversal actions are logged here." />
          ) : (
            <div className="space-y-2">
              {audit.slice(0, 10).map((item) => (
                <Card key={item.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14px] font-semibold">{item.field} changed</div>
                    <div className="text-[11px] text-muted">{new Date(item.changed_at).toLocaleDateString()}</div>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{item.table_name} · {item.record_id.slice(0, 8)}</div>
                </Card>
              ))}
            </div>
          )}

          <SectionTitle>Quick actions</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => nav('/finance')} className="glass flex items-center gap-2 rounded-2xl p-3 text-left">
              <Link2 size={15} className="text-primary" />
              <span className="text-[13px] font-semibold">Money records</span>
            </button>
            <button type="button" onClick={() => document.getElementById('account-reconciliation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="glass flex items-center gap-2 rounded-2xl p-3 text-left">
              <ShieldCheck size={15} className="text-primary" />
              <span className="text-[13px] font-semibold">Reconcile account</span>
            </button>
            <button type="button" onClick={() => nav('/recycle')} className="glass col-span-2 flex items-center gap-2 rounded-2xl p-3 text-left">
              <Undo2 size={15} className="text-primary" />
              <span className="text-[13px] font-semibold">Open Recycle Bin · Restore deleted records</span>
            </button>
          </div>
        </>
      )}
    </Page>
  );
}
