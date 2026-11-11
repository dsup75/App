// Home "Total Balance": big amount, real 30-day balance line, this month's change, and your
// bank cards fanned out on the right. Everything is worked out from your own entries.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchCreditAccounts, type CreditAccount } from '../lib/credit';
import { isSpendable } from '../lib/tables';
import { formatINR } from '../lib/money';
import { cardLook, CardChip, NetworkMark } from './BankCard';
import { Glyph } from './Glyph';

function splitAmount(paise: number) {
  const s = formatINR(paise);
  const i = s.lastIndexOf('.');
  return i > 0 ? [s.slice(0, i), s.slice(i)] : [s, ''];
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 70;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 14)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${W},${H} L0,${H} Z`;
  const up = points[points.length - 1] >= points[0];
  const c = up ? 'var(--tone-income)' : 'var(--tone-expense)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[64px] w-full" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.32" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke={c} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
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
  const [line, setLine] = useState<number[]>([]);

  useEffect(() => {
    fetchCreditAccounts()
      .then((r) => setAccounts(r.filter((a) => isSpendable(a.type) || a.type === 'credit_card')))
      .catch(() => {});
    const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      supabase.from('account_movements').select('account_id,txn_date,signed_paise').gte('txn_date', from).limit(5000),
      supabase.from('accounts').select('id,opening_date,type').is('deleted_at', null),
    ]).then(([m, a]) => {
      if (m.error) return;
      const opening = new Map(((a.data ?? []) as any[]).map((x) => [x.id, x.opening_date as string | null]));
      // the line follows spendable money only (same as the big number)
      const spend = new Set(((a.data ?? []) as any[]).filter((x) => isSpendable(x.type)).map((x) => x.id));
      const byDay = new Map<string, number>();
      for (const r of (m.data ?? []) as any[]) {
        if (!spend.has(r.account_id)) continue;
        const od = opening.get(r.account_id);
        if (od && r.txn_date < od) continue;
        byDay.set(r.txn_date, (byDay.get(r.txn_date) ?? 0) + Number(r.signed_paise));
      }
      // walk back from today's balance
      const pts: number[] = [];
      let bal = total;
      for (let i = 0; i < 30; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        pts.unshift(bal);
        bal -= byDay.get(d) ?? 0;
      }
      setLine(pts);
    });
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
      <div className="flex items-center gap-2">
        <Glyph name="wallet" size={36} />
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

      <div className="relative mt-2 flex items-start">
        <div className="relative z-10 min-w-0 flex-1">
          <p className="font-bold tracking-tight">
            {hide ? (
              <span className="text-[34px]">₹ • • • •</span>
            ) : (
              <>
                <span className="text-[36px] leading-none">{whole}</span>
                <span className="text-[20px] opacity-80">{dec}</span>
              </>
            )}
          </p>
          <p className="mt-1 text-[12.5px] opacity-80">Across all accounts</p>
          {!hide && (monthIn > 0 || monthOut > 0) && (
            <span
              className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{ background: net >= 0 ? 'var(--tone-income-bg)' : 'var(--tone-expense-bg)', color: net >= 0 ? 'var(--tone-income)' : 'var(--tone-expense)' }}
            >
              {net >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {pct !== null ? `${Math.abs(pct)}%` : formatINR(Math.abs(net))} this month
            </span>
          )}
        </div>
        {top.length > 0 && (
          <div className="relative h-[108px] w-[158px] shrink-0" aria-hidden>
            {top
              .slice()
              .reverse()
              .map((a, i, arr) => {
                const k = arr.length - 1 - i; // 0 = front
                return <MiniCard key={a.id} a={a} style={{ right: k * 14, top: 8 + k * 6, transform: `rotate(${-8 + k * 7}deg)`, zIndex: 10 - k }} />;
              })}
          </div>
        )}
      </div>

      <div className="-mx-1 mt-1">
        <Sparkline points={line} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[11.5px] opacity-80">
          {hide ? 'This month' : `In ${formatINR(monthIn)} · Out ${formatINR(monthOut)}`}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            nav('/finance?tab=accounts');
          }}
          className="glass press flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
        >
          View Accounts <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
