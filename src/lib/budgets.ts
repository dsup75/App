// Monthly budget status: how much of each limit is spent this month
import { supabase } from './supabase';
import { currentMonth, monthRange } from './dates';

export interface BudgetStatus {
  id: string;
  category_id: string | null;
  area: string | null;
  month: string | null;
  limit: number;
  spent: number;
  pct: number;
}

/** Your share of an expense (others' split shares are not your spending) */
function myShare(e: any): number {
  const others = Array.isArray(e.split_with) ? e.split_with.reduce((s: number, x: any) => s + Number(x.amount_paise || 0), 0) : 0;
  return Math.max(0, Number(e.amount_paise) - others);
}

export async function budgetStatus(month = currentMonth()): Promise<BudgetStatus[]> {
  const { from, to } = monthRange(month);
  const [b, e] = await Promise.all([
    supabase.from('budgets').select('id,category_id,area,month,amount_paise').is('deleted_at', null),
    supabase.from('expenses').select('category_id,area,amount_paise,split_with').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to).limit(5000),
  ]);
  if (b.error) throw b.error;
  if (e.error) throw e.error;
  const all = ((b.data as any[]) ?? []).filter((x) => !x.month || x.month === month);
  // a budget set for this exact month replaces the "every month" one for the same category + area
  const key = (x: any) => `${x.category_id ?? '*'}|${x.area ?? '*'}`;
  const specific = new Set(all.filter((x) => x.month).map(key));
  const list = all.filter((x) => x.month || !specific.has(key(x)));
  const exps = (e.data as any[]) ?? [];
  return list
    .map((x) => {
      const spent = exps
        .filter((ex) => (!x.category_id || ex.category_id === x.category_id) && (!x.area || ex.area === x.area))
        .reduce((s, ex) => s + myShare(ex), 0);
      const limit = Number(x.amount_paise);
      return { id: x.id, category_id: x.category_id, area: x.area, month: x.month, limit, spent, pct: limit ? Math.round((spent / limit) * 100) : 0 };
    })
    .sort((a, b) => b.pct - a.pct);
}
