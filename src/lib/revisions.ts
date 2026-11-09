// Smart revision (spaced repetition). The database plans the first revision after a chapter study
// session (trigger) and the next one after you mark a revision done with feedback.
import { supabase } from './supabase';
import { todayISO } from './dates';

export type RevisionFeedback = 'easy' | 'moderate' | 'difficult';

export interface RevisionRow {
  id: string;
  chapter_id: string;
  subject_id: string | null;
  step: number;
  interval_days: number;
  due_date: string;
  status: 'pending' | 'done' | 'skipped';
  feedback: RevisionFeedback | null;
  done_at: string | null;
  notes: string | null;
  chapter_name: string;
  subject_name: string | null;
  revision_count: number;
  done_count: number;
}

export const DEFAULT_INTERVALS = [1, 3, 7, 14, 30];

export async function fetchPendingRevisions(untilISO?: string): Promise<RevisionRow[]> {
  let q = supabase.from('revision_queue').select('*').eq('status', 'pending').order('due_date').limit(300);
  if (untilISO) q = q.lte('due_date', untilISO);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RevisionRow[];
}

export async function fetchChapterRevisions(chapterId: string): Promise<RevisionRow[]> {
  const { data, error } = await supabase.from('revision_queue').select('*').eq('chapter_id', chapterId).order('due_date', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as RevisionRow[];
}

export async function completeRevision(id: string, feedback: RevisionFeedback, notes?: string) {
  const { data, error } = await supabase.rpc('complete_revision', { p_id: id, p_feedback: feedback, p_done_on: todayISO(), p_notes: notes ?? null });
  if (error) throw error;
  return data as { next_id: string | null; next_due: string | null; cycle_complete: boolean; step: number };
}

export async function rescheduleRevision(id: string, date: string) {
  const { error } = await supabase.rpc('reschedule_revision', { p_id: id, p_date: date });
  if (error) throw error;
}

export async function startRevisionPlan(chapterId: string, firstDate?: string) {
  const { data, error } = await supabase.rpc('start_revision_plan', { p_chapter_id: chapterId, p_first_date: firstDate ?? null });
  if (error) throw error;
  return data as string;
}

export async function skipRevision(id: string) {
  const { error } = await supabase.from('revisions').update({ status: 'skipped' }).eq('id', id).eq('status', 'pending');
  if (error) throw error;
}

export interface RevisionSettings {
  intervals: number[];
  auto_schedule: boolean;
}

export async function getRevisionSettings(): Promise<RevisionSettings> {
  const { data } = await supabase.from('revision_settings').select('intervals, auto_schedule').maybeSingle();
  return data ? { intervals: data.intervals as number[], auto_schedule: !!data.auto_schedule } : { intervals: DEFAULT_INTERVALS, auto_schedule: true };
}

export async function saveRevisionSettings(s: RevisionSettings) {
  const intervals = s.intervals.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= 365).slice(0, 10);
  if (!intervals.length) throw new Error('Add at least one interval (1–365 days).');
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('revision_settings')
    .upsert({ user_id: u.user?.id, intervals, auto_schedule: s.auto_schedule, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export const FEEDBACK_LABEL: Record<RevisionFeedback, string> = { easy: 'Easy', moderate: 'Moderate', difficult: 'Difficult' };
