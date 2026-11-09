// List screens for modules built on the generic TableList
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Circle, Pin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError, updateRecord, type Row } from '../lib/db';
import { formatINR, sumPaise } from '../lib/money';
import { formatDate, relativeDay, todayISO } from '../lib/dates';
import { useToast } from '../context/ToastContext';
import { TableList } from '../components/TableList';
import { RecordLine } from '../components/RecordLine';
import { invoiceStatus, simpleInterest } from '../components/DetailExtras';
import { Badge, HeroCard, IconBubble, List, ListRow, ProgressBar, cx } from '../components/ui';
import { HandCoins, PiggyBank, FileText } from 'lucide-react';

const today = () => todayISO();

/* ---------------- Invoices ---------------- */
export function InvoicesScreen() {
  const nav = useNavigate();
  const [totals, setTotals] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    supabase.from('invoice_totals').select('id,received_paise').then(({ data }) => {
      setTotals(new Map(((data as any[]) ?? []).map((x) => [x.id, Number(x.received_paise)])));
    });
  }, []);
  const recv = (r: Row) => totals.get(r.id) ?? 0;
  const open = (r: Row) => r.status === 'sent' && recv(r) < r.amount_paise;
  return (
    <TableList
      table="invoices"
      order="issue_date"
      filters={[
        { value: 'open', label: 'Unpaid', test: open },
        { value: 'overdue', label: 'Overdue', test: (r) => open(r) && !!r.due_date && r.due_date < today() },
        { value: 'paid', label: 'Paid', test: (r) => r.status === 'sent' && recv(r) >= r.amount_paise },
        { value: 'draft', label: 'Draft', test: (r) => r.status === 'draft' },
        { value: 'all', label: 'All', test: () => true },
      ]}
      header={(rows) => {
        const outstanding = rows.filter(open).reduce((s, r) => s + (r.amount_paise - recv(r)), 0);
        return (
          <HeroCard>
            <p className="text-[13px] opacity-80">Outstanding from clients</p>
            <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(outstanding)}</p>
            <p className="text-[12px] opacity-80">{rows.filter(open).length} unpaid invoices</p>
          </HeroCard>
        );
      }}
      renderRows={(rows, nameOf) => (
        <List>
          {rows.map((r) => {
            const st = invoiceStatus(r, recv(r));
            return (
              <ListRow
                key={r.id}
                icon={<IconBubble tone="teal"><FileText size={17} /></IconBubble>}
                title={`${nameOf(r.client_id)} · ${r.invoice_no}`}
                subtitle={[r.period, r.due_date && `Due ${formatDate(r.due_date)}`].filter(Boolean).join(' · ') || r.title}
                right={
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[14px] font-semibold">{formatINR(r.amount_paise - recv(r) > 0 && r.status === 'sent' ? r.amount_paise - recv(r) : r.amount_paise)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                }
                onClick={() => nav(`/r/invoices/${r.id}`)}
              />
            );
          })}
        </List>
      )}
    />
  );
}

