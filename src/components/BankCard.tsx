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
  { test: /cash|wallet|purse/i, look: { from: '#2e8b57', to: '#123d27', accent: '#c8f5d8', mark: '₹ CASH' } },
];

const APP_LOOK: Record<string, string> = { paytm: 'paytm', phonepe: 'phonepe', gpay: 'gpay', amazonpay: 'amazon', cash: 'cash' };

export function cardLook(a: { name: string; upi_app?: string | null; type?: string }): Look {
  const byName = LOOKS.find((l) => l.test.test(a.name));
  if (byName) return byName.look;
  const app = a.upi_app ? APP_LOOK[a.upi_app] : undefined;
  if (app) return LOOKS.find((l) => l.test.test(app))!.look;
  if (a.type === 'cash') return LOOKS.find((l) => l.test.test('cash'))!.look;
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
  card_network?: 'rupay' | 'visa' | 'mastercard' | null;
  card_color?: string | null;
}
const NETWORK_LABEL = { rupay: 'RuPay', visa: 'VISA', mastercard: 'mastercard' } as const;

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
        boxShadow: '0 14px 30px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.25)',
      }}
    >
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
          <span className="h-7 w-10 rounded-[6px]" style={{ background: 'linear-gradient(135deg,#f5d77a,#b8913a)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />
          <Wifi size={16} className="rotate-90 opacity-70" />
          {extra?.account_number && (
            <span className="ml-1 font-mono text-[12.5px] tracking-[0.12em] opacity-90">•••• {hidden ? '••••' : extra.account_number.replace(/\s/g, '').slice(-4)}</span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0">
            {extra?.account_holder && <p className="truncate text-[11px] uppercase tracking-wider opacity-80">{extra.account_holder}</p>}
            <p className="text-[10.5px] uppercase tracking-wider opacity-70">Balance</p>
            <p className="text-[22px] font-bold leading-tight tracking-tight">{hidden ? '₹ • • • • •' : formatINR(account.balance_paise)}</p>
            <p className="truncate text-[11px] opacity-80">
              {upi ?? mask(`Opening ${formatINR(account.opening_balance_paise)}${account.opening_date ? ` · ${formatDate(account.opening_date)}` : ''}`)}
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
            <span className="absolute bottom-12 right-0 text-[13px] font-black italic tracking-tight opacity-90">{NETWORK_LABEL[extra.card_network]}</span>
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
      .select('id,account_number,account_holder,card_network,card_color')
      .then(({ data, error }) => {
        if (!error && data) setExtras(Object.fromEntries((data as any[]).map((r) => [r.id, r])));
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
