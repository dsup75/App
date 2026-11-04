// Google Sheet sync through the user's own Apps Script Web App.
// The database (Supabase) stays the source of truth; the sheet is a copy.
import { supabase } from './supabase';
import { paiseToInput } from './money';

export function isValidScriptUrl(url: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(url.trim());
}

async function callScript(url: string, payload: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
  } catch {
    throw new Error('Could not reach the script. Check internet and the URL.');
  }
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Script did not return JSON. In Apps Script, deploy as Web app with access "Anyone".');
  }
  if (!data.ok) throw new Error(data.error || 'Script returned an error.');
  return data;
}

export async function testScript(url: string, key: string): Promise<string> {
  const data = await callScript(url, { action: 'ping', key });
  return data.sheet ? `Connected to "${data.sheet}"` : 'Connected';
}

const SHEETS: { table: string; sheet: string; cols: string[] }[] = [
  { table: 'accounts', sheet: 'Accounts', cols: ['id', 'name', 'type', 'opening_balance_paise', 'notes', 'created_at', 'updated_at'] },
  { table: 'categories', sheet: 'Categories', cols: ['id', 'name', 'kind', 'created_at', 'updated_at'] },
  { table: 'incomes', sheet: 'Income', cols: ['id', 'txn_date', 'title', 'amount_paise', 'account_id', 'category_id', 'client_name', 'payer_type', 'payer_name', 'payment_method', 'reference', 'payment_app', 'txn_time', 'payment_mode', 'payment_link', 'area', 'notes', 'created_at', 'updated_at'] },
  { table: 'expenses', sheet: 'Expenses', cols: ['id', 'txn_date', 'txn_time', 'title', 'amount_paise', 'account_id', 'category_id', 'payment_method', 'payment_app', 'reference', 'payment_mode', 'payment_link', 'area', 'notes', 'created_at', 'updated_at'] },
  { table: 'transfers', sheet: 'Transfers', cols: ['id', 'txn_date', 'title', 'amount_paise', 'from_account_id', 'to_account_id', 'notes', 'created_at', 'updated_at'] },
  { table: 'savings_goals', sheet: 'Goals', cols: ['id', 'name', 'target_paise', 'target_date', 'notes', 'created_at', 'updated_at'] },
  { table: 'payment_requests', sheet: 'Payment Requests', cols: ['id', 'title', 'client_name', 'amount_paise', 'due_date', 'status', 'paid_at', 'note', 'created_at', 'updated_at'] },
  { table: 'tasks', sheet: 'Tasks', cols: ['id', 'title', 'area', 'priority', 'status', 'due_date', 'completed_at', 'notes', 'created_at', 'updated_at'] },
];

export async function syncAll(url: string, key: string, onProgress?: (msg: string) => void): Promise<number> {
  // Resolve names so the sheet is readable
  const [acc, cat] = await Promise.all([
    supabase.from('accounts').select('id,name'),
    supabase.from('categories').select('id,name'),
  ]);
  const names = new Map<string, string>();
  (acc.data ?? []).forEach((a: any) => names.set(a.id, a.name));
  (cat.data ?? []).forEach((c: any) => names.set(c.id, c.name));

  let total = 0;
  for (const s of SHEETS) {
    onProgress?.(`Syncing ${s.sheet}…`);
    const { data, error } = await supabase.from(s.table).select('*').is('deleted_at', null).limit(10000);
    if (error) throw error;
    const headers = s.cols.map((c) =>
      c.endsWith('_paise') ? c.replace('_paise', '_inr') : c.endsWith('_id') && c !== 'id' ? c.replace('_id', '') : c,
    );
    const rows = (data ?? []).map((r: any) =>
      s.cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return '';
        if (c.endsWith('_paise')) return paiseToInput(Number(v));
        if (c.endsWith('_id') && c !== 'id') return names.get(v) ?? v;
        return v;
      }),
    );
    await callScript(url, { action: 'replace', key, sheet: s.sheet, headers, rows });
    total += rows.length;
  }
  return total;
}
