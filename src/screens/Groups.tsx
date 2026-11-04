import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, UserPlus, Users, ArrowRight, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createRecord, friendlyError, getRecord, softDelete, updateRecord, type Row } from '../lib/db';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { relativeDay, todayISO } from '../lib/dates';
import { mergeParts, netBalances, splitEqual, splitItems, splitPercent, suggestSettlements, type Part } from '../lib/split';
import { useToast } from '../context/ToastContext';
import { TableList } from '../components/TableList';
import {
  Badge, Button, Card, Confirm, Empty, ErrorBox, FormRow, HeroCard, IconBubble, IconButton, List, ListRow, Page, SectionTitle, Segmented, Sheet, Spinner, Toggle, cx,
} from '../components/ui';

export function GroupsScreen() {
  const nav = useNavigate();
  return (
    <TableList
      table="groups"
      title="Groups & Split"
      subtitle="Split bills with friends — they don't need the app."
      renderRows={(rows) => (
        <List>
          {rows.map((g) => (
            <ListRow
              key={g.id}
              icon={<IconBubble tone="violet"><Users size={17} /></IconBubble>}
              title={g.name}
              subtitle={g.kind === 'business' ? 'Business' : 'Personal'}
              onClick={() => nav(`/groups/${g.id}`)}
              chevron
            />
          ))}
        </List>
      )}
    />
  );
}

