// Home "Total Balance": big amount, real 30-day balance line, this month's change, and your
// bank cards fanned out on the right. Everything is worked out from your own entries.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Eye, EyeOff, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBalances, type Balance } from '../lib/db';
import { formatINR } from '../lib/money';
import { cardLook } from './BankCard';

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
      <path d={d} fill="none" stroke={c} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${c})` }} />
    </svg>
  );
}

function MiniCard({ a, style }: { a: Balance; style: CSSProperties }) {
  const look = cardLook(a);
  return (
    <div
      className="bank-card absolute h-[72px] w-[112px] overflow-hidden rounded-[12px] p-2 text-white"
      style={{ background: `linear-gradient(135deg, ${look.from}, ${look.to})`, boxShadow: '0 10px 24px rgba(0,0,0,.35)', ...style }}
    >
      <span className="card-sheen" />
      <p className="truncate text-right text-[10px] font-black italic" style={{ color: look.accent }}>{look.mark}</p>
      <span className="mt-1.5 block h-3.5 w-5 rounded-[3px]" style={{ background: 'linear-gradient(135deg,#f5d77a,#b8913a)' }} />
      <p className="mt-1 truncate text-[8.5px] font-semibold opacity-90">{a.name}</p>
    </div>
  );
}

export function BalanceHero({ total, monthIn, monthOut, hide, onToggleHide }: { total: number; monthIn: number; monthOut: number; hide: boolean; onToggleHide: () => void }) {
  const nav = useNavigate();
  const [accounts, setAccounts] = useState<Balance[]>([]);
  const [line, setLine] = useState<number[]>([]);

  useEffect(() => {
    fetchBalances()
      .then((r) => setAccounts(r))
      .catch(() => {});
    const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      supabase.from('account_movements').select('account_id,txn_date,signed_paise').gte('txn_date', from).limit(5000),
      supabase.from('accounts').select('id,opening_date').is('deleted_at', null),
    ]).then(([m, a]) => {
      if (m.error) return;
      const opening = new Map(((a.data ?? []) as any[]).map((x) => [x.id, x.opening_date as string | null]));
      const byDay = new Map<string, number>();
      for (const r of (m.data ?? []) as any[]) {
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
  const top = useMemo(() => [...accounts].sort((x, y) => y.balance_paise - x.balance_paise).slice(0, 3), [accounts]);

  return (
    <div className="hero relative overflow-hidden rounded-[24px] p-4" onClick={() => nav('/finance')}>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: 'linear-gradient(135deg,#4f8cff,#2a5bd7)', boxShadow: '0 6px 14px rgba(42,91,215,.45)' }}>
          <Wallet size={18} className="text-white" />
        </span>
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
          <div className="relative h-[100px] w-[150px] shrink-0" aria-hidden>
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
