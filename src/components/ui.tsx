import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, CircleAlert, Inbox } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ---------- Page with iOS large title ---------- */
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
    <div className="page-in relative z-10 mx-auto max-w-xl px-4 pb-36 pt-safe">
      <div className="flex h-12 items-center justify-between">
        {back ? (
          <button onClick={() => nav(-1)} className="-ml-2 flex items-center gap-0.5 rounded-full px-2 py-1 text-primary active:opacity-60">
            <ChevronLeft size={22} /> <span className="text-[15px]">Back</span>
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <h1 className="text-[32px] font-bold leading-tight tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[15px] text-muted">{subtitle}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('glass rounded-[26px] p-4', onClick && 'cursor-pointer active:scale-[0.99] transition-transform', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
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
        'liquid inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold',
        variant === 'primary' && 'liquid-primary',
        variant === 'danger' && 'liquid-danger',
        size === 'sm' && 'h-9 px-4 text-[13px]',
        size === 'md' && 'h-11 px-5 text-[15px]',
        size === 'lg' && 'h-[52px] px-6 text-[16px]',
        full && 'w-full',
        className,
      )}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
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
      <span className="mb-1.5 block px-1 text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block px-1 text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block px-1 text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/* ---------- iOS segmented control ---------- */
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
    <div className={cx('glass relative flex rounded-full p-1', className)}>
      <div
        className="liquid absolute bottom-1 left-1 top-1 rounded-full"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
          transition: 'transform .4s cubic-bezier(.34,1.4,.64,1)',
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors', o.value === value ? 'text-fg' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('liquid h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold', o.value === value && 'liquid-primary')}
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
      className={cx(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 disabled:opacity-40',
        checked ? 'bg-[var(--primary-2)]' : 'bg-[var(--hairline)]',
      )}
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      <span
        className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-md"
        style={{ left: checked ? 22 : 2, transition: 'left .35s cubic-bezier(.34,1.56,.64,1)' }}
      />
    </button>
  );
}

/* ---------- Grouped list (iOS settings style) ---------- */
export function List({ children }: { children: ReactNode }) {
  return <div className="glass divide-y divide-[var(--hairline)] overflow-hidden rounded-[22px]">{children}</div>;
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
      className={cx('flex min-h-[54px] items-center gap-3 px-4 py-2.5', clickable && 'cursor-pointer active:bg-[var(--hairline)]', disabled && 'opacity-50')}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
      </div>
      {right}
      {chevron && <ChevronRight size={18} className="shrink-0 text-muted" />}
    </div>
  );
}

export function IconBubble({ children, tone = 'primary' }: { children: ReactNode; tone?: 'primary' | 'income' | 'expense' | 'muted' | 'blue' | 'violet' | 'amber' }) {
  const colors: Record<string, string> = {
    primary: 'linear-gradient(180deg,#34D399,#059669)',
    income: 'linear-gradient(180deg,#34D399,#059669)',
    expense: 'linear-gradient(180deg,#FB7185,#E11D48)',
    muted: 'linear-gradient(180deg,#94A3B8,#64748B)',
    blue: 'linear-gradient(180deg,#60A5FA,#2563EB)',
    violet: 'linear-gradient(180deg,#A78BFA,#7C3AED)',
    amber: 'linear-gradient(180deg,#FBBF24,#D97706)',
  };
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-white"
      style={{ background: colors[tone], boxShadow: 'inset 0 1px 1px rgba(255,255,255,.5)' }}
    >
      {children}
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="glass-strong sheet-in relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-[30px] px-5 pb-8 pt-3 pb-safe">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--hairline)]" />
        {title && <h3 className="mb-4 text-center text-[17px] font-semibold">{title}</h3>}
        {children}
        <div className="h-4" />
      </div>
    </div>
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
      <div className="mb-5 text-center text-[15px] text-muted">{message}</div>
      <div className="flex gap-3">
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
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted">
      <Loader2 className="animate-spin" />
      {label && <span className="text-[13px]">{label}</span>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <CircleAlert className="mx-auto mb-2 text-danger" />
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
      <Inbox className="mx-auto mb-2 text-muted" />
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 text-[14px] text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'primary' | 'danger' | 'amber' }) {
  const map = {
    muted: 'bg-[var(--hairline)] text-muted',
    primary: 'bg-emerald-500/15 text-primary',
    danger: 'bg-rose-500/15 text-danger',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', map[tone])}>{children}</span>;
}
