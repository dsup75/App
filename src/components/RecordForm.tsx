import { useEffect, useState } from 'react';
import { TABLES, type Field, type TableName } from '../lib/tables';
import { parseRupeesToPaise, parseSignedRupeesToPaise, paiseToInput } from '../lib/money';
import { useLookups } from '../lib/useLookups';
import { Button, Card, FormRow } from './ui';

type Values = Record<string, any>;

/** Build editable string state from a DB row (or defaults for a new record). */
export function initialFormState(table: TableName, row?: Values | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of TABLES[table].fields) {
    const raw = row ? row[f.key] : f.default?.();
    if (f.type === 'money' || f.type === 'signed_money') out[f.key] = raw === undefined || raw === null ? '' : paiseToInput(Number(raw));
    else out[f.key] = raw === undefined || raw === null ? '' : String(raw);
  }
  return out;
}

/** Convert form strings → DB values. Returns errors per field. */
export function toDbValues(table: TableName, form: Record<string, string>): { values: Values; errors: Record<string, string> } {
  const def = TABLES[table];
  const values: Values = {};
  const errors: Record<string, string> = {};
  for (const f of def.fields) {
    const s = (form[f.key] ?? '').trim();
    if (!s) {
      if (f.required) errors[f.key] = `${f.label.replace(' (₹)', '')} is required`;
      values[f.key] = f.type === 'signed_money' ? 0 : null;
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
  const { accounts, categories, loaded } = useLookups();

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k] || errors._form) setErrors((e) => ({ ...e, [k]: '', _form: '' }));
  };

  // Pre-select the first active account for empty account fields
  useEffect(() => {
    const active = accounts.filter((a) => !a.deleted_at);
    if (!active.length) return;
    setForm((f) => {
      const next = { ...f };
      let changed = false;
      def.fields.forEach((fd) => {
        if (fd.type !== 'account' || next[fd.key]) return;
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
        return <textarea className="field min-h-[90px]" value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
      case 'money':
      case 'signed_money':
        return (
          <input
            className="field text-[22px] font-semibold"
            inputMode="decimal"
            value={v}
            placeholder="0"
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
      case 'date':
        return <input type="date" className="field" value={v} onChange={(e) => set(f.key, e.target.value)} />;
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
            <option value="">{loaded ? 'Select account' : 'Loading…'}</option>
            {opts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
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
      default:
        return <input className="field" value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        {def.fields.map((f) => (
          <FormRow key={f.key} label={f.label} error={errors[f.key]}>
            {renderField(f)}
          </FormRow>
        ))}
        {errors._form && <p className="px-1 text-[13px] text-danger">{errors._form}</p>}
      </Card>
      <Button variant="primary" size="lg" full loading={saving} onClick={submit}>
        {submitLabel}
      </Button>
    </div>
  );
}
