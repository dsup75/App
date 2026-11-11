// Premium card for an account, coloured like its bank / app. Each card has its own hide/show eye.
import { useEffect, useState, type MouseEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useIconStore } from '../lib/icons';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Wifi } from 'lucide-react';
import { formatINR } from '../lib/money';
import { formatDate } from '../lib/dates';
import { ACCOUNT_TYPES, UPI_APPS, optionLabel } from '../lib/tables';
import type { Balance } from '../lib/db';

interface Look {
  from: string;
  to: string;
  accent: string;
  mark: string;
}

const LOOKS: { test: RegExp; look: Look }[] = [
  // brand colours: IPPB red + gold, SBI blue + sky, Fino blue + red star, Bank of Baroda / Baroda UP orange
  { test: /india\s*post|ippb/i, look: { from: '#c9252b', to: '#7a1013', accent: '#f0b60e', mark: 'IPPB' } },
  { test: /\bsbi\b|state bank/i, look: { from: '#22409a', to: '#0f1f52', accent: '#00b5ef', mark: 'SBI' } },
  { test: /fino/i, look: { from: '#0a4da2', to: '#062c5e', accent: '#ff4d4f', mark: 'FINO' } },
  { test: /gramin|baroda|\bbob\b|\bupgb\b/i, look: { from: '#f15a22', to: '#9c3108', accent: '#ffe0cc', mark: 'BARODA' } },
  { test: /hdfc/i, look: { from: '#004c8f', to: '#001f42', accent: '#ed232a', mark: 'HDFC' } },
  { test: /icici/i, look: { from: '#b02a30', to: '#6b1418', accent: '#f58220', mark: 'ICICI' } },
  { test: /axis/i, look: { from: '#97144d', to: '#4a0a26', accent: '#f4b6cf', mark: 'AXIS' } },
  { test: /kotak/i, look: { from: '#d71920', to: '#003874', accent: '#ffffff', mark: 'KOTAK' } },
  { test: /\bpnb\b|punjab national/i, look: { from: '#a2183a', to: '#5c0d20', accent: '#f3a51e', mark: 'PNB' } },
  { test: /canara/i, look: { from: '#0072bc', to: '#003d66', accent: '#ffcb05', mark: 'CANARA' } },
  { test: /union bank/i, look: { from: '#e31e24', to: '#1d3f8f', accent: '#ffffff', mark: 'UNION' } },
  { test: /airtel/i, look: { from: '#e40000', to: '#7a0000', accent: '#ffffff', mark: 'AIRTEL' } },
  { test: /paytm/i, look: { from: '#00b9f1', to: '#002e6e', accent: '#ffffff', mark: 'Paytm' } },
  { test: /phone\s*pe/i, look: { from: '#6f2dbd', to: '#2f1060', accent: '#d8c2ff', mark: 'PhonePe' } },
  { test: /g\s*pay|google pay/i, look: { from: '#1a73e8', to: '#0b3d91', accent: '#ffffff', mark: 'G Pay' } },
  { test: /amazon/i, look: { from: '#37475a', to: '#131a22', accent: '#ff9900', mark: 'amazon pay' } },
  { test: /\bsimpl\b/i, look: { from: '#00d09c', to: '#036b52', accent: '#ffffff', mark: 'simpl' } },
  { test: /lazy\s*pay/i, look: { from: '#e61f7b', to: '#6b0b38', accent: '#ffffff', mark: 'LazyPay' } },
  { test: /\bslice\b/i, look: { from: '#7b3fe4', to: '#2c0f6b', accent: '#ffd23f', mark: 'slice' } },
  { test: /one\s*card/i, look: { from: '#2b2b2b', to: '#0a0a0a', accent: '#c9c9c9', mark: 'OneCard' } },
  { test: /bajaj/i, look: { from: '#005baa', to: '#00264d', accent: '#ffffff', mark: 'BAJAJ' } },
  { test: /groww/i, look: { from: '#00b386', to: '#035e48', accent: '#ffffff', mark: 'groww' } },
  { test: /zerodha|kite/i, look: { from: '#387ed1', to: '#16365e', accent: '#ffffff', mark: 'ZERODHA' } },
  { test: /\blic\b/i, look: { from: '#0b4ea2', to: '#05264d', accent: '#ffd400', mark: 'LIC' } },
  { test: /cash|wallet|purse/i, look: { from: '#2e8b57', to: '#123d27', accent: '#c8f5d8', mark: '₹ CASH' } },
];

const APP_LOOK: Record<string, string> = { paytm: 'paytm', phonepe: 'phonepe', gpay: 'gpay', amazonpay: 'amazon', cash: 'cash' };

