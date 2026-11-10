// iPhone-style lock: the face / fingerprint sheet opens by itself every time the app is locked
// (on open and when you come back to it). PIN is always there as a fallback.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, Fingerprint, Lock } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { useLock } from '../context/LockContext';
import { useAuth } from '../context/AuthContext';
import { PinPad } from '../components/PinPad';
import { Confirm } from '../components/ui';
import { biometricInfo, bioLabel, type BioKind } from '../lib/lock';
import { Logo } from './Auth';

export function LockScreen() {
  const { config, unlockWithPin, unlockWithBiometric, updateConfig } = useLock();
  const { signOut, settings } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [kinds, setKinds] = useState<BioKind[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showPin, setShowPin] = useState(!config?.biometric);
  const running = useRef(false);

  useEffect(() => {
    biometricInfo().then((i) => setKinds(i.kinds));
  }, []);

  const tryBio = useCallback(async () => {
    if (!config?.biometric || running.current) return;
    running.current = true;
    setScanning(true);
    // first attempt can fail while Android is still bringing the app to the front — retry once
    let ok = await unlockWithBiometric();
    if (!ok && document.visibilityState === 'visible') {
      await new Promise((r) => setTimeout(r, 450));
      ok = await unlockWithBiometric();
    }
    setScanning(false);
    running.current = false;
    if (!ok) setShowPin(true);
  }, [config?.biometric, unlockWithBiometric]);

  // like Face ID: ask straight away, and again every time the app comes back while locked
  useEffect(() => {
    const t = setTimeout(tryBio, 250);
    let sub: { remove: () => void } | null = null;
    CapApp.addListener('resume', () => setTimeout(tryBio, 300)).then((h) => (sub = h)).catch(() => {});
    return () => {
      clearTimeout(t);
      sub?.remove();
    };
  }, [tryBio]);

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
  const face = kinds.includes('face');
  const BioIcon = face ? ScanFace : Fingerprint;
  const first = settings?.full_name ? settings.full_name.split(' ')[0] : '';

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[var(--bg)] px-6">
      <div className="app-bg" />
      <div className="page-in relative z-10 flex w-full max-w-[340px] flex-col items-center">
        <Logo size={52} />
        <p className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
          <Lock size={12} /> DeepBoost Life is locked
        </p>
        <h1 className="mb-5 mt-1 text-[22px] font-semibold">{first ? `Welcome back, ${first}` : 'Welcome back'}</h1>

        {config.biometric && !showPin ? (
          <>
            <button
              type="button"
              onClick={tryBio}
              aria-label={`Unlock with ${bioLabel(kinds)}`}
              className="glass relative flex h-[132px] w-[132px] items-center justify-center rounded-[38px]"
            >
              <span className={scanning ? 'bio-scan absolute inset-3 rounded-[30px]' : 'absolute inset-3 rounded-[30px]'} />
              <BioIcon size={64} strokeWidth={1.4} className="relative text-primary" />
            </button>
            <p className="mt-4 text-[14.5px] font-medium">{scanning ? (face ? 'Looking for your face…' : 'Touch the sensor…') : `Tap to use ${bioLabel(kinds)}`}</p>
            <button onClick={() => setShowPin(true)} className="mt-8 text-[14px] font-medium text-primary">
              Use PIN instead
            </button>
          </>
        ) : (
          <>
            <p className="mb-5 text-[14px] text-muted">Enter your {config.length}-digit PIN</p>
            <PinPad
              length={config.length}
              onComplete={onPin}
              error={error}
              busy={busy}
              bioKind={face ? 'face' : 'fingerprint'}
              onBiometric={config.biometric ? () => tryBio() : undefined}
            />
            <button onClick={() => setForgot(true)} className="mt-7 text-[14px] font-medium text-primary">
              Forgot PIN?
            </button>
          </>
        )}
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
