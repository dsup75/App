import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createRecord, friendlyError, getRecord, updateRecord, type Row } from '../lib/db';
import { TABLES, isTableName, type TableName } from '../lib/tables';
import { todayISO } from '../lib/dates';
import { paiseToInput } from '../lib/money';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { RecordForm, initialFormState } from '../components/RecordForm';
import { initialExtras, type Extras } from '../components/MoneyExtras';
import { supabase } from '../lib/supabase';
import { softDelete } from '../lib/db';
import { Button, Empty, ErrorBox, Page, Sheet, Spinner } from '../components/ui';
import { formatValue } from './RecordDetail';

const MONEY_KEYS = [
  'amount_paise', 'account_id', 'from_account_id', 'to_account_id', 'txn_date', 'opening_balance_paise', 'category_id',
  'invoice_id', 'income_id', 'expense_id', 'principal_paise', 'interest_paise', 'loan_id', 'direction', 'target_paise', 'goal_id',
];

/** Group expenses have a custom editor on the group screen */
function GroupExpenseRedirect({ id, groupId }: { id: string | null | undefined; groupId: string | null }) {
  const nav = useNavigate();
  useEffect(() => {
    if (groupId) nav(`/groups/${groupId}?expense=${id ?? 'new'}`, { replace: true });
    else if (id)
      getRecord('group_expenses', id).then((r) => r && nav(`/groups/${r.group_id}?expense=${id}`, { replace: true }));
    else nav('/groups', { replace: true });
  }, [id, groupId, nav]);
  return <Spinner />;
}

export function RecordEdit() {
  const { table, id } = useParams();
  const [params] = useSearchParams();
  const dupId = params.get('dup');
  const fromRequest = params.get('from_request');
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
  const [extras, setExtras] = useState<Extras | undefined>(undefined);
  const [origAllocs, setOrigAllocs] = useState<{ id: string; income_id: string; amount_paise: number }[]>([]);
  const [newAllocs, setNewAllocs] = useState<{ id?: string; income_id: string; amount_paise: number }[] | null>(null);

  useEffect(() => {
    if (!valid) return;
    const sourceId = id || dupId;
    if (!sourceId && fromRequest && t === 'incomes') {
      // "Mark as paid" → prefill income from the payment request
      getRecord('payment_requests', fromRequest)
        .then((req) => {
          const state = initialFormState('incomes');
          if (req) {
            state.title = req.client_name ? `${req.client_name} — ${req.title}` : req.title;
            state.amount_paise = paiseToInput(Number(req.amount_paise));
            state.client_name = req.client_name ?? '';
            if (req.account_id) state.account_id = req.account_id;
            state.payment_request_id = req.id;
            state.area = 'business';
          }
          setInitial(state);
        })
        .catch((e) => setError(friendlyError(e)));
      return;
    }
    if (!sourceId) {
      // Any ?field=value in the URL pre-fills the form (e.g. ?client_id=… from a client page)
      const prefill: Record<string, string> = {};
      params.forEach((value, key) => {
        if (TABLES[t].fields.some((f) => f.key === key)) prefill[key] = value;
      });
      setInitial(initialFormState(t, null, prefill));
      return;
    }
    getRecord(t, sourceId)
      .then((r) => {
        if (!r) return setError('Record not found.');
        if (id && r.deleted_at) return setError('This record is in the Recycle Bin. Restore it before editing.');
        setOriginal(id ? r : null);
        const state = initialFormState(t, r);
        if (dupId && 'txn_date' in state) state.txn_date = todayISO();
        if (dupId && (t === 'tasks' || t === 'payment_requests')) state.status = 'pending';
        if (dupId && 'payment_request_id' in state) state.payment_request_id = '';
        if (t === 'expenses' && id) {
          supabase
            .from('allocations')
            .select('id,income_id,amount_paise')
            .eq('expense_id', id)
            .is('deleted_at', null)
            .then(({ data }) => {
              const a = (data as any[]) ?? [];
              setOrigAllocs(a);
              setExtras(initialExtras(r, a));
              setInitial(state);
            });
          return;
        }
        if (t === 'incomes' || t === 'expenses') setExtras(initialExtras(r));
        setInitial(state);
      })
      .catch((e) => setError(friendlyError(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, t, id, dupId, fromRequest]);

  if (!valid) return <Page title="Not found" back><Empty title="Unknown record type" /></Page>;
  const def = TABLES[t];
  if (t === 'group_expenses') return <GroupExpenseRedirect id={id ?? dupId} groupId={params.get('group_id')} />;
  const pageTitle = editing ? `Edit ${def.label}` : dupId ? `Copy ${def.label}` : fromRequest ? 'Record payment' : `New ${def.label}`;

  const syncAllocs = async (expenseId: string, list: { id?: string; income_id: string; amount_paise: number }[] | null) => {
    if (t !== 'expenses' || !list) return;
    const keep = new Set(list.filter((a) => a.id).map((a) => a.id));
    for (const o of origAllocs) if (!keep.has(o.id)) await softDelete('allocations', o.id);
    for (const a of list) {
      const o = origAllocs.find((x) => x.id === a.id);
      if (o) {
        if (o.income_id !== a.income_id || o.amount_paise !== a.amount_paise)
          await updateRecord('allocations', o.id, { income_id: a.income_id, amount_paise: a.amount_paise });
      } else await createRecord('allocations', { expense_id: expenseId, income_id: a.income_id, amount_paise: a.amount_paise });
    }
  };

  const save = async (values: Record<string, any>, allocs = newAllocs) => {
    setSaving(true);
    try {
      const saved = Object.keys(values).length || !editing ? (editing ? await updateRecord(t, id!, values) : await createRecord(t, values)) : { id: id! };
      try {
        await syncAllocs(saved.id, allocs);
      } catch (e) {
        toast(`Saved, but income link failed: ${friendlyError(e)}`, 'error');
        nav(`/r/${t}/${saved.id}`, { replace: true });
        return;
      }
      toast(editing ? 'Changes saved' : `${def.label} added`);
      nav(`/r/${t}/${saved.id}`, { replace: true });
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const onSubmit = (values: Record<string, any>, allocs?: { id?: string; income_id: string; amount_paise: number }[]) => {
    setNewAllocs(allocs ?? null);
    if (!editing || !original) return save(values, allocs ?? null);
    // Only send changed fields (keeps edit history clean)
    const changed: Record<string, any> = {};
    const same = (a: unknown, b: unknown) => (typeof a === 'object' || typeof b === 'object' ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null) : String(a ?? null) === String(b ?? null));
    for (const f of def.fields) {
      if (!(f.key in values)) continue;
      if (!same(original[f.key], values[f.key])) changed[f.key] = values[f.key] ?? null;
    }
    const allocsChanged =
      t === 'expenses' &&
      JSON.stringify((allocs ?? []).map((a) => [a.id ?? '', a.income_id, a.amount_paise])) !== JSON.stringify(origAllocs.map((a) => [a.id, a.income_id, a.amount_paise]));
    if (!Object.keys(changed).length && allocsChanged) return save({}, allocs ?? null);
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
    save(changed, allocs ?? null);
  };

  return (
    <Page title={pageTitle} back>
      {error ? (
        <ErrorBox message={error} />
      ) : !initial ? (
        <Spinner />
      ) : (
        <RecordForm table={t} initial={initial} extrasInitial={extras} saving={saving} submitLabel={editing ? "Save changes" : `Add ${def.label}`} onSubmit={onSubmit} />
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
