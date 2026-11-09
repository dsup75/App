// Weight & body measurements (manual, scale over Bluetooth, or Health Connect)
import { supabase } from './supabase';

export interface Measurement {
  id: string;
  measured_at: string;
  weight_kg: number;
  bmi: number | null;
  body_fat_pct: number | null;
  muscle_kg: number | null;
  bone_kg: number | null;
  water_pct: number | null;
  visceral_fat: number | null;
  bmr_kcal: number | null;
  metabolic_age: number | null;
  source: 'manual' | 'scale_ble' | 'health_connect';
  gadget_id: string | null;
  notes: string | null;
}

export type NewMeasurement = Partial<Omit<Measurement, 'id'>> & { weight_kg: number };

export const SOURCE_LABEL: Record<Measurement['source'], string> = { manual: 'Manual', scale_ble: 'Scale (Bluetooth)', health_connect: 'Health Connect' };

export async function fetchMeasurements(limit = 120): Promise<Measurement[]> {
  const { data, error } = await supabase.from('body_measurements').select('*').is('deleted_at', null).order('measured_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, weight_kg: Number(r.weight_kg) })) as Measurement[];
}

export async function addMeasurement(m: NewMeasurement) {
  const { error } = await supabase.from('body_measurements').insert({ ...m, measured_at: m.measured_at ?? new Date().toISOString() });
  if (error) throw error;
}

export async function deleteMeasurement(id: string) {
  const { error } = await supabase.from('body_measurements').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function getHealthProfile(): Promise<{ height_cm: number | null; weight_goal_kg: number | null }> {
  const { data } = await supabase.from('health_profile').select('height_cm, weight_goal_kg').maybeSingle();
  return { height_cm: data?.height_cm != null ? Number(data.height_cm) : null, weight_goal_kg: data?.weight_goal_kg != null ? Number(data.weight_goal_kg) : null };
}

export async function saveHealthProfile(p: { height_cm: number | null; weight_goal_kg: number | null }) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('health_profile').upsert({ user_id: u.user?.id, ...p, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Standard BMI formula: kg / m² */
export const bmiOf = (kg: number, heightCm: number | null) => (heightCm && heightCm > 50 ? Math.round((kg / (heightCm / 100) ** 2) * 10) / 10 : null);

export function bmiLabel(b: number | null) {
  if (b === null) return '';
  if (b < 18.5) return 'Underweight';
  if (b < 25) return 'Normal';
  if (b < 30) return 'Overweight';
  return 'Obese';
}
