// Extra sections for money entries:
//  • which income(s) paid for this (expenses, udhaar given, transfers)
//  • split an expense with other people
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, X, Link2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { splitEqual } from '../lib/split';
import type { LinkInput } from '../lib/db';
import { Toggle, cx } from './ui';

export interface LinkRow {
  id?: string;
  income_id: string;
  amount: string;
}
export interface SplitRow {
  name: string;
  amount: string;
}

export function linksFromDb(rows: { id: string; income_id: string; amount_paise: number }[]): LinkRow[] {
  return rows.map((a) => ({ id: a.id, income_id: a.income_id, amount: paiseToInput(a.amount_paise) }));
}

export function splitFromDb(v: unknown): SplitRow[] {
  return Array.isArray(v) ? v.map((s: any) => ({ name: s.name, amount: paiseToInput(Number(s.amount_paise)) })) : [];
}

export function linksToDb(rows: LinkRow[], total: number): LinkInput[] | string {
  const out: LinkInput[] = [];
  for (const a of rows.filter((x) => x.income_id || x.amount.trim())) {
    const p = parseRupeesToPaise(a.amount);
    if (!a.income_id || !p) return 'Each linked income needs an amount.';
    out.push({ id: a.id, income_id: a.income_id, amount_paise: p });
  }
  const used = out.reduce((s, x) => s + x.amount_paise, 0);
  if (used > total) return `Linked income (${formatINR(used)}) is more than this entry (${formatINR(total)}).`;
  return out;
}

export function splitToDb(rows: SplitRow[], on: boolean, total: number): { name: string; amount_paise: number }[] | string {
  if (!on) return [];
  const out: { name: string; amount_paise: number }[] = [];
  for (const r of rows.filter((s) => s.name.trim() || s.amount.trim())) {
    const p = parseRupeesToPaise(r.amount);
    if (!r.name.trim() || !p) return 'Each person in the split needs a name and their share.';
    out.push({ name: r.name.trim(), amount_paise: p });
  }
  if (!out.length) return 'Add the people you split with, or turn the split off.';
  const others = out.reduce((s, x) => s + x.amount_paise, 0);
  if (others > total) return `Others' shares (${formatINR(others)}) are more than the total.`;
  return out;
}

const sumOf = (rows: { amount: string }[]) => rows.reduce((s, r) => s + (parseRupeesToPaise(r.amount) ?? 0), 0);

