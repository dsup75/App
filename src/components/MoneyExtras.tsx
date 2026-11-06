// Extra sections for money entries:
//  • which income(s) paid for this (expenses, udhaar given, transfers)
//  • split an expense with other people
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Link2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { splitEqual } from '../lib/split';
import type { LinkInput } from '../lib/db';
import { Sheet, Toggle, cx } from './ui';
import { useLookups } from '../lib/useLookups';

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
  const { nameOf } = useLookups();
  const [incomes, setIncomes] = useState<{ id: string; title: string; amount_paise: number; txn_date: string; account_id: string | null }[]>([]);
  const [left, setLeft] = useState<Map<string, number>>(new Map());
  const [accs, setAccs] = useState<Map<string, string[]>>(new Map());
  const [picking, setPicking] = useState<number | null>(null);
  // amounts this entry already holds (when editing) are available again
  const [own] = useState(() => new Map(links.filter((a) => a.id).map((a) => [a.income_id, parseRupeesToPaise(a.amount) ?? 0])));

  useEffect(() => {
    Promise.all([
      supabase.from('incomes').select('id,title,amount_paise,txn_date,account_id').is('deleted_at', null).order('txn_date', { ascending: false }).limit(5000),
      supabase.from('income_usage').select('id,left_paise').limit(5000),
      supabase.from('payment_lines').select('parent_id,account_id').eq('parent_table', 'incomes').is('deleted_at', null).limit(10000),
    ]).then(([a, b, c]) => {
      setIncomes((a.data as any[]) ?? []);
      setLeft(new Map(((b.data as any[]) ?? []).map((x) => [x.id, Number(x.left_paise)])));
      // every account an income was received in (one income can be split over several)
      const m = new Map<string, string[]>();
      ((c.data as any[]) ?? []).forEach((l) => {
        const list = m.get(l.parent_id) ?? [];
        if (!list.includes(l.account_id)) list.push(l.account_id);
        m.set(l.parent_id, list);
      });
      setAccs(m);
    });
  }, []);

  const available = (id: string, full: number) => (left.has(id) ? left.get(id)! : full) + (own.get(id) ?? 0);

  const pick = (i: number, id: string) =>
    setLinks((x) => {
      const otherLinked = x.reduce((s, y, j) => (j === i ? s : s + (parseRupeesToPaise(y.amount) ?? 0)), 0);
      const inc = incomes.find((n) => n.id === id);
      const can = inc ? Math.min(available(id, inc.amount_paise), Math.max(0, total - otherLinked)) : 0;
      return x.map((y, j) => (j === i ? { ...y, income_id: id, amount: can ? paiseToInput(can) : y.amount } : y));
    });

  return (
    <Section icon={<Link2 size={15} />} title={title} hint={hint} on={links.length > 0} onToggle={(v) => setLinks(() => (v ? [{ income_id: '', amount: '' }] : []))}>
      {links.map((a, i) => (
        <div key={i} className="flex gap-2">
          <button
            type="button"
            className={cx('field min-w-0 flex-1 truncate text-left', !a.income_id && 'text-muted')}
            onClick={() => setPicking(i)}
          >
            {a.income_id ? incomes.find((n) => n.id === a.income_id)?.title ?? 'Income' : 'Choose income'}
          </button>
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
      {createPortal(
      <Sheet open={picking !== null} onClose={() => setPicking(null)} title="Choose income">
        {(() => {
          const i = picking ?? 0;
          const current = links[i]?.income_id;
          const list = incomes.filter((inc) => available(inc.id, inc.amount_paise) > 0 || inc.id === current);
          if (!list.length) return <p className="py-6 text-center text-[13.5px] text-muted">No income with money left.</p>;
          return (
            <div className="glass list-in divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]" role="radiogroup">
              {list.map((inc) => {
                const on = inc.id === current;
                const acc = (accs.get(inc.id) ?? (inc.account_id ? [inc.account_id] : [])).map((x) => nameOf(x)).join(' + ') || '—';
                return (
                  <button
                    key={inc.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={cx('flex w-full items-center gap-3 px-3.5 py-3 text-left', on && 'bg-[var(--primary-soft)]')}
                    onClick={() => {
                      pick(i, inc.id);
                      setPicking(null);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{inc.title}</span>
                      <span className="block text-[13.5px]">
                        <span className="font-semibold text-income">{formatINR(available(inc.id, inc.amount_paise))}</span>
                        <span className="text-muted"> remaining of {formatINR(inc.amount_paise)}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-muted">Account: {acc}</span>
                    </span>
                    <span
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                      style={{ boxShadow: `inset 0 0 0 2px ${on ? 'var(--primary-2)' : 'var(--muted)'}` }}
                    >
                      {on && <span className="h-[11px] w-[11px] rounded-full bg-[var(--primary-2)]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </Sheet>,
      document.body,
      )}
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
