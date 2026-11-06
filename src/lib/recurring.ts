// Recurring entries: due rules become drafts the user approves or skips
import { supabase } from './supabase';
import { todayISO, toISODate } from './dates';
import { saveMoneyEntry, updateRecord, type Row } from './db';

export function nextDate(iso: string, frequency: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return toISODate(d);
}

export type SubState = 'active' | 'paused' | 'cancelled' | 'expired';

/** Expired = the next payment would fall after the end date */
export function subState(r: Row): SubState {
  if (r.status === 'cancelled') return 'cancelled';
  if (r.end_date && r.next_date > r.end_date) return 'expired';
  if (r.status === 'paused') return 'paused';
  return 'active';
}

export const SUB_STATE_LABEL: Record<SubState, string> = { active: 'Active', paused: 'Paused', cancelled: 'Cancelled', expired: 'Expired' };

/** Cost of one rule per month / per year */
export function monthlyCost(r: Row): number {
  const a = Number(r.amount_paise) || 0;
  return r.frequency === 'weekly' ? Math.round((a * 52) / 12) : r.frequency === 'yearly' ? Math.round(a / 12) : a;
}
export function yearlyCost(r: Row): number {
  const a = Number(r.amount_paise) || 0;
  return r.frequency === 'weekly' ? a * 52 : r.frequency === 'yearly' ? a : a * 12;
}

export async function dueRules(): Promise<Row[]> {
  const { data, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .is('deleted_at', null)
    .eq('status', 'active')
    .lte('next_date', todayISO())
    .order('next_date');
  if (error) throw error;
  return ((data as Row[]) ?? []).filter((r) => subState(r) === 'active');
}

/** Moves the rule to its next date after the current one */
export async function advanceRule(rule: Row): Promise<void> {
  let n = nextDate(rule.next_date, rule.frequency);
  // a rule that was missed for a long time only creates one draft, then catches up
  const today = todayISO();
  while (n <= today && rule.frequency !== 'yearly') {
    const after = nextDate(n, rule.frequency);
    if (after > today) break;
    n = after;
  }
  await updateRecord('recurring_rules', rule.id, { next_date: n });
}

/** Saves the entry for this due date (one payment line), then advances the rule */
export async function approveRule(rule: Row): Promise<string> {
  const parent: Record<string, unknown> = {
    title: rule.title,
    category_id: rule.category_id,
    client_id: rule.client_id,
    payment_mode: rule.payment_mode,
    area: rule.area,
    notes: rule.notes,
    recurring_rule_id: rule.id,
    due_for: rule.next_date,
  };
  if (rule.kind === 'incomes') parent.payer_type = rule.client_id ? 'client' : 'other';
  const id = await saveMoneyEntry(
    rule.kind,
    null,
    parent,
    [
      {
        account_id: rule.account_id,
        amount_paise: Number(rule.amount_paise),
        payment_app: rule.payment_app,
        payment_method: rule.payment_app === 'cash' ? 'cash' : rule.payment_app ? 'upi' : null,
        txn_date: rule.next_date > todayISO() ? todayISO() : rule.next_date,
      },
    ],
    null,
  );
  await advanceRule(rule);
  return id;
}
