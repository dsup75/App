// Subscription shared by several people (e.g. YouTube Premium for 4): who paid the bill, each person's share,
// who has paid you back (fully / partly) and who will pay later — cycle by cycle.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Check, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR, paiseToInput } from '../lib/money';
import { formatDate, todayISO } from '../lib/dates';
import { approveRule, advanceRule } from '../lib/recurring';
import { friendlyError, type Row } from '../lib/db';
import { invalidateLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, FormRow, ProgressBar, Segmented, Sheet } from './ui';

interface Bill {
  id: string;
  amount_paise: number;
  txn_date: string;
  due_for: string | null;
  payers: { member_id: string; amount_paise: number }[];
  shares: { member_id: string; amount_paise: number }[];
}
interface Settle {
  id: string;
  from_member_id: string;
  to_member_id: string;
  amount_paise: number;
  due_for: string | null;
  txn_date: string;
}

const toPaise = (s: string) => Math.round(Number(String(s).replace(/,/g, '')) * 100) || 0;

export function SubscriptionPeople({ rule, reloadKey }: { rule: Row; reloadKey: number }) {
  const nav = useNavigate();
  const toast = useToast();
  const [groupId, setGroupId] = useState<string | null>(rule.split_group_id ?? null);
  const [members, setMembers] = useState<Row[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [settles, setSettles] = useState<Settle[]>([]);
  const [groups, setGroups] = useState<Row[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [pay, setPay] = useState<{ member: Row; bill: Bill; due: number } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  const load = useCallback(async () => {
    const gs = await supabase.from('groups').select('id,name').is('deleted_at', null).order('name');
    setGroups((gs.data ?? []) as Row[]);
    if (!groupId) return;
    const [m, b, st] = await Promise.all([
      supabase.from('group_members').select('id,name,is_me').eq('group_id', groupId).is('deleted_at', null).order('created_at'),
      supabase.from('group_expenses').select('id,amount_paise,txn_date,due_for,payers,shares').eq('recurring_rule_id', rule.id).is('deleted_at', null).order('due_for', { ascending: false }),
      supabase.from('group_settlements').select('id,from_member_id,to_member_id,amount_paise,due_for,txn_date').eq('recurring_rule_id', rule.id).is('deleted_at', null),
    ]);
    setMembers((m.data ?? []) as Row[]);
    setBills((b.data ?? []) as Bill[]);
    setSettles((st.data ?? []) as Settle[]);
  }, [groupId, rule.id]);
  useEffect(() => {
    load();
  }, [load, reloadKey, tick]);

  const me = members.find((m) => m.is_me);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? 'Member';

  /** For one cycle: what each person owes the payer and what they have paid back */
  const cycleRows = (b: Bill) => {
    const payer = b.payers[0]?.member_id;
    return b.shares
      .filter((sh) => sh.member_id !== payer)
      .map((sh) => {
        const paid = settles
          .filter((x) => x.from_member_id === sh.member_id && x.to_member_id === payer && (x.due_for ?? '') === (b.due_for ?? ''))
          .reduce((t, x) => t + Number(x.amount_paise), 0);
        return { member_id: sh.member_id, share: Number(sh.amount_paise), paid, left: Math.max(0, Number(sh.amount_paise) - paid), payer };
      });
  };
  const totals = useMemo(() => {
    let toCollect = 0;
    let collected = 0;
    let iOwe = 0;
    for (const b of bills) {
      for (const r of cycleRows(b)) {
        if (r.payer === me?.id) {
          toCollect += r.left;
          collected += r.paid;
        } else if (r.member_id === me?.id) iOwe += r.left;
      }
    }
    return { toCollect, collected, iOwe };
  }, [bills, settles, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const thisCycleLogged = bills.some((b) => b.due_for === rule.next_date);

  if (!groupId) {
    return (
      <Card className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <p className="min-w-0 flex-1 text-[14px] font-semibold">Shared with other people?</p>
        </div>
        <p className="text-[12.5px] text-muted">E.g. YouTube Premium for 4: add the people, and for every bill the app keeps each person's share — who paid now and who will pay later.</p>
        <Button full variant="primary" onClick={() => setShareOpen(true)}>
          <Plus size={14} /> Share with people
        </Button>
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} rule={rule} groups={groups} onDone={(g) => { setGroupId(g); reload(); }} />
      </Card>
    );
  }

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <p className="min-w-0 flex-1 text-[14px] font-semibold">Shared by {members.length} people</p>
          <Button size="sm" onClick={() => nav(`/groups/${groupId}`)}>Group</Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[12px] p-2" style={{ background: 'var(--card-2)' }}>
            <p className="text-[11px] text-muted">To collect</p>
            <p className="text-[14.5px] font-bold text-warn">{formatINR(totals.toCollect)}</p>
          </div>
          <div className="rounded-[12px] p-2" style={{ background: 'var(--card-2)' }}>
            <p className="text-[11px] text-muted">Received</p>
            <p className="text-[14.5px] font-bold text-income">{formatINR(totals.collected)}</p>
          </div>
          <div className="rounded-[12px] p-2" style={{ background: 'var(--card-2)' }}>
            <p className="text-[11px] text-muted">You owe</p>
            <p className="text-[14.5px] font-bold">{formatINR(totals.iOwe)}</p>
          </div>
        </div>
        {!me && <p className="text-[12px] text-danger">Add yourself as "me" in the group so shares can be worked out.</p>}
        {!thisCycleLogged && rule.status === 'active' && (
          <Button full variant="primary" onClick={() => setLogOpen(true)}>
            <Receipt size={14} /> Log bill for {formatDate(rule.next_date)}
          </Button>
        )}
      </Card>

      {bills.map((b) => {
        const rows = cycleRows(b);
        const payer = b.payers[0]?.member_id;
        const paidAll = rows.every((r) => r.left === 0);
        const got = rows.reduce((t, r) => t + r.paid, 0);
        const need = rows.reduce((t, r) => t + r.share, 0);
        return (
          <Card key={b.id} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[14px] font-semibold">{formatDate(b.due_for ?? b.txn_date)} · {formatINR(b.amount_paise)}</p>
              <Badge tone={paidAll ? 'primary' : got > 0 ? 'blue' : 'amber'}>{paidAll ? 'Settled' : got > 0 ? 'Partly paid' : 'Pending'}</Badge>
            </div>
            <p className="text-[12px] text-muted">Paid by {payer === me?.id ? 'you' : name(payer)} · each share {formatINR(b.shares[0]?.amount_paise ?? 0)}</p>
            {need > 0 && <ProgressBar pct={(got / need) * 100} />}
            {rows.map((r) => (
              <div key={r.member_id} className="flex items-center gap-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate">
                  {r.member_id === me?.id ? 'You' : name(r.member_id)}
                  <span className="text-[11.5px] text-muted"> · {r.left === 0 ? `paid ${formatINR(r.paid)}` : r.paid ? `paid ${formatINR(r.paid)}, ${formatINR(r.left)} left` : `owes ${formatINR(r.left)}`}</span>
                </span>
                {r.left === 0 ? (
                  <Badge tone="primary"><Check size={11} /> Paid</Badge>
                ) : (
                  <Button size="sm" onClick={() => setPay({ member: members.find((m) => m.id === r.member_id)!, bill: b, due: r.left })}>
                    {r.member_id === me?.id ? 'I paid' : 'Got money'}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        );
      })}

      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} rule={rule} groupId={groupId} members={members} onDone={reload} />
      <PaySheet info={pay} onClose={() => setPay(null)} rule={rule} groupId={groupId} onDone={reload} name={name} />
    </>
  );
}

/* ---- pick or create the group of people ---- */
function ShareSheet({ open, onClose, rule, groups, onDone }: { open: boolean; onClose: () => void; rule: Row; groups: Row[]; onDone: (g: string) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [names, setNames] = useState('');
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      let gid = pick;
      if (mode === 'new') {
        const people = names.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
        if (!people.length) throw new Error('Type the other people’s names (comma separated).');
        const g = await supabase.from('groups').insert({ name: `${rule.title} (shared)`.slice(0, 120), kind: 'personal' }).select('id').single();
        if (g.error) throw g.error;
        gid = g.data.id;
        const m = await supabase.from('group_members').insert([{ group_id: gid, name: 'Me', is_me: true }, ...people.map((n) => ({ group_id: gid, name: n.slice(0, 80) }))]);
        if (m.error) throw m.error;
      }
      if (!gid) throw new Error('Pick a group');
      const u = await supabase.from('recurring_rules').update({ split_group_id: gid }).eq('id', rule.id);
      if (u.error) throw u.error;
      invalidateLookups();
      toast('Shared — each bill will be split');
      onDone(gid);
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Share with people">
      <div className="space-y-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'new', label: 'New people' }, { value: 'existing', label: 'Existing group' }]} />
        {mode === 'new' ? (
          <FormRow label="Other people (you are added automatically)" hint="e.g. Rahul, Priya, Aman">
            <textarea className="field min-h-[80px]" value={names} onChange={(e) => setNames(e.target.value)} placeholder="Rahul, Priya, Aman" />
          </FormRow>
        ) : (
          <FormRow label="Group">
            <select className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </FormRow>
        )}
        <p className="text-[11.5px] text-muted">Each bill is split equally between everyone (you included).</p>
        <Button full variant="primary" loading={busy} onClick={save}>Save</Button>
      </div>
    </Sheet>
  );
}

/* ---- log this cycle's bill: paid by me (from my account) or by someone else ---- */
function LogSheet({ open, onClose, rule, groupId, members, onDone }: { open: boolean; onClose: () => void; rule: Row; groupId: string; members: Row[]; onDone: () => void }) {
  const toast = useToast();
  const me = members.find((m) => m.is_me);
  const [payer, setPayer] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setPayer(me?.id ?? '');
  }, [open, me?.id]);
  const save = async () => {
    if (!me || members.length < 2) return toast('Add yourself and at least one more person first', 'error');
    setBusy(true);
    try {
      if (payer === me.id) {
        // my expense from my account — the server adds the split bill (paid by me) automatically
        await approveRule(rule);
      } else {
        const n = members.length;
        const amt = Number(rule.amount_paise);
        const each = Math.floor(amt / n);
        const shares = members.map((m, i) => ({ member_id: m.id, amount_paise: each + (i === 0 ? amt - each * n : 0) }));
        const { error } = await supabase.from('group_expenses').insert({
          group_id: groupId, title: String(rule.title).slice(0, 120), amount_paise: amt, txn_date: todayISO(), split_type: 'equal',
          payers: [{ member_id: payer, amount_paise: amt }], shares, recurring_rule_id: rule.id, due_for: rule.next_date,
          notes: 'Subscription bill paid by another member',
        });
        if (error) throw error;
        await advanceRule(rule);
      }
      toast('Bill logged and split');
      onDone();
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Bill for ${formatDate(rule.next_date)}`}>
      <div className="space-y-3">
        <p className="text-[13px]">{formatINR(rule.amount_paise)} split between {members.length} people ({formatINR(Math.floor(Number(rule.amount_paise) / Math.max(1, members.length)))} each)</p>
        <FormRow label="Who paid the bill?">
          <select className="field" value={payer} onChange={(e) => setPayer(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.is_me ? 'Me (from my account)' : m.name}</option>)}
          </select>
        </FormRow>
        <p className="text-[11.5px] text-muted">If you paid, an expense is added to your account. If someone else paid, only your share is noted as owed to them.</p>
        <Button full variant="primary" loading={busy} onClick={save}>Log bill</Button>
      </div>
    </Sheet>
  );
}

/* ---- record a payment of a share (full or part) ---- */
function PaySheet({ info, onClose, rule, groupId, onDone, name }: { info: { member: Row; bill: Bill; due: number } | null; onClose: () => void; rule: Row; groupId: string; onDone: () => void; name: (id: string) => string }) {
  const toast = useToast();
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (info) setAmt(paiseToInput(info.due));
  }, [info]);
  if (!info) return null;
  const payer = info.bill.payers[0]?.member_id;
  const save = async () => {
    const p = toPaise(amt);
    if (p <= 0 || p > info.due) return toast(`Enter up to ${formatINR(info.due)}`, 'error');
    setBusy(true);
    const { error } = await supabase.from('group_settlements').insert({
      group_id: groupId, title: `${rule.title} share`.slice(0, 120), from_member_id: info.member.id, to_member_id: payer, amount_paise: p,
      txn_date: todayISO(), recurring_rule_id: rule.id, due_for: info.bill.due_for,
    });
    setBusy(false);
    if (error) return toast(friendlyError(error), 'error');
    toast(p === info.due ? 'Marked as paid' : 'Part payment saved — rest still pending');
    onDone();
    onClose();
  };
  return (
    <Sheet open={!!info} onClose={onClose} title={info.member.is_me ? `You paid ${name(payer)}` : `${info.member.name} paid you`}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Share left for {formatDate(info.bill.due_for ?? info.bill.txn_date)}: {formatINR(info.due)}</p>
        <FormRow label="Amount (₹)" hint="Less than the full share = part payment; the rest stays pending.">
          <input className="field" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </FormRow>
        <Button full variant="primary" loading={busy} onClick={save}>Save</Button>
      </div>
    </Sheet>
  );
}
