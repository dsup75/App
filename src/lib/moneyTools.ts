import { supabase } from './supabase';

export interface MoneyLinkRow {
  id: string;
  source_table: string;
  source_id: string;
  target_table: string;
  target_id: string;
  relation_type: string;
  amount_paise: number;
  note?: string | null;
  created_at?: string;
}

export interface MoneyJourneyNode {
  id: string;
  table: string;
  title: string;
  amount_paise: number;
  account_id: string | null;
  txn_date: string | null;
  sourceRelation?: string;
}

export interface UnallocatedSummary {
  received_paise: number;
  allocated_paise: number;
  transferred_paise: number;
  remaining_paise: number;
}

async function fetchRecord(table: string, id: string): Promise<Record<string, any> | null> {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return (data as Record<string, any>) ?? null;
}

function titleFor(table: string, row: Record<string, any>): string {
  if (!row) return 'Record';
  if (table === 'incomes' || table === 'expenses') return row.title ?? 'Untitled';
  if (table === 'transfers') return row.title ?? 'Transfer';
  if (table === 'loans') return row.person ?? 'Loan';
  if (table === 'accounts') return row.name ?? 'Account';
  return row.title ?? row.name ?? 'Record';
}

export async function getMoneyJourney(targetTable: string, targetId: string): Promise<MoneyJourneyNode[]> {
  const seen = new Set<string>();
  const queue: { table: string; id: string; rel?: string }[] = [{ table: targetTable, id: targetId }];
  const out: MoneyJourneyNode[] = [];

  while (queue.length) {
    const next = queue.shift();
    if (!next) continue;
    const key = `${next.table}:${next.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const row = await fetchRecord(next.table, next.id);
    if (!row) continue;

    const amount = Number(row.amount_paise ?? row.principal_paise ?? 0);
    out.push({
      id: next.id,
      table: next.table,
      title: titleFor(next.table, row),
      amount_paise: amount,
      account_id: row.account_id ?? row.from_account_id ?? row.to_account_id ?? null,
      txn_date: row.txn_date ?? row.start_date ?? null,
      sourceRelation: next.rel,
    });

    const { data: links, error } = await supabase.from('money_links').select('*').eq('target_table', next.table).eq('target_id', next.id).is('deleted_at', null).order('created_at', { ascending: true });
    if (error || !links) continue;

    for (const link of links as MoneyLinkRow[]) {
      queue.push({ table: link.source_table, id: link.source_id, rel: link.relation_type });
    }
  }

  return out;
}

export async function getUnallocatedSummary(): Promise<UnallocatedSummary> {
  const [incomeRes, transferRes, allocationsRes, linkRes] = await Promise.all([
    supabase.from('incomes').select('amount_paise').is('deleted_at', null),
    supabase.from('transfers').select('amount_paise').is('deleted_at', null),
    supabase.from('allocations').select('amount_paise').is('deleted_at', null),
    supabase.from('money_links').select('amount_paise').is('deleted_at', null),
  ]);

  const received = (incomeRes.data ?? []).reduce((sum, row: any) => sum + Number(row.amount_paise ?? 0), 0);
  const transferred = (transferRes.data ?? []).reduce((sum, row: any) => sum + Number(row.amount_paise ?? 0), 0);
  const allocated = (allocationsRes.data ?? []).reduce((sum, row: any) => sum + Number(row.amount_paise ?? 0), 0) + (linkRes.data ?? []).reduce((sum, row: any) => sum + Number(row.amount_paise ?? 0), 0);

  return {
    received_paise: received,
    allocated_paise: allocated,
    transferred_paise: transferred,
    remaining_paise: Math.max(0, received - allocated - transferred),
  };
}
