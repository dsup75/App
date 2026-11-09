// Money Tools data layer (additive): source positions, per-row links, journey,
// duplicates, reversal, reconciliation, history.
import { supabase } from './supabase';
import type { LineInput, MoneyTable } from './db';
import { invalidateLookups } from './useLookups';
import { invalidateUsage } from './useUsage';

export type SourceTable = 'incomes' | 'transfers' | 'loans' | 'loan_repayments';

export interface SourcePosition {
  source_table: SourceTable;
  source_id: string;
  account_id: string;
  title: string;
  via_title: string | null;
  source_date: string | null;
  received_paise: number;
  moved_out_paise: number;
  spent_paise: number;
  available_paise: number;
}

/** Row-level link as saved: money from a source, taken out of one account */
export interface RowLinkInput {
  source_table: SourceTable;
  source_id: string;
  account_id: string;
  amount_paise: number;
}

/** Tables whose money-out rows can be linked to a source */
export const ROW_LINK_TABLES: MoneyTable[] = ['expenses', 'transfers', 'loans', 'loan_repayments'];

export const sourceKey = (t: string, id: string) => `${t}:${id}`;

function num(v: unknown) {
  return Number(v) || 0;
}

/** Where every source's money is right now, per account. Amounts are capped by what the source still has overall. */
export async function fetchSourcePositions(): Promise<SourcePosition[]> {
  const [p, s] = await Promise.all([
    supabase.from('source_positions').select('*').limit(5000),
    supabase.from('money_source_status').select('source_table,source_id,remaining_paise').limit(5000),
  ]);
  if (p.error) throw p.error;
  const remaining = new Map(((s.data as any[]) ?? []).map((x) => [sourceKey(x.source_table, x.source_id), num(x.remaining_paise)]));
  return ((p.data as any[]) ?? []).map((x) => {
    const left = remaining.get(sourceKey(x.source_table, x.source_id));
    return {
      ...x,
      received_paise: num(x.received_paise),
      moved_out_paise: num(x.moved_out_paise),
      spent_paise: num(x.spent_paise),
      // never offer more than the source has left in total (covers older links without an account)
      available_paise: Math.max(0, Math.min(num(x.available_paise), left ?? num(x.available_paise))),
    } as SourcePosition;
  });
}

/** Links already saved on an entry (new per-row links only) */
export async function getRowLinks(table: MoneyTable, id: string): Promise<(RowLinkInput & { id: string })[]> {
  const { data, error } = await supabase
    .from('money_links')
    .select('id,source_table,source_id,account_id,amount_paise')
    .eq('target_table', table)
    .eq('target_id', id)
    .is('deleted_at', null);
  if (error) throw error;
  return ((data as any[]) ?? []).map((x) => ({ ...x, amount_paise: num(x.amount_paise) }));
}

/** Saves the entry, its payment lines and its per-row source links in one transaction */
export async function saveMoneyEntryWithSources(
  table: MoneyTable,
  id: string | null,
  parent: Record<string, unknown>,
  lines: LineInput[],
  rowLinks: RowLinkInput[] | null,
): Promise<string> {
  invalidateLookups();
  invalidateUsage();
  const { data, error } = await supabase.rpc('save_money_entry_with_sources', {
    p_table: table,
    p_id: id,
    p_parent: parent,
    p_lines: lines,
    p_row_links: rowLinks,
  });
  if (error) throw error;
  return data as string;
}

export interface DuplicateCandidate {
  id: string;
  kind: 'incomes' | 'expenses' | 'transfers';
  title: string;
  amount_paise: number;
  txn_date: string;
  reasons: string[];
  score: number;
}

