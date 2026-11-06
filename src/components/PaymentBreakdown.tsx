// Read-only list of the payment parts of a money entry
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { getLines, type LineRow, type MoneyTable } from '../lib/db';
import { formatINR } from '../lib/money';
import { formatDate } from '../lib/dates';
import { useCustomOptions } from '../lib/options';
import { Card, SectionTitle } from './ui';

export function PaymentBreakdown({ table, id, nameOf, reloadKey }: { table: MoneyTable; id: string; nameOf: (id: string) => string; reloadKey?: number }) {
  const nav = useNavigate();
  const { labelOf } = useCustomOptions();
  const [lines, setLines] = useState<LineRow[] | null>(null);

  useEffect(() => {
    getLines(table, id).then(setLines).catch(() => setLines([]));
  }, [table, id, reloadKey]);

  if (!lines?.length) return null;
  const partyLabel = table === 'incomes' ? 'Paid by' : table === 'expenses' ? 'Paid to' : 'Person';

  return (
    <>
      <SectionTitle right={<span className="text-[12.5px] text-muted">{lines.length} payment{lines.length > 1 ? 's' : ''}</span>}>Payment breakdown</SectionTitle>
      <div className="space-y-2">
        {lines.map((l) => (
          <Card key={l.id} className="space-y-1" onClick={() => nav(`/r/accounts/${l.account_id}`)}>
            <div className="flex items-center gap-2">
              {l.direction === 'in' ? <ArrowDownLeft size={16} className="text-income" /> : <ArrowUpRight size={16} className="text-expense" />}
              <p className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                {nameOf(l.account_id)}
                {l.payment_app ? <span className="font-normal text-muted"> · {labelOf('payment_app', l.payment_app)}</span> : null}
              </p>
              <span className={'text-[15px] font-semibold ' + (l.direction === 'in' ? 'text-income' : 'text-expense')}>
                {l.direction === 'in' ? '+' : '−'}
                {formatINR(l.amount_paise)}
              </span>
            </div>
            <p className="text-[12.5px] text-muted">
              {formatDate(l.txn_date)}
              {l.txn_time ? ` · ${String(l.txn_time).slice(0, 5)}` : ''}
              {l.reference ? ` · UTR ${l.reference}` : ''}
            </p>
            {(l.party_name || l.notes) && (
              <p className="text-[12.5px]">
                {l.party_name ? `${partyLabel}: ${l.party_name}` : ''}
                {l.party_name && l.notes ? ' · ' : ''}
                {l.notes ?? ''}
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
