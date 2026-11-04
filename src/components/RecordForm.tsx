import { useEffect, useState } from 'react';
import { TABLES, type Field, type TableName } from '../lib/tables';
import { parseRupeesToPaise, parseSignedRupeesToPaise, paiseToInput } from '../lib/money';
import { useLookups } from '../lib/useLookups';
import { useCustomOptions } from '../lib/options';
import { supabase } from '../lib/supabase';
import { MoneyExtras, extrasToDb, initialExtras, type Extras } from './MoneyExtras';
import { Button, Card, FormRow, Toggle } from './ui';

type Values = Record<string, any>;

function toFormString(f: Field, raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  switch (f.type) {
    case 'money':
    case 'signed_money':
    case 'rate':
      return paiseToInput(Number(raw));
    case 'bool':
      return raw ? 'true' : 'false';
    case 'time':
      return String(raw).slice(0, 5);
    case 'json':
      return JSON.stringify(raw);
    default:
      return String(raw);
  }
}

/** Build editable string state from a DB row (or defaults for a new record). */
export function initialFormState(table: TableName, row?: Values | null, prefill?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of TABLES[table].fields) {
    const raw = row ? row[f.key] : f.default?.();
    out[f.key] = toFormString(f, raw);
    if (!row && prefill && prefill[f.key] !== undefined) out[f.key] = prefill[f.key];
  }
  return out;
}

/** Convert form strings → DB values. Returns errors per field. */
export function toDbValues(table: TableName, form: Record<string, string>): { values: Values; errors: Record<string, string> } {
  const def = TABLES[table];
  const values: Values = {};
  const errors: Record<string, string> = {};
  for (const f of def.fields) {
    if (f.type === 'json') continue; // edited by custom screens only
    const s = (form[f.key] ?? '').trim();
    if (f.type === 'bool') {
      values[f.key] = s === 'true';
      continue;
    }
    if (!s) {
      if (f.required) errors[f.key] = `${f.label.replace(/ \(.*\)$/, '')} is required`;
      values[f.key] = f.type === 'signed_money' || f.type === 'rate' ? 0 : null;
      continue;
    }
    if (f.type === 'money') {
      const p = parseRupeesToPaise(s);
      if (p === null || p <= 0) errors[f.key] = 'Enter a valid amount, e.g. 1500 or 1500.50';
      else values[f.key] = p;
    } else if (f.type === 'signed_money') {
      const p = parseSignedRupeesToPaise(s);
      if (p === null) errors[f.key] = 'Enter a valid amount';
      else values[f.key] = p;
    } else if (f.type === 'rate') {
      const p = parseRupeesToPaise(s);
      if (p === null || p > 100000) errors[f.key] = 'Enter a rate like 12 or 12.5';
      else values[f.key] = p;
    } else if (f.type === 'int') {
      if (!/^-?\d+$/.test(s)) errors[f.key] = 'Enter a whole number';
      else values[f.key] = Number(s);
    } else {
      values[f.key] = s;
    }
  }
  const extra = def.validate?.(values);
  if (extra) errors._form = extra;
  return { values, errors };
}

