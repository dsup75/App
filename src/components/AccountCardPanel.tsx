// Account page: the account's own card, colour choice (bank's original colours or your own) and bank details.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Eye, EyeOff, Palette, Pencil } from 'lucide-react';
import { BankCard, cardLook } from './BankCard';
import { supabase } from '../lib/supabase';
import { optionLabel, BANK_ACCOUNT_TYPES } from '../lib/tables';
import { copyText } from '../lib/upi';
import { friendlyError, type Row } from '../lib/db';
import { useToast } from '../context/ToastContext';
import { Button, Card, Sheet, cx } from './ui';

const SWATCHES = ['#1a3a8f', '#0a4da2', '#22409a', '#c9252b', '#97144d', '#6f2dbd', '#0b7a5c', '#f26522', '#b8860b', '#37474f', '#111111', '#c2185b'];

export function AccountCardPanel({ row, balance, onChanged }: { row: Row; balance: number | null; onChanged: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [colorOpen, setColorOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [color, setColor] = useState<string | null>(row.card_color ?? null);

  const saveColor = async (c: string | null) => {
    setColor(c);
    const { error } = await supabase.from('accounts').update({ card_color: c }).eq('id', row.id);
    if (error) return toast(friendlyError(error), 'error');
    toast(c ? 'Card colour saved' : 'Using the bank’s colours');
    setColorOpen(false);
    onChanged();
  };
  const copy = (label: string, v: string) => copyText(v).then(() => toast(`${label} copied`)).catch(() => toast('Could not copy', 'error'));
  const details: [string, string | null, boolean][] = [
    ['Account holder', row.account_holder ?? null, false],
    ['Account number', row.account_number ?? null, true],
    ['IFSC', row.ifsc ?? null, false],
    ['CIF / customer ID', row.customer_id ?? null, true],
    ['Branch', row.branch ?? null, false],
    ['Account type', row.bank_account_type ? optionLabel(BANK_ACCOUNT_TYPES, row.bank_account_type) : null, false],
    ['UPI ID', row.upi_id ?? null, false],
  ];
  const filled = details.filter(([, v]) => v);
  const original = cardLook({ name: row.name, upi_app: row.upi_app, type: row.type });

  return (
    <>
      <BankCard
        account={{ ...(row as any), balance_paise: balance ?? 0 }}
        extra={{ account_number: row.account_number, account_holder: row.account_holder, card_network: row.card_network, card_color: color }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button full onClick={() => setColorOpen(true)}>
          <Palette size={14} /> Card colour
        </Button>
        <Button full onClick={() => nav(`/r/accounts/${row.id}/edit`)}>
          <Pencil size={14} /> {filled.length ? 'Edit details' : 'Add bank details'}
        </Button>
      </div>

      {filled.length > 0 && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold">Bank details</p>
            <button type="button" onClick={() => setShow(!show)} className="flex items-center gap-1 text-[12.5px] text-muted">
              {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {filled.map(([label, v, sensitive]) => (
            <div key={label} className="flex items-center gap-2 text-[13.5px]">
              <span className="w-[42%] shrink-0 text-muted">{label}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{sensitive && !show ? `•••• ${String(v).slice(-4)}` : v}</span>
              <button type="button" aria-label={`Copy ${label}`} onClick={() => copy(label, String(v))} className="p-1 text-muted">
                <Copy size={14} />
              </button>
            </div>
          ))}
          <p className="text-[11px] text-muted">Never save ATM PIN, UPI PIN, CVV, OTP or net-banking passwords anywhere.</p>
        </Card>
      )}

      <Sheet open={colorOpen} onClose={() => setColorOpen(false)} title="Card colour">
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => saveColor(null)}
            className={cx('press flex w-full items-center gap-3 rounded-[14px] p-2.5 text-left', !color && 'ring-2 ring-[var(--primary-2)]')}
            style={{ background: 'var(--card-2)' }}
          >
            <span className="h-9 w-14 shrink-0 rounded-[8px]" style={{ background: `linear-gradient(135deg, ${original.from}, ${original.to})` }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Bank’s original colours</span>
              <span className="block text-[11.5px] text-muted">Matched from the account name (e.g. SBI, IPPB, Fino)</span>
            </span>
          </button>
          <p className="text-[12px] font-semibold text-muted">Or pick your own</p>
          <div className="grid grid-cols-6 gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => saveColor(c)}
                className={cx('press aspect-square rounded-full', color === c && 'ring-2 ring-[var(--primary-2)] ring-offset-2 ring-offset-[var(--sheet)]')}
                style={{ background: `linear-gradient(135deg, ${c}, #0b0b0b)` }}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted">Your own card design for this app — not an official bank card. You can also upload the bank’s logo with “Icon → Change”.</p>
        </div>
      </Sheet>
    </>
  );
}
