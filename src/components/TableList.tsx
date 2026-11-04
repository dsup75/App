import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError, type Row } from '../lib/db';
import { TABLES, type TableName } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { RecordLine } from './RecordLine';
import { Chips, Empty, ErrorBox, IconButton, List, Page, Spinner } from './ui';

export interface ListFilter {
  value: string;
  label: string;
  test: (r: Row) => boolean;
}

/** Generic, searchable list page for any record table */
export function TableList({
  table,
  title,
  subtitle,
  order = 'created_at',
  asc = false,
  filters,
  header,
  renderRows,
  newParams,
  back = true,
  reloadSignal,
}: {
  table: TableName;
  title?: string;
  subtitle?: string;
  order?: string;
  asc?: boolean;
  filters?: ListFilter[];
  header?: (rows: Row[]) => ReactNode;
  renderRows?: (rows: Row[], nameOf: (id: string) => string, reload: () => void) => ReactNode;
  newParams?: string;
  back?: boolean;
  reloadSignal?: number;
}) {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(filters?.[0]?.value ?? 'all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await supabase.from(table).select('*').is('deleted_at', null).order(order, { ascending: asc, nullsFirst: false }).limit(2000);
    if (error) setError(friendlyError(error));
    else setRows(data as Row[]);
  }, [table, order, asc]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const list = useMemo(() => {
    let r = rows ?? [];
    const f = filters?.find((x) => x.value === filter);
    if (f) r = r.filter(f.test);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((x) => JSON.stringify(x).toLowerCase().includes(s) || nameOf(x.client_id).toLowerCase().includes(s));
    }
    return r;
  }, [rows, filters, filter, q, nameOf]);

  const def = TABLES[table];
  return (
    <Page
      title={title ?? def.plural}
      subtitle={subtitle}
      back={back}
      right={
        <IconButton label={`Add ${def.label}`} onClick={() => nav(`/r/${table}/new${newParams ? `?${newParams}` : ''}`)}>
          <Plus size={19} />
        </IconButton>
      }
    >
      {rows && header?.(rows)}
      <div className="flex items-center gap-2 rounded-[12px] bg-[var(--card)] px-3" style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
        <Search size={16} className="text-muted" />
        <input className="h-10 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--muted)]" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {filters && filters.length > 1 && <Chips value={filter} onChange={setFilter} options={filters.map((f) => ({ value: f.value, label: f.label }))} />}
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title={`No ${def.plural.toLowerCase()} here`} text="Tap + to add one." />
      ) : renderRows ? (
        renderRows(list, nameOf, load)
      ) : (
        <List>
          {list.map((r) => (
            <RecordLine key={r.id} table={table} row={r} nameOf={nameOf} />
          ))}
        </List>
      )}
    </Page>
  );
}