export function GroupDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [group, setGroup] = useState<Row | null>(null);
  const [members, setMembers] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [settlements, setSettlements] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [addMember, setAddMember] = useState(false);
  const [settle, setSettle] = useState<{ from: string; to: string; amount_paise: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [g, m, e, s] = await Promise.all([
        getRecord('groups', id),
        supabase.from('group_members').select('*').eq('group_id', id).is('deleted_at', null).order('created_at'),
        supabase.from('group_expenses').select('*').eq('group_id', id).is('deleted_at', null).order('txn_date', { ascending: false }),
        supabase.from('group_settlements').select('*').eq('group_id', id).is('deleted_at', null).order('txn_date', { ascending: false }),
      ]);
      for (const r of [m, e, s]) if (r.error) throw r.error;
      setGroup(g);
      setMembers(m.data as Row[]);
      setExpenses(e.data as Row[]);
      setSettlements(s.data as Row[]);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const name = (mid: string) => members.find((m) => m.id === mid)?.name ?? 'Removed member';
  const net = useMemo(
    () => netBalances(members.map((m) => m.id), expenses as any, settlements as any),
    [members, expenses, settlements],
  );
  const plan = useMemo(() => suggestSettlements(net), [net]);
  const total = expenses.reduce((s, e) => s + Number(e.amount_paise), 0);
  const me = members.find((m) => m.is_me);

  const editing = params.get('expense');
  const closeEditor = () => setParams({}, { replace: true });

  const doSettle = async () => {
    if (!settle || !id) return;
    setBusy(true);
    try {
      await createRecord('group_settlements', {
        group_id: id,
        title: 'Settlement',
        from_member_id: settle.from,
        to_member_id: settle.to,
        amount_paise: settle.amount_paise,
        txn_date: todayISO(),
      });
      toast('Settlement recorded');
      setSettle(null);
      load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Page title="Group" back><ErrorBox message={error} onRetry={load} /></Page>;
  if (!group) return <Page title="Group" back><Spinner /></Page>;

  return (
    <Page
      title={group.name}
      subtitle={`${members.length} members · ${group.kind === 'business' ? 'Business' : 'Personal'}`}
      back
      right={
        <IconButton label="Edit group" onClick={() => nav(`/r/groups/${group.id}`)}>
          <Pencil size={16} />
        </IconButton>
      }
    >
      <HeroCard>
        <p className="text-[13px] opacity-80">Total group spend</p>
        <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(total)}</p>
        {me && (
          <p className="text-[13px] opacity-90">
            {(net.get(me.id) ?? 0) > 0
              ? `You should get back ${formatINR(net.get(me.id)!)}`
              : (net.get(me.id) ?? 0) < 0
                ? `You owe ${formatINR(-net.get(me.id)!)}`
                : 'You are settled up'}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => setParams({ expense: 'new' })} disabled={members.length < 2}>
            <Plus size={15} /> Add expense
          </Button>
          <Button size="sm" onClick={() => setAddMember(true)}>
            <UserPlus size={15} /> Add member
          </Button>
        </div>
      </HeroCard>

      {members.length < 2 && <Card className="text-[13.5px] text-muted">Add at least two members (including yourself) to start splitting.</Card>}

      <SectionTitle>Balances</SectionTitle>
      <List>
        {members.map((m) => {
          const v = net.get(m.id) ?? 0;
          return (
            <ListRow
              key={m.id}
              icon={<IconBubble tone={m.is_me ? 'primary' : 'violet'}><span className="text-[13px] font-bold">{m.name.slice(0, 1).toUpperCase()}</span></IconBubble>}
              title={m.is_me ? `${m.name} (you)` : m.name}
              subtitle={v > 0 ? 'gets back' : v < 0 ? 'owes' : 'settled'}
              right={<span className={cx('text-[14px] font-semibold', v > 0 && 'text-income', v < 0 && 'text-expense')}>{formatINR(Math.abs(v))}</span>}
              onClick={() => nav(`/r/group_members/${m.id}/edit`)}
            />
          );
        })}
      </List>

      {plan.length > 0 && (
        <>
          <SectionTitle>Who pays whom</SectionTitle>
          <List>
            {plan.map((p, i) => (
              <ListRow
                key={i}
                title={
                  <span className="flex items-center gap-1.5">
                    {name(p.from)} <ArrowRight size={14} className="text-muted" /> {name(p.to)}
                  </span>
                }
                right={
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">{formatINR(p.amount_paise)}</span>
                    <Button size="sm" variant="primary" onClick={() => setSettle({ from: p.from, to: p.to, amount_paise: p.amount_paise })}>
                      Settle
                    </Button>
                  </div>
                }
              />
            ))}
          </List>
        </>
      )}

      <SectionTitle>Expenses</SectionTitle>
      {expenses.length === 0 ? (
        <Empty title="No expenses yet" />
      ) : (
        <List>
          {expenses.map((e) => (
            <ListRow
              key={e.id}
              icon={<IconBubble tone="violet"><Users size={16} /></IconBubble>}
              title={e.title}
              subtitle={`${relativeDay(e.txn_date)} · paid by ${(e.payers as Part[]).map((p) => name(p.member_id)).join(', ')}`}
              right={<span className="text-[14px] font-semibold">{formatINR(e.amount_paise)}</span>}
              onClick={() => setParams({ expense: e.id })}
            />
          ))}
        </List>
      )}

      {settlements.length > 0 && (
        <>
          <SectionTitle>Settlement history</SectionTitle>
          <List>
            {settlements.map((s) => (
              <ListRow
                key={s.id}
                title={`${name(s.from_member_id)} paid ${name(s.to_member_id)}`}
                subtitle={relativeDay(s.txn_date)}
                right={<span className="text-[14px] font-semibold">{formatINR(s.amount_paise)}</span>}
                onClick={() => nav(`/r/group_settlements/${s.id}`)}
                chevron
              />
            ))}
          </List>
          <p className="px-1 text-[12px] text-muted">Settlements only move money between people — they never count as extra expenses.</p>
        </>
      )}

      <AddMemberSheet open={addMember} onClose={() => setAddMember(false)} groupId={group.id} hasMe={!!me} onAdded={load} />
      {editing && (
        <ExpenseEditor
          key={editing}
          groupId={group.id}
          expenseId={editing === 'new' ? null : editing}
          members={members}
          existing={expenses.find((e) => e.id === editing) ?? null}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            load();
          }}
        />
      )}
      <Confirm
        open={!!settle}
        title="Record settlement?"
        message={settle ? `${name(settle.from)} pays ${name(settle.to)} ${formatINR(settle.amount_paise)}.` : ''}
        confirmLabel="Record"
        loading={busy}
        onConfirm={doSettle}
        onClose={() => setSettle(null)}
      />
    </Page>
  );
}

function AddMemberSheet({ open, onClose, groupId, hasMe, onAdded }: { open: boolean; onClose: () => void; groupId: string; hasMe: boolean; onAdded: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [isMe, setIsMe] = useState(!hasMe);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(hasMe ? '' : 'Me');
      setIsMe(!hasMe);
    }
  }, [open, hasMe]);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createRecord('group_members', { group_id: groupId, name: name.trim(), is_me: isMe });
      toast('Member added');
      onAdded();
      setName('');
      setIsMe(false);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add member">
      <div className="space-y-3">
        <FormRow label="Name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </FormRow>
        {!hasMe && (
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[14px]">This is me</span>
            <Toggle checked={isMe} onChange={setIsMe} />
          </div>
        )}
        <Button variant="primary" full loading={busy} onClick={save}>
          Add
        </Button>
        <Button full onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

type SplitType = 'equal' | 'custom' | 'percent' | 'itemwise';

