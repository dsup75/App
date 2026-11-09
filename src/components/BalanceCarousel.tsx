// Home: one Total Balance card. Swipe (by hand only — no auto-slide) to see each bank / UPI account.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBalances, type Balance } from '../lib/db';
import { formatINR } from '../lib/money';
import { optionLabel, ACCOUNT_TYPES, UPI_APPS } from '../lib/tables';
import { cx } from './ui';

export function BalanceCarousel({ children, hide }: { children: ReactNode; hide: boolean }) {
  const nav = useNavigate();
  const [rows, setRows] = useState<Balance[]>([]);
  const [idx, setIdx] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetchBalances()
      .then((r) => setRows(r.filter((a: any) => !a.deleted_at && a.is_active !== false)))
      .catch(() => setRows([]));
  }, []);
  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const total = rows.length + 1;

  return (
    <div>
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        <div className="w-full shrink-0 snap-center">{children}</div>
        {rows.map((a: any) => (
          <div key={a.id} className="w-full shrink-0 snap-center px-0.5">
            <button type="button" onClick={() => nav(`/r/accounts/${a.id}`)} className="hero press block h-full w-full rounded-[22px] p-4 text-left">
              <p className="text-[13px] opacity-85">{optionLabel(ACCOUNT_TYPES, a.type)}{a.upi_app ? ` · ${optionLabel(UPI_APPS, a.upi_app)}` : ''}</p>
              <p className="mt-0.5 truncate text-[18px] font-bold">{a.name}</p>
              <p className="mt-2 text-[28px] font-bold tracking-tight">{hide ? '₹ • • • •' : formatINR(a.balance_paise)}</p>
              <p className="mt-2 text-[12px] opacity-80">Tap for statement & details</p>
            </button>
          </div>
        ))}
      </div>
      {total > 1 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={i === 0 ? 'Total balance' : `Account ${i}`}
              onClick={() => go(i)}
              className={cx('h-1.5 rounded-full transition-all', i === idx ? 'w-4 bg-[var(--primary-2)]' : 'w-1.5 bg-[var(--hairline)]')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