/* ---------------- Udhaar / Loans ---------------- */
export function LoansScreen() {
  const nav = useNavigate();
  const [totals, setTotals] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    supabase.from('loan_totals').select('id,principal_repaid_paise').then(({ data }) => {
      setTotals(new Map(((data as any[]) ?? []).map((x) => [x.id, Number(x.principal_repaid_paise)])));
    });
  }, []);
  const remaining = (r: Row) => Math.max(0, r.principal_paise - (totals.get(r.id) ?? 0));
  return (
    <TableList
      table="loans"
      title="Udhaar & Loans"
      order="start_date"
      filters={[
        { value: 'open', label: 'Open', test: (r) => remaining(r) > 0 },
        { value: 'lent', label: 'I lent', test: (r) => r.direction === 'lent' && remaining(r) > 0 },
        { value: 'borrowed', label: 'I borrowed', test: (r) => r.direction === 'borrowed' && remaining(r) > 0 },
        { value: 'settled', label: 'Settled', test: (r) => remaining(r) === 0 },
      ]}
      header={(rows) => {
        const toGet = rows.filter((r) => r.direction === 'lent').reduce((s, r) => s + remaining(r), 0);
        const toPay = rows.filter((r) => r.direction === 'borrowed').reduce((s, r) => s + remaining(r), 0);
        return (
          <HeroCard>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[12px] opacity-80">You will get</p>
                <p className="text-[22px] font-bold">{formatINR(toGet)}</p>
              </div>
              <div>
                <p className="text-[12px] opacity-80">You have to pay</p>
                <p className="text-[22px] font-bold">{formatINR(toPay)}</p>
              </div>
            </div>
          </HeroCard>
        );
      }}
      renderRows={(rows) => (
        <List>
          {rows.map((r) => {
            const rem = remaining(r);
            const overdue = rem > 0 && r.due_date && r.due_date < today();
            const interest = r.interest_type === 'simple' ? simpleInterest(rem, r.interest_rate_bp, r.start_date) : 0;
            return (
              <ListRow
                key={r.id}
                icon={<IconBubble tone={r.direction === 'lent' ? 'income' : 'expense'}><HandCoins size={17} /></IconBubble>}
                title={r.person}
                subtitle={[r.direction === 'lent' ? 'Owes you' : 'You owe', r.due_date && `due ${relativeDay(r.due_date)}`, interest ? `+${formatINR(interest)} interest` : null]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={cx('text-[14px] font-semibold', r.direction === 'lent' ? 'text-income' : 'text-expense')}>{formatINR(rem)}</span>
                    {rem === 0 ? <Badge tone="primary">Settled</Badge> : overdue ? <Badge tone="danger">Overdue</Badge> : null}
                  </div>
                }
                onClick={() => nav(`/r/loans/${r.id}`)}
              />
            );
          })}
        </List>
      )}
    />
  );
}

