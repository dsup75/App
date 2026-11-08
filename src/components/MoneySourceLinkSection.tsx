import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link2, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, parseRupeesToPaise } from '../lib/money';
import type { MoneySourceTable } from '../lib/moneySourceLinks';
import { Card } from './ui';

export interface MoneySourceLinkDraft {
  id?: string;
  source_table: MoneySourceTable;
  source_id: string;
  amount_paise: number;
  relation_type: string;
  note: string | null;
}

interface Candidate {
  id: string;
  table: MoneySourceTable;
  title: string;
  amount_paise: number;
  txn_date: string | null;
}

const TABLES: MoneySourceTable[] = ['incomes', 'expenses', 'transfers', 'loans', 'loan_repayments'];
const TABLE_LABEL: Record<MoneySourceTable, string> = {
  incomes: 'Income',
  expenses: 'Expense',
  transfers: 'Transfer',
  loans: 'Loan',
  loan_repayments: 'Loan repayment',
};

function candidateTitle(table: MoneySourceTable, row: Record<string, any>): string {
  if (table === 'loans') return row.person || row.title || 'Loan';
  if (table === 'loan_repayments') return row.title || 'Loan repayment';
  return row.title || (table === 'transfers' ? 'Transfer' : TABLE_LABEL[table]);
}

function candidateAmount(row: Record<string, any>): number {
  return Number(row.amount_paise ?? (Number(row.principal_paise ?? 0) + Number(row.interest_paise ?? 0)) ?? 0);
}

export function MoneySourceLinkSection({
  targetTable,
  targetId,
  total,
  links,
  setLinks,
}: {
  targetTable: MoneySourceTable;
  targetId?: string;
  total: number;
  links: MoneySourceLinkDraft[];
  setLinks: Dispatch<SetStateAction<MoneySourceLinkDraft[]>>;
}) {
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      setError('');
      const probe = await supabase.from('money_source_links').select('id').limit(1);
      if (probe.error) {
        if (!live) return;
        if (/relation .* does not exist|schema cache/i.test(probe.error.message)) setMissing(true);
        else setError(probe.error.message);
        return;
      }
      const results = await Promise.all(TABLES.map((table) =>
        supabase.from(table).select('*').is('deleted_at', null).limit(100),
      ));
      const rows: Candidate[] = [];
      results.forEach((result, index) => {
        if (result.error) return;
        const table = TABLES[index];
        (result.data ?? []).forEach((raw: Record<string, any>) => {
          if (targetId && table === targetTable && raw.id === targetId) return;
          const amountPaise = candidateAmount(raw);
          if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return;
          rows.push({
            id: raw.id,
            table,
            title: candidateTitle(table, raw),
            amount_paise: amountPaise,
            txn_date: raw.txn_date ?? raw.start_date ?? null,
          });
        });
      });
      rows.sort((a, b) => (b.txn_date ?? '').localeCompare(a.txn_date ?? ''));
      if (live) {
        setCandidates(rows);
        setReady(true);
      }
    };
    load().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [targetTable, targetId]);

  const candidateByKey = useMemo(() => new Map(candidates.map((c) => [c.table + ':' + c.id, c])), [candidates]);
  const linkedTotal = links.reduce((sum, link) => sum + link.amount_paise, 0);

  const add = () => {
    const candidate = candidateByKey.get(selected);
    const paise = parseRupeesToPaise(amount);
    if (!candidate || !paise || paise <= 0) {
      setError('Choose a source and enter a valid amount.');
      return;
    }
    if (paise > candidate.amount_paise) {
      setError('Linked amount cannot exceed the source transaction amount.');
      return;
    }
    if (linkedTotal + paise > total) {
      setError('Total source links cannot exceed this transaction amount.');
      return;
    }
    if (links.some((link) => link.source_table === candidate.table && link.source_id === candidate.id)) {
      setError('This source is already linked. Remove it first to change its amount.');
      return;
    }
    setLinks((current) => [...current, {
      source_table: candidate.table,
      source_id: candidate.id,
      amount_paise: paise,
      relation_type: 'derived_from',
      note: note.trim() || null,
    }]);
    setSelected('');
    setAmount('');
    setNote('');
    setError('');
  };

  return (
    <Card className="space-y-3 p-3.5">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">Money source links</p>
          <p className="text-[12px] text-muted">Optional trail across income, expenses, transfers and loans. Does not change account balances.</p>
        </div>
      </div>

      {missing ? (
        <p className="text-[12px] text-muted">Source linking will become available after the money-source database migration is applied. Your normal transaction save is unaffected.</p>
      ) : !ready ? (
        <p className="text-[12px] text-muted">{error || 'Checking source-link availability…'}</p>
      ) : (
        <>
          {links.length > 0 && (
            <div className="space-y-2">
              {links.map((link) => {
                const candidate = candidateByKey.get(link.source_table + ':' + link.source_id);
                return (
                  <div key={link.id ?? link.source_table + ':' + link.source_id} className="flex items-center gap-2 rounded-xl bg-[var(--card-2)] p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{candidate?.title ?? TABLE_LABEL[link.source_table]}</p>
                      <p className="text-[11px] text-muted">{TABLE_LABEL[link.source_table]} · {candidate?.txn_date ?? 'Saved source'}</p>
                    </div>
                    <span className="text-[12px] font-semibold">{formatINR(link.amount_paise)}</span>
                    <button type="button" aria-label="Remove source link" className="p-1 text-muted" onClick={() => setLinks((current) => current.filter((x) => x !== link && x.id !== link.id))}>
                      <X size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="space-y-2">
            <select className="field" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Choose a source transaction</option>
              {candidates.map((candidate) => (
                <option key={candidate.table + ':' + candidate.id} value={candidate.table + ':' + candidate.id}>
                  {TABLE_LABEL[candidate.table]} · {candidate.title} · {formatINR(candidate.amount_paise)}{candidate.txn_date ? ' · ' + candidate.txn_date : ''}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className="field" inputMode="decimal" placeholder="Linked amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input className="field" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button type="button" className="liquid flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold disabled:opacity-50" onClick={add} disabled={!selected || !amount.trim() || busy}>
              <Plus size={15} /> Add source link
            </button>
          </div>
          <div className="flex justify-between text-[11.5px] text-muted">
            <span>Linked {formatINR(linkedTotal)}</span>
            <span>Transaction {formatINR(total)}</span>
          </div>
        </>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </Card>
  );
}
