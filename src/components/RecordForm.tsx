import { useEffect, useState } from 'react';
import { TABLES, type Field, type TableName } from '../lib/tables';
import { parseRupeesToPaise, parseSignedRupeesToPaise, paiseToInput } from '../lib/money';
import { useLookups } from '../lib/useLookups';
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
}: {
  table: TableName;
  initial: Record<string, string>;
  submitLabel: string;
  saving?: boolean;
  onSubmit: (values: Values) => void;
}) {
  const def = TABLES[table];
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { accounts, categories, refs, loaded } = useLookups();

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
          changed = true;
        }
      });
      return changed ? next : f;
    });
  }, [accounts, def.fields]);

  const submit = () => {
    const { values, errors: errs } = toDbValues(table, form);
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
      case 'select':
        return (
          <select className="field" value={v} onChange={(e) => set(f.key, e.target.value)}>
            {!f.required && !f.default && <option value="">—</option>}
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
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
        {errors._form && <p className="px-0.5 text-[13px] text-danger">{errors._form}</p>}
      </Card>
      <Button variant="primary" size="lg" full loading={saving} onClick={submit}>
        {submitLabel}
      </Button>
    </div>
  );
}