/* ---------------- Savings ---------------- */
export function SavingsScreen() {
  const nav = useNavigate();
  const [totals, setTotals] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    supabase.from('savings_totals').select('id,saved_paise').then(({ data }) => {
      setTotals(new Map(((data as any[]) ?? []).map((x) => [x.id, Number(x.saved_paise)])));
    });
  }, []);
  return (
    <TableList
      table="savings_goals"
      title="Goals"
      order="created_at"
      asc
      header={(rows) => (
        <HeroCard>
          <p className="text-[13px] opacity-80">Total saved</p>
          <p className="mt-1 text-[28px] font-bold tracking-tight">{formatINR(rows.reduce((s, r) => s + (totals.get(r.id) ?? 0), 0))}</p>
          <p className="text-[12px] opacity-80">across {rows.length} goals</p>
        </HeroCard>
      )}
      renderRows={(rows) => (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const saved = totals.get(r.id) ?? 0;
            const pct = Math.round((saved / r.target_paise) * 100);
            return (
              <div key={r.id} onClick={() => nav(`/r/savings_goals/${r.id}`)} className="glass cursor-pointer rounded-[18px] p-3.5 active:scale-[0.99] transition-transform">
                <div className="flex items-center gap-3">
                  <IconBubble tone="pink"><PiggyBank size={17} /></IconBubble>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold">{r.name}</p>
                    <p className="text-[12.5px] text-muted">
                      {formatINR(saved)} of {formatINR(r.target_paise)}
                      {r.target_date ? ` · by ${formatDate(r.target_date)}` : ''}
                    </p>
                  </div>
                  <span className="text-[14px] font-bold">{pct}%</span>
                </div>
                <div className="mt-2.5">
                  <ProgressBar pct={pct} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    />
  );
}

/* ---------------- Notes ---------------- */
export function NotesScreen() {
  const nav = useNavigate();
  return (
    <TableList
      table="notes"
      order="updated_at"
      filters={[
        { value: 'all', label: 'All', test: () => true },
        { value: 'personal', label: 'Personal', test: (r) => r.area === 'personal' },
        { value: 'study', label: 'Study', test: (r) => r.area === 'study' },
        { value: 'business', label: 'Business', test: (r) => r.area === 'business' },
      ]}
      renderRows={(rows) => (
        <div className="grid grid-cols-2 gap-2.5">
          {[...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((r) => (
            <div key={r.id} onClick={() => nav(`/r/notes/${r.id}`)} className="glass cursor-pointer rounded-[18px] p-3.5 active:scale-[0.98] transition-transform">
              <div className="flex items-start justify-between gap-1">
                <p className="line-clamp-2 text-[14px] font-semibold">{r.title}</p>
                {r.pinned && <Pin size={14} className="shrink-0 text-primary" />}
              </div>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[12.5px] text-muted">{r.body}</p>
              <p className="mt-2 text-[11px] text-muted">{formatDate(r.updated_at)}</p>
            </div>
          ))}
        </div>
      )}
    />
  );
}

/* ---------------- Events ---------------- */
export function EventsScreen() {
  return (
    <TableList
      table="events"
      order="event_date"
      asc
      filters={[
        { value: 'upcoming', label: 'Upcoming', test: (r) => r.event_date >= today() },
        { value: 'past', label: 'Past', test: (r) => r.event_date < today() },
        { value: 'all', label: 'All', test: () => true },
      ]}
      renderRows={(rows, nameOf) => (
        <List>
          {rows.map((r) => (
            <EventRow key={r.id} row={r} nameOf={nameOf} />
          ))}
        </List>
      )}
    />
  );
}

function EventRow({ row }: { row: Row; nameOf: (id: string) => string }) {
  const nav = useNavigate();
  const d = new Date(row.event_date + 'T00:00:00');
  return (
    <ListRow
      icon={
        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[11px] bg-[var(--primary-soft)] text-primary">
          <span className="text-[9px] font-semibold uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
          <span className="text-[15px] font-bold leading-none">{d.getDate()}</span>
        </div>
      }
      title={row.title}
      subtitle={[relativeDay(row.event_date), row.start_time && String(row.start_time).slice(0, 5), row.location].filter(Boolean).join(' · ')}
      onClick={() => nav(`/r/events/${row.id}`)}
    />
  );
}

/* ---------------- Shopping list ---------------- */
export function ShoppingScreen() {
  const toast = useToast();
  const nav = useNavigate();
  return (
    <TableList
      table="shopping_items"
      title="Shopping List"
      order="created_at"
      filters={[
        { value: 'todo', label: 'To buy', test: (r) => !r.done },
        { value: 'done', label: 'Bought', test: (r) => r.done },
      ]}
      renderRows={(rows, _n, reload) => (
        <List>
          {rows.map((r) => (
            <div key={r.id} className="flex min-h-[50px] items-center gap-3 px-3.5">
              <button
                aria-label="Toggle bought"
                onClick={() =>
                  updateRecord('shopping_items', r.id, { done: !r.done })
                    .then(reload)
                    .catch((e) => toast(friendlyError(e), 'error'))
                }
              >
                {r.done ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-2)] text-[var(--on-primary)]">
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : (
                  <Circle size={24} className="text-muted" />
                )}
              </button>
              <button onClick={() => nav(`/r/shopping_items/${r.id}`)} className={cx('flex-1 text-left text-[14.5px]', r.done && 'text-muted line-through')}>
                {r.name}
              </button>
              {r.quantity && <span className="text-[13px] text-muted">{r.quantity}</span>}
            </div>
          ))}
        </List>
      )}
    />
  );
}

/* ---------------- Clients' sub-lists ---------------- */
export function CampaignsScreen() {
  return (
    <TableList
      table="campaigns"
      order="created_at"
      filters={[
        { value: 'active', label: 'Active', test: (r) => r.status === 'active' },
        { value: 'planned', label: 'Planned', test: (r) => r.status === 'planned' },
        { value: 'paused', label: 'Paused', test: (r) => r.status === 'paused' },
        { value: 'completed', label: 'Completed', test: (r) => r.status === 'completed' },
        { value: 'all', label: 'All', test: () => true },
      ]}
    />
  );
}

export function ProjectsScreen() {
  return (
    <TableList
      table="projects"
      order="deadline"
      asc
      filters={[
        { value: 'active', label: 'Active', test: (r) => r.status === 'active' || r.status === 'planned' },
        { value: 'done', label: 'Done', test: (r) => r.status === 'completed' || r.status === 'cancelled' },
        { value: 'all', label: 'All', test: () => true },
      ]}
    />
  );
}

export function SimpleList({ table, order, asc }: { table: Parameters<typeof TableList>[0]['table']; order?: string; asc?: boolean }) {
  return <TableList table={table} order={order} asc={asc} />;
}

export function AllocationsScreen() {
  return (
    <TableList
      table="allocations"
      subtitle="Which income paid for which expense. Allocations never add new income or expenses."
      renderRows={(rows, nameOf) => (
        <List>
          {rows.map((r) => (
            <RecordLine key={r.id} table="allocations" row={r} nameOf={nameOf} />
          ))}
        </List>
      )}
    />
  );
}

export { sumPaise };
