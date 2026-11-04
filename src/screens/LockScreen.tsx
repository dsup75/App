import { useEffect, useRef, useState } from 'react';
import { useLock } from '../context/LockContext';
import { useAuth } from '../context/AuthContext';
import { PinPad } from '../components/PinPad';
import { Confirm } from '../components/ui';
import { Logo } from './Auth';

export function LockScreen() {
  const { config, unlockWithPin, unlockWithBiometric, updateConfig } = useLock();
  const { signOut, settings } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    if (config?.biometric && !tried.current) {
      tried.current = true;
      setTimeout(() => unlockWithBiometric(), 300);
    }
  }, [config, unlockWithBiometric]);

  if (!config) return null;

  const onPin = async (pin: string) => {
    setError('');
    setBusy(true);
    const r = await unlockWithPin(pin);
    setBusy(false);
    if (!r.ok) setError(r.message ?? 'Wrong PIN');
  };

  const resetViaLogin = async () => {
    await updateConfig(null);
    await signOut();
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[var(--bg)] px-6">
      <div className="app-bg" />
      <div className="page-in relative z-10 flex flex-col items-center">
        <Logo size={56} />
        <h1 className="mb-1 mt-4 text-[22px] font-semibold">
          {settings?.full_name ? `Welcome back, ${settings.full_name.split(' ')[0]}` : 'Welcome back'}
        </h1>
        <p className="mb-6 text-[14px] text-muted">Enter your {config.length}-digit PIN</p>
        <PinPad
          length={config.length}
          onComplete={onPin}
          error={error}
          busy={busy}
          onBiometric={config.biometric ? () => unlockWithBiometric() : undefined}
        />
        <button onClick={() => setForgot(true)} className="mt-8 text-[14px] font-medium text-primary">
          Forgot PIN?
        </button>
      </div>
      <Confirm
        open={forgot}
        title="Forgot PIN?"
        message="You will be signed out. Sign in again with your email and password, then set a new PIN in Settings. Your data stays safe."
        confirmLabel="Sign out"
        onConfirm={resetViaLogin}
        onClose={() => setForgot(false)}
      />
    </div>
  );
}
