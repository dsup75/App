// Home "Total Balance": big amount, this month's change and your
// bank cards fanned out on the right. Everything is worked out from your own entries.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { fetchCreditAccounts, type CreditAccount } from '../lib/credit';
import { isSpendable } from '../lib/tables';
import { formatINR } from '../lib/money';
import { cardLook, CardChip, NetworkMark } from './BankCard';

function splitAmount(paise: number) {
  const s = formatINR(paise);
  const i = s.lastIndexOf('.');
  return i > 0 ? [s.slice(0, i), s.slice(i)] : [s, ''];
}

function MiniCard({ a, style }: { a: CreditAccount; style: CSSProperties }) {
  const base = cardLook(a);
  const look = a.card_color ? { ...base, from: a.card_color, to: '#0b0b0b' } : base;
  const last4 = a.card_last4 || (a.account_number ? a.account_number.replace(/\s/g, '').slice(-4) : null);
  return (
    <div
      className="bank-card absolute h-[80px] w-[124px] overflow-hidden rounded-[13px] px-2 py-1.5 text-white"
      style={{ background: `linear-gradient(135deg, ${look.from}, ${look.to})`, boxShadow: '0 10px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3)', ...style }}
    >
      <span className="card-sheen" />
      <p className="truncate text-right text-[11px] font-black italic leading-tight" style={{ color: look.accent }}>{look.mark}</p>
      <div className="mt-1 flex items-center gap-1">
        <CardChip w={19} />
        <span className="text-[8px] opacity-80">)))</span>
      </div>
      <p className="mt-0.5 truncate font-mono text-[8.5px] tracking-wider opacity-90">{last4 ? `•••• •••• ${last4}` : a.name}</p>
      {a.card_network && (
        <span className="absolute bottom-1 right-1.5">
          <NetworkMark network={a.card_network} size={9} />
        </span>
      )}
    </div>
  );
}

export function BalanceHero({ total, monthIn, monthOut, hide, onToggleHide }: { total: number; monthIn: number; monthOut: number; hide: boolean; onToggleHide: () => void }) {
  const nav = useNavigate();
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);

  useEffect(() => {
    fetchCreditAccounts()
      .then((r) => setAccounts(r.filter((a) => isSpendable(a.type) || a.type === 'credit_card')))
      .catch(() => {});
  }, [total]);

  const net = monthIn - monthOut;
  const startOfMonth = total - net;
  const pct = startOfMonth > 0 ? Math.round((net / startOfMonth) * 1000) / 10 : null;
  const [whole, dec] = splitAmount(total);
  // cards with a known bank first (they look like real cards), then by balance
  const top = useMemo(
    () => [...accounts].sort((x, y) => Number(!!(y.card_network || y.card_last4)) - Number(!!(x.card_network || x.card_last4)) || y.balance_paise - x.balance_paise).slice(0, 3),
    [accounts],
  );

  return (
    <div className="hero relative overflow-hidden rounded-[24px] p-4" onClick={() => nav('/finance')}>
      <div className="relative flex items-start">
        <div className="relative z-10 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[16px] font-semibold">Total Balance</p>
            <button
              type="button"
              aria-label={hide ? 'Show amounts' : 'Hide amounts'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleHide();
              }}
              className="p-1 opacity-80"
            >
              {hide ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p className="mt-1.5 font-bold tracking-tight">
            {hide ? (
              <span className="text-[32px]">₹ • • • •</span>
            ) : (
              <>
                <span className="text-[34px] leading-none">{whole}</span>
                <span className="text-[20px] opacity-85">{dec}</span>
              </>
            )}
          </p>
          {!hide && (monthIn > 0 || monthOut > 0) && (
            <p className="mt-2 flex items-center gap-1 text-[14px] font-semibold" style={{ color: net >= 0 ? 'var(--tone-income)' : 'var(--tone-expense)' }}>
              {net >= 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
              {pct !== null ? `${Math.abs(pct)}%` : formatINR(Math.abs(net))} this month
            </p>
          )}
        </div>
        {top.length > 0 && (
          <div className="relative -mr-1 -mt-1 h-[108px] w-[150px] shrink-0" aria-hidden>
            {top
              .slice()
              .reverse()
              .map((a, i, arr) => {
                const k = arr.length - 1 - i; // 0 = front
                return <MiniCard key={a.id} a={a} style={{ left: k * 16, top: 4 + k * 3, transform: `rotate(${-6 + k * 5}deg)`, zIndex: 10 - k }} />;
              })}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          nav('/finance?tab=accounts');
        }}
        className="press mt-4 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[14px] font-semibold"
        style={{ background: 'rgba(255,255,255,.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--acc), .55), 0 0 14px rgba(var(--acc), .25)' }}
      >
        View Accounts <ArrowRight size={15} />
      </button>
    </div>
  );
}