/** Possible duplicates of an entry about to be saved. Never throws — a failed check just means no warning. */
export async function findDuplicates(
  kind: string,
  amount: number,
  date: string,
  accountId: string | null,
  title: string | null,
  reference: string | null,
  excludeId: string | null,
): Promise<DuplicateCandidate[]> {
  if (!['incomes', 'expenses', 'transfers'].includes(kind) || !amount) return [];
  try {
    const { data, error } = await supabase.rpc('find_duplicate_candidates', {
      p_kind: kind,
      p_amount_paise: amount,
      p_date: date,
      p_account_id: accountId,
      p_title: title,
      p_reference: reference,
      p_exclude_id: excludeId,
      p_window_days: 1,
    });
    if (error) return [];
    return ((data as any[]) ?? []).map((x) => ({ ...x, amount_paise: num(x.amount_paise) }));
  } catch {
    return [];
  }
}

/** Undo = a new opposite entry; the original is never edited */
export async function reverseEntry(table: string, id: string, reason?: string): Promise<string> {
  invalidateLookups();
  invalidateUsage();
  const { data, error } = await supabase.rpc('reverse_entry', { p_table: table, p_id: id, p_reason: reason ?? null, p_date: null });
  if (error) throw error;
  return data as string;
}

export interface Reversal {
  original_table: string;
  original_id: string;
  reversal_table: string;
  reversal_id: string;
  reason: string | null;
  created_at: string;
}
export async function getReversals(table: string, id: string): Promise<Reversal[]> {
  const { data } = await supabase
    .from('entry_reversals')
    .select('original_table,original_id,reversal_table,reversal_id,reason,created_at')
    .is('deleted_at', null)
    .or(`and(original_table.eq.${table},original_id.eq.${id}),and(reversal_table.eq.${table},reversal_id.eq.${id})`);
  return (data as Reversal[]) ?? [];
}

export interface JourneyStep {
  depth: number;
  from_table: string;
  from_id: string;
  from_title: string | null;
  to_table: string;
  to_id: string;
  to_title: string | null;
  amount_paise: number;
  to_account_name?: string | null;
}
export async function journeyForward(table: string, id: string): Promise<JourneyStep[]> {
  const { data } = await supabase.rpc('money_journey', { p_source_table: table, p_source_id: id, p_max_depth: 8 });
  return ((data as any[]) ?? []).map((x) => ({ ...x, amount_paise: num(x.amount_paise) }));
}
export async function journeyBack(table: string, id: string): Promise<JourneyStep[]> {
  const { data } = await supabase.rpc('money_origin', { p_target_table: table, p_target_id: id, p_max_depth: 8 });
  return ((data as any[]) ?? []).map((x) => ({ ...x, amount_paise: num(x.amount_paise) }));
}

export interface HistoryEvent {
  id: string;
  table_name: string;
  record_id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
  event_type: 'created' | 'edited' | 'deleted' | 'restored';
  title: string | null;
}
export async function fetchHistory(opts: { table?: string; id?: string; limit?: number } = {}): Promise<HistoryEvent[]> {
  let q = supabase.from('transaction_history').select('*').order('changed_at', { ascending: false }).limit(opts.limit ?? 200);
  if (opts.table) q = q.eq('table_name', opts.table);
  if (opts.id) q = q.eq('record_id', opts.id);
  const { data, error } = await q;
  if (error) throw error;
  return (data as HistoryEvent[]) ?? [];
}

export async function createReconciliation(accountId: string, actualPaise: number, asOf: string, notes: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('create_reconciliation', { p_account_id: accountId, p_actual_paise: actualPaise, p_as_of: asOf, p_notes: notes });
  if (error) throw error;
  return data as string;
}

export const ADJUSTMENT_KINDS = [
  { value: 'missing_income', label: 'Income not recorded' },
  { value: 'missing_expense', label: 'Expense not recorded' },
  { value: 'bank_fee', label: 'Bank fee / charge' },
  { value: 'interest', label: 'Interest' },
  { value: 'rounding', label: 'Rounding' },
  { value: 'cash_difference', label: 'Cash counting difference' },
  { value: 'other', label: 'Other' },
];

