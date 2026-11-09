// Form for income, expense, udhaar, udhaar repayment and transfer:
//   top    → "kis liye" (purpose: title, category, client, mode …)
//   bottom → "Payment breakdown": one line per payment part (app, amount,
//            account, date, time, UTR, paid by / to, note)
import { useEffect, useMemo, useState } from 'react';
import { Plus, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { todayISO } from '../lib/dates';
import { UPI_APPS } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { useCustomOptions } from '../lib/options';
import type { Account, LineInput, LinkInput, MoneyTable } from '../lib/db';
import { RecordForm } from './RecordForm';
import { LinksSection, SplitSection, linksToDb, splitToDb, type LinkRow, type SplitRow } from './MoneyExtras';
import { FormRow, cx } from './ui';
import { RowSourceLinks, type RowLinkState } from './RowSourceLinks';
import { ROW_LINK_TABLES, type RowLinkInput } from '../lib/moneyTools';

/** Fields that live in the payment lines instead of the purpose card */
export const LINE_FIELDS: Record<MoneyTable, string[]> = {
  incomes: ['amount_paise', 'account_id', 'payment_method', 'payment_app', 'reference', 'txn_date', 'txn_time', 'payer_name'],
  expenses: ['amount_paise', 'account_id', 'payment_method', 'payment_app', 'reference', 'txn_date', 'txn_time'],
  transfers: ['amount_paise', 'from_account_id', 'to_account_id', 'txn_date', 'txn_time'],
  loans: ['principal_paise', 'account_id', 'start_date'],
  loan_repayments: ['principal_paise', 'account_id', 'txn_date'],
};

export interface LineState {
  id?: string;
  direction: 'in' | 'out';
  account_id: string;
  amount: string;
  payment_app: string;
  txn_date: string;
  txn_time: string;
  reference: string;
  party_name: string;
  notes: string;
  /** money sources linked to this money-out row (optional) */
  links?: RowLinkState[];
}

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function blankLine(direction: 'in' | 'out', p: Partial<LineState> = {}): LineState {
  return { direction, account_id: '', amount: '', payment_app: '', txn_date: todayISO(), txn_time: nowTime(), reference: '', party_name: '', notes: '', ...p };
}

export function linesFromDb(rows: (LineInput & { id?: string })[], keepIds = true): LineState[] {
  return rows.map((r) => ({
    id: keepIds ? r.id : undefined,
    direction: (r.direction ?? 'out') as 'in' | 'out',
    account_id: r.account_id,
    amount: paiseToInput(r.amount_paise),
    payment_app: r.payment_app ?? '',
    txn_date: keepIds ? r.txn_date : todayISO(),
    txn_time: r.txn_time ? String(r.txn_time).slice(0, 5) : keepIds ? '' : nowTime(),
    reference: keepIds ? r.reference ?? '' : '',
    party_name: r.party_name ?? '',
    notes: r.notes ?? '',
  }));
}

function methodFor(app: string): string | null {
  if (!app) return null;
  if (app === 'cash') return 'cash';
  if (app === 'card') return 'card';
  if (app === 'netbanking' || app === 'bank_app') return 'bank';
  return 'upi';
}

function linesToDb(lines: LineState[]): LineInput[] | string {
  const out: LineInput[] = [];
  for (const [i, l] of lines.entries()) {
    const p = parseRupeesToPaise(l.amount);
    if (!l.account_id) return `Payment ${i + 1}: choose the account.`;
    if (!p || p <= 0) return `Payment ${i + 1}: enter the amount.`;
    if (!l.txn_date) return `Payment ${i + 1}: enter the date.`;
    out.push({
      id: l.id,
      direction: l.direction,
      account_id: l.account_id,
      amount_paise: p,
      payment_app: l.payment_app || null,
      payment_method: methodFor(l.payment_app),
      txn_date: l.txn_date,
      txn_time: l.txn_time || null,
      reference: l.reference.trim() || null,
      party_name: l.party_name.trim() || null,
      notes: l.notes.trim() || null,
    });
  }
  return out;
}

export function MoneyForm({
  table,
  initial,
  initialLines,
  initialLinks,
  initialSplit,
  submitLabel,
  saving,
  onSubmit,
  ownRowLinks,
}: {
  table: MoneyTable;
  initial: Record<string, string>;
  initialLines: LineState[];
  initialLinks: LinkRow[];
  initialSplit: SplitRow[];
  submitLabel: string;
  saving?: boolean;
  onSubmit: (parent: Record<string, unknown>, lines: LineInput[], links: LinkInput[] | null, rowLinks?: RowLinkInput[] | null) => void;
  /** per-row links this entry already holds, key "table:id@account" → paise (editing) */
  ownRowLinks?: Map<string, number>;
}) {
  const { accounts, refs } = useLookups();
  const [form, setForm] = useState(initial);
  const [lines, setLines] = useState<LineState[]>(initialLines);
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [split, setSplit] = useState<SplitRow[]>(initialSplit);
  const [splitOn, setSplitOn] = useState(initialSplit.length > 0);
  const [contacts, setContacts] = useState<{ id: string; name: string; role: string | null }[]>([]);

  // Which way money moves for this entry
  const loanDir = table === 'loans' ? form.direction : table === 'loan_repayments' ? refs.loans?.find((l) => l.id === form.loan_id)?.direction : undefined;
  const dir: 'in' | 'out' | null =
    table === 'incomes' ? 'in' : table === 'expenses' ? 'out' : table === 'loans' ? (loanDir === 'borrowed' ? 'in' : 'out') : table === 'loan_repayments' ? (loanDir === 'lent' ? 'in' : 'out') : null;

  // Keep line directions in sync (transfers keep their own)
  useEffect(() => {
    if (!dir) return;
    setLines((ls) => (ls.some((l) => l.direction !== dir) ? ls.map((l) => ({ ...l, direction: dir })) : ls));
  }, [dir]);

  // Client staff names for "Paid by" on income lines
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

  // Fill empty accounts with a sensible default once accounts load
  useEffect(() => {
    const active = accounts.filter((a) => !a.deleted_at);
    if (!active.length) return;
    setLines((ls) =>
      ls.map((l, i) => {
        if (l.account_id) return l;
        const other = ls.find((x) => x.account_id && x.direction !== l.direction)?.account_id;
        const byApp = l.payment_app ? active.find((a) => a.upi_app === l.payment_app) ?? (l.payment_app === 'cash' ? active.find((a) => a.type === 'cash') : undefined) : undefined;
        const pick = byApp ?? active.find((a) => a.id !== other) ?? active[i % active.length];
        return { ...l, account_id: pick.id, payment_app: l.payment_app || pick.upi_app || (pick.type === 'cash' ? 'cash' : '') };
      }),
    );
  }, [accounts]);

  const total = useMemo(() => {
    const s = (d: 'in' | 'out') => lines.filter((l) => l.direction === d).reduce((t, l) => t + (parseRupeesToPaise(l.amount) ?? 0), 0);
    return table === 'transfers' ? s('out') : s('in') + s('out');
  }, [lines, table]);

  const linkable = table === 'expenses' || table === 'transfers' || (table === 'loans' && loanDir !== 'borrowed');
  // Older entries linked the whole entry to incomes; they keep that section. New entries link per payment row.
  const legacyLinks = initialLinks.length > 0;
  const rowLinkable = !legacyLinks && ROW_LINK_TABLES.includes(table);
  const [ownLinks] = useState(() => ownRowLinks ?? new Map<string, number>());
  const rowLinksOf = (): RowLinkInput[] | string => {
    const m = new Map<string, RowLinkInput>();
    const perAccount = new Map<string, { linked: number; rows: number }>();
    for (const l of lines) {
      if (l.direction !== 'out' || !l.account_id) continue;
      const pa = perAccount.get(l.account_id) ?? { linked: 0, rows: 0 };
      pa.rows += parseRupeesToPaise(l.amount) ?? 0;
      for (const k of l.links ?? []) {
        if (!k.source_id && !k.amount.trim()) continue;
        const amt = parseRupeesToPaise(k.amount);
        if (!k.source_id || !amt || amt <= 0) return 'Each linked money source needs an amount.';
        pa.linked += amt;
        const key = `${k.source_table}:${k.source_id}@${l.account_id}`;
        const prev = m.get(key);
        m.set(key, { source_table: k.source_table, source_id: k.source_id, account_id: l.account_id, amount_paise: (prev?.amount_paise ?? 0) + amt });
      }
      perAccount.set(l.account_id, pa);
    }
    for (const [acc, v] of perAccount) {
      if (v.linked > v.rows) {
        const name = accounts.find((a) => a.id === acc)?.name ?? 'an account';
        return `Linked money (${formatINR(v.linked)}) is more than what is paid from ${name} (${formatINR(v.rows)}).`;
      }
    }
    return [...m.values()];
  };

  const validateExtra = () => {
    const ls = linesToDb(lines);
    if (typeof ls === 'string') return ls;
    if (table === 'transfers') {
      const sIn = ls.filter((l) => l.direction === 'in').reduce((t, l) => t + l.amount_paise, 0);
      const sOut = ls.filter((l) => l.direction === 'out').reduce((t, l) => t + l.amount_paise, 0);
      if (!sIn || !sOut) return 'Add at least one "from" and one "to" account.';
      if (sIn !== sOut) return `Money out (${formatINR(sOut)}) and money in (${formatINR(sIn)}) must be equal.`;
    }
    if (table === 'loan_repayments') {
      const interest = parseRupeesToPaise(form.interest_paise || '0') ?? 0;
      if (interest > total) return 'Interest part cannot be more than the total paid.';
    }
    if (linkable && legacyLinks) {
      const lk = linksToDb(links, total);
      if (typeof lk === 'string') return lk;
    }
    if (rowLinkable) {
      const rl = rowLinksOf();
      if (typeof rl === 'string') return rl;
    }
    if (table === 'expenses') {
      const sp = splitToDb(split, splitOn, total);
      if (typeof sp === 'string') return sp;
    }
    return null;
  };

  const submit = (values: Record<string, unknown>) => {
    const ls = linesToDb(lines) as LineInput[];
    const lk = linkable && legacyLinks ? (linksToDb(links, total) as LinkInput[]) : null;
    const parent = { ...values };
    if (table === 'expenses') parent.split_with = splitToDb(split, splitOn, total);
    onSubmit(parent, ls, lk, rowLinkable ? (rowLinksOf() as RowLinkInput[]) : null);
  };

  const groups: { direction: 'in' | 'out'; title: string }[] =
    table === 'transfers'
      ? [
          { direction: 'out', title: 'From (money out)' },
          { direction: 'in', title: 'To (money in)' },
        ]
      : [{ direction: dir ?? 'out', title: dir === 'in' ? 'Payment breakdown — received' : 'Payment breakdown — paid' }];

  const partyLabel = table === 'incomes' ? 'Paid by' : table === 'expenses' ? 'Paid to' : table === 'transfers' ? 'Note / person' : 'Person';

  return (
    <RecordForm
      table={table}
      initial={initial}
      submitLabel={`${submitLabel} · ${formatINR(total)}`}
      saving={saving}
      omit={LINE_FIELDS[table]}
      onFormChange={setForm}
      validateExtra={validateExtra}
      onSubmit={submit}
      extra={
        <>
          {groups.map((g) => {
            const mine = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.direction === g.direction);
            const sub = mine.reduce((t, { l }) => t + (parseRupeesToPaise(l.amount) ?? 0), 0);
            return (
              <div key={g.direction} className="glass space-y-3 rounded-[20px] p-3.5">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                    {g.direction === 'in' ? <ArrowDownLeft size={16} className="text-income" /> : <ArrowUpRight size={16} className="text-expense" />}
                    {g.title}
                  </p>
                  <span className="text-[13px] font-semibold">{formatINR(sub)}</span>
                </div>
                {mine.map(({ l, i }, n) => (
                  <div key={i} className="space-y-2">
                    <LineCard
                      index={n}
                      line={l}
                      accounts={accounts}
                      partyLabel={partyLabel}
                      contacts={g.direction === 'in' && table === 'incomes' ? contacts : []}
                      canRemove={mine.length > 1}
                      onChange={(patch) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch, ...(patch.account_id && patch.account_id !== x.account_id ? { links: [] } : {}) } : x)))}
                      onRemove={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    />
                    {rowLinkable && l.direction === 'out' && l.account_id && (
                      <RowSourceLinks
                        accountId={l.account_id}
                        accountName={accounts.find((a) => a.id === l.account_id)?.name ?? 'this account'}
                        rowAmount={parseRupeesToPaise(l.amount) ?? 0}
                        links={l.links ?? []}
                        own={ownLinks}
                        onChange={(next) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, links: next } : x)))}
                      />
                    )}
                  </div>
                ))}
                <button
                  className="liquid flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold"
                  onClick={() =>
                    setLines((ls) => {
                      const last = [...ls].reverse().find((x) => x.direction === g.direction);
                      return [...ls, blankLine(g.direction, { txn_date: last?.txn_date ?? todayISO(), party_name: table === 'incomes' ? '' : last?.party_name ?? '' })];
                    })
                  }
                >
                  <Plus size={15} /> Add another payment
                </button>
              </div>
            );
          })}
          {linkable && legacyLinks && (
            <LinksSection
              title={table === 'transfers' ? 'Moving money of which income?' : 'Paid out of which income?'}
              hint="Link one or more incomes (optional)"
              links={links}
              setLinks={setLinks}
              total={total}
            />
          )}
          {table === 'expenses' && <SplitSection on={splitOn} setOn={setSplitOn} split={split} setSplit={setSplit} total={total} />}
        </>
      }
    />
  );
}