export function cardLook(a: { name: string; upi_app?: string | null; type?: string }): Look {
  const byName = LOOKS.find((l) => l.test.test(a.name));
  if (byName) return byName.look;
  const app = a.upi_app ? APP_LOOK[a.upi_app] : undefined;
  if (app) return LOOKS.find((l) => l.test.test(app))!.look;
  if (a.type === 'cash') return LOOKS.find((l) => l.test.test('cash'))!.look;
  // premium defaults for cards, loans and investments without a known brand
  if (a.type === 'credit_card') return { from: '#3a3d46', to: '#0c0d10', accent: '#e9d8a6', mark: a.name.slice(0, 10).toUpperCase() };
  if (a.type === 'pay_later') return { from: '#5b4bdb', to: '#1f1660', accent: '#ffffff', mark: a.name.slice(0, 10).toUpperCase() };
  if (a.type === 'loan') return { from: '#1e3a8a', to: '#0b1530', accent: '#93c5fd', mark: 'LOAN' };
  if (a.type === 'investment') return { from: '#0f766e', to: '#052e2b', accent: '#a7f3d0', mark: 'INVEST' };
  return { from: 'var(--hero-1)', to: 'var(--hero-2)', accent: 'rgba(255,255,255,.8)', mark: a.name.slice(0, 10).toUpperCase() };
}

function readHidden(id: string) {
  try {
    return localStorage.getItem(`card-hidden:${id}`) === '1';
  } catch {
    return false;
  }
}

export interface CardExtra {
  account_number?: string | null;
  account_holder?: string | null;
  card_network?: 'rupay' | 'visa' | 'mastercard' | 'amex' | 'diners' | null;
  card_color?: string | null;
  card_last4?: string | null;
  credit_limit_paise?: number | null;
  lender?: string | null;
}

/** Card network written in its usual style (plain lettering — not the official logo artwork) */
export function NetworkMark({ network, size = 15 }: { network: NonNullable<CardExtra['card_network']>; size?: number }) {
  const base = { fontSize: size, lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,.35)' } as const;
  if (network === 'visa') return <span className="font-black italic tracking-tight" style={{ ...base, fontSize: size * 1.15, letterSpacing: '-0.02em' }}>VISA</span>;
  if (network === 'rupay')
    return (
      <span className="font-black italic tracking-tight" style={base}>
        Ru<span style={{ fontWeight: 800 }}>Pay</span>
      </span>
    );
  if (network === 'mastercard') return <span className="font-bold tracking-tight" style={{ ...base, fontSize: size * 0.85 }}>mastercard</span>;
  if (network === 'amex') return <span className="rounded-[3px] px-1 font-black tracking-tight" style={{ ...base, fontSize: size * 0.7, background: 'rgba(255,255,255,.9)', color: '#1f6fcf', textShadow: 'none', padding: '3px 4px' }}>AMEX</span>;
  return <span className="font-bold tracking-tight" style={{ ...base, fontSize: size * 0.8 }}>Diners Club</span>;
}

/** A realistic EMV chip (generic drawing) */
export function CardChip({ w = 40 }: { w?: number }) {
  const h = Math.round(w * 0.74);
  return (
    <svg width={w} height={h} viewBox="0 0 40 30" aria-hidden>
      <defs>
        <linearGradient id="chip-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe6a2" />
          <stop offset="0.45" stopColor="#d9b25c" />
          <stop offset="1" stopColor="#a8822f" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="29" rx="6" fill="url(#chip-g)" stroke="rgba(0,0,0,.25)" />
      <g fill="none" stroke="rgba(90,60,10,.55)" strokeWidth="1">
        <path d="M0 10h12M0 20h12M28 10h12M28 20h12M12 0v30M28 0v30" />
        <rect x="12" y="7" width="16" height="16" rx="3" />
      </g>
    </svg>
  );
}

const CREDIT_TYPES = ['credit_card', 'pay_later', 'loan'];

