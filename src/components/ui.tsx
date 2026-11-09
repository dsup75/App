import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, CircleAlert, Inbox } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ---------- Page with large title ---------- */
export function Page({
  title,
  subtitle,
  back,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="page-in page-wrap relative z-10 mx-auto pb-32 pt-safe">
      <div className="flex h-11 items-center justify-between">
        {back ? (
          <button onClick={() => nav(-1)} className="-ml-1.5 flex items-center gap-0.5 rounded-full py-1 pr-2 text-primary active:opacity-60">
            <ChevronLeft size={20} /> <span className="text-[14px] font-medium">Back</span>
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[14px] text-muted">{subtitle}</p>}
      <div className="mt-4 space-y-3.5">{children}</div>
    </div>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cx('glass rounded-[20px] p-4', onClick && 'cursor-pointer transition-transform active:scale-[0.99]', className)}
    >
      {children}
    </div>
  );
}

export function HeroCard({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('hero rounded-[22px] p-4', onClick && 'cursor-pointer active:scale-[0.99] transition-transform', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0.5 pt-1.5">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {right}
    </div>
  );
}

export function SeeAll({ onClick, label = 'See all' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="text-[13px] font-semibold text-primary active:opacity-60">
      {label}
    </button>
  );
}

/* ---------- Buttons ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'glass' | 'primary' | 'danger';
  loading?: boolean;
  full?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'glass', loading, full, size = 'md', className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'liquid inline-flex select-none items-center justify-center gap-1.5 rounded-full font-semibold',
        variant === 'primary' && 'liquid-primary',
        variant === 'danger' && 'liquid-danger',
        size === 'sm' && 'h-8 px-3.5 text-[12.5px]',
        size === 'md' && 'h-10 px-4 text-[14px]',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        full && 'w-full',
        className,
      )}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ children, onClick, label, className }: { children: ReactNode; onClick?: () => void; label: string; className?: string }) {
  return (
    <button aria-label={label} onClick={onClick} className={cx('liquid flex h-10 w-10 items-center justify-center rounded-full', className)}>
      {children}
    </button>
  );
}

/* ---------- Form fields ---------- */
export function FormRow({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block px-0.5 text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block px-0.5 text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block px-0.5 text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/* ---------- Segmented control (solid green pill) ---------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={cx('relative flex rounded-full bg-[var(--card-2)] p-1', className)} style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
      <div
        className="liquid-primary absolute bottom-1 left-1 top-1 rounded-full"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
          transition: 'transform .35s cubic-bezier(.34,1.3,.64,1)',
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 flex-1 truncate rounded-full px-1 py-1.5 text-[12.5px] font-semibold transition-colors', o.value === value ? 'text-[var(--on-primary)]' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('liquid h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold', o.value === value && 'liquid-primary')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors duration-300 disabled:opacity-40', checked ? 'bg-[var(--primary-2)]' : 'bg-[var(--hairline)]')}
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      <span
        className="absolute top-[2px] h-[24px] w-[24px] rounded-full bg-white shadow"
        style={{ left: checked ? 20 : 2, transition: 'left .3s cubic-bezier(.34,1.56,.64,1)' }}
      />
    </button>
  );
}

/* ---------- Grouped list ---------- */
export function List({ children }: { children: ReactNode }) {
  return <div className="glass list-in divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]">{children}</div>;
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onClick,
  chevron,
  disabled,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  disabled?: boolean;
}) {
  const clickable = !!onClick && !disabled;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={cx('flex min-h-[52px] items-center gap-3 px-3.5 py-2.5', clickable && 'cursor-pointer active:bg-[var(--hairline)]', disabled && 'opacity-50')}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-medium">{title}</div>
        {subtitle && <div className="truncate text-[12.5px] text-muted">{subtitle}</div>}
      </div>
      {right}
      {chevron && <ChevronRight size={17} className="shrink-0 text-muted" />}
    </div>
  );
}

export type Tone = 'primary' | 'income' | 'expense' | 'muted' | 'blue' | 'violet' | 'amber' | 'pink' | 'teal';

/** Tone colours come from CSS variables, so every theme (incl. Black & White) controls them. */
export const TONES: Record<Tone, { bg: string; fg: string; solid: string }> = {
  primary: { bg: 'var(--primary-soft)', fg: 'var(--primary-2)', solid: 'var(--primary-2)' },
  income: { bg: 'var(--tone-income-bg)', fg: 'var(--tone-income)', solid: 'var(--tone-income)' },
  expense: { bg: 'var(--tone-expense-bg)', fg: 'var(--tone-expense)', solid: 'var(--tone-expense)' },
  muted: { bg: 'var(--tone-muted-bg)', fg: 'var(--tone-muted)', solid: 'var(--tone-muted)' },
  blue: { bg: 'var(--tone-blue-bg)', fg: 'var(--tone-blue)', solid: 'var(--tone-blue)' },
  violet: { bg: 'var(--tone-violet-bg)', fg: 'var(--tone-violet)', solid: 'var(--tone-violet)' },
  amber: { bg: 'var(--tone-amber-bg)', fg: 'var(--tone-amber)', solid: 'var(--tone-amber-solid)' },
  pink: { bg: 'var(--tone-pink-bg)', fg: 'var(--tone-pink)', solid: 'var(--tone-pink-solid)' },
  teal: { bg: 'var(--tone-teal-bg)', fg: 'var(--tone-teal)', solid: 'var(--tone-teal-solid)' },
};

export function IconBubble({ children, tone = 'primary', size = 36 }: { children: ReactNode; tone?: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <div className="flex shrink-0 items-center justify-center rounded-[11px]" style={{ width: size, height: size, background: t.bg, color: t.fg }}>
      {children}
    </div>
  );
}

/* ---------- Data display ---------- */
export function ProgressBar({ pct, color = 'var(--primary-2)' }: { pct: number; color?: string }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function KV({ label, value, tone }: { label: string; value: ReactNode; tone?: 'income' | 'expense' }) {
  return (
    <div className="rounded-[14px] bg-[var(--card-2)] p-3">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className={cx('mt-0.5 truncate text-[15.5px] font-bold', tone === 'income' && 'text-income', tone === 'expense' && 'text-expense')}>{value}</p>
    </div>
  );
}

/** Simple bar chart (values in any unit) */
export function BarChart({
  data,
  format,
  height = 120,
}: {
  data: { label: string; value: number; highlight?: boolean }[];
  format?: (v: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height: height + 22 }}>
      {data.map((d, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          {d.highlight && format && <span className="rounded-md bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--on-primary)]">{format(d.value)}</span>}
          <div
            className="w-full max-w-[26px] rounded-[7px]"
            style={{
              height: Math.max(4, (d.value / max) * height),
              background: d.highlight ? 'linear-gradient(180deg,var(--primary-2),var(--primary))' : 'var(--primary-soft)',
              transition: 'height .7s cubic-bezier(.22,1,.36,1)',
            }}
          />
          <span className="truncate text-[10.5px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut chart */
export function Donut({ parts, size = 132, center }: { parts: { value: number; color: string }[]; size?: number; center?: ReactNode }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 15.9155;
  let offset = 25;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" className="h-full w-full">
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--hairline)" strokeWidth="5" />
        {total > 0 &&
          parts.map((p, i) => {
            const pct = (p.value / total) * 100;
            const el = (
              <circle
                key={i}
                cx="21"
                cy="21"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="5"
                strokeDasharray={`${Math.max(0, pct - 0.6)} ${100 - Math.max(0, pct - 0.6)}`}
                strokeDashoffset={offset}
              />
            );
            offset -= pct;
            return el;
          })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

export const CHART_COLORS = ['var(--primary-2)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];

/* ---------- Bottom sheet ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // rendered at the end of <body> so a parent with blur (glass) can never clip or misplace it
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="sheet-in sheet-panel relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-[26px] px-4 pb-8 pt-2.5 pb-safe"
        style={{ background: 'var(--sheet)', WebkitBackdropFilter: 'blur(calc(var(--blur) + 6px)) saturate(180%)', backdropFilter: 'blur(calc(var(--blur) + 6px)) saturate(180%)', borderTop: '1px solid var(--edge)' }}
      >
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-[var(--hairline)]" />
        {title && <h3 className="mb-3.5 text-center text-[16px] font-semibold">{title}</h3>}
        {children}
        <div className="h-4" />
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="mb-5 text-center text-[14px] text-muted">{message}</div>
      <div className="flex gap-2.5">
        <Button full onClick={onClose}>
          Cancel
        </Button>
        <Button full variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------- States ---------- */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted" role="status" aria-label={label ?? 'Loading'}>
      <Loader2 className="animate-spin" size={20} />
      {label && <span className="text-[13px]">{label}</span>}
    </div>
  );
}

/** Placeholder rows while a list loads */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-[58px]" />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <CircleAlert className="mx-auto mb-2 text-danger" size={20} />
      <p className="text-[14px]">{message}</p>
      {onRetry && (
        <Button size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <Card className="py-8 text-center">
      <span className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-[14px] bg-[var(--primary-soft)] text-primary">
        <Inbox size={20} />
      </span>
      <p className="text-[14.5px] font-semibold">{title}</p>
      {text && <p className="mt-1 text-[13px] text-muted">{text}</p>}
      {action && <div className="mt-3.5">{action}</div>}
    </Card>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'primary' | 'danger' | 'amber' | 'blue' }) {
  const map = {
    muted: { background: 'var(--hairline)', color: 'var(--muted)' },
    primary: { background: 'var(--primary-soft)', color: 'var(--primary-2)' },
    danger: { background: 'var(--tone-expense-bg)', color: 'var(--danger)' },
    amber: { background: 'var(--tone-amber-bg)', color: 'var(--tone-amber)' },
    blue: { background: 'var(--tone-blue-bg)', color: 'var(--tone-blue)' },
  };
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={map[tone]}>
      {children}
    </span>
  );
}
