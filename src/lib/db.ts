import { supabase } from './supabase';
import type { TableName } from './tables';
import { invalidateLookups as clearLookups } from './useLookups';
import { invalidateUsage } from './useUsage';

function invalidateLookups() {
  clearLookups();
  invalidateUsage();
}

export type Row = Record<string, any> & { id: string };

export function friendlyError(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string };
  const msg = err?.message ?? String(e);
  if (msg.includes('LINKED_DELETED:')) return msg.split('LINKED_DELETED:')[1].trim();
  if (msg.includes('APP_ERROR:')) return msg.split('APP_ERROR:')[1].trim();
  if (err?.code === '23505' && /recurring_once/.test(msg)) return 'This payment is already added for this date.';
  if (err?.code === '23505' && /recurring_rules_unique_title/.test(msg)) return 'A subscription / recurring entry with this name already exists.';
  if (err?.code === '23505') return 'This already exists.';
  if (err?.code === '23503')
    return 'This record is still used by other entries. Delete or move those entries first.';
  if (err?.code === '23514') return 'Some values are not allowed. Please check the form.';
  if (err?.code === '42501') return 'You do not have permission to do this.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No internet connection. Please try again.';
  if (/relation .* does not exist/i.test(msg))
    return 'Database is not set up yet. Run the SQL file in Supabase (see README).';
  return msg;
}

function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function getRecord(table: TableName, id: string): Promise<Row | null> {
  return check(await supabase.from(table).select('*').eq('id', id).maybeSingle()) as Row | null;
}

export async function createRecord(table: TableName, values: Record<string, unknown>): Promise<Row> {
  invalidateLookups();
  return check(await supabase.from(table).insert(values).select('*').single()) as Row;
}

export async function updateRecord(table: TableName, id: string, values: Record<string, unknown>): Promise<Row> {
  invalidateLookups();
  return check(await supabase.from(table).update(values).eq('id', id).select('*').single()) as Row;
}

export async function softDelete(table: TableName, id: string): Promise<void> {
  invalidateLookups();
  check(await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id));
}

export async function restoreRecord(table: TableName, id: string): Promise<void> {
  invalidateLookups();
  check(await supabase.from(table).update({ deleted_at: null }).eq('id', id));
}

export async function deleteForever(table: TableName, id: string): Promise<void> {
  invalidateLookups();
  const res = await supabase.from(table).delete().eq('id', id).not('deleted_at', 'is', null).select('id');
  const data = check(res) as { id: string }[];
  if (!data.length) throw new Error('Only records in the Recycle Bin can be deleted permanently.');
}

export interface HistoryRow {
  id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
}

export async function getHistory(table: TableName, id: string): Promise<HistoryRow[]> {
  return check(
    await supabase
      .from('edit_history')
      .select('id, field, old_value, new_value, changed_at')
      .eq('table_name', table)
      .eq('record_id', id)
      .order('changed_at', { ascending: false })
      .limit(200),
  ) as HistoryRow[];
}

export interface Account {
  id: string;
  name: string;
  type: string;
  upi_app?: string | null;
  upi_id?: string | null;
  deleted_at: string | null;
}
export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  deleted_at: string | null;
}

export async function fetchLookups(): Promise<{ accounts: Account[]; categories: Category[] }> {
  const [a, c] = await Promise.all([
    supabase.from('accounts').select('id, name, type, deleted_at').order('created_at'),
    supabase.from('categories').select('id, name, kind, deleted_at').order('name'),
  ]);
  return { accounts: check(a) as Account[], categories: check(c) as Category[] };
}

export interface Balance {
  id: string;
  name: string;
  type: string;
  upi_app?: string | null;
  upi_id?: string | null;
  opening_balance_paise: number;
  balance_paise: number;
}

export async function fetchBalances(): Promise<Balance[]> {
  return check(await supabase.from('account_balances').select('*').order('name')) as Balance[];
}

export async function fetchMoney(
  table: 'incomes' | 'expenses' | 'transfers',
  from: string,
  to: string,
): Promise<Row[]> {
  return check(
    await supabase
      .from(table)
      .select('*')
      .is('deleted_at', null)
      .gte('txn_date', from)
      .lte('txn_date', to)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000),
  ) as Row[];
}

export async function fetchActive(table: TableName, orderBy = 'created_at', ascending = false): Promise<Row[]> {
  return check(
    await supabase.from(table).select('*').is('deleted_at', null).order(orderBy, { ascending }).limit(2000),
  ) as Row[];
}

export interface Settings {
  user_id: string;
  full_name: string;
  apps_script_url: string | null;
  sync_key: string | null;
  sheet_verified_at: string | null;
  last_synced_at: string | null;
  upi_id: string | null;
  upi_name: string | null;
  business_name: string | null;
  business_details: string | null;
}

export async function fetchSettings(userId: string): Promise<Settings | null> {
  const row = check(await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle());
  if (row) return row as Settings;
  // Self-heal if the signup trigger did not create it
  const created = await supabase.from('user_settings').insert({ user_id: userId }).select('*').maybeSingle();
  return (created.data as Settings) ?? null;
}

export async function saveSettings(userId: string, values: Partial<Settings>): Promise<Settings> {
  return check(
    await supabase.from('user_settings').update(values).eq('user_id', userId).select('*').single(),
  ) as Settings;
}

/* ---------------- Money entries with payment breakdown ---------------- */
export const MONEY_TABLES = ['incomes', 'expenses', 'loans', 'loan_repayments', 'transfers'] as const;
export type MoneyTable = (typeof MONEY_TABLES)[number];
export function isMoneyTable(t: string): t is MoneyTable {
  return (MONEY_TABLES as readonly string[]).includes(t);
}

export interface LineInput {
  id?: string;
  direction?: 'in' | 'out';
  account_id: string;
  amount_paise: number;
  payment_app?: string | null;
  payment_method?: string | null;
  txn_date: string;
  txn_time?: string | null;
  reference?: string | null;
  party_name?: string | null;
  notes?: string | null;
}

export interface LinkInput {
  id?: string;
  income_id: string;
  amount_paise: number;
}

/** Saves the entry, its payment lines and (optionally) its income links in one transaction. */
export async function saveMoneyEntry(
  table: MoneyTable,
  id: string | null,
  parent: Record<string, unknown>,
  lines: LineInput[],
  links: LinkInput[] | null,
): Promise<string> {
  invalidateLookups();
  const { data, error } = await supabase.rpc('save_money_entry', {
    p_table: table,
    p_id: id,
    p_parent: parent,
    p_lines: lines,
    p_links: links,
  });
  if (error) throw error;
  return data as string;
}

export interface LineRow extends LineInput {
  id: string;
  direction: 'in' | 'out';
  sort: number;
}

export async function getLines(table: MoneyTable, id: string): Promise<LineRow[]> {
  return check(
    await supabase
      .from('payment_lines')
      .select('id,direction,account_id,amount_paise,payment_app,payment_method,txn_date,txn_time,reference,party_name,notes,sort')
      .eq('parent_table', table)
      .eq('parent_id', id)
      .is('deleted_at', null)
      .order('sort'),
  ) as LineRow[];
}

export const LINK_COLUMN: Partial<Record<MoneyTable, string>> = { expenses: 'expense_id', loans: 'loan_id', transfers: 'transfer_id' };

export async function getLinks(table: MoneyTable, id: string): Promise<{ id: string; income_id: string; amount_paise: number }[]> {
  const col = LINK_COLUMN[table];
  if (!col) return [];
  return check(await supabase.from('allocations').select('id,income_id,amount_paise').eq(col, id).is('deleted_at', null)) as any[];
}