export function BankCard({ account, extra }: { account: Balance & { opening_date?: string | null }; extra?: CardExtra }) {
  const nav = useNavigate();
  const base = cardLook(account);
  // a colour chosen by the user wins; it is the user's own design, not an official bank card
  const look = extra?.card_color ? { ...base, from: extra.card_color, to: '#0b0b0b' } : base;
  const icons = useIconStore();
  const ic = icons.get('accounts', account.id);
  const up = ic?.kind === 'custom' ? icons.upload(ic.custom_icon_id) : null;
  const logo = up && icons.url(up.path) ? { url: icons.url(up.path)!, keep: up.keep_colors } : null;
  const [hidden, setHidden] = useState(() => readHidden(account.id));
  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    const next = !hidden;
    setHidden(next);
    try {
      localStorage.setItem(`card-hidden:${account.id}`, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const mask = (s: string) => (hidden ? '•••• ••••' : s);
  const owes = CREDIT_TYPES.includes(account.type);
  const last4 = extra?.card_last4 || (extra?.account_number ? extra.account_number.replace(/\s/g, '').slice(-4) : null);
  const upi = account.upi_id ? (hidden ? account.upi_id.replace(/^[^@]+/, '••••') : account.upi_id) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => nav(`/r/accounts/${account.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && nav(`/r/accounts/${account.id}`)}
      className="bank-card press relative aspect-[1.586] w-full shrink-0 snap-center overflow-hidden rounded-[22px] p-4 text-white"
      style={{
        background: `linear-gradient(135deg, ${look.from}, ${look.to})`,
        boxShadow: '0 18px 36px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.3)',
      }}
    >
      <span className="card-sheen" />
      {/* glossy shapes */}
      <span className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full" style={{ background: 'rgba(255,255,255,.12)' }} />
      <span className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-56 rounded-full" style={{ background: 'rgba(0,0,0,.12)' }} />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.14), transparent)' }} />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold tracking-tight">{account.name}</p>
            <p className="text-[11.5px] opacity-80">
              {optionLabel(ACCOUNT_TYPES, account.type)}
              {account.upi_app ? ` · ${optionLabel(UPI_APPS, account.upi_app)}` : ''}
            </p>
          </div>
          {logo ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px]" style={{ background: 'rgba(255,255,255,.92)' }}>
              <img src={logo.url} alt="" className={logo.keep ? '' : 'themed-img'} style={{ width: 30, height: 30, objectFit: 'contain' }} />
            </span>
          ) : (
            <span className="shrink-0 text-[15px] font-black italic tracking-tight" style={{ color: look.accent }}>
              {look.mark}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <CardChip />
          <Wifi size={17} className="rotate-90 opacity-80" />
          {last4 && (
            <span className="ml-1 font-mono text-[13.5px] tracking-[0.14em] opacity-95" style={{ textShadow: '0 1px 1px rgba(0,0,0,.35)' }}>
              •••• •••• {hidden ? '••••' : last4}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0">
            {extra?.account_holder && <p className="truncate text-[11px] uppercase tracking-wider opacity-80">{extra.account_holder}</p>}
            <p className="text-[10.5px] uppercase tracking-wider opacity-70">{owes ? (account.type === 'loan' ? 'Left to pay' : 'Outstanding') : account.type === 'investment' ? 'Invested' : 'Balance'}</p>
            <p className="text-[22px] font-bold leading-tight tracking-tight">{hidden ? '₹ • • • • •' : formatINR(owes ? Math.max(0, -account.balance_paise) : account.balance_paise)}</p>
            <p className="truncate text-[11px] opacity-80">
              {owes && extra?.credit_limit_paise
                ? mask(`Limit ${formatINR(extra.credit_limit_paise)} · Available ${formatINR(Math.max(0, extra.credit_limit_paise + Math.min(0, account.balance_paise)))}`)
                : upi ?? mask(`Opening ${formatINR(account.opening_balance_paise)}${account.opening_date ? ` · ${formatDate(account.opening_date)}` : ''}`)}
            </p>
          </div>
          <button
            type="button"
            aria-label={hidden ? `Show ${account.name} details` : `Hide ${account.name} details`}
            onClick={toggle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,.18)' }}
          >
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          {extra?.card_network && (
            <span className="absolute bottom-12 right-0 opacity-95">
              <NetworkMark network={extra.card_network} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function BankCardCarousel({ rows }: { rows: Balance[] }) {
  const [extras, setExtras] = useState<Record<string, CardExtra>>({});
  useEffect(() => {
    supabase
      .from('accounts')
      .select('id,account_number,account_holder,card_network,card_color,card_last4,credit_limit_paise,lender')
      .then(async ({ data, error }) => {
        if (!error && data) return setExtras(Object.fromEntries((data as any[]).map((r) => [r.id, r])));
        // server not updated yet: older columns only
        const old = await supabase.from('accounts').select('id,account_number,account_holder,card_network,card_color');
        if (!old.error && old.data) setExtras(Object.fromEntries((old.data as any[]).map((r) => [r.id, r])));
      });
  }, []);
  if (!rows.length) return null;
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
      {rows.map((r) => (
        <div key={r.id} className="w-[84%] max-w-[340px] shrink-0 snap-center">
          <BankCard account={r} extra={extras[r.id]} />
        </div>
      ))}
    </div>
  );
}
