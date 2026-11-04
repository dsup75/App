import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import { formatINR } from '../lib/money';
import { relativeDay } from '../lib/dates';
import { optionLabel, UPI_APPS } from '../lib/tables';
import { IconBubble, ListRow } from './ui';

export type MoneyKind = 'incomes' | 'expenses' | 'transfers';

export function MoneyRow({ kind, row, nameOf }: { kind: MoneyKind; row: any; nameOf: (id: string) => string }) {
  const nav = useNavigate();
  const icon =
    kind === 'incomes' ? (
      <IconBubble tone="income"><ArrowDownLeft size={18} /></IconBubble>
    ) : kind === 'expenses' ? (
      <IconBubble tone="expense"><ArrowUpRight size={18} /></IconBubble>
    ) : (
      <IconBubble tone="violet"><ArrowLeftRight size={18} /></IconBubble>
    );
  const sub =
    kind === 'transfers'
      ? `${nameOf(row.from_account_id)} → ${nameOf(row.to_account_id)}`
      : [row.payment_app ? optionLabel(UPI_APPS, row.payment_app) : nameOf(row.account_id), row.category_id ? nameOf(row.category_id) : null, row.payment_mode === 'business' ? 'Business' : null]
          .filter(Boolean)
          .join(' · ');
  const amount =
    kind === 'incomes' ? (
      <span className="font-semibold text-income">{formatINR(row.amount_paise, { sign: true })}</span>
    ) : kind === 'expenses' ? (
      <span className="font-semibold text-expense">{formatINR(-row.amount_paise)}</span>
    ) : (
      <span className="font-semibold">{formatINR(row.amount_paise)}</span>
    );
  return (
    <ListRow
      icon={icon}
      title={row.title}
      subtitle={`${relativeDay(row.txn_date)}${row.txn_time ? ` ${String(row.txn_time).slice(0, 5)}` : ''} · ${sub}`}
      right={amount}
      onClick={() => nav(`/r/${kind}/${row.id}`)}
    />
  );
}
