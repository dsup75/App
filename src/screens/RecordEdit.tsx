import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createRecord, friendlyError, getLines, getLinks, getRecord, isMoneyTable, saveMoneyEntry, updateRecord, type LineInput, type LinkInput, type MoneyTable, type Row } from '../lib/db';
import { TABLES, isTableName, type TableName } from '../lib/tables';
import { todayISO } from '../lib/dates';
import { paiseToInput } from '../lib/money';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { RecordForm, initialFormState } from '../components/RecordForm';
import { linksFromDb, splitFromDb, type LinkRow, type SplitRow } from '../components/MoneyExtras';
import { MoneyForm, blankLine, linesFromDb, type LineState } from '../components/MoneyForm';
import { formatINR } from '../lib/money';
import { advanceRule } from '../lib/recurring';
import { Button, Empty, ErrorBox, Page, Sheet, Spinner } from '../components/ui';
import { formatValue } from './RecordDetail';

const MONEY_KEYS = [
  'amount_paise', 'account_id', 'from_account_id', 'to_account_id', 'txn_date', 'opening_balance_paise', 'category_id',
  'invoice_id', 'income_id', 'expense_id', 'principal_paise', 'interest_paise', 'loan_id', 'direction', 'target_paise', 'goal_id',
];

/** Remember the last account / app / mode used for each kind of entry (this phone only) */
function lastUsed(t: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`last-used:${t}`) || '{}');
  } catch {
    return {};
  }
}
function rememberLast(t: string, parent: Record<string, unknown>, lines: LineInput[]) {
  try {
    const first = lines[0];
    const v: Record<string, string> = {};
    if (first?.account_id) v.account_id = first.account_id;
    if (first?.payment_app) v.payment_app = first.payment_app;
    const out = lines.find((l) => l.direction === 'out');
    const inn = lines.find((l) => l.direction === 'in');
    if (t === 'transfers' && out && inn) {
      v.from_account_id = out.account_id;
      v.to_account_id = inn.account_id;
    }
    for (const k of ['payment_mode', 'area']) if (typeof parent[k] === 'string') v[k] = parent[k] as string;
    localStorage.setItem(`last-used:${t}`, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function totalOf(t: MoneyTable, r: Row): number {
  if (t === 'loans') return Number(r.principal_paise ?? 0);
  if (t === 'loan_repayments') return Number(r.principal_paise ?? 0) + Number(r.interest_paise ?? 0);
  return Number(r.amount_paise ?? 0);
}

function lineDir(t: MoneyTable, prefill: Record<string, string>): 'in' | 'out' {
  if (t === 'incomes') return 'in';
  if (t === 'loans') return prefill.direction === 'borrowed' ? 'in' : 'out';
  return 'out';
}

/** Turn ?amount_paise=…&account_id=… style prefill into the first payment line */
function prefillLines(t: MoneyTable, p: Record<string, string>): LineState[] {
  const base = {
    amount: p.amount_paise ?? p.principal_paise ?? '',
    payment_app: p.payment_app ?? '',
    reference: p.reference ?? '',
    party_name: p.payer_name ?? '',
    ...(p.txn_date || p.start_date ? { txn_date: p.txn_date || p.start_date } : {}),
    ...(p.txn_time ? { txn_time: p.txn_time } : {}),
  };
  if (t === 'transfers')
    return [blankLine('out', { ...base, account_id: p.from_account_id ?? '' }), blankLine('in', { ...base, account_id: p.to_account_id ?? '' })];
  return [blankLine(lineDir(t, p), { ...base, account_id: p.account_id ?? '' })];
}

/** Fallback when an old row has no lines yet */
function legacyLines(t: MoneyTable, r: Row): LineState[] {
  const amt = paiseToInput(totalOf(t, r));
  if (t === 'transfers')
    return [
      blankLine('out', { amount: amt, account_id: r.from_account_id ?? '', txn_date: r.txn_date ?? todayISO() }),
      blankLine('in', { amount: amt, account_id: r.to_account_id ?? '', txn_date: r.txn_date ?? todayISO() }),
    ];
  return [blankLine(lineDir(t, { direction: r.direction }), { amount: amt, account_id: r.account_id ?? '', txn_date: r.txn_date ?? r.start_date ?? todayISO(), payment_app: r.payment_app ?? '', reference: r.reference ?? '' })];
}

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
  const money = valid && isMoneyTable(t);
  const [mInit, setMInit] = useState<{ lines: LineState[]; links: LinkRow[]; split: SplitRow[] } | null>(null);
  const [mPending, setMPending] = useState<{ parent: Record<string, unknown>; lines: LineInput[]; links: LinkInput[] | null; from: number; to: number } | null>(null);

  useEffect(() => {
    if (!valid) return;
    const sourceId = id || dupId;
    if (!sourceId && fromRequest && t === 'incomes') {
      // "Mark as paid" → prefill income from the payment request
      getRecord('payment_requests', fromRequest)
        .then((req) => {
          const state = initialFormState('incomes');
          const line = blankLine('in');
          if (req) {
            state.title = req.client_name ? `${req.client_name} — ${req.title}` : req.title;
            line.amount = paiseToInput(Number(req.amount_paise));
            line.party_name = req.client_name ?? '';
            state.client_name = req.client_name ?? '';
            if (req.account_id) line.account_id = req.account_id;
            state.payment_request_id = req.id;
            state.area = 'business';
          }
          setMInit({ lines: [line], links: [], split: [] });
          setInitial(state);
        })
        .catch((e) => setError(friendlyError(e)));
      return;
    }
    if (!sourceId) {
      // Any ?field=value in the URL pre-fills the form (e.g. ?client_id=… from a client page)
      const prefill: Record<string, string> = {};
      const raw: Record<string, string> = {};
      params.forEach((value, key) => {
        raw[key] = value;
        if (TABLES[t].fields.some((f) => f.key === key)) prefill[key] = value;
      });
      if (isMoneyTable(t)) {
        const last = lastUsed(t);
        const withLast = { ...last, ...raw };
        if (raw.payment_app && !raw.account_id) delete withLast.account_id; // app chosen → MoneyForm picks its account
        setMInit({ lines: prefillLines(t, withLast), links: [], split: [] });
        for (const k of ['payment_mode', 'area']) if (!prefill[k] && last[k] && TABLES[t].fields.some((f) => f.key === k)) prefill[k] = last[k];
      }
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
        if (isMoneyTable(t)) {
          Promise.all([getLines(t, sourceId), id ? getLinks(t, sourceId) : Promise.resolve([])])
            .then(([ls, lk]) => {
              const lines = ls.length ? linesFromDb(ls, !!id) : legacyLines(t, r);
              setMInit({ lines, links: linksFromDb(lk), split: t === 'expenses' ? splitFromDb(r.split_with) : [] });
              setInitial(state);
            })
            .catch((e) => setError(friendlyError(e)));
          return;
        }
        setInitial(state);
      })
      .catch((e) => setError(friendlyError(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, t, id, dupId, fromRequest]);

  if (!valid) return <Page title="Not found" back><Empty title="Unknown record type" /></Page>;
  const def = TABLES[t];
  if (t === 'group_expenses') return <GroupExpenseRedirect id={id ?? dupId} groupId={params.get('group_id')} />;
  const pageTitle = editing ? `Edit ${def.label}` : dupId ? `Copy ${def.label}` : fromRequest ? 'Record payment' : `New ${def.label}`;

  const saveMoney = async (p: { parent: Record<string, unknown>; lines: LineInput[]; links: LinkInput[] | null }) => {
    setSaving(true);
    try {
      const newId = await saveMoneyEntry(t as MoneyTable, editing ? id! : null, p.parent, p.lines, p.links);
      if (!editing) rememberLast(t, p.parent, p.lines);
      const ruleId = params.get('from_rule');
      if (ruleId && !editing) {
        const rule = await getRecord('recurring_rules', ruleId).catch(() => null);
        if (rule) await advanceRule(rule).catch(() => {});
      }
      toast(editing ? 'Changes saved' : `${def.label} added`);
      nav(`/r/${t}/${newId}`, { replace: true });
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setSaving(false);
      setMPending(null);
    }
  };

  const onMoneySubmit = (parent: Record<string, unknown>, lines: LineInput[], links: LinkInput[] | null) => {
    const ruleId = params.get('from_rule');
    if (ruleId && !editing) {
      parent.recurring_rule_id = ruleId;
      parent.due_for = params.get('due_for') || null;
    }
    if (dupId || fromRequest) {
      delete parent.payment_request_id;
      if (fromRequest) parent.payment_request_id = fromRequest;
    }
    if (editing && original) {
      const from = totalOf(t as MoneyTable, original);
      const to = lines.filter((l) => t !== 'transfers' || l.direction === 'out').reduce((s, l) => s + l.amount_paise, 0);
      if (from !== to) return setMPending({ parent, lines, links, from, to });
    }
    saveMoney({ parent, lines, links });
  };

  const save = async (values: Record<string, any>) => {
    setSaving(true);
    try {
      const saved = Object.keys(values).length || !editing ? (editing ? await updateRecord(t, id!, values) : await createRecord(t, values)) : { id: id! };
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
    const same = (a: unknown, b: unknown) => (typeof a === 'object' || typeof b === 'object' ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null) : String(a ?? null) === String(b ?? null));
    for (const f of def.fields) {
      if (!(f.key in values)) continue;
      if (!same(original[f.key], values[f.key])) changed[f.key] = values[f.key] ?? null;
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
      ) : !initial || (money && !mInit) ? (
        <Spinner />
      ) : money && mInit ? (
        <MoneyForm
          table={t as MoneyTable}
          initial={initial}
          initialLines={mInit.lines}
          initialLinks={mInit.links}
          initialSplit={mInit.split}
          saving={saving}
          submitLabel={editing ? 'Save' : 'Add'}
          onSubmit={onMoneySubmit}
        />
      ) : (
        <RecordForm table={t} initial={initial} saving={saving} submitLabel={editing ? 'Save changes' : `Add ${def.label}`} onSubmit={onSubmit} />
      )}

      <Sheet open={!!mPending} onClose={() => setMPending(null)} title="Confirm money change">
        <div className="rounded-2xl bg-[var(--hairline)] p-3 text-[14px]">
          <p className="text-[12px] text-muted">Total amount</p>
          <p>
            <span className="text-muted line-through">{formatINR(mPending?.from)}</span> → <span className="font-semibold">{formatINR(mPending?.to)}</span>
          </p>
        </div>
        <p className="pt-3 text-[13px] text-muted">Account balances and monthly totals will be recalculated automatically. The old values stay in edit history.</p>
        <div className="mt-5 flex gap-3">
          <Button full onClick={() => setMPending(null)}>Cancel</Button>
          <Button full variant="primary" loading={saving} onClick={() => mPending && saveMoney(mPending)}>
            Save
          </Button>
        </div>
      </Sheet>

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
