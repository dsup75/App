import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isConfigured } from '../lib/supabase';
import { fetchSettings, type Settings } from '../lib/db';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  settings: Settings | null;
  reloadSettings: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const reloadSettings = useCallback(async () => {
    if (!userId) return setSettings(null);
    try {
      setSettings(await fetchSettings(userId));
    } catch {
      /* shown as empty; screens handle their own errors */
    }
  }, [userId]);

  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSettings(null);
  }, []);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, settings, reloadSettings, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
