import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuth } from './AuthContext';
import { loadLock, saveLock, clearLock, verifyPin, biometricPrompt, type LockConfig } from '../lib/lock';

interface LockState {
  ready: boolean;
  locked: boolean;
  config: LockConfig | null;
  unlockWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  unlockWithBiometric: () => Promise<boolean>;
  lockNow: () => void;
  updateConfig: (cfg: LockConfig | null) => Promise<void>;
  suppressBriefly: () => void;
}

const Ctx = createContext<LockState>(null as unknown as LockState);

export function LockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const bgAt = useRef<number | null>(null);
  const suppressUntil = useRef(0);
  const cfgRef = useRef<LockConfig | null>(null);
  cfgRef.current = config;

  // Load on login: lock straight away if a PIN exists
  useEffect(() => {
    let alive = true;
    setReady(false);
    if (!userId) {
      setConfig(null);
      setLocked(false);
      setReady(true);
      return;
    }
    loadLock(userId).then((cfg) => {
      if (!alive) return;
      setConfig(cfg);
      setLocked(!!cfg);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Background / resume handling
  useEffect(() => {
    const onHide = () => {
      if (Date.now() < suppressUntil.current) return;
      bgAt.current = Date.now();
    };
    const onShow = () => {
      const cfg = cfgRef.current;
      if (!cfg || bgAt.current === null) return;
      if (Date.now() < suppressUntil.current) {
        bgAt.current = null;
        return;
      }
      if (Date.now() - bgAt.current >= cfg.timeoutSec * 1000) setLocked(true);
      bgAt.current = null;
    };
    if (Capacitor.isNativePlatform()) {
      const h = App.addListener('appStateChange', ({ isActive }) => (isActive ? onShow() : onHide()));
      return () => {
        h.then((x) => x.remove());
      };
    }
    const vis = () => (document.hidden ? onHide() : onShow());
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  const suppressBriefly = useCallback(() => {
    suppressUntil.current = Date.now() + 4000;
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const cfg = cfgRef.current;
      if (!cfg || !userId) return { ok: true };
      if (cfg.lockoutUntil > Date.now()) {
        const s = Math.ceil((cfg.lockoutUntil - Date.now()) / 1000);
        return { ok: false, message: `Too many attempts. Try again in ${s}s.` };
      }
      if (await verifyPin(pin, cfg)) {
        const next = { ...cfg, failCount: 0, lockoutUntil: 0 };
        await saveLock(userId, next);
        setConfig(next);
        setLocked(false);
        return { ok: true };
      }
      const failCount = cfg.failCount + 1;
      const lockoutUntil = failCount >= 5 ? Date.now() + Math.min(300, 30 * 2 ** (failCount - 5)) * 1000 : 0;
      const next = { ...cfg, failCount, lockoutUntil };
      await saveLock(userId, next);
      setConfig(next);
      return {
        ok: false,
        message: lockoutUntil ? 'Too many wrong attempts. Please wait.' : `Wrong PIN (${failCount}/5)`,
      };
    },
    [userId],
  );

  const unlockWithBiometric = useCallback(async () => {
    suppressBriefly();
    const ok = await biometricPrompt('Unlock DeepBoost Life', !!cfgRef.current?.deviceCredential);
    suppressBriefly();
    if (ok) setLocked(false);
    return ok;
  }, [suppressBriefly]);

  const lockNow = useCallback(() => {
    if (cfgRef.current) setLocked(true);
  }, []);

  const updateConfig = useCallback(
    async (cfg: LockConfig | null) => {
      if (!userId) return;
      if (cfg) await saveLock(userId, cfg);
      else await clearLock(userId);
      setConfig(cfg);
    },
    [userId],
  );

  return (
    <Ctx.Provider
      value={{ ready, locked, config, unlockWithPin, unlockWithBiometric, lockNow, updateConfig, suppressBriefly }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useLock = () => useContext(Ctx);
