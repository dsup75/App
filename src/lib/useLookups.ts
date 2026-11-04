import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { displayOf, type TableName } from './tables';
import type { Account, Category } from './db';

export interface RefRow {
  id: string;
  label: string;
  deleted_at: string | null;
  [k: string]: any;
}

interface Data {
  accounts: Account[];
  categories: Category[];
  refs: Partial<Record<TableName, RefRow[]>>;
  names: Map<string, string>;
}

const REF_QUERIES: { table: TableName; cols: string; order: string; asc: boolean; limit?: number }[] = [
  { table: 'clients', cols: 'id,name,status,deleted_at', order: 'name', asc: true },
  { table: 'projects', cols: 'id,name,client_id,deleted_at', order: 'name', asc: true },
  { table: 'invoices', cols: 'id,invoice_no,title,client_id,amount_paise,deleted_at', order: 'issue_date', asc: false, limit: 500 },
  { table: 'incomes', cols: 'id,title,amount_paise,deleted_at', order: 'txn_date', asc: false, limit: 300 },
  { table: 'expenses', cols: 'id,title,amount_paise,deleted_at', order: 'txn_date', asc: false, limit: 300 },
  { table: 'loans', cols: 'id,person,direction,deleted_at', order: 'start_date', asc: false },
  { table: 'savings_goals', cols: 'id,name,deleted_at', order: 'name', asc: true },
  { table: 'groups', cols: 'id,name,deleted_at', order: 'name', asc: true },
  { table: 'group_members', cols: 'id,name,group_id,is_me,deleted_at', order: 'created_at', asc: true },
  { table: 'subjects', cols: 'id,name,deleted_at', order: 'created_at', asc: true },
  { table: 'chapters', cols: 'id,name,subject_id,deleted_at', order: 'name', asc: true },
];

let cache: { at: number; data: Data } | null = null;
let inflight: Promise<Data> | null = null;

export function invalidateLookups() {
  cache = null;
}

async function loadAll(): Promise<Data> {
  const [acc, cat, ...refs] = await Promise.all([
    supabase.from('accounts').select('id, name, type, upi_app, upi_id, deleted_at').order('created_at'),
    supabase.from('categories').select('id, name, kind, deleted_at').order('name'),
    ...REF_QUERIES.map((q) => {
      let b = supabase.from(q.table).select(q.cols).order(q.order, { ascending: q.asc });
      if (q.limit) b = b.limit(q.limit);
      return b;
    }),
  ]);
  const names = new Map<string, string>();
  const accounts = (acc.data ?? []) as Account[];
  const categories = (cat.data ?? []) as Category[];
  accounts.forEach((a) => names.set(a.id, a.name));
  categories.forEach((c) => names.set(c.id, c.name));
  const refMap: Data['refs'] = {};
  REF_QUERIES.forEach((q, i) => {
    const rows = ((refs[i] as any).data ?? []) as any[];
    refMap[q.table] = rows.map((r) => {
      const label = displayOf(q.table, r);
      names.set(r.id, label);
      return { ...r, label };
    });
  });
  return { accounts, categories, refs: refMap, names };
}

export function useLookups() {
  const [data, setData] = useState<Data | null>(cache?.data ?? null);

  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.at < 20000) {
      setData(cache.data);
      return;
    }
    if (force) cache = null;
    inflight = inflight ?? loadAll();
    try {
      const d = await inflight;
      cache = { at: Date.now(), data: d };
      setData(d);
    } catch {
      setData((x) => x ?? { accounts: [], categories: [], refs: {}, names: new Map() });
    } finally {
      inflight = null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useCallback((id: string | null | undefined) => (id ? data?.names.get(id) ?? '—' : '—'), [data]);

  return {
    accounts: data?.accounts ?? [],
    categories: data?.categories ?? [],
    refs: data?.refs ?? {},
    loaded: !!data,
    nameOf,
    reload: () => load(true),
  };
}
