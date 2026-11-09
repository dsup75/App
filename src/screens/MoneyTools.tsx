// Money Tools: sources & unallocated tracker, reconciliation, activity history, duplicate finder
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Route, Scale, History, Copy, Calculator, DatabaseBackup, ArrowRight, Check, AlertTriangle, Plus, RotateCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBalances, friendlyError, restoreRecord, type Balance, type Row } from '../lib/db';
import { formatINR, parseSignedRupeesToPaise, sumPaise } from '../lib/money';
import { formatDate, todayISO, toISODate } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import {
  ADJUSTMENT_KINDS, createReconciliation, fetchHistory, fetchSourcePositions, type HistoryEvent, type SourcePosition,
} from '../lib/moneyTools';
import {
  Badge, Button, Card, Chips, Empty, ErrorBox, FormRow, HeroCard, IconBubble, KV, List, ListRow, Page, SectionTitle, Sheet, Skeleton, type Tone,
} from '../components/ui';

const TOOLS: { label: string; hint: string; to: string; icon: LucideIcon; tone: Tone }[] = [
  { label: 'Money sources', hint: 'Received, spent, moved and what is left — per account', to: '/money-tools/sources', icon: Route, tone: 'primary' },
  { label: 'Reconcile account', hint: 'Compare bank balance with the app', to: '/money-tools/reconcile', icon: Scale, tone: 'blue' },
  { label: 'Activity & undo', hint: 'Every create, edit, delete and reversal', to: '/money-tools/history', icon: History, tone: 'violet' },
  { label: 'Duplicate finder', hint: 'Entries that look the same', to: '/money-tools/duplicates', icon: Copy, tone: 'amber' },
  { label: 'Calculators', hint: 'SIP, EMI, udhaar interest, fuel, discount', to: '/money-tools/calculators', icon: Calculator, tone: 'teal' },
  { label: 'Backup', hint: 'Export / import all your data as a file', to: '/money-tools/backup', icon: DatabaseBackup, tone: 'pink' },
];

export function MoneyToolsHub() {
  const nav = useNavigate();
  return (
    <Page title="Money Tools" subtitle="Trace your money, check balances, undo safely" back>
      <List>
        {TOOLS.map((t) => (
          <ListRow
            key={t.to}
            icon={
              <IconBubble tone={t.tone}>
                <t.icon size={17} />
              </IconBubble>
            }
            title={t.label}
            subtitle={t.hint}
            onClick={() => nav(t.to)}
            chevron
          />
        ))}
      </List>
    </Page>
  );
}

