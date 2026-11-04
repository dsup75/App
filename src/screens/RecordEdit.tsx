import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createRecord, friendlyError, getRecord, updateRecord, type Row } from '../lib/db';
import { TABLES, isTableName, type TableName } from '../lib/tables';
import { todayISO } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { RecordForm, initialFormState } from '../components/RecordForm';
import { Button, Empty, ErrorBox, Page, Sheet, Spinner } from '../components/ui';
import { formatValue } from './RecordDetail';

const MONEY_KEYS = ['amount_paise', 'account_id', 'from_account_id', 'to_account_id', 'txn_date', 'opening_balance_paise', 'category_id', 'area'];

export function RecordEdit() {
  const { table, id } = useParams();
  const [params] = useSearchParams();
  const dupId = params.get('dup');
  const nav = useNavigate();
  const toast = useToast();
  const { nameOf } = useLookups();
  const valid = isTableName(table);
  const t = table as TableName;
  const editing = !!id;

  const [initial, setInitial] = useState<Record<string, string> | null>(null);
  const [original, setOriginal] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ values: Record<string, any>; changes: { label: string; from: string; to: string }[] } | null>(null);

  useEffect(() => {
    if (!valid) return;
    const sourceId = id || dupId;
    if (!sourceId) {
      setInitial(initialFormState(t));
      return;
    }
    getRecord(t, sourceId)
      .then((r) => {
        if (!r) return setError('Record not found.');
        if (id && r.deleted_at) return setError('This record is in the Recycle Bin. Restore it before editing.');
        setOriginal(id ? r : null);
        const state = initialFormState(t, r);
        if (dupId && 'txn_date' in state) state.txn_date = todayISO();
        if (dupId && t === 'tasks') state.status = 'pending';
        setInitial(state);
      })
      .catch((e) => setError(friendlyError(e)));
  }, [valid, t, id, dupId]);

  if (!valid) return <Page title="Not found" back><Empty title="Unknown record type" /></Page>;
  const def = TABLES[t];
  const pageTitle = editing ? `Edit ${def.label}` : dupId ? `Copy ${def.label}` : `New ${def.label}`;

  const save = async (values: Record<string, any>) => {
    setSaving(true);
    try {
      const saved = editing ? await updateRecord(t, id!, values) : await createRecord(t, values);
      toast(editing ? 'Changes saved' : `${def.label} added`);
      nav(`/r/${t}/${saved.id}`, { replace: true });
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const onSubmit = (values: Record<string, any>) => {
    if (!editing || !original) return save(values);
    // Only send changed fields (keeps edit history clean)
    const changed: Record<string, any> = {};
    for (const f of def.fields) {
      const before = original[f.key] ?? null;
      const after = values[f.key] ?? null;
      if (String(before) !== String(after)) changed[f.key] = after;
    }
    if (!Object.keys(changed).length) {
      toast('No changes to save');
      return nav(-1);
    }
    // Financial edits: explain the effect before saving
    const moneyChanges = Object.keys(changed).filter((k) => def.financial && MONEY_KEYS.includes(k));
    if (moneyChanges.length) {
      setPending({
        values: changed,
        changes: moneyChanges.map((k) => {
          const f = def.fields.find((x) => x.key === k);
          return { label: f?.label ?? k, from: formatValue(f, original[k], nameOf), to: formatValue(f, changed[k], nameOf) };
        }),
      });
      return;
    }
    save(changed);
  };

  return (
    <Page title={pageTitle} back>
      {error ? (
        <ErrorBox message={error} />
      ) : !initial ? (
        <Spinner />
      ) : (
        <RecordForm table={t} initial={initial} saving={saving} submitLabel={editing ? 'Save changes' : `Add ${def.label}`} onSubmit={onSubmit} />
      )}

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Confirm money change">
        <div className="space-y-2">
          {pending?.changes.map((c) => (
            <div key={c.label} className="rounded-2xl bg-[var(--hairline)] p-3 text-[14px]">
              <p className="text-[12px] text-muted">{c.label}</p>
              <p>
                <span className="text-muted line-through">{c.from}</span> → <span className="font-semibold">{c.to}</span>
              </p>
            </div>
          ))}
          <p className="pt-1 text-[13px] text-muted">
            Account balances and monthly totals will be recalculated automatically. The old values stay in edit history.
          </p>
        </div>
        <div className="mt-5 flex gap-3">
          <Button full onClick={() => setPending(null)}>Cancel</Button>
          <Button full variant="primary" loading={saving} onClick={() => pending && save(pending.values)}>
            Save
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}
