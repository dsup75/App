import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Copy, Trash2, RotateCcw, History, Plus } from 'lucide-react';
import {
  deleteForever, friendlyError, getHistory, getRecord, restoreRecord, softDelete, type HistoryRow, type Row,
} from '../lib/db';
import { supabase } from '../lib/supabase';
import { TABLES, displayOf, fieldLabel, isTableName, optionLabel, type Field, type TableName } from '../lib/tables';
import { CHILDREN, type ChildSpec } from '../lib/children';
import { formatINR, paiseToInput } from '../lib/money';
import { formatDate, formatDateTime } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useCustomOptions } from '../lib/options';
import { useToast } from '../context/ToastContext';
import { RequestPanel } from '../components/RequestPanel';
import { DetailExtras } from '../components/DetailExtras';
import { RecordLine } from '../components/RecordLine';
import { Badge, Button, Card, Confirm, Empty, ErrorBox, List, ListRow, Page, SectionTitle, Spinner } from '../components/ui';

export function formatValue(f: Field | undefined, value: unknown, nameOf: (id: string) => string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (!f) return typeof value === 'object' ? JSON.stringify(value) : String(value);
  switch (f.type) {
    case 'money':
    case 'signed_money':
      return formatINR(Number(value));
    case 'rate':
      return `${paiseToInput(Number(value))}% / year`;
    case 'date':
      return formatDate(String(value));
    case 'time':
      return String(value).slice(0, 5);
    case 'bool':
      return value ? 'Yes' : 'No';
    case 'select':
      return optionLabel(f.options, value);
    case 'account':
    case 'category':
    case 'ref':
      return nameOf(String(value));
    case 'json':
      if (Array.isArray(value))
        return (
          value
            .map((x: any) => `${x.name ?? nameOf(x.member_id ?? x.account_id)} ${formatINR(Number(x.amount_paise))}`)
            .join(', ') || '—'
        );
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

function linkTarget(f: Field, row: Row): string | null {
  const v = row[f.key];
  if (!v) return null;
  if (f.type === 'account') return `/r/accounts/${v}`;
  if (f.type === 'category') return `/r/categories/${v}`;
  if (f.type === 'ref' && f.refTable) return `/r/${f.refTable}/${v}`;
  return null;
}

export function RecordDetail() {
  const { table, id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { nameOf, reload: reloadLookups } = useLookups();
  const { labelOf } = useCustomOptions();
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'forever' | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const valid = isTableName(table);
  const t = table as TableName;

  const load = useCallback(async () => {
    if (!valid || !id) return;
    setError('');
    try {
      const [r, h] = await Promise.all([getRecord(t, id), getHistory(t, id)]);
      setRow(r);
      setHistory(h);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [valid, t, id]);

  useEffect(() => {
    load();
  }, [load]);

  // Group expenses and members are managed on the group screen
  useEffect(() => {
    if (row && (t === 'group_expenses' || t === 'group_members') && !row.deleted_at) {
      nav(`/groups/${row.group_id}${t === 'group_expenses' ? `?expense=${row.id}` : ''}`, { replace: true });
    }
  }, [row, t, nav]);

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
  const title = displayOf(t, row);
  const showsHero = ['invoices', 'loans', 'savings_goals', 'mock_tests', 'accounts'].includes(t);
  const amountField = def.fields.find((f) => f.type === 'money' && f.required);
  const showAmount = !!amountField && !showsHero;

  return (
    <Page title={title} subtitle={def.label} back>
      {deleted && (
        <Card className="flex items-center gap-3">
          <Badge tone="danger">In Recycle Bin</Badge>
          <span className="text-[13px] text-muted">Deleted {formatDateTime(row.deleted_at)}</span>
        </Card>
      )}

      {!deleted && <DetailExtras table={t} row={row} nameOf={nameOf} reloadKey={reloadKey} />}

      {showAmount && amountField && (
        <Card className="text-center">
          <p className="text-[12.5px] text-muted">Amount</p>
          <p className={'text-[30px] font-bold tracking-tight ' + (t === 'incomes' ? 'text-income' : t === 'expenses' ? 'text-expense' : '')}>
            {formatINR(row[amountField.key])}
          </p>
        </Card>
      )}

      {t === 'payment_requests' && <RequestPanel row={row} nameOf={nameOf} onChanged={load} />}

      <List>
        {def.fields
          .filter((f) => !(showAmount && f === amountField) && f.key !== def.titleField && !f.hidden)
          .filter((f) => f.required || (row[f.key] !== null && row[f.key] !== undefined && row[f.key] !== '' && !(Array.isArray(row[f.key]) && !row[f.key].length)))
          .map((f) => {
            const to = linkTarget(f, row);
            const url = f.key === 'payment_link' && /^https?:\/\//i.test(String(row[f.key] ?? '')) ? String(row[f.key]) : null;
            return (
              <ListRow
                key={f.key}
                title={<span className="text-[12.5px] font-normal text-muted">{f.label}</span>}
                subtitle={<span className="whitespace-pre-wrap text-[14.5px] text-fg">{f.listKey ? labelOf(f.listKey, row[f.key]) : formatValue(f, row[f.key], nameOf)}</span>}
                onClick={to ? () => nav(to) : url ? () => window.open(url, '_blank') : undefined}
                chevron={!!to || !!url}
              />
            );
          })}
        {t === 'incomes' && row.payment_request_id && (
          <ListRow
            title={<span className="text-[12.5px] font-normal text-muted">Payment request</span>}
            subtitle="Open linked request"
            onClick={() => nav(`/r/payment_requests/${row.payment_request_id}`)}
            chevron
          />
        )}
        {row.completed_at && <ListRow title={<span className="text-[12.5px] font-normal text-muted">Completed</span>} subtitle={formatDateTime(row.completed_at)} />}
        <ListRow title={<span className="text-[12.5px] font-normal text-muted">Created</span>} subtitle={formatDateTime(row.created_at)} />
        <ListRow title={<span className="text-[12.5px] font-normal text-muted">Last modified</span>} subtitle={formatDateTime(row.updated_at)} />
      </List>

      {!deleted ? (
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => nav(`/r/${t}/${row.id}/edit`)}>
            <Pencil size={15} /> Edit
          </Button>
          <Button onClick={() => nav(`/r/${t}/new?dup=${row.id}`)}>
            <Copy size={15} /> Copy
          </Button>
          <Button variant="danger" onClick={() => setConfirm('delete')}>
            <Trash2 size={15} /> Delete
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" loading={busy} onClick={() => act(() => restoreRecord(t, row.id), 'Restored')}>
            <RotateCcw size={15} /> Restore
          </Button>
          <Button variant="danger" onClick={() => setConfirm('forever')}>
            <Trash2 size={15} /> Delete forever
          </Button>
        </div>
      )}

      {!deleted &&
        (CHILDREN[t] ?? []).map((c) => (
          <ChildSection key={c.table + c.fk} spec={c} parent={row} parentTable={t} nameOf={nameOf} reloadKey={reloadKey} />
        ))}

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <History size={14} /> Edit history
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

function ChildSection({
  spec,
  parent,
  parentTable,
  nameOf,
  reloadKey,
}: {
  spec: ChildSpec;
  parent: Row;
  parentTable: TableName;
  nameOf: (id: string) => string;
  reloadKey: number;
}) {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase
      .from(spec.table)
      .select('*')
      .eq(spec.fk, parent.id)
      .is('deleted_at', null)
      .order(spec.order, { ascending: spec.order === 'name' })
      .limit(30)
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, [spec, parent.id, reloadKey]);

  const params = new URLSearchParams({ [spec.fk]: parent.id, ...(spec.extra ?? {}) });
  if (parent.client_id && parentTable !== 'clients') params.set('client_id', parent.client_id);
  if (parentTable === 'chapters' && parent.subject_id) params.set('subject_id', parent.subject_id);

  return (
    <>
      <SectionTitle
        right={
          <button onClick={() => nav(`/r/${spec.table}/new?${params.toString()}`)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
            <Plus size={14} /> {spec.addLabel ?? 'Add'}
          </button>
        }
      >
        {spec.title}
      </SectionTitle>
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="px-1 text-[13px] text-muted">Nothing yet.</p>
      ) : (
        <List>
          {rows.map((r) => (
            <RecordLine key={r.id} table={spec.table} row={r} nameOf={nameOf} />
          ))}
        </List>
      )}
    </>
  );
}

function HistoryList({ table, rows, nameOf }: { table: TableName; rows: HistoryRow[]; nameOf: (id: string) => string }) {
  if (!rows.length) return <p className="px-1 text-[13px] text-muted">No history yet.</p>;
  const def = TABLES[table];
  const describe = (h: HistoryRow) => {
    if (h.field === '__created') return 'Record created';
    if (h.field === 'deleted_at') return h.new_value ? 'Moved to Recycle Bin' : 'Restored from Recycle Bin';
    if (h.field === 'completed_at' || h.field === 'paid_at') return null;
    const f = def.fields.find((x) => x.key === h.field);
    return `${fieldLabel(table, h.field)}: ${formatValue(f, h.old_value, nameOf)} → ${formatValue(f, h.new_value, nameOf)}`;
  };
  return (
    <List>
      {rows
        .map((h) => ({ h, text: describe(h) }))
        .filter((x) => x.text)
        .map(({ h, text }) => (
          <ListRow key={h.id} title={<span className="whitespace-normal text-[13.5px]">{text}</span>} subtitle={formatDateTime(h.changed_at)} />
        ))}
    </List>
  );
}