/* ---------------- Money sources & unallocated tracker ---------------- */
export function SourcesScreen() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [pos, setPos] = useState<SourcePosition[] | null>(null);
  const [bal, setBal] = useState<Balance[]>([]);
  const [error, setError] = useState('');
  const [view, setView] = useState<'account' | 'source'>('account');

  const load = useCallback(() => {
    setError('');
    Promise.all([fetchSourcePositions(), fetchBalances()])
      .then(([p, b]) => {
        setPos(p);
        setBal(b);
      })
      .catch((e) => setError(friendlyError(e)));
  }, []);
  useEffect(load, [load]);

  const originals = (pos ?? []).filter((p) => p.source_table !== 'transfers');
  const received = sumPaise(originals.map((p) => ({ amount_paise: p.received_paise })));
  const spent = sumPaise((pos ?? []).map((p) => ({ amount_paise: p.spent_paise })));
  const moved = sumPaise(originals.map((p) => ({ amount_paise: p.moved_out_paise })));
  const left = sumPaise((pos ?? []).map((p) => ({ amount_paise: Math.max(0, p.available_paise) })));

  const byAccount = useMemo(() => {
    const m = new Map<string, SourcePosition[]>();
    (pos ?? []).filter((p) => p.available_paise > 0).forEach((p) => m.set(p.account_id, [...(m.get(p.account_id) ?? []), p]));
    return [...m.entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));
  }, [pos, nameOf]);

  const bySource = useMemo(() => {
    const m = new Map<string, { title: string; table: string; id: string; received: number; spent: number; moved: number; left: number; date: string | null }>();
    for (const p of originals) {
      const k = `${p.source_table}:${p.source_id}`;
      const v = m.get(k) ?? { title: p.title, table: p.source_table, id: p.source_id, received: 0, spent: 0, moved: 0, left: 0, date: p.source_date };
      v.received += p.received_paise;
      v.spent += p.spent_paise;
      v.moved += p.moved_out_paise;
      v.left += Math.max(0, p.available_paise);
      m.set(k, v);
    }
    return [...m.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [originals]);

  return (
    <Page title="Money sources" subtitle="Where your money came from and where it is now" back>
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !pos ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <HeroCard>
            <p className="text-[13px] opacity-80">Traced money still available</p>
            <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(left)}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <div className="rounded-[12px] p-2" style={{ background: 'rgba(255,255,255,.12)' }}>
                <p className="opacity-80">Received</p>
                <p className="text-[14px] font-bold">{formatINR(received)}</p>
              </div>
              <div className="rounded-[12px] p-2" style={{ background: 'rgba(255,255,255,.12)' }}>
                <p className="opacity-80">Spent / given</p>
                <p className="text-[14px] font-bold">{formatINR(spent)}</p>
              </div>
              <div className="rounded-[12px] p-2" style={{ background: 'rgba(255,255,255,.12)' }}>
                <p className="opacity-80">Moved</p>
                <p className="text-[14px] font-bold">{formatINR(moved)}</p>
              </div>
            </div>
          </HeroCard>
          <p className="px-1 text-[12px] text-muted">Transfers between your accounts are never counted as new income — they only move traced money from one account to another.</p>
          <Chips
            value={view}
            onChange={setView}
            options={[
              { value: 'account', label: 'By account' },
              { value: 'source', label: 'By source' },
            ]}
          />

          {view === 'account' ? (
            !byAccount.length && !bal.length ? (
              <Empty title="Nothing traced yet" text="When you link an expense, udhaar or transfer row to the money it used, it shows up here." />
            ) : (
              bal.map((b) => {
                const list = byAccount.find(([acc]) => acc === b.id)?.[1] ?? [];
                const traced = sumPaise(list.map((p) => ({ amount_paise: p.available_paise })));
                const untraced = Number(b.balance_paise) - traced;
                return (
                  <div key={b.id} className="space-y-2">
                    <SectionTitle right={<span className="text-[12.5px] text-muted">Balance {formatINR(b.balance_paise)}</span>}>{b.name}</SectionTitle>
                    <List>
                      {list.map((p) => (
                        <ListRow
                          key={`${p.source_table}:${p.source_id}`}
                          title={p.title}
                          subtitle={[p.via_title ? `via ${p.via_title}` : p.source_table === 'incomes' ? 'Income' : 'Udhaar', p.source_date && formatDate(p.source_date)].filter(Boolean).join(' · ')}
                          right={<span className="text-[14px] font-semibold text-income">{formatINR(p.available_paise)}</span>}
                          onClick={() => nav(`/r/${p.source_table}/${p.source_id}`)}
                          chevron
                        />
                      ))}
                      {untraced !== 0 && (
                        <ListRow
                          title="Not linked to any source"
                          subtitle="Opening balance, or money not yet linked"
                          right={<span className="text-[14px] font-semibold text-muted">{formatINR(untraced)}</span>}
                        />
                      )}
                    </List>
                  </div>
                );
              })
            )
          ) : !bySource.length ? (
            <Empty title="No sources yet" text="Incomes, udhaar taken and udhaar returned to you appear here." />
          ) : (
            <List>
              {bySource.map((v) => (
                <ListRow
                  key={`${v.table}:${v.id}`}
                  title={v.title}
                  subtitle={`Received ${formatINR(v.received)} · spent ${formatINR(v.spent)}${v.moved ? ` · moved ${formatINR(v.moved)} (open to follow it)` : ''}`}
                  right={<span className="text-[14px] font-semibold text-income">{formatINR(v.left)}</span>}
                  onClick={() => nav(`/r/${v.table}/${v.id}`)}
                  chevron
                />
              ))}
            </List>
          )}
        </>
      )}
    </Page>
  );
}

/* ---------------- Reconciliation ---------------- */
interface RecSummary {
  id: string;
  account_id: string;
  as_of_date: string;
  actual_balance_paise: number;
  app_balance_paise: number;
  difference_paise: number;
  adjustments_paise: number;
  unexplained_paise: number;
  app_drift_paise: number;
  status: 'balanced' | 'unexplained';
  notes: string | null;
}

