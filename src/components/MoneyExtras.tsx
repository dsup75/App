// Extra sections for income / expense forms:
//  • pay / receive from several accounts (part cash, part GPay…)
//  • which income(s) funded this expense (allocations)
//  • split this expense with other people
import { useEffect, useState, type ReactNode } from 'react';
import { Plus, X, Wallet, Link2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { splitEqual } from '../lib/split';
import type { Account } from '../lib/db';
import { Toggle, cx } from './ui';

export interface SourceRow {
  account_id: string;
  amount: string;
}
export interface AllocRow {
  id?: string;
  income_id: string;
  amount: string;
}
export interface SplitRow {
  name: string;
  amount: string;
}
export interface Extras {
  multi: boolean;
  sources: SourceRow[];
  allocs: AllocRow[];
  splitOn: boolean;
  split: SplitRow[];
}

export function initialExtras(row: Record<string, any> | null | undefined, allocs: { id: string; income_id: string; amount_paise: number }[] = []): Extras {
  const sources = Array.isArray(row?.sources) ? row!.sources : [];
  const split = Array.isArray(row?.split_with) ? row!.split_with : [];
  return {
    multi: sources.length > 1,
    sources: sources.map((s: any) => ({ account_id: s.account_id, amount: paiseToInput(Number(s.amount_paise)) })),
    allocs: allocs.map((a) => ({ id: a.id, income_id: a.income_id, amount: paiseToInput(a.amount_paise) })),
    splitOn: split.length > 0,
    split: split.map((s: any) => ({ name: s.name, amount: paiseToInput(Number(s.amount_paise)) })),
  };
}

/** Validates and converts extras. Returns error text or the DB-ready pieces. */
export function extrasToDb(
  table: 'incomes' | 'expenses',
  ex: Extras,
  total: number,
  accounts: Account[],
):
  | string
  | {
      sources: { account_id: string; amount_paise: number; payment_app: string | null }[];
      split_with: { name: string; amount_paise: number }[];
      allocs: { id?: string; income_id: string; amount_paise: number }[];
    } {
  let sources: { account_id: string; amount_paise: number; payment_app: string | null }[] = [];
  if (ex.multi) {
    const rows = ex.sources.filter((s) => s.account_id || s.amount.trim());
    if (rows.length < 2) return 'Add at least two accounts, or turn off "multiple accounts".';
    for (const r of rows) {
      const p = parseRupeesToPaise(r.amount);
      if (!r.account_id || !p) return 'Each account needs an amount.';
      sources.push({ account_id: r.account_id, amount_paise: p, payment_app: accounts.find((a) => a.id === r.account_id)?.upi_app ?? null });
    }
    const sum = sources.reduce((s, x) => s + x.amount_paise, 0);
    if (sum !== total) return `Account amounts add up to ${formatINR(sum)} but the total is ${formatINR(total)}.`;
    if (new Set(sources.map((s) => s.account_id)).size !== sources.length) return 'Each account can be used once in the split.';
  }
  let split_with: { name: string; amount_paise: number }[] = [];
  if (table === 'expenses' && ex.splitOn) {
    for (const r of ex.split.filter((s) => s.name.trim() || s.amount.trim())) {
      const p = parseRupeesToPaise(r.amount);
      if (!r.name.trim() || !p) return 'Each person in the split needs a name and their share.';
      split_with.push({ name: r.name.trim(), amount_paise: p });
    }
    if (!split_with.length) return 'Add the people you split with, or turn the split off.';
    const others = split_with.reduce((s, x) => s + x.amount_paise, 0);
    if (others > total) return `Others' shares (${formatINR(others)}) are more than the total.`;
  }
  const allocs: { id?: string; income_id: string; amount_paise: number }[] = [];
  if (table === 'expenses') {
    for (const a of ex.allocs.filter((x) => x.income_id || x.amount.trim())) {
      const p = parseRupeesToPaise(a.amount);
      if (!a.income_id || !p) return 'Each linked income needs an amount.';
      allocs.push({ id: a.id, income_id: a.income_id, amount_paise: p });
    }
    const used = allocs.reduce((s, x) => s + x.amount_paise, 0);
    if (used > total) return `Linked income (${formatINR(used)}) is more than this expense.`;
  }
  return { sources, split_with, allocs };
}

export function MoneyExtras({
  table,
  ex,
  setEx,
  totalText,
  accounts,
}: {
  table: 'incomes' | 'expenses';
  ex: Extras;
  setEx: (fn: (e: Extras) => Extras) => void;
  totalText: string;
  accounts: Account[];
}) {
  const total = parseRupeesToPaise(totalText) ?? 0;
  const active = accounts.filter((a) => !a.deleted_at);
  const [incomes, setIncomes] = useState<{ id: string; title: string; amount_paise: number; txn_date: string }[]>([]);

  useEffect(() => {
    if (table !== 'expenses') return;
    supabase
      .from('incomes')
      .select('id,title,amount_paise,txn_date')
      .is('deleted_at', null)
      .order('txn_date', { ascending: false })
      .limit(100)
      .then(({ data }) => setIncomes((data as any[]) ?? []));
  }, [table]);

  const sumOf = (rows: { amount: string }[]) => rows.reduce((s, r) => s + (parseRupeesToPaise(r.amount) ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* Multiple accounts */}
      <Section
        icon={<Wallet size={15} />}
        title={table === 'expenses' ? 'Paid from more than one account' : 'Received in more than one account'}
        hint="e.g. part cash, part Google Pay"
        on={ex.multi}
        onToggle={(v) =>
          setEx((e) => ({
            ...e,
            multi: v,
            sources: v && e.sources.length < 2 ? [{ account_id: active[0]?.id ?? '', amount: '' }, { account_id: active[1]?.id ?? '', amount: '' }] : e.sources,
          }))
        }
      >
        {ex.sources.map((s, i) => (
          <div key={i} className="flex gap-2">
            <select className="field flex-1" value={s.account_id} onChange={(e) => setEx((x) => ({ ...x, sources: x.sources.map((y, j) => (j === i ? { ...y, account_id: e.target.value } : y)) }))}>
              <option value="">Account</option>
              {active.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input className="field w-28" inputMode="decimal" placeholder="₹" value={s.amount} onChange={(e) => setEx((x) => ({ ...x, sources: x.sources.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)) }))} />
            <button aria-label="Remove" className="px-1 text-muted" onClick={() => setEx((x) => ({ ...x, sources: x.sources.filter((_, j) => j !== i) }))}>
              <X size={16} />
            </button>
          </div>
        ))}
        <Footer
          onAdd={() => setEx((x) => ({ ...x, sources: [...x.sources, { account_id: '', amount: '' }] }))}
          addLabel="Account"
          status={total ? `${formatINR(sumOf(ex.sources))} of ${formatINR(total)}` : ''}
          ok={sumOf(ex.sources) === total}
        />
      </Section>

      {table === 'expenses' && (
        <>
          {/* Funded by income */}
          <Section icon={<Link2 size={15} />} title="Paid out of which income?" hint="Link one or more incomes (optional)" on={ex.allocs.length > 0} onToggle={(v) => setEx((e) => ({ ...e, allocs: v ? [{ income_id: '', amount: totalText }] : [] }))}>
            {ex.allocs.map((a, i) => (
              <div key={i} className="flex gap-2">
                <select className="field min-w-0 flex-1" value={a.income_id} onChange={(e) => setEx((x) => ({ ...x, allocs: x.allocs.map((y, j) => (j === i ? { ...y, income_id: e.target.value } : y)) }))}>
                  <option value="">Choose income</option>
                  {incomes.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.title} · {formatINR(inc.amount_paise)} · {inc.txn_date.slice(5)}
                    </option>
                  ))}
                </select>
                <input className="field w-28" inputMode="decimal" placeholder="₹" value={a.amount} onChange={(e) => setEx((x) => ({ ...x, allocs: x.allocs.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)) }))} />
                <button aria-label="Remove" className="px-1 text-muted" onClick={() => setEx((x) => ({ ...x, allocs: x.allocs.filter((_, j) => j !== i) }))}>
                  <X size={16} />
                </button>
              </div>
            ))}
            <Footer
              onAdd={() => setEx((x) => ({ ...x, allocs: [...x.allocs, { income_id: '', amount: '' }] }))}
              addLabel="Income"
              status={total ? `${formatINR(sumOf(ex.allocs))} of ${formatINR(total)} linked` : ''}
              ok={sumOf(ex.allocs) <= total}
            />
          </Section>

          {/* Split with people */}
          <Section
            icon={<Users size={15} />}
            title="Split with others"
            hint="They owe you their share"
            on={ex.splitOn}
            onToggle={(v) => setEx((e) => ({ ...e, splitOn: v, split: v && !e.split.length ? [{ name: '', amount: '' }] : e.split }))}
          >
            {ex.split.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input className="field min-w-0 flex-1" placeholder="Name" value={s.name} onChange={(e) => setEx((x) => ({ ...x, split: x.split.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
                <input className="field w-28" inputMode="decimal" placeholder="Their ₹" value={s.amount} onChange={(e) => setEx((x) => ({ ...x, split: x.split.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)) }))} />
                <button aria-label="Remove" className="px-1 text-muted" onClick={() => setEx((x) => ({ ...x, split: x.split.filter((_, j) => j !== i) }))}>
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button className="liquid h-8 rounded-full px-3 text-[12.5px] font-semibold" onClick={() => setEx((x) => ({ ...x, split: [...x.split, { name: '', amount: '' }] }))}>
                  <Plus size={13} className="mr-1 inline" />
                  Person
                </button>
                <button
                  className="liquid h-8 rounded-full px-3 text-[12.5px] font-semibold"
                  disabled={!total || !ex.split.length}
                  onClick={() =>
                    setEx((x) => {
                      // equal split including you
                      const parts = splitEqual(total, ['me', ...x.split.map((_, i) => String(i))]);
                      return { ...x, split: x.split.map((s, i) => ({ ...s, amount: paiseToInput(parts[i + 1].amount_paise) })) };
                    })
                  }
                >
                  Split equally
                </button>
              </div>
              {total > 0 && <span className="text-[12px] text-muted">Your share: {formatINR(Math.max(0, total - sumOf(ex.split)))}</span>}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
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

function Footer({ onAdd, addLabel, status, ok }: { onAdd: () => void; addLabel: string; status: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <button className="liquid h-8 rounded-full px-3 text-[12.5px] font-semibold" onClick={onAdd}>
        <Plus size={13} className="mr-1 inline" />
        {addLabel}
      </button>
      {status && <span className={cx('text-[12px]', ok ? 'text-muted' : 'text-danger')}>{status}</span>}
    </div>
  );
}
