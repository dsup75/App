// Detail-page cards for money entries: Money journey + Activity (history & reverse)
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, History, Route, Undo2 } from 'lucide-react';
import { formatINR } from '../lib/money';
import { formatDate } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import {
  fetchHistory, getReversals, journeyBack, journeyForward, reverseEntry,
  type HistoryEvent, type JourneyStep, type Reversal,
} from '../lib/moneyTools';
import { useToast } from '../context/ToastContext';
import { Button, Card, FormRow, Sheet, cx } from './ui';

const SOURCE_TABLES = ['incomes', 'transfers', 'loans', 'loan_repayments'];
const TARGET_TABLES = ['expenses', 'transfers', 'loans', 'loan_repayments'];

function StepList({ steps, back }: { steps: JourneyStep[]; back?: boolean }) {
  const nav = useNavigate();
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const tbl = back ? s.from_table : s.to_table;
        const id = back ? s.from_id : s.to_id;
        const title = back ? s.from_title : s.to_title;
        return (
          <button
            key={i}
            type="button"
            onClick={() => nav(`/r/${tbl}/${id}`)}
            className="flex w-full items-center gap-2 text-left text-[13px]"
            style={{ paddingLeft: `${(s.depth - 1) * 14}px` }}
          >
            <ArrowRight size={13} className={cx('shrink-0', back ? 'rotate-180 text-income' : 'text-muted')} />
            <span className="min-w-0 flex-1 truncate">
              {title ?? 'Entry'}
              <span className="text-muted">
                {' '}
                · {tbl === 'transfers' ? 'transfer' : tbl === 'expenses' ? 'expense' : tbl === 'incomes' ? 'income' : 'udhaar'}
                {!back && s.to_account_name ? ` · ${s.to_account_name}` : ''}
              </span>
            </span>
            <span className="shrink-0 font-semibold">{formatINR(s.amount_paise)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MoneyJourneyCard({ table, id, reloadKey }: { table: string; id: string; reloadKey?: number }) {
  const { nameOf } = useLookups();
  const [fwd, setFwd] = useState<JourneyStep[] | null>(null);
  const [back, setBack] = useState<JourneyStep[] | null>(null);
  const [now, setNow] = useState<{ account_id: string; available_paise: number; spent_paise: number; moved_out_paise: number; received_paise: number }[]>([]);

  useEffect(() => {
    if (SOURCE_TABLES.includes(table)) {
      journeyForward(table, id).then(setFwd).catch(() => setFwd([]));
      supabase
        .from('source_positions')
        .select('account_id,available_paise,spent_paise,moved_out_paise,received_paise')
        .eq('source_table', table)
        .eq('source_id', id)
        .then(({ data }) => setNow(((data as any[]) ?? []).map((x) => ({ ...x, available_paise: Number(x.available_paise) }))));
    } else setFwd([]);
    if (TARGET_TABLES.includes(table)) journeyBack(table, id).then(setBack).catch(() => setBack([]));
    else setBack([]);
  }, [table, id, reloadKey]);

  if (fwd === null || back === null) return null;
  const hasNow = now.some((n) => Number(n.received_paise) > 0 || n.available_paise !== 0);
  if (!fwd.length && !back.length && !hasNow) return null;
  const totalLeft = now.reduce((t, n) => t + Math.max(0, n.available_paise), 0);
  const spent = fwd.filter((s) => s.to_table !== 'transfers').reduce((t, s) => t + s.amount_paise, 0);
  const moved = fwd.filter((s) => s.depth === 1 && s.to_table === 'transfers').reduce((t, s) => t + s.amount_paise, 0);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Route size={16} className="text-primary" />
        <p className="text-[14px] font-semibold">Money journey</p>
      </div>
      {back.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] font-semibold text-muted">Where this money came from</p>
          <StepList steps={back} back />
        </div>
      )}
      {SOURCE_TABLES.includes(table) && (hasNow || fwd.length > 0) && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-[12px] p-2" style={{ background: 'var(--card-2)' }}>
              <p className="text-[11px] text-muted">Moved</p>
              <p className="text-[14px] font-semibold">{formatINR(moved)}</p>
            </div>
            <div className="rounded-[12px] p-2" style={{ background: 'var(--card-2)' }}>
              <p className="text-[11px] text-muted">Spent</p>
              <p className="text-[14px] font-semibold">{formatINR(spent)}</p>
            </div>
            <div className="rounded-[12px] p-2" style={{ background: 'var(--card-2)' }}>
              <p className="text-[11px] text-muted">Left</p>
              <p className="text-[14px] font-semibold text-income">{formatINR(totalLeft)}</p>
            </div>
          </div>
          {now.filter((n) => n.available_paise > 0).length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] font-semibold text-muted">Where it is now</p>
              {now
                .filter((n) => n.available_paise > 0)
                .map((n) => (
                  <div key={n.account_id} className="flex items-center justify-between text-[13px]">
                    <span>{nameOf(n.account_id)}</span>
                    <span className="font-semibold">{formatINR(n.available_paise)}</span>
                  </div>
                ))}
            </div>
          )}
          {fwd.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold text-muted">Where it went</p>
              <StepList steps={fwd} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const EVENT_LABEL: Record<string, string> = { created: 'Created', edited: 'Edited', deleted: 'Moved to Recycle Bin', restored: 'Restored' };
const HIDE_FIELDS = new Set(['updated_at', 'line_count', 'sources']);

function show(v: unknown) {
  if (v === null || v === undefined || v === 'null') return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  return String(v).slice(0, 40);
}

export function ActivityCard({ table, id, deleted }: { table: string; id: string; deleted?: boolean }) {
  const nav = useNavigate();
  const toast = useToast();
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [rev, setRev] = useState<Reversal[]>([]);
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const canReverse = ['incomes', 'expenses', 'transfers'].includes(table) && !deleted;

  useEffect(() => {
    fetchHistory({ table, id, limit: 60 })
      .then((h) => setEvents(h.filter((e) => !HIDE_FIELDS.has(e.field))))
      .catch(() => setEvents([]));
    getReversals(table, id).then(setRev).catch(() => setRev([]));
  }, [table, id]);

  const reversedBy = rev.find((r) => r.original_table === table && r.original_id === id);
  const reverses = rev.find((r) => r.reversal_table === table && r.reversal_id === id);

  const doReverse = async () => {
    setBusy(true);
    try {
      const newId = await reverseEntry(table, id, reason);
      const target = table === 'incomes' ? 'expenses' : table === 'expenses' ? 'incomes' : 'transfers';
      toast('Reversal entry created — the original was not changed');
      setAsk(false);
      nav(`/r/${target}/${newId}`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (events === null) return null;
  return (
    <Card className="space-y-2.5">
      <div className="flex items-center gap-2">
        <History size={16} className="text-primary" />
        <p className="min-w-0 flex-1 text-[14px] font-semibold">Activity</p>
        {canReverse && !reversedBy && !reverses && (
          <button type="button" className="liquid flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-semibold" onClick={() => setAsk(true)}>
            <Undo2 size={13} /> Reverse
          </button>
        )}
      </div>
      {reversedBy && (
        <button type="button" onClick={() => nav(`/r/${reversedBy.reversal_table}/${reversedBy.reversal_id}`)} className="w-full rounded-[12px] p-2.5 text-left text-[13px]" style={{ background: 'var(--primary-soft)' }}>
          ↩ Reversed on {formatDate(reversedBy.created_at.slice(0, 10))}
          {reversedBy.reason ? ` — ${reversedBy.reason}` : ''} · open reversal
        </button>
      )}
      {reverses && (
        <button type="button" onClick={() => nav(`/r/${reverses.original_table}/${reverses.original_id}`)} className="w-full rounded-[12px] p-2.5 text-left text-[13px]" style={{ background: 'var(--primary-soft)' }}>
          ↩ This entry reverses an earlier one · open original
        </button>
      )}
      {!events.length ? (
        <p className="text-[12.5px] text-muted">No activity recorded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {events.slice(0, 15).map((e) => (
            <div key={e.id} className="flex gap-2 text-[12.5px]">
              <span className="w-[92px] shrink-0 text-muted">
                {new Date(e.changed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                {e.event_type === 'edited' && (
                  <span className="text-muted">
                    {' '}
                    {e.field.replace(/_paise$/, '').replace(/_/g, ' ')}: {show(e.old_value)} → {show(e.new_value)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {canReverse && <p className="text-[11.5px] text-muted">Reverse creates a new opposite entry. The original stays as it is, so nothing is lost.</p>}

      {createPortal(
      <Sheet open={ask} onClose={() => setAsk(false)} title="Reverse this entry?">
        <div className="space-y-3">
          <p className="text-[13.5px] text-muted">
            A new {table === 'incomes' ? 'expense' : table === 'expenses' ? 'income' : 'transfer (opposite way)'} with the same amount and accounts will be added today. Balances go back to how they were. The original entry is not changed.
          </p>
          <FormRow label="Reason (optional)">
            <input className="field" placeholder="e.g. Payment failed, refunded" value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormRow>
          <div className="grid grid-cols-2 gap-2">
            <Button full onClick={() => setAsk(false)}>
              Cancel
            </Button>
            <Button full variant="primary" loading={busy} onClick={doReverse}>
              Reverse
            </Button>
          </div>
        </div>
      </Sheet>,
      document.body,
      )}
    </Card>
  );
}
