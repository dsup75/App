// Budget status: how much of each limit is spent in its period
import { supabase } from './supabase';
import { currentMonth, monthRange, todayISO } from './dates';

export interface BudgetStatus {
  id: string;
  category_id: string | null;
  account_id: string | null;
  area: string | null;
  month: string | null;
  start_date: string | null;
  end_date: string | null;
  from: string;
  to: string;
  limit: number;
  spent: number;
  pct: number;
}

/** Your share of an expense (others' split shares are not your spending) */
function myShare(e: any): number {
  const others = Array.isArray(e.split_with) ? e.split_with.reduce((s: number, x: any) => s + Number(x.amount_paise || 0), 0) : 0;
  return Math.max(0, Number(e.amount_paise) - others);
}

/** Budgets that apply now: every-month ones, this month's ones, and custom periods that include today */
export async function budgetStatus(month = currentMonth()): Promise<BudgetStatus[]> {
  const m = monthRange(month);
  const today = todayISO();
  const b = await supabase.from('budgets').select('id,category_id,account_id,area,month,start_date,end_date,amount_paise').is('deleted_at', null);
  if (b.error) throw b.error;
  const all = ((b.data as any[]) ?? []).filter((x) =>
    x.start_date ? x.start_date <= (month === currentMonth() ? today : m.to) && x.end_date >= (month === currentMonth() ? today : m.from) : !x.month || x.month === month,
  );
  // a budget for this exact month replaces the "every month" one with the same scope
  const key = (x: any) => `${x.category_id ?? '*'}|${x.account_id ?? '*'}|${x.area ?? '*'}`;
  const specific = new Set(all.filter((x) => x.month).map(key));
  const list = all.filter((x) => x.month || x.start_date || !specific.has(key(x)));
  if (!list.length) return [];

  // one query covering every period
  const from = list.reduce((a, x) => (x.start_date && x.start_date < a ? x.start_date : a), m.from);
  const to = list.reduce((a, x) => (x.end_date && x.end_date > a ? x.end_date : a), m.to);
  const needAccounts = list.some((x) => x.account_id);
  const [e, lines] = await Promise.all([
    supabase.from('expenses').select('id,category_id,area,amount_paise,split_with,txn_date').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to).limit(10000),
    needAccounts
      ? supabase.from('account_movements').select('parent_id,account_id,amount_paise,txn_date').eq('parent_table', 'expenses').eq('direction', 'out').gte('txn_date', from).lte('txn_date', to).limit(10000)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (e.error) throw e.error;
  const exps = (e.data as any[]) ?? [];
  const byId = new Map(exps.map((x) => [x.id, x]));
  const outLines = (lines.data as any[]) ?? [];

  return list
    .map((x) => {
      const pf = x.start_date ?? m.from;
      const pt = x.end_date ?? m.to;
      let spent: number;
      if (x.account_id) {
        // money that actually left this account for expenses
        spent = outLines
          .filter((l) => l.account_id === x.account_id && l.txn_date >= pf && l.txn_date <= pt)
          .filter((l) => {
            const ex = byId.get(l.parent_id);
            return ex && (!x.category_id || ex.category_id === x.category_id) && (!x.area || ex.area === x.area);
          })
          .reduce((t, l) => t + Number(l.amount_paise), 0);
      } else {
        spent = exps
          .filter((ex) => ex.txn_date >= pf && ex.txn_date <= pt && (!x.category_id || ex.category_id === x.category_id) && (!x.area || ex.area === x.area))
          .reduce((t, ex) => t + myShare(ex), 0);
      }
      const limit = Number(x.amount_paise);
      return {
        id: x.id,
        category_id: x.category_id,
        account_id: x.account_id,
        area: x.area,
        month: x.month,
        start_date: x.start_date,
        end_date: x.end_date,
        from: pf,
        to: pt,
        limit,
        spent,
        pct: limit ? Math.round((spent / limit) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function budgetTitle(b: BudgetStatus, nameOf: (id: string) => string): string {
  const parts = [b.category_id ? nameOf(b.category_id) : b.account_id ? '' : 'All spending', b.account_id ? `from ${nameOf(b.account_id)}` : ''].filter(Boolean);
  return parts.join(' ') || 'All spending';
}
