// Shared cache: how much of each income is used, and how much of each expense is funded.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Usage {
  incomeUsed: Map<string, number>;
  incomeLeft: Map<string, number>;
  expenseFunded: Map<string, number>;
}

let cache: { at: number; data: Usage } | null = null;
let inflight: Promise<Usage> | null = null;
const listeners = new Set<(u: Usage) => void>();

export function invalidateUsage() {
  cache = null;
}

async function fetchUsage(): Promise<Usage> {
  const [inc, exp] = await Promise.all([
    supabase.from('income_usage').select('id,used_paise,left_paise').gt('used_paise', 0).limit(5000),
    supabase.from('expense_funding').select('id,funded_paise').gt('funded_paise', 0).limit(5000),
  ]);
  const u: Usage = { incomeUsed: new Map(), incomeLeft: new Map(), expenseFunded: new Map() };
  ((inc.data as any[]) ?? []).forEach((r) => {
    u.incomeUsed.set(r.id, Number(r.used_paise));
    u.incomeLeft.set(r.id, Number(r.left_paise));
  });
  ((exp.data as any[]) ?? []).forEach((r) => u.expenseFunded.set(r.id, Number(r.funded_paise)));
  return u;
}

export async function loadUsage(force = false): Promise<Usage> {
  if (!force && cache && Date.now() - cache.at < 15000) return cache.data;
  inflight = inflight ?? fetchUsage();
  try {
    const d = await inflight;
    cache = { at: Date.now(), data: d };
    listeners.forEach((l) => l(d));
    return d;
  } finally {
    inflight = null;
  }
}

export function useUsage(): Usage | null {
  const [u, setU] = useState<Usage | null>(cache?.data ?? null);
  useEffect(() => {
    listeners.add(setU);
    loadUsage().then(setU).catch(() => {});
    return () => {
      listeners.delete(setU);
    };
  }, []);
  return u;
}
