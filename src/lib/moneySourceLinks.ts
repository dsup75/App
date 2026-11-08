import { supabase } from './supabase';

export const MONEY_SOURCE_TABLES = [
  'incomes',
  'expenses',
  'transfers',
  'loans',
  'loan_repayments',
] as const;

export type MoneySourceTable = (typeof MONEY_SOURCE_TABLES)[number];

export interface MoneySourceLink {
  id: string;
  source_table: MoneySourceTable;
  source_id: string;
  target_table: MoneySourceTable;
  target_id: string;
  relation_type: string;
  amount_paise: number;
  note: string | null;
  created_at: string;
}

export interface MoneySourceLinkInput {
  source_table: MoneySourceTable;
  source_id: string;
  target_table: MoneySourceTable;
  target_id: string;
  relation_type?: string;
  amount_paise: number;
  note?: string | null;
}

export interface MoneyJourneyNode {
  id: string;
  table: MoneySourceTable;
  title: string;
  amount_paise: number;
  account_id: string | null;
  txn_date: string | null;
  sourceRelation?: string;
}

function assertMoneySourceTable(table: string): asserts table is MoneySourceTable {
  if (!(MONEY_SOURCE_TABLES as readonly string[]).includes(table)) {
    throw new Error('Unsupported money record type.');
  }
}

function assertPositivePaise(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Link amount must be a positive whole number of paise.');
  }
}

export async function createMoneySourceLink(input: MoneySourceLinkInput): Promise<MoneySourceLink> {
  assertMoneySourceTable(input.source_table);
  assertMoneySourceTable(input.target_table);
  assertPositivePaise(input.amount_paise);

  if (input.source_table === input.target_table && input.source_id === input.target_id) {
    throw new Error('A money record cannot link to itself.');
  }

  const relationType = input.relation_type ?? 'derived_from';
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(relationType)) {
    throw new Error('Invalid money-link relationship type.');
  }

  const { data, error } = await supabase
    .from('money_source_links')
    .insert({
      source_table: input.source_table,
      source_id: input.source_id,
      target_table: input.target_table,
      target_id: input.target_id,
      relation_type: relationType,
      amount_paise: input.amount_paise,
      note: input.note ?? null,
    })
    .select('id,source_table,source_id,target_table,target_id,relation_type,amount_paise,note,created_at')
    .single();

  if (error) throw error;
  return data as MoneySourceLink;
}

export async function getMoneySourceLinksForTarget(
  targetTable: MoneySourceTable,
  targetId: string,
): Promise<MoneySourceLink[]> {
  assertMoneySourceTable(targetTable);
  const { data, error } = await supabase
    .from('money_source_links')
    .select('id,source_table,source_id,target_table,target_id,relation_type,amount_paise,note,created_at')
    .eq('target_table', targetTable)
    .eq('target_id', targetId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MoneySourceLink[];
}

export async function getMoneySourceLinksForSource(
  sourceTable: MoneySourceTable,
  sourceId: string,
): Promise<MoneySourceLink[]> {
  assertMoneySourceTable(sourceTable);
  const { data, error } = await supabase
    .from('money_source_links')
    .select('id,source_table,source_id,target_table,target_id,relation_type,amount_paise,note,created_at')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MoneySourceLink[];
}

export async function softDeleteMoneySourceLink(linkId: string): Promise<void> {
  const { data, error } = await supabase
    .from('money_source_links')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', linkId)
    .is('deleted_at', null)
    .select('id');

  if (error) throw error;
  if (!data?.length) throw new Error('Money link was not found or is already removed.');
}

async function fetchMoneyRecord(table: MoneySourceTable, id: string): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return (data as Record<string, any> | null) ?? null;
}

function getRecordTitle(table: MoneySourceTable, row: Record<string, any>): string {
  if (table === 'loans') return row.person ?? 'Loan';
  if (table === 'loan_repayments') return row.title ?? 'Loan repayment';
  return row.title ?? (table === 'transfers' ? 'Transfer' : 'Untitled');
}

/**
 * Follows connected source and target links from a selected record. This is lineage-only:
 * it never creates or modifies a payment line or account balance.
 */
export async function getMoneySourceJourney(
  targetTable: MoneySourceTable,
  targetId: string,
  maxNodes = 100,
): Promise<MoneyJourneyNode[]> {
  assertMoneySourceTable(targetTable);

  const queue: { table: MoneySourceTable; id: string; relation?: string }[] = [
    { table: targetTable, id: targetId },
  ];
  const visited = new Set<string>();
  const journey: MoneyJourneyNode[] = [];

  while (queue.length && journey.length < maxNodes) {
    const current = queue.shift();
    if (!current) continue;

    const key = current.table + ':' + current.id;
    if (visited.has(key)) continue;
    visited.add(key);

    const record = await fetchMoneyRecord(current.table, current.id);
    if (!record) continue;

    const amount = Number(record.amount_paise ?? (Number(record.principal_paise ?? 0) + Number(record.interest_paise ?? 0)));
    journey.push({
      id: current.id,
      table: current.table,
      title: getRecordTitle(current.table, record),
      amount_paise: amount,
      account_id: record.account_id ?? record.from_account_id ?? record.to_account_id ?? null,
      txn_date: record.txn_date ?? record.start_date ?? null,
      sourceRelation: current.relation,
    });

    const [incoming, outgoing] = await Promise.all([
      getMoneySourceLinksForTarget(current.table, current.id),
      getMoneySourceLinksForSource(current.table, current.id),
    ]);
    for (const link of incoming) {
      queue.push({
        table: link.source_table,
        id: link.source_id,
        relation: link.relation_type,
      });
    }
    for (const link of outgoing) {
      queue.push({
        table: link.target_table,
        id: link.target_id,
        relation: link.relation_type,
      });
    }
  }

  return journey;
}

export interface MoneySourceLinkDesired {
  id?: string;
  source_table: MoneySourceTable;
  source_id: string;
  amount_paise: number;
  relation_type?: string;
  note?: string | null;
}

/** Reconciles only lineage metadata for one saved target record. */
export async function syncMoneySourceLinksForTarget(
  targetTable: MoneySourceTable,
  targetId: string,
  desired: MoneySourceLinkDesired[],
): Promise<void> {
  const current = await getMoneySourceLinksForTarget(targetTable, targetId);
  const retainedIds = new Set(desired.map((link) => link.id).filter((id): id is string => !!id));

  for (const link of current) {
    if (!retainedIds.has(link.id)) await softDeleteMoneySourceLink(link.id);
  }

  for (const link of desired) {
    if (link.id) continue;
    await createMoneySourceLink({
      source_table: link.source_table,
      source_id: link.source_id,
      target_table: targetTable,
      target_id: targetId,
      relation_type: link.relation_type ?? 'derived_from',
      amount_paise: link.amount_paise,
      note: link.note ?? null,
    });
  }
}
