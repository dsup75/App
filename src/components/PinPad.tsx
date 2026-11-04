import { useEffect, useState, type ReactNode } from 'react';
import { Delete, Fingerprint } from 'lucide-react';
import { cx } from './ui';

export function PinPad({
  length,
  onComplete,
  error,
  busy,
  onBiometric,
}: {
  length: 4 | 6;
  onComplete: (pin: string) => void;
  error?: string;
  busy?: boolean;
  onBiometric?: () => void;
}) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      setPin('');
      const t = setTimeout(() => setShake(false), 450);
      return () => clearTimeout(t);
    }
  }, [error]);

  const press = (d: string) => {
    if (busy || pin.length >= length) return;
    const next = pin + d;
    setPin(next);
    if (next.length === length) setTimeout(() => onComplete(next), 120);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="flex flex-col items-center">
      <div className={cx('mb-3 flex gap-4', shake && 'shake')}>
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={cx(
              'h-3.5 w-3.5 rounded-full border-2 transition-all duration-200',
              i < pin.length ? 'scale-110 border-[var(--primary-2)] bg-[var(--primary-2)]' : 'border-[var(--muted)]',
            )}
          />
        ))}
      </div>
      <p className="mb-6 h-5 text-[13px] text-danger">{error}</p>
      <div className="grid grid-cols-3 gap-5">
        {keys.map((k) => (
          <Key key={k} onClick={() => press(k)}>
            {k}
          </Key>
        ))}
        {onBiometric ? (
          <Key onClick={onBiometric} label="Use fingerprint">
            <Fingerprint size={28} />
          </Key>
        ) : (
          <span />
        )}
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => setPin((p) => p.slice(0, -1))} label="Delete" plain>
          <Delete size={24} />
        </Key>
      </div>
    </div>
  );
}

function Key({ children, onClick, label, plain }: { children: ReactNode; onClick: () => void; label?: string; plain?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cx(
        'flex h-[74px] w-[74px] items-center justify-center rounded-full text-[28px] font-medium',
        plain ? 'active:opacity-50' : 'liquid',
      )}
    >
      {children}
    </button>
  );
}
