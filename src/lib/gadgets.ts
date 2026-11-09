// Gadgets the user added (stored in their account). Connection state is never assumed — it is checked live.
import { supabase } from './supabase';

export type GadgetKind = 'scale' | 'watch' | 'earbuds' | 'phone' | 'other';

export interface Gadget {
  id: string;
  name: string;
  kind: GadgetKind;
  model: string | null;
  companion_app: string | null;
  ble_address: string | null;
  category: string | null;
  last_sync_at: string | null;
  last_status: string | null;
  settings: Record<string, unknown>;
  notes: string | null;
}

export const KIND_LABEL: Record<GadgetKind, string> = { scale: 'Smart scale', watch: 'Smartwatch', earbuds: 'Earbuds / headphones', phone: 'Phone', other: 'Other device' };

export async function fetchGadgets(): Promise<Gadget[]> {
  const { data, error } = await supabase.from('gadgets').select('*').is('deleted_at', null).order('created_at');
  if (error) throw error;
  return (data ?? []) as Gadget[];
}

export async function fetchGadget(id: string): Promise<Gadget | null> {
  const { data, error } = await supabase.from('gadgets').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return (data as Gadget) ?? null;
}

export async function addGadget(g: Partial<Gadget> & { name: string; kind: GadgetKind }) {
  const { data, error } = await supabase.from('gadgets').insert(g).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function updateGadget(id: string, patch: Partial<Gadget>) {
  const { error } = await supabase.from('gadgets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeGadget(id: string) {
  const { error } = await supabase.from('gadgets').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export const isMac = (s: string) => /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(s);

/** Da Fit (MOYOUNG) steps characteristic: 3 × 3-byte little-endian values. Unverified until the user confirms it matches Da Fit. */
export function decodeMoyoungSteps(hex: string | null): { steps: number; distanceM: number; calories: number } | null {
  if (!hex) return null;
  const b = hex.replace(/[^0-9a-f]/gi, '').match(/.{2}/g)?.map((x) => parseInt(x, 16)) ?? [];
  if (b.length < 9) return null;
  const u24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const r = { steps: u24(0), distanceM: u24(3), calories: u24(6) };
  if (r.steps > 200000 || r.distanceM > 500000 || r.calories > 20000) return null;
  return r;
}
