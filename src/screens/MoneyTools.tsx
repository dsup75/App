import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, BadgeDollarSign, CircleDollarSign, Link2, ShieldCheck, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMoneyJourney, getUnallocatedSummary, type MoneyJourneyNode as LegacyMoneyJourneyNode, type UnallocatedSummary } from '../lib/moneyTools';
import { getMoneySourceJourney, type MoneyJourneyNode as SourceMoneyJourneyNode } from '../lib/moneySourceLinks';
import { formatINR } from '../lib/money';
import { Card, Empty, Page, SectionTitle, Spinner } from '../components/ui';

interface AuditEntry { id: string; action: string; table_name: string; record_id: string; created_at: string; }
interface ReconciliationRow {
  id: string;
  account_id: string;
  actual_balance_paise: number;
  calculated_balance_paise: number;
  difference_paise: number;
  explanation: string | null;
  status: string;
  created_at: string;
}

export function MoneyTools() {
  const [summary, setSummary] = useState<UnallocatedSummary | null>(null);
  const [journey, setJourney] = useState<(LegacyMoneyJourneyNode | SourceMoneyJourneyNode)[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [recons, setRecons] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getUnallocatedSummary(),
      supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('reconciliations').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('incomes').select('id,title,amount_paise,txn_date,account_id').is('deleted_at', null).order('txn_date', { ascending: false }).limit(20),
    ])
      .then(([summaryData, auditRes, reconRes, incomeRes]) => {
        setSummary(summaryData);
        setAudit((auditRes.data as AuditEntry[]) ?? []);
        setRecons((reconRes.data as ReconciliationRow[]) ?? []);

        const firstIncome = (incomeRes.data as any[] | undefined)?.[0];
        if (firstIncome) {
          Promise.all([
            getMoneyJourney('incomes', firstIncome.id).catch(() => []),
            getMoneySourceJourney('incomes', firstIncome.id).catch(() => []),
          ]).then(([legacy, universal]) => {
            const unique = new Map<string, LegacyMoneyJourneyNode | SourceMoneyJourneyNode>();
            [...legacy, ...universal].forEach((node) => unique.set(`${node.table}:${node.id}`, node));
            setJourney([...unique.values()]);
          });
        } else {
          setJourney([]);
        }
      })
      .catch(() => {
        setSummary({ received_paise: 0, allocated_paise: 0, transferred_paise: 0, remaining_paise: 0 });
        setAudit([]);
        setRecons([]);
        setJourney([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const journeyRows = useMemo(() => journey.slice(0, 6), [journey]);

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
          {journeyRows.length === 0 ? (
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

          <SectionTitle>Reconciliation</SectionTitle>
          {recons.length === 0 ? (
            <Empty title="No reconciliations" text="Record account mismatches and explanations from the account detail view." />
          ) : (
            <div className="space-y-2">
              {recons.slice(0, 5).map((row) => (
                <Card key={row.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-semibold">Difference {formatINR(row.difference_paise)}</div>
                    <span className="text-[11px] text-muted">{row.status}</span>
                  </div>
                  <div className="mt-2 text-[12px] text-muted">
                    Actual: {formatINR(row.actual_balance_paise)} · Calculated: {formatINR(row.calculated_balance_paise)}
                  </div>
                  {row.explanation && <div className="mt-2 text-[12px] text-muted">{row.explanation}</div>}
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
                    <div className="text-[14px] font-semibold">{item.action}</div>
                    <div className="text-[11px] text-muted">{new Date(item.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{item.table_name}</div>
                </Card>
              ))}
            </div>
          )}

          <SectionTitle>Quick actions</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Card className="flex items-center gap-2 p-3">
              <Link2 size={15} className="text-primary" />
              <span className="text-[13px] font-semibold">Source links</span>
            </Card>
            <Card className="flex items-center gap-2 p-3">
              <ShieldCheck size={15} className="text-primary" />
              <span className="text-[13px] font-semibold">Reconcile</span>
            </Card>
            <Card className="flex items-center gap-2 p-3">
              <Undo2 size={15} className="text-primary" />
              <span className="text-[13px] font-semibold">Restore reversal</span>
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}
