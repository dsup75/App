import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { deleteForever, friendlyError, restoreRecord } from '../lib/db';
import { TABLES, type TableName } from '../lib/tables';
import { formatINR } from '../lib/money';
import { formatDateTime } from '../lib/dates';
import { useToast } from '../context/ToastContext';
import { Confirm, Empty, ErrorBox, List, Page, Spinner } from '../components/ui';

interface BinRow {
  table_name: TableName;
  id: string;
  title: string;
  amount_paise: number | null;
  deleted_at: string;
}

export function RecycleBin() {
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<BinRow[] | null>(null);
  const [error, setError] = useState('');
  const [forever, setForever] = useState<BinRow | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await supabase.from('recycle_bin').select('*').order('deleted_at', { ascending: false }).limit(500);
    if (error) setError(friendlyError(error));
    else setRows(data as BinRow[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const restore = async (r: BinRow) => {
    setBusy(r.id);
    try {
      await restoreRecord(r.table_name, r.id);
      toast(`${TABLES[r.table_name].label} restored`);
      setRows((all) => all?.filter((x) => x.id !== r.id) ?? null);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!forever) return;
    setBusy(forever.id);
    try {
      await deleteForever(forever.table_name, forever.id);
      toast('Deleted permanently');
      setRows((all) => all?.filter((x) => x.id !== forever.id) ?? null);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
      setForever(null);
    }
  };

  return (
    <Page title="Recycle Bin" subtitle="Deleted items stay here until you restore or remove them." back>
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title="Recycle Bin is empty" />
      ) : (
        <List>
          {rows.map((r) => (
            <div key={r.table_name + r.id} className="flex items-center gap-3 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => nav(`/r/${r.table_name}/${r.id}`)}>
                <div className="truncate text-[15px] font-medium">{r.title}</div>
                <div className="truncate text-[12px] text-muted">
                  {TABLES[r.table_name]?.label ?? r.table_name}
                  {r.amount_paise ? ` · ${formatINR(r.amount_paise)}` : ''} · {formatDateTime(r.deleted_at)}
                </div>
              </button>
              <button
                aria-label="Restore"
                disabled={busy === r.id}
                onClick={() => restore(r)}
                className="liquid flex h-9 w-9 items-center justify-center rounded-full text-primary"
              >
                <RotateCcw size={17} />
              </button>
              <button
                aria-label="Delete forever"
                disabled={busy === r.id}
                onClick={() => setForever(r)}
                className="liquid flex h-9 w-9 items-center justify-center rounded-full text-danger"
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </List>
      )}
      <Confirm
        open={!!forever}
        title="Delete forever?"
        message={`"${forever?.title}" will be removed permanently. This cannot be undone.`}
        confirmLabel="Delete forever"
        danger
        loading={!!busy}
        onConfirm={remove}
        onClose={() => setForever(null)}
      />
    </Page>
  );
}