export function RecordForm({
  table,
  initial,
  submitLabel,
  saving,
  onSubmit,
  extrasInitial,
}: {
  table: TableName;
  initial: Record<string, string>;
  submitLabel: string;
  saving?: boolean;
  onSubmit: (values: Values, allocs?: { id?: string; income_id: string; amount_paise: number }[]) => void;
  extrasInitial?: Extras;
}) {
  const def = TABLES[table];
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { accounts, categories, refs, loaded } = useLookups();
  const { optionsFor } = useCustomOptions();
  const money = table === 'incomes' || table === 'expenses';
  const [ex, setEx] = useState<Extras>(extrasInitial ?? initialExtras(null));
  const [contacts, setContacts] = useState<{ id: string; name: string; role: string | null }[]>([]);
  const [typeName, setTypeName] = useState(false);

  // Client staff names for "Payer name"
  useEffect(() => {
    if (table !== 'incomes' || !form.client_id) {
      setContacts([]);
      return;
    }
    supabase
      .from('client_contacts')
      .select('id,name,role')
      .eq('client_id', form.client_id)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setContacts((data as any[]) ?? []));
  }, [table, form.client_id]);

  const set = (k: string, v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Clear dependent refs when their parent changes
      def.fields.forEach((fd) => {
        if (fd.filterBy?.field === k && next[fd.key]) {
          const row = refs[fd.refTable!]?.find((r) => r.id === next[fd.key]);
          if (row && v && row[fd.filterBy.column] !== v) next[fd.key] = '';
        }
      });
      // Picking an account that is a UPI app fills "which app" automatically
      if ((k === 'account_id' || k === 'from_account_id') && 'payment_app' in next) {
        const acc = accounts.find((a) => a.id === v);
        if (acc?.upi_app) next.payment_app = acc.upi_app;
        else if (acc?.type === 'cash') next.payment_app = 'cash';
        if (acc?.type === 'cash' && 'payment_method' in next) next.payment_method = 'cash';
        else if (acc?.upi_app && 'payment_method' in next && next.payment_method === 'cash') next.payment_method = 'upi';
      }
      // Business payment mode → business area (can still be changed)
      if (k === 'payment_mode' && v === 'business' && next.area === 'personal') next.area = 'business';
      return next;
    });
    if (errors[k] || errors._form) setErrors((e) => ({ ...e, [k]: '', _form: '' }));
  };

  // Pre-select the first active account for empty required account fields
  useEffect(() => {
    const active = accounts.filter((a) => !a.deleted_at);
    if (!active.length) return;
    setForm((f) => {
      const next = { ...f };
      let changed = false;
      def.fields.forEach((fd) => {
        if (fd.type !== 'account' || !fd.required || next[fd.key]) return;
        const pick = fd.key === 'to_account_id' ? active.find((a) => a.id !== next.from_account_id) : active[0];
        if (pick) {
          next[fd.key] = pick.id;
          if ('payment_app' in next && !next.payment_app && pick.upi_app) next.payment_app = pick.upi_app;
          changed = true;
        }
      });
      return changed ? next : f;
    });
  }, [accounts, def.fields]);

  const submit = () => {
    const { values, errors: errs } = toDbValues(table, form);
    if (!Object.values(errs).some(Boolean) && money) {
      const r = extrasToDb(table as 'incomes' | 'expenses', ex, values.amount_paise ?? 0, accounts);
      if (typeof r === 'string') errs._form = r;
      else {
        values.sources = r.sources;
        if (r.sources.length) {
          values.account_id = r.sources[0].account_id;
          values.payment_app = null;
        }
        if (table === 'expenses') values.split_with = r.split_with;
        setErrors(errs);
        return onSubmit(values, r.allocs);
      }
    }
    setErrors(errs);
    if (!Object.values(errs).some(Boolean)) onSubmit(values);
  };

  const renderField = (f: Field) => {
    const v = form[f.key] ?? '';
    switch (f.type) {
      case 'textarea':
        return <textarea className="field min-h-[84px]" value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
      case 'money':
      case 'signed_money':
        return (
          <input
            className="field text-[18px] font-semibold"
            inputMode="decimal"
            value={v}
            placeholder="0"
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
      case 'rate':
        return <input className="field" inputMode="decimal" value={v} placeholder="0" onChange={(e) => set(f.key, e.target.value)} />;
      case 'int':
        return <input className="field" inputMode="numeric" value={v} placeholder={f.placeholder ?? '0'} onChange={(e) => set(f.key, e.target.value)} />;
      case 'date':
        return <input type="date" className="field" value={v} onChange={(e) => set(f.key, e.target.value)} />;
      case 'time':
        return <input type="time" className="field" value={v} onChange={(e) => set(f.key, e.target.value)} />;
      case 'bool':
        return (
          <div className="flex items-center justify-between rounded-[12px] bg-[var(--field)] px-3 py-2" style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
            <span className="text-[14px]">{v === 'true' ? 'Yes' : 'No'}</span>
            <Toggle checked={v === 'true'} onChange={(x) => set(f.key, x ? 'true' : 'false')} />
          </div>
        );
      case 'select': {
        const opts = f.listKey ? optionsFor(f.listKey, f.options ?? []) : f.options ?? [];
        const withCurrent = v && !opts.some((o) => o.value === v) ? [...opts, { value: v, label: v }] : opts;
        return (
          <select className="field" value={v} onChange={(e) => set(f.key, e.target.value)}>
            {!f.required && !f.default && <option value="">—</option>}
            {withCurrent.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
      case 'account': {
        const opts = accounts.filter((a) => !a.deleted_at || a.id === v);
        return (
          <select className="field" value={v} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{loaded ? (f.required ? 'Select account' : 'None') : 'Loading…'}</option>
            {opts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.upi_id ? ` · ${a.upi_id}` : ''}
                {a.deleted_at ? ' (in Recycle Bin)' : ''}
              </option>
            ))}
          </select>
        );
      }
      case 'category': {
        const opts = categories.filter((c) => c.kind === f.categoryKind && (!c.deleted_at || c.id === v));
        return (
          <select className="field" value={v} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">No category</option>
            {opts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        );
      }
      case 'ref': {
        let opts = (refs[f.refTable!] ?? []).filter((r) => !r.deleted_at || r.id === v);
        if (f.filterBy && form[f.filterBy.field]) opts = opts.filter((r) => r[f.filterBy!.column] === form[f.filterBy!.field] || r.id === v);
        return (
          <select className="field" value={v} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{loaded ? (f.required ? 'Select…' : 'None') : 'Loading…'}</option>
            {opts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        );
      }
      case 'json':
        return null;
      default:
        if (table === 'incomes' && f.key === 'payer_name' && contacts.length && !typeName) {
          const known = contacts.some((c) => c.name === v);
          return (
            <select
              className="field"
              value={known ? v : v ? '__other' : ''}
              onChange={(e) => {
                if (e.target.value === '__other') {
                  setTypeName(true);
                  return;
                }
                set(f.key, e.target.value);
                if (e.target.value && form.payer_type === 'client') set('payer_type', 'client_staff');
              }}
            >
              <option value="">— Select staff —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                  {c.role ? ` (${c.role})` : ''}
                </option>
              ))}
              <option value="__other">{v && !known ? `${v} (typed)` : 'Someone else… (type name)'}</option>
            </select>
          );
        }
        return <input className="field" value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    <div className="space-y-3.5">
      <Card className="space-y-3.5">
        {def.fields
          .filter((f) => !f.hidden && f.type !== 'json')
          .filter((f) => !(table === 'loans' && f.key === 'interest_rate_bp' && form.interest_type !== 'simple'))
          .map((f) => (
            <FormRow key={f.key} label={f.label} error={errors[f.key]} hint={f.hint}>
              {renderField(f)}
            </FormRow>
          ))}
        {!money && errors._form && <p className="px-0.5 text-[13px] text-danger">{errors._form}</p>}
      </Card>
      {money && <MoneyExtras table={table as 'incomes' | 'expenses'} ex={ex} setEx={setEx} totalText={form.amount_paise ?? ''} accounts={accounts} />}
      {money && errors._form && <p className="px-1 text-[13px] text-danger">{errors._form}</p>}
      <Button variant="primary" size="lg" full loading={saving} onClick={submit}>
        {submitLabel}
      </Button>
    </div>
  );
}