function LineCard({
  index,
  line,
  accounts,
  partyLabel,
  contacts,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineState;
  accounts: Account[];
  partyLabel: string;
  contacts: { id: string; name: string; role: string | null }[];
  canRemove: boolean;
  onChange: (p: Partial<LineState>) => void;
  onRemove: () => void;
}) {
  const { optionsFor } = useCustomOptions();
  const apps = optionsFor('payment_app', UPI_APPS);
  const active = accounts.filter((a) => !a.deleted_at || a.id === line.account_id);
  const [typing, setTyping] = useState(false);
  const knownContact = contacts.some((c) => c.name === line.party_name);

  const pickApp = (app: string) => {
    const p: Partial<LineState> = { payment_app: app };
    const match = accounts.find((a) => !a.deleted_at && a.upi_app === app) ?? (app === 'cash' ? accounts.find((a) => !a.deleted_at && a.type === 'cash') : undefined);
    if (match) p.account_id = match.id;
    onChange(p);
  };
  const pickAccount = (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    const p: Partial<LineState> = { account_id: id };
    if (acc?.upi_app) p.payment_app = acc.upi_app;
    else if (acc?.type === 'cash') p.payment_app = 'cash';
    onChange(p);
  };

  return (
    <div className="space-y-2.5 rounded-[16px] p-3" style={{ background: 'var(--card-2)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-muted">Payment {index + 1}</span>
        {canRemove && (
          <button aria-label="Remove payment" onClick={onRemove} className="text-muted">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormRow label="App">
          <select className="field" value={line.payment_app} onChange={(e) => pickApp(e.target.value)}>
            <option value="">—</option>
            {apps.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
            {line.payment_app && !apps.some((o) => o.value === line.payment_app) && <option value={line.payment_app}>{line.payment_app}</option>}
          </select>
        </FormRow>
        <FormRow label="Amount (₹)">
          <input className="field font-semibold" inputMode="decimal" placeholder="0" value={line.amount} onChange={(e) => onChange({ amount: e.target.value })} />
        </FormRow>
      </div>
      <FormRow label="Account">
        <select className={cx('field', !line.account_id && 'text-muted')} value={line.account_id} onChange={(e) => pickAccount(e.target.value)}>
          <option value="">Choose account</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.upi_id ? ` · ${a.upi_id}` : ''}
            </option>
          ))}
        </select>
      </FormRow>
      <div className="grid grid-cols-2 gap-2">
        <FormRow label="Date">
          <input type="date" className="field" value={line.txn_date} onChange={(e) => onChange({ txn_date: e.target.value })} />
        </FormRow>
        <FormRow label="Time">
          <input type="time" className="field" value={line.txn_time} onChange={(e) => onChange({ txn_time: e.target.value })} />
        </FormRow>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormRow label="UTR / ref">
          <input className="field" placeholder="Optional" value={line.reference} onChange={(e) => onChange({ reference: e.target.value })} />
        </FormRow>
        <FormRow label={partyLabel}>
          {contacts.length > 0 && !typing ? (
            <select
              className="field"
              value={knownContact ? line.party_name : line.party_name ? '__other' : ''}
              onChange={(e) => (e.target.value === '__other' ? setTyping(true) : onChange({ party_name: e.target.value }))}
            >
              <option value="">— Staff —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                  {c.role ? ` (${c.role})` : ''}
                </option>
              ))}
              <option value="__other">{line.party_name && !knownContact ? `${line.party_name} (typed)` : 'Someone else…'}</option>
            </select>
          ) : (
            <input className="field" placeholder="Optional" value={line.party_name} onChange={(e) => onChange({ party_name: e.target.value })} />
          )}
        </FormRow>
      </div>
      <FormRow label="Note">
        <input className="field" placeholder="Optional" value={line.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </FormRow>
    </div>
  );
}