export function ReconcileScreen() {
  const toast = useToast();
  const [params] = useSearchParams();
  const { nameOf } = useLookups();
  const [bal, setBal] = useState<Balance[]>([]);
  const [recs, setRecs] = useState<RecSummary[] | null>(null);
  const [adj, setAdj] = useState<Row[]>([]);
  const [account, setAccount] = useState(params.get('account') ?? '');
  const [actual, setActual] = useState('');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState<RecSummary | null>(null);
  const [ef, setEf] = useState({ kind: 'bank_fee', amount: '', reason: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    Promise.all([
      fetchBalances(),
      supabase.from('reconciliation_summary').select('*').order('as_of_date', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('reconciliation_adjustments').select('id,reconciliation_id,amount_paise,kind,reason').is('deleted_at', null).limit(1000),
    ])
      .then(([b, r, a]) => {
        setBal(b);
        if (r.error) throw r.error;
        setRecs(((r.data as any[]) ?? []).map((x) => ({ ...x, difference_paise: Number(x.difference_paise), unexplained_paise: Number(x.unexplained_paise) })));
        setAdj((a.data as Row[]) ?? []);
        setAccount((cur) => cur || b[0]?.id || '');
      })
      .catch((e) => setError(friendlyError(e)));
  }, []);
  useEffect(load, [load]);

  const appBal = bal.find((b) => b.id === account)?.balance_paise;
  const actualPaise = parseSignedRupeesToPaise(actual);

  const save = async () => {
    if (!account) return toast('Choose an account', 'error');
    if (actualPaise === null || actual.trim() === '') return toast('Enter the balance shown in your bank / app', 'error');
    setBusy(true);
    try {
      await createReconciliation(account, actualPaise, date, notes.trim() || null);
      toast('Balance check saved — your balance was not changed');
      setActual('');
      setNotes('');
      load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addAdjustment = async () => {
    if (!explain) return;
    const amt = parseSignedRupeesToPaise(ef.amount);
    if (!amt) return toast('Enter the amount (use − if the bank has less)', 'error');
    if (!ef.reason.trim()) return toast('Write a short reason', 'error');
    setBusy(true);
    const { error: err } = await supabase.from('reconciliation_adjustments').insert({ reconciliation_id: explain.id, amount_paise: amt, kind: ef.kind, reason: ef.reason.trim() });
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast('Explanation added');
    setEf({ kind: 'bank_fee', amount: '', reason: '' });
    setExplain(null);
    load();
  };

  return (
    <Page title="Reconcile" subtitle="Check the app balance against your bank or wallet. Nothing in your entries or balances is changed." back>
      {error && <ErrorBox message={error} onRetry={load} />}
      <Card className="space-y-3">
        <FormRow label="Account">
          <select className="field" value={account} onChange={(e) => setAccount(e.target.value)}>
            {bal.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FormRow>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Balance in bank / app (₹)">
            <input className="field font-semibold" inputMode="decimal" placeholder="e.g. 1926" value={actual} onChange={(e) => setActual(e.target.value)} />
          </FormRow>
          <FormRow label="As on">
            <input type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </FormRow>
        </div>
        {appBal !== undefined && (
          <div className="grid grid-cols-3 gap-2">
            <KV label="App balance (today)" value={formatINR(appBal)} />
            <KV label="Actual" value={actualPaise !== null && actual.trim() ? formatINR(actualPaise) : '—'} />
            <KV
              label="Difference"
              value={actualPaise !== null && actual.trim() ? formatINR(actualPaise - Number(appBal)) : '—'}
              tone={actualPaise !== null && actual.trim() && actualPaise - Number(appBal) < 0 ? 'expense' : undefined}
            />
          </div>
        )}
        <FormRow label="Note (optional)">
          <input className="field" placeholder="e.g. Checked passbook" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormRow>
        <Button full variant="primary" loading={busy} onClick={save}>
          <Check size={15} /> Save balance check
        </Button>
        <p className="text-[11.5px] text-muted">The saved check uses the app balance as on the chosen date.</p>
      </Card>

      <SectionTitle>Past checks</SectionTitle>
      {!recs ? (
        <Skeleton rows={2} />
      ) : !recs.length ? (
        <Empty title="No balance checks yet" />
      ) : (
        <div className="space-y-2">
          {recs.map((r) => {
            const mine = adj.filter((a) => a.reconciliation_id === r.id);
            return (
              <Card key={r.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[14.5px] font-semibold">
                    {nameOf(r.account_id)} · {formatDate(r.as_of_date)}
                  </p>
                  <Badge tone={r.status === 'balanced' ? 'primary' : 'amber'}>{r.status === 'balanced' ? 'Balanced' : 'Unexplained'}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <KV label="App" value={formatINR(r.app_balance_paise)} />
                  <KV label="Actual" value={formatINR(r.actual_balance_paise)} />
                  <KV label="Difference" value={formatINR(r.difference_paise)} tone={r.difference_paise < 0 ? 'expense' : undefined} />
                </div>
                {mine.map((a) => (
                  <p key={a.id} className="text-[12.5px]">
                    <span className="text-muted">{ADJUSTMENT_KINDS.find((k) => k.value === a.kind)?.label}:</span> {formatINR(a.amount_paise)} — {a.reason}
                  </p>
                ))}
                {r.unexplained_paise !== 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-amber-600">{formatINR(r.unexplained_paise)} not explained yet</span>
                    <Button size="sm" onClick={() => { setExplain(r); setEf({ kind: 'bank_fee', amount: (r.unexplained_paise / 100).toString(), reason: '' }); }}>
                      <Plus size={13} /> Explain
                    </Button>
                  </div>
                )}
                {r.app_drift_paise !== 0 && (
                  <p className="flex items-center gap-1 text-[11.5px] text-muted">
                    <AlertTriangle size={12} /> Entries for this date changed after the check ({formatINR(r.app_drift_paise)}).
                  </p>
                )}
                {r.notes && <p className="text-[12px] text-muted">{r.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!explain} onClose={() => setExplain(null)} title="Explain the difference">
        <div className="space-y-3">
          <p className="text-[13px] text-muted">This only records the reason. No income or expense is created. If money is really missing from the app, add that entry yourself.</p>
          <FormRow label="What is it?">
            <select className="field" value={ef.kind} onChange={(e) => setEf((x) => ({ ...x, kind: e.target.value }))}>
              {ADJUSTMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Amount (₹, − if the bank has less)">
            <input className="field" inputMode="decimal" value={ef.amount} onChange={(e) => setEf((x) => ({ ...x, amount: e.target.value }))} />
          </FormRow>
          <FormRow label="Reason">
            <input className="field" placeholder="e.g. SMS charges for October" value={ef.reason} onChange={(e) => setEf((x) => ({ ...x, reason: e.target.value }))} />
          </FormRow>
          <Button full variant="primary" loading={busy} onClick={addAdjustment}>
            Save explanation
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}

/* ---------------- Activity & undo ---------------- */
const KIND_LABEL: Record<string, string> = {
  incomes: 'Income', expenses: 'Expense', transfers: 'Transfer', loans: 'Udhaar', loan_repayments: 'Repayment',
  allocations: 'Income link', payment_lines: 'Payment part', money_links: 'Source link', reconciliations: 'Balance check', reconciliation_adjustments: 'Explanation',
};
const PARENTS = ['incomes', 'expenses', 'transfers', 'loans', 'loan_repayments'];

export function HistoryScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'created' | 'edited' | 'deleted' | 'restored'>('all');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    fetchHistory({ limit: 400 })
      .then((h) => setEvents(h.filter((e) => PARENTS.includes(e.table_name) && !['updated_at', 'line_count', 'sources'].includes(e.field))))
      .catch((e) => setError(friendlyError(e)));
  }, []);
  useEffect(load, [load]);

  const list = (events ?? []).filter((e) => filter === 'all' || e.event_type === filter);
  const undoDelete = async (e: HistoryEvent) => {
    try {
      await restoreRecord(e.table_name as any, e.record_id);
      toast('Restored from Recycle Bin');
      load();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  return (
    <Page title="Activity" subtitle="Every change to your money entries. To undo an entry, open it and tap Reverse — the original is never changed." back>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'created', label: 'Created' },
          { value: 'edited', label: 'Edited' },
          { value: 'deleted', label: 'Deleted' },
          { value: 'restored', label: 'Restored' },
        ]}
      />
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !events ? (
        <Skeleton rows={6} />
      ) : !list.length ? (
        <Empty title="No activity" />
      ) : (
        <List>
          {list.slice(0, 200).map((e) => (
            <ListRow
              key={e.id}
              title={e.title ?? KIND_LABEL[e.table_name]}
              subtitle={`${KIND_LABEL[e.table_name]} · ${e.event_type}${e.event_type === 'edited' ? ` · ${e.field.replace(/_paise$/, '').replace(/_/g, ' ')}` : ''} · ${new Date(e.changed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
              right={
                e.event_type === 'deleted' ? (
                  <button
                    type="button"
                    className="liquid flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      undoDelete(e);
                    }}
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                ) : undefined
              }
              onClick={() => nav(`/r/${e.table_name}/${e.record_id}`)}
            />
          ))}
        </List>
      )}
    </Page>
  );
}

/* ---------------- Duplicate finder (read only — never deletes) ---------------- */
export function DuplicatesScreen() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [groups, setGroups] = useState<{ kind: string; rows: Row[] }[] | null>(null);
  const [days, setDays] = useState<'30' | '90' | '365'>('90');
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('dup-dismissed') || '[]'));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    setGroups(null);
    const from = new Date();
    from.setDate(from.getDate() - Number(days));
    const f = toISODate(from);
    Promise.all(
      (['expenses', 'incomes', 'transfers'] as const).map((k) =>
        supabase.from(k).select('id,title,amount_paise,txn_date,account_id,from_account_id,reference').is('deleted_at', null).gte('txn_date', f).limit(3000).then(({ data }) => ({ kind: k, rows: (data as Row[]) ?? [] })),
      ),
    ).then((all) => {
      const out: { kind: string; rows: Row[] }[] = [];
      for (const { kind, rows } of all) {
        const sorted = [...rows].sort((a, b) => Number(a.amount_paise) - Number(b.amount_paise) || a.txn_date.localeCompare(b.txn_date));
        const used = new Set<string>();
        for (let i = 0; i < sorted.length; i++) {
          if (used.has(sorted[i].id)) continue;
          const g = [sorted[i]];
          for (let j = i + 1; j < sorted.length && Number(sorted[j].amount_paise) === Number(sorted[i].amount_paise); j++) {
            const a = sorted[i];
            const b = sorted[j];
            const dd = Math.abs(new Date(a.txn_date).getTime() - new Date(b.txn_date).getTime()) / 86400000;
            const sameAcc = (a.account_id ?? a.from_account_id) === (b.account_id ?? b.from_account_id);
            const sameRef = a.reference && b.reference && a.reference === b.reference;
            if ((dd <= 1 && sameAcc) || sameRef) {
              g.push(b);
              used.add(b.id);
            }
          }
          if (g.length > 1) out.push({ kind, rows: g });
        }
      }
      setGroups(out);
    });
  }, [days]);

  const key = (g: { rows: Row[] }) => g.rows.map((r) => r.id).sort().join(',');
  const visible = (groups ?? []).filter((g) => !dismissed.has(key(g)));
  const dismiss = (g: { rows: Row[] }) => {
    const next = new Set(dismissed).add(key(g));
    setDismissed(next);
    try {
      localStorage.setItem('dup-dismissed', JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  return (
    <Page title="Duplicate finder" subtitle="Same amount, same account, within a day (or same UTR). Nothing is deleted automatically." back>
      <Chips
        value={days}
        onChange={setDays}
        options={[
          { value: '30', label: 'Last 30 days' },
          { value: '90', label: '90 days' },
          { value: '365', label: '1 year' },
        ]}
      />
      {!groups ? (
        <Skeleton rows={3} />
      ) : !visible.length ? (
        <Empty title="No duplicates found" text="Nice — nothing looks repeated." />
      ) : (
        visible.map((g) => (
          <Card key={key(g)} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-amber-600">
                {g.rows.length} similar {g.kind === 'incomes' ? 'incomes' : g.kind === 'expenses' ? 'expenses' : 'transfers'}
              </p>
              <button type="button" className="text-[12.5px] font-semibold text-primary" onClick={() => dismiss(g)}>
                Not a duplicate
              </button>
            </div>
            {g.rows.map((r) => (
              <button key={r.id} type="button" onClick={() => nav(`/r/${g.kind}/${r.id}`)} className="flex w-full items-center gap-2 text-left text-[13.5px]">
                <span className="min-w-0 flex-1 truncate">
                  {r.title} <span className="text-muted">· {formatDate(r.txn_date)} · {nameOf(r.account_id ?? r.from_account_id)}</span>
                </span>
                <span className="font-semibold">{formatINR(r.amount_paise)}</span>
                <ArrowRight size={14} className="text-muted" />
              </button>
            ))}
          </Card>
        ))
      )}
    </Page>
  );
}