/** "Paid out of which income?" */
export function LinksSection({
  title,
  hint,
  links,
  setLinks,
  total,
}: {
  title: string;
  hint: string;
  links: LinkRow[];
  setLinks: (fn: (l: LinkRow[]) => LinkRow[]) => void;
  total: number;
}) {
  const [incomes, setIncomes] = useState<{ id: string; title: string; amount_paise: number; txn_date: string }[]>([]);
  const [left, setLeft] = useState<Map<string, number>>(new Map());
  // amounts this entry already holds (when editing) are available again
  const [own] = useState(() => new Map(links.filter((a) => a.id).map((a) => [a.income_id, parseRupeesToPaise(a.amount) ?? 0])));

  useEffect(() => {
    Promise.all([
      supabase.from('incomes').select('id,title,amount_paise,txn_date').is('deleted_at', null).order('txn_date', { ascending: false }).limit(200),
      supabase.from('income_usage').select('id,left_paise').limit(5000),
    ]).then(([a, b]) => {
      setIncomes((a.data as any[]) ?? []);
      setLeft(new Map(((b.data as any[]) ?? []).map((x) => [x.id, Number(x.left_paise)])));
    });
  }, []);

  const available = (id: string, full: number) => (left.has(id) ? left.get(id)! : full) + (own.get(id) ?? 0);

  return (
    <Section icon={<Link2 size={15} />} title={title} hint={hint} on={links.length > 0} onToggle={(v) => setLinks(() => (v ? [{ income_id: '', amount: '' }] : []))}>
      {links.map((a, i) => (
        <div key={i} className="flex gap-2">
          <select
            className="field min-w-0 flex-1"
            value={a.income_id}
            onChange={(e) => {
              const id = e.target.value;
              setLinks((x) => {
                const otherLinked = x.reduce((s, y, j) => (j === i ? s : s + (parseRupeesToPaise(y.amount) ?? 0)), 0);
                const inc = incomes.find((n) => n.id === id);
                const can = inc ? Math.min(available(id, inc.amount_paise), Math.max(0, total - otherLinked)) : 0;
                return x.map((y, j) => (j === i ? { ...y, income_id: id, amount: can ? paiseToInput(can) : y.amount } : y));
              });
            }}
          >
            <option value="">Choose income</option>
            {incomes
              .filter((inc) => available(inc.id, inc.amount_paise) > 0 || inc.id === a.income_id)
              .map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.title} · {formatINR(available(inc.id, inc.amount_paise))} left of {formatINR(inc.amount_paise)}
                </option>
              ))}
          </select>
          <input className="field w-28" inputMode="decimal" placeholder="₹" value={a.amount} onChange={(e) => setLinks((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
          <button aria-label="Remove" className="px-1 text-muted" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))}>
            <X size={16} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button className="liquid h-8 rounded-full px-3 text-[12.5px] font-semibold" onClick={() => setLinks((x) => [...x, { income_id: '', amount: '' }])}>
          <Plus size={13} className="mr-1 inline" />
          Income
        </button>
        {total > 0 && <span className={cx('text-[12px]', sumOf(links) > total ? 'text-danger' : 'text-muted')}>{formatINR(sumOf(links))} of {formatINR(total)} linked</span>}
      </div>
    </Section>
  );
}

/** "Split with others" */
export function SplitSection({
  on,
  setOn,
  split,
  setSplit,
  total,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  split: SplitRow[];
  setSplit: (fn: (s: SplitRow[]) => SplitRow[]) => void;
  total: number;
}) {
  const mine = useMemo(() => Math.max(0, total - sumOf(split)), [total, split]);
  return (
    <Section
      icon={<Users size={15} />}
      title="Split with others"
      hint="They owe you their share"
      on={on}
      onToggle={(v) => {
        setOn(v);
        if (v && !split.length) setSplit(() => [{ name: '', amount: '' }]);
      }}
    >
      {split.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input className="field min-w-0 flex-1" placeholder="Name" value={s.name} onChange={(e) => setSplit((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
          <input className="field w-28" inputMode="decimal" placeholder="Their ₹" value={s.amount} onChange={(e) => setSplit((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
          <button aria-label="Remove" className="px-1 text-muted" onClick={() => setSplit((x) => x.filter((_, j) => j !== i))}>
            <X size={16} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button className="liquid h-8 rounded-full px-3 text-[12.5px] font-semibold" onClick={() => setSplit((x) => [...x, { name: '', amount: '' }])}>
            <Plus size={13} className="mr-1 inline" />
            Person
          </button>
          <button
            className="liquid h-8 rounded-full px-3 text-[12.5px] font-semibold"
            disabled={!total || !split.length}
            onClick={() =>
              setSplit((x) => {
                const parts = splitEqual(total, ['me', ...x.map((_, i) => String(i))]);
                return x.map((s, i) => ({ ...s, amount: paiseToInput(parts[i + 1].amount_paise) }));
              })
            }
          >
            Split equally
          </button>
        </div>
        {total > 0 && <span className="text-[12px] text-muted">Your share: {formatINR(mine)}</span>}
      </div>
    </Section>
  );
}

export function Section({
  icon,
  title,
  hint,
  on,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={cx('glass rounded-[18px] p-3.5', on && 'space-y-2.5')}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--primary-soft)] text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{title}</p>
          <p className="text-[12px] text-muted">{hint}</p>
        </div>
        <Toggle checked={on} onChange={onToggle} />
      </div>
      {on && children}
    </div>
  );
}