function ExpenseEditor({
  groupId,
  expenseId,
  members,
  existing,
  onClose,
  onSaved,
}: {
  groupId: string;
  expenseId: string | null;
  members: Row[];
  existing: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const me = members.find((m) => m.is_me) ?? members[0];
  const [title, setTitle] = useState(existing?.title ?? '');
  const [amount, setAmount] = useState(existing ? paiseToInput(existing.amount_paise) : '');
  const [date, setDate] = useState(existing?.txn_date ?? todayISO());
  const [splitType, setSplitType] = useState<SplitType>((existing?.split_type as SplitType) ?? 'equal');
  // payers: member -> amount string
  const [payers, setPayers] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    if (existing) (existing.payers as Part[]).forEach((x) => (p[x.member_id] = paiseToInput(x.amount_paise)));
    return p;
  });
  const [multiPayer, setMultiPayer] = useState(existing ? (existing.payers as Part[]).length > 1 : false);
  const [singlePayer, setSinglePayer] = useState(existing ? (existing.payers as Part[])[0]?.member_id : me?.id);
  const [included, setIncluded] = useState<string[]>(() => (existing && existing.split_type === 'equal' ? (existing.shares as Part[]).map((s) => s.member_id) : members.map((m) => m.id)));
  const [custom, setCustom] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    if (existing && existing.split_type !== 'equal') (existing.shares as Part[]).forEach((x) => (c[x.member_id] = paiseToInput(x.amount_paise)));
    return c;
  });
  const [items, setItems] = useState<{ name: string; amount: string; members: string[] }[]>([{ name: '', amount: '', members: members.map((m) => m.id) }]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);

  const total = parseRupeesToPaise(amount) ?? 0;

  const computeShares = (): Part[] | string => {
    if (splitType === 'equal') {
      if (!included.length) return 'Select who shares this expense.';
      return splitEqual(total, included);
    }
    if (splitType === 'custom') {
      const parts = members.map((m) => ({ member_id: m.id, amount_paise: parseRupeesToPaise(custom[m.id] || '0') ?? -1 }));
      if (parts.some((p) => p.amount_paise < 0)) return 'Enter valid amounts.';
      const sum = parts.reduce((s, p) => s + p.amount_paise, 0);
      if (sum !== total) return `Shares add up to ${formatINR(sum)}, total is ${formatINR(total)}.`;
      return mergeParts(parts);
    }
    if (splitType === 'percent') {
      const bps = members.map((m) => ({ member_id: m.id, bp: parseRupeesToPaise(custom[m.id] || '0') ?? -1 }));
      if (bps.some((b) => b.bp < 0)) return 'Enter valid percentages.';
      const sum = bps.reduce((s, b) => s + b.bp, 0);
      if (sum !== 10000) return `Percentages add up to ${sum / 100}%, need 100%.`;
      return mergeParts(splitPercent(total, bps));
    }
    const parsed = items.filter((i) => i.amount.trim()).map((i) => ({ amount_paise: parseRupeesToPaise(i.amount) ?? -1, members: i.members }));
    if (!parsed.length) return 'Add at least one item.';
    if (parsed.some((i) => i.amount_paise <= 0 || !i.members.length)) return 'Each item needs an amount and at least one person.';
    const sum = parsed.reduce((s, i) => s + i.amount_paise, 0);
    if (sum !== total) return `Items add up to ${formatINR(sum)}, total is ${formatINR(total)}.`;
    return splitItems(parsed);
  };

  const computePayers = (): Part[] | string => {
    if (!multiPayer) return singlePayer ? [{ member_id: singlePayer, amount_paise: total }] : 'Choose who paid.';
    const parts = members.map((m) => ({ member_id: m.id, amount_paise: parseRupeesToPaise(payers[m.id] || '0') ?? -1 }));
    if (parts.some((p) => p.amount_paise < 0)) return 'Enter valid paid amounts.';
    const sum = parts.reduce((s, p) => s + p.amount_paise, 0);
    if (sum !== total) return `Paid amounts add up to ${formatINR(sum)}, total is ${formatINR(total)}.`;
    return mergeParts(parts);
  };

  const save = async () => {
    setErr('');
    if (!title.trim()) return setErr('Enter a title.');
    if (total <= 0) return setErr('Enter the total amount.');
    const shares = computeShares();
    if (typeof shares === 'string') return setErr(shares);
    const pays = computePayers();
    if (typeof pays === 'string') return setErr(pays);
    const values = { group_id: groupId, title: title.trim(), amount_paise: total, txn_date: date, split_type: splitType, payers: pays, shares };
    setBusy(true);
    try {
      if (expenseId) await updateRecord('group_expenses', expenseId, values);
      else await createRecord('group_expenses', values);
      toast(expenseId ? 'Expense updated' : 'Expense added');
      onSaved();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!expenseId) return;
    try {
      await softDelete('group_expenses', expenseId);
      toast('Moved to Recycle Bin');
      onSaved();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const preview = total > 0 ? computeShares() : null;

  return (
    <Sheet open onClose={onClose} title={expenseId ? 'Edit expense' : 'Add expense'}>
      <div className="space-y-3">
        <FormRow label="Title">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner" />
        </FormRow>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Total (₹)">
            <input className="field text-[17px] font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </FormRow>
          <FormRow label="Date">
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormRow>
        </div>

        <div className="flex items-center justify-between px-0.5">
          <span className="text-[13px] font-medium text-muted">More than one person paid</span>
          <Toggle checked={multiPayer} onChange={setMultiPayer} />
        </div>
        {!multiPayer ? (
          <FormRow label="Paid by">
            <select className="field" value={singlePayer} onChange={(e) => setSinglePayer(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </FormRow>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="flex-1 text-[14px]">{m.name} paid</span>
                <input className="field w-28" inputMode="decimal" placeholder="0" value={payers[m.id] ?? ''} onChange={(e) => setPayers((p) => ({ ...p, [m.id]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}

        <Segmented
          value={splitType}
          onChange={setSplitType}
          options={[
            { value: 'equal', label: 'Equal' },
            { value: 'custom', label: 'Amount' },
            { value: 'percent', label: '%' },
            { value: 'itemwise', label: 'Items' },
          ]}
        />

        {splitType === 'equal' && (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = included.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => setIncluded((x) => (on ? x.filter((y) => y !== m.id) : [...x, m.id]))}
                  className={cx('liquid h-8 rounded-full px-3 text-[12.5px] font-semibold', on && 'liquid-primary')}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        )}
        {(splitType === 'custom' || splitType === 'percent') && (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="flex-1 text-[14px]">{m.name}</span>
                <input
                  className="field w-28"
                  inputMode="decimal"
                  placeholder={splitType === 'percent' ? '%' : '₹'}
                  value={custom[m.id] ?? ''}
                  onChange={(e) => setCustom((c) => ({ ...c, [m.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}
        {splitType === 'itemwise' && (
          <div className="space-y-2.5">
            {items.map((it, i) => (
              <div key={i} className="rounded-[14px] bg-[var(--card-2)] p-2.5">
                <div className="flex gap-2">
                  <input className="field flex-1" placeholder="Item" value={it.name} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                  <input className="field w-24" inputMode="decimal" placeholder="₹" value={it.amount} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
                  <button aria-label="Remove item" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} className="text-muted">
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const on = it.members.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => setItems((x) => x.map((y, j) => (j === i ? { ...y, members: on ? y.members.filter((z) => z !== m.id) : [...y.members, m.id] } : y)))}
                        className={cx('liquid h-7 rounded-full px-2.5 text-[12px] font-semibold', on && 'liquid-primary')}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Button size="sm" onClick={() => setItems((x) => [...x, { name: '', amount: '', members: members.map((m) => m.id) }])}>
              <Plus size={14} /> Item
            </Button>
          </div>
        )}

        {Array.isArray(preview) && preview.length > 0 && (
          <div className="rounded-[14px] bg-[var(--card-2)] p-3 text-[13px]">
            <p className="mb-1 font-semibold">Shares</p>
            {preview.map((p) => (
              <div key={p.member_id} className="flex justify-between">
                <span>{members.find((m) => m.id === p.member_id)?.name}</span>
                <span className="font-medium">{formatINR(p.amount_paise)}</span>
              </div>
            ))}
          </div>
        )}

        {err && <p className="px-0.5 text-[13px] text-danger">{err}</p>}
        <Button variant="primary" size="lg" full loading={busy} onClick={save}>
          {expenseId ? 'Save changes' : 'Add expense'}
        </Button>
        {expenseId && (
          <Button full variant="danger" onClick={() => setDel(true)}>
            <Trash2 size={15} /> Delete
          </Button>
        )}
        {expenseId && <Badge>Edit history is kept for this expense</Badge>}
      </div>
      <Confirm open={del} title="Delete expense?" message="It moves to the Recycle Bin and balances update." confirmLabel="Delete" danger onConfirm={remove} onClose={() => setDel(false)} />
    </Sheet>
  );
}
