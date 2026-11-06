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
  { table: 'incomes', sheet: 'Income', cols: ['id', 'txn_date', 'title', 'amount_paise', 'account_id', 'category_id', 'client_name', 'payer_type', 'payer_name', 'payment_method', 'reference', 'payment_app', 'txn_time', 'payment_mode', 'payment_link', 'area', 'line_count', 'notes', 'created_at', 'updated_at'] },
  { table: 'expenses', sheet: 'Expenses', cols: ['id', 'txn_date', 'txn_time', 'title', 'amount_paise', 'account_id', 'category_id', 'payment_method', 'payment_app', 'reference', 'payment_mode', 'payment_link', 'area', 'notes', 'created_at', 'updated_at'] },
  { table: 'transfers', sheet: 'Transfers', cols: ['id', 'txn_date', 'title', 'amount_paise', 'from_account_id', 'to_account_id', 'notes', 'created_at', 'updated_at'] },
  { table: 'savings_goals', sheet: 'Goals', cols: ['id', 'name', 'target_paise', 'target_date', 'notes', 'created_at', 'updated_at'] },
  { table: 'payment_requests', sheet: 'Payment Requests', cols: ['id', 'title', 'client_name', 'amount_paise', 'due_date', 'status', 'paid_at', 'note', 'created_at', 'updated_at'] },
  { table: 'tasks', sheet: 'Tasks', cols: ['id', 'title', 'area', 'task_type', 'priority', 'status', 'due_date', 'client_id', 'completed_at', 'notes', 'created_at', 'updated_at'] },
  { table: 'clients', sheet: 'Clients', cols: ['id', 'name', 'contact_person', 'phone', 'email', 'business_type', 'status', 'start_date', 'notes', 'created_at'] },
  { table: 'client_contacts', sheet: 'Client Staff', cols: ['id', 'client_id', 'name', 'role', 'phone', 'email', 'created_at'] },
  { table: 'invoices', sheet: 'Invoices', cols: ['id', 'invoice_no', 'client_id', 'title', 'period', 'amount_paise', 'issue_date', 'due_date', 'status', 'notes', 'created_at'] },
  { table: 'payment_lines', sheet: 'Payment Lines', cols: ['id', 'parent_table', 'parent_id', 'direction', 'txn_date', 'txn_time', 'amount_paise', 'account_id', 'payment_app', 'payment_method', 'reference', 'party_name', 'notes', 'created_at'] },
  { table: 'allocations', sheet: 'Allocations', cols: ['id', 'income_id', 'expense_id', 'loan_id', 'transfer_id', 'amount_paise', 'notes', 'created_at'] },
  { table: 'loans', sheet: 'Udhaar & Loans', cols: ['id', 'direction', 'person', 'principal_paise', 'account_id', 'start_date', 'due_date', 'interest_type', 'interest_rate_bp', 'notes', 'created_at'] },
  { table: 'loan_repayments', sheet: 'Loan Repayments', cols: ['id', 'loan_id', 'title', 'principal_paise', 'interest_paise', 'account_id', 'txn_date', 'notes', 'created_at'] },
  { table: 'savings_entries', sheet: 'Goal Entries', cols: ['id', 'goal_id', 'title', 'amount_paise', 'txn_date', 'notes', 'created_at'] },
  { table: 'group_expenses', sheet: 'Group Expenses', cols: ['id', 'group_id', 'title', 'amount_paise', 'txn_date', 'split_type', 'notes', 'created_at'] },
  { table: 'group_settlements', sheet: 'Group Settlements', cols: ['id', 'group_id', 'from_member_id', 'to_member_id', 'amount_paise', 'txn_date', 'notes', 'created_at'] },
  { table: 'projects', sheet: 'Projects', cols: ['id', 'client_id', 'name', 'status', 'start_date', 'deadline', 'budget_paise', 'notes', 'created_at'] },
  { table: 'campaigns', sheet: 'Campaigns', cols: ['id', 'client_id', 'name', 'platform', 'objective', 'status', 'budget_paise', 'start_date', 'end_date', 'results', 'notes', 'created_at'] },
  { table: 'study_sessions', sheet: 'Study Sessions', cols: ['id', 'session_date', 'title', 'subject_id', 'chapter_id', 'minutes', 'kind', 'notes', 'created_at'] },
  { table: 'chapters', sheet: 'Chapters', cols: ['id', 'subject_id', 'name', 'class_level', 'status', 'revision_count', 'is_weak', 'is_backlog', 'notes'] },
  { table: 'mock_tests', sheet: 'Mock Tests', cols: ['id', 'name', 'exam', 'subject_id', 'test_date', 'total_marks', 'obtained_marks', 'correct', 'incorrect', 'unattempted', 'weak_chapters', 'notes'] },
  { table: 'habits', sheet: 'Habits', cols: ['id', 'name', 'slot', 'area', 'target_per_week', 'notes', 'created_at'] },
  { table: 'events', sheet: 'Events', cols: ['id', 'title', 'event_date', 'start_time', 'end_time', 'area', 'location', 'notes'] },
  { table: 'notes', sheet: 'Notes', cols: ['id', 'title', 'body', 'area', 'pinned', 'updated_at'] },
];

export async function syncAll(url: string, key: string, onProgress?: (msg: string) => void): Promise<number> {
  // Resolve linked ids to names so the sheet is readable
  const names = new Map<string, string>();
  const nameSources: [string, string][] = [
    ['accounts', 'id,name'], ['categories', 'id,name'], ['clients', 'id,name'], ['savings_goals', 'id,name'],
    ['groups', 'id,name'], ['group_members', 'id,name'], ['subjects', 'id,name'], ['chapters', 'id,name'],
    ['loans', 'id,person'], ['invoices', 'id,invoice_no'], ['incomes', 'id,title'], ['expenses', 'id,title'],
  ];
  const lists = await Promise.all(nameSources.map(([t, c]) => supabase.from(t).select(c).limit(10000)));
  lists.forEach((r) => ((r.data as any[]) ?? []).forEach((x) => names.set(x.id, x.name ?? x.person ?? x.invoice_no ?? x.title)));

  let total = 0;
  const batch: { sheet: string; headers: string[]; rows: unknown[][] }[] = [];
  for (const s of SHEETS) {
    onProgress?.(`Reading ${s.sheet}…`);
    const { data, error } = await supabase.from(s.table).select('*').is('deleted_at', null).limit(10000);
    if (error) {
      if (/does not exist/i.test(error.message)) continue; // table from a newer update not installed yet
      throw error;
    }
    const headers = s.cols.map((c) =>
      c.endsWith('_paise') ? c.replace('_paise', '_inr') : c.endsWith('_id') && c !== 'id' ? c.replace('_id', '') : c,
    );
    const rows = (data ?? []).map((r: any) =>
      s.cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return '';
        if (c.endsWith('_paise')) return paiseToInput(Number(v));
        if (c.endsWith('_id') && c !== 'id') return names.get(v) ?? v;
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      }),
    );
    batch.push({ sheet: s.sheet, headers, rows });
    total += rows.length;
  }
  onProgress?.('Writing to Google Sheet…');
  try {
    await callScript(url, { action: 'replace_many', key, sheets: batch });
  } catch (e) {
    // Older script without replace_many → one sheet at a time
    if (!/Unknown action/i.test((e as Error).message)) throw e;
    for (const b of batch) {
      onProgress?.(`Writing ${b.sheet}…`);
      await callScript(url, { action: 'replace', key, sheet: b.sheet, headers: b.headers, rows: b.rows });
    }
  }
  return total;
}
