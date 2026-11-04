import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Copy, Trash2, RotateCcw, History } from 'lucide-react';
import {
  deleteForever, friendlyError, getHistory, getRecord, restoreRecord, softDelete, type HistoryRow, type Row,
} from '../lib/db';
import { supabase } from '../lib/supabase';
import { TABLES, fieldLabel, isTableName, optionLabel, type Field, type TableName } from '../lib/tables';
import { formatINR } from '../lib/money';
import { formatDate, formatDateTime } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { MoneyRow, type MoneyKind } from '../components/MoneyRow';
import { Badge, Button, Card, Confirm, Empty, ErrorBox, List, ListRow, Page, SectionTitle, Spinner } from '../components/ui';

export function formatValue(f: Field | undefined, value: unknown, nameOf: (id: string) => string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (!f) return String(value);
  switch (f.type) {
    case 'money':
    case 'signed_money':
      return formatINR(Number(value));
    case 'date':
      return formatDate(String(value));
    case 'select':
      return optionLabel(f.options, value);
    case 'account':
    case 'category':
      return nameOf(String(value));
    default:
      return String(value);
  }
}

export function RecordDetail() {
  const { table, id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { nameOf, reload: reloadLookups } = useLookups();
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [linked, setLinked] = useState<{ kind: MoneyKind; r: Row }[]>([]);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'forever' | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = isTableName(table);
  const t = table as TableName;

  const load = useCallback(async () => {
    if (!valid || !id) return;
    setError('');
    try {
      const [r, h] = await Promise.all([getRecord(t, id), getHistory(t, id)]);
      setRow(r);
      setHistory(h);
      if (t === 'accounts' || t === 'categories') {
        const col = t === 'accounts' ? 'account_id' : 'category_id';
        const qs = await Promise.all([
          supabase.from('incomes').select('*').eq(col, id).is('deleted_at', null).order('txn_date', { ascending: false }).limit(10),
          supabase.from('expenses').select('*').eq(col, id).is('deleted_at', null).order('txn_date', { ascending: false }).limit(10),
          t === 'accounts'
            ? supabase.from('transfers').select('*').or(`from_account_id.eq.${id},to_account_id.eq.${id}`).is('deleted_at', null).order('txn_date', { ascending: false }).limit(10)
            : Promise.resolve({ data: [] as Row[], error: null }),
        ]);
        const items = [
          ...(qs[0].data ?? []).map((r) => ({ kind: 'incomes' as MoneyKind, r: r as Row })),
          ...(qs[1].data ?? []).map((r) => ({ kind: 'expenses' as MoneyKind, r: r as Row })),
          ...(qs[2].data ?? []).map((r) => ({ kind: 'transfers' as MoneyKind, r: r as Row })),
        ].sort((a, b) => b.r.txn_date.localeCompare(a.r.txn_date));
        setLinked(items.slice(0, 15));
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [valid, t, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!valid) return <Page title="Not found" back><Empty title="Unknown record type" /></Page>;
  const def = TABLES[t];

  const act = async (fn: () => Promise<void>, msg: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      reloadLookups();
      if (after) after();
      else await load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (error) return <Page title={def.label} back><ErrorBox message={error} onRetry={load} /></Page>;
  if (row === undefined) return <Page title={def.label} back><Spinner /></Page>;
  if (row === null) return <Page title={def.label} back><Empty title="Record not found" text="It may have been deleted permanently." /></Page>;

  const deleted = !!row.deleted_at;
  const title = row[def.titleField];
  const amountField = def.fields.find((f) => f.type === 'money');

  return (
    <Page title={title} subtitle={def.label} back>
      {deleted && (
        <Card className="flex items-center gap-3">
          <Badge tone="danger">In Recycle Bin</Badge>
          <span className="text-[13px] text-muted">Deleted {formatDateTime(row.deleted_at)}</span>
        </Card>
      )}

      {amountField && (
        <Card className="text-center">
          <p className="text-[13px] text-muted">Amount</p>
          <p
            className={
              'text-[36px] font-bold tracking-tight ' + (t === 'incomes' ? 'text-income' : t === 'expenses' ? 'text-expense' : '')
            }
          >
            {formatINR(row[amountField.key])}
          </p>
        </Card>
      )}

      <List>
        {def.fields
          .filter((f) => f !== amountField && f.key !== def.titleField)
          .map((f) => (
            <ListRow
              key={f.key}
              title={<span className="text-[13px] font-normal text-muted">{f.label}</span>}
              subtitle={<span className="whitespace-pre-wrap text-[15px] text-fg">{formatValue(f, row[f.key], nameOf)}</span>}
              onClick={
                (f.type === 'account' || f.type === 'category') && row[f.key]
                  ? () => nav(`/r/${f.type === 'account' ? 'accounts' : 'categories'}/${row[f.key]}`)
                  : undefined
              }
              chevron={(f.type === 'account' || f.type === 'category') && !!row[f.key]}
            />
          ))}
        {t === 'tasks' && row.completed_at && (
          <ListRow title={<span className="text-[13px] font-normal text-muted">Completed</span>} subtitle={formatDateTime(row.completed_at)} />
        )}
        <ListRow title={<span className="text-[13px] font-normal text-muted">Created</span>} subtitle={formatDateTime(row.created_at)} />
        <ListRow title={<span className="text-[13px] font-normal text-muted">Last modified</span>} subtitle={formatDateTime(row.updated_at)} />
      </List>

      {!deleted ? (
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => nav(`/r/${t}/${row.id}/edit`)}>
            <Pencil size={16} /> Edit
          </Button>
          <Button onClick={() => nav(`/r/${t}/new?dup=${row.id}`)}>
            <Copy size={16} /> Copy
          </Button>
          <Button variant="danger" onClick={() => setConfirm('delete')}>
            <Trash2 size={16} /> Delete
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" loading={busy} onClick={() => act(() => restoreRecord(t, row.id), 'Restored')}>
            <RotateCcw size={16} /> Restore
          </Button>
          <Button variant="danger" onClick={() => setConfirm('forever')}>
            <Trash2 size={16} /> Delete forever
          </Button>
        </div>
      )}

      {(t === 'accounts' || t === 'categories') && (
        <>
          <SectionTitle>Linked entries</SectionTitle>
          {linked.length === 0 ? (
            <Empty title="No linked entries" />
          ) : (
            <List>
              {linked.map(({ kind, r }) => (
                <MoneyRow key={kind + r.id} kind={kind} row={r} nameOf={nameOf} />
              ))}
            </List>
          )}
        </>
      )}

      <SectionTitle>
        <span className="inline-flex items-center gap-1">
          <History size={13} /> Edit history
        </span>
      </SectionTitle>
      <HistoryList table={t} rows={history} nameOf={nameOf} />

      <Confirm
        open={confirm === 'delete'}
        title={`Delete ${def.label.toLowerCase()}?`}
        message={
          def.financial
            ? 'It moves to the Recycle Bin and stops counting in balances and reports. You can restore it anytime.'
            : 'It moves to the Recycle Bin. You can restore it anytime.'
        }
        confirmLabel="Move to Recycle Bin"
        danger
        loading={busy}
        onConfirm={() => act(() => softDelete(t, row.id), 'Moved to Recycle Bin', () => nav(-1))}
        onClose={() => setConfirm(null)}
      />
      <Confirm
        open={confirm === 'forever'}
        title="Delete forever?"
        message="This cannot be undone. Edit history is kept for your records."
        confirmLabel="Delete forever"
        danger
        loading={busy}
        onConfirm={() => act(() => deleteForever(t, row.id), 'Deleted permanently', () => nav(-1))}
        onClose={() => setConfirm(null)}
      />
    </Page>
  );
}

function HistoryList({ table, rows, nameOf }: { table: TableName; rows: HistoryRow[]; nameOf: (id: string) => string }) {
  if (!rows.length) return <Empty title="No history yet" />;
  const def = TABLES[table];
  const describe = (h: HistoryRow) => {
    if (h.field === '__created') return 'Record created';
    if (h.field === 'deleted_at') return h.new_value ? 'Moved to Recycle Bin' : 'Restored from Recycle Bin';
    if (h.field === 'completed_at') return null;
    const f = def.fields.find((x) => x.key === h.field);
    return `${fieldLabel(table, h.field)}: ${formatValue(f, h.old_value, nameOf)} → ${formatValue(f, h.new_value, nameOf)}`;
  };
  return (
    <List>
      {rows
        .map((h) => ({ h, text: describe(h) }))
        .filter((x) => x.text)
        .map(({ h, text }) => (
          <ListRow key={h.id} title={<span className="whitespace-normal text-[14px]">{text}</span>} subtitle={formatDateTime(h.changed_at)} />
        ))}
    </List>
  );
}
