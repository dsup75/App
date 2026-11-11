// Credit & Loans: credit cards, pay later, bank/app loans with EMIs, investments, insurance,
// credit score and net worth — in one place. Every number comes from your own entries.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Landmark, TrendingUp, ShieldCheck, Gauge, Plus, CalendarClock, HandCoins, Calculator, Wallet, ChevronRight, ListOrdered, RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError, saveMoneyEntry, updateRecord } from '../lib/db';
import { formatINR, parseRupeesToPaise, paiseToInput } from '../lib/money';
import { formatDate, relativeDay, todayISO } from '../lib/dates';
import { INVESTMENT_KINDS, LOAN_KINDS, optionLabel, isSpendable, POLICY_TYPES } from '../lib/tables';
import {
  cardStatus, emiSchedule, emiSplit, fetchCreditAccounts, fetchNetWorth, investmentStatus, loanStatus, owed, nextOnDay,
  type CreditAccount, type NetWorth,
} from '../lib/credit';
import { BankCard } from '../components/BankCard';
import { BrandLogo as DomainLogo } from '../components/EntityIcon';
import { brandDomain } from '../lib/brands';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, ErrorBox, FormRow, IconBubble, List, ListRow, Page, ProgressBar, SectionTitle, Sheet, Skeleton } from '../components/ui';

type Moves = Map<string, { txn_date: string; signed_paise: number }[]>;

export function CreditScreen() {
  const nav = useNavigate();
  const [accounts, setAccounts] = useState<CreditAccount[] | null>(null);
  const [moves, setMoves] = useState<Moves>(new Map());
  const [net, setNet] = useState<NetWorth | null>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [payBill, setPayBill] = useState<CreditAccount | null>(null);
  const [payEmi, setPayEmi] = useState<CreditAccount | null>(null);
  const [plan, setPlan] = useState<CreditAccount | null>(null);
  const [invest, setInvest] = useState<{ a: CreditAccount; mode: 'add' | 'value' } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const acc = await fetchCreditAccounts();
      setAccounts(acc);
      const cards = acc.filter((a) => a.type === 'credit_card' || a.type === 'pay_later');
      const since = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
      const [mv, nw, pol, sc] = await Promise.all([
        cards.length
          ? supabase.from('account_movements').select('account_id,txn_date,signed_paise').in('account_id', cards.map((c) => c.id)).gte('txn_date', since).limit(5000)
          : Promise.resolve({ data: [], error: null } as any),
        fetchNetWorth(acc),
        supabase.from('insurance_policies').select('*').is('deleted_at', null).order('next_due_date', { ascending: true, nullsFirst: false }),
        supabase.from('credit_scores').select('*').is('deleted_at', null).order('checked_on', { ascending: false }).limit(12),
      ]);
      const m: Moves = new Map();
      for (const r of (mv.data ?? []) as any[]) {
        if (!m.has(r.account_id)) m.set(r.account_id, []);
        m.get(r.account_id)!.push({ txn_date: r.txn_date, signed_paise: Number(r.signed_paise) });
      }
      setMoves(m);
      setNet(nw);
      setPolicies(pol.error ? [] : (pol.data as any[]));
      setScores(sc.error ? [] : (sc.data as any[]));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const a = accounts ?? [];
    return {
      cards: a.filter((x) => x.type === 'credit_card'),
      later: a.filter((x) => x.type === 'pay_later'),
      loans: a.filter((x) => x.type === 'loan'),
      invest: a.filter((x) => x.type === 'investment'),
      spend: a.filter((x) => isSpendable(x.type)),
    };
  }, [accounts]);

  if (error) return <Page title="Credit & Loans" back><ErrorBox message={error} onRetry={load} /></Page>;
  if (!accounts) return <Page title="Credit & Loans" back><Skeleton rows={6} /></Page>;

  const totalLimit = groups.cards.reduce((s, c) => s + (c.credit_limit_paise ?? 0), 0);
  const totalUsed = groups.cards.reduce((s, c) => s + owed(c), 0);
  const util = totalLimit ? Math.round((totalUsed / totalLimit) * 100) : null;
  const latestScore = scores[0];

  return (
    <Page title="Credit & Loans" subtitle="Cards, EMIs, investments, insurance — all in one place" back>
      {/* ---------- Net worth ---------- */}
      {net && (
        <div className="hero relative overflow-hidden rounded-[24px] p-4">
          <p className="text-[13px] opacity-80">Net worth (what you have − what you owe)</p>
          <p className="mt-1 text-[30px] font-bold leading-tight tracking-tight">{formatINR(net.net)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
            <div className="glass rounded-[14px] p-2.5">
              <p className="opacity-75">You have</p>
              <p className="text-[16px] font-bold" style={{ color: 'var(--tone-income)' }}>{formatINR(net.assets)}</p>
              <p className="mt-0.5 text-[11px] opacity-70">Money {formatINR(net.cash)} · Invested {formatINR(net.investments)} · Lent {formatINR(net.lent)}</p>
            </div>
            <div className="glass rounded-[14px] p-2.5">
              <p className="opacity-75">You owe</p>
              <p className="text-[16px] font-bold" style={{ color: 'var(--tone-expense)' }}>{formatINR(net.liabilities)}</p>
              <p className="mt-0.5 text-[11px] opacity-70">Cards {formatINR(net.cardDues)} · Loans {formatINR(net.loanDues)} · Udhaar {formatINR(net.borrowed)}</p>
            </div>
          </div>
          {util !== null && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[12px] opacity-85">
                <span>Credit used</span>
                <span>{util}% of {formatINR(totalLimit)}</span>
              </div>
              <ProgressBar pct={Math.min(100, util)} color={util > 30 ? 'var(--tone-expense)' : 'var(--tone-income)'} />
              <p className="mt-1 text-[11px] opacity-70">{util > 30 ? 'Above 30% — keeping it under 30% helps your credit score.' : 'Under 30% — good for your credit score.'}</p>
            </div>
          )}
        </div>
      )}

      {/* ---------- Credit cards ---------- */}
      <SectionTitle right={<AddLink onClick={() => nav('/r/accounts/new?type=credit_card')} label="Add card" />}>Credit cards</SectionTitle>
      {groups.cards.length === 0 ? (
        <EmptyAdd
          icon={<CreditCard size={18} />}
          title="No credit card added"
          text="Add your card with limit, bill day and due day. Spend on it like any account; pay the bill as a transfer from your bank."
          onAdd={() => nav('/r/accounts/new?type=credit_card')}
        />
      ) : (
        groups.cards.map((c) => <CardBlock key={c.id} a={c} moves={moves.get(c.id) ?? []} onPay={() => setPayBill(c)} />)
      )}

      {/* ---------- Pay later ---------- */}
      <SectionTitle right={<AddLink onClick={() => nav('/r/accounts/new?type=pay_later')} label="Add" />}>Pay Later (BNPL)</SectionTitle>
      {groups.later.length === 0 ? (
        <p className="px-1 text-[12.5px] text-muted">Paytm Postpaid, Amazon Pay Later, Flipkart Pay Later, Simpl, LazyPay… add them here to see dues and limits.</p>
      ) : (
        <List>
          {groups.later.map((c) => {
            const st = cardStatus(c, moves.get(c.id) ?? []);
            return (
              <ListRow
                key={c.id}
                icon={<BrandLogo name={c.lender || c.name} size={36} fallback={<IconBubble tone="violet"><Wallet size={16} /></IconBubble>} />}
                title={c.name}
                subtitle={[st.limit ? `Limit ${formatINR(st.limit)}` : null, st.dueDate ? `Due ${relativeDay(st.dueDate)}` : null].filter(Boolean).join(' · ') || 'Pay later'}
                right={
                  <span className="flex flex-col items-end">
                    <span className="text-[14px] font-semibold text-expense">{formatINR(st.owed)}</span>
                    {st.owed > 0 && (
                      <button type="button" className="text-[12px] font-semibold text-primary" onClick={(e) => { e.stopPropagation(); setPayBill(c); }}>
                        Pay
                      </button>
                    )}
                  </span>
                }
                onClick={() => nav(`/r/accounts/${c.id}`)}
              />
            );
          })}
        </List>
      )}

      {/* ---------- Loans ---------- */}
      <SectionTitle right={<AddLink onClick={() => nav('/r/accounts/new?type=loan')} label="Add loan" />}>Loans & EMIs</SectionTitle>
      {groups.loans.length === 0 ? (
        <EmptyAdd
          icon={<Landmark size={18} />}
          title="No loan added"
          text="Home, bike, personal, education, gold or phone EMI — add it with EMI amount, rate and EMI day. Each EMI you pay is split into principal and interest automatically."
          onAdd={() => nav('/r/accounts/new?type=loan')}
        />
      ) : (
        groups.loans.map((l) => <LoanBlock key={l.id} a={l} onPay={() => setPayEmi(l)} onPlan={() => setPlan(l)} />)
      )}
      <Card onClick={() => nav('/loans')} className="press flex items-center gap-3">
        <IconBubble tone="amber"><HandCoins size={17} /></IconBubble>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">Udhaar with people</p>
          <p className="text-[12.5px] text-muted">{net ? `They owe you ${formatINR(net.lent)} · You owe ${formatINR(net.borrowed)}` : 'Money lent and borrowed'}</p>
        </div>
        <ChevronRight size={17} className="text-muted" />
      </Card>

      {/* ---------- Investments ---------- */}
      <SectionTitle right={<AddLink onClick={() => nav('/r/accounts/new?type=investment')} label="Add" />}>Investments</SectionTitle>
      {groups.invest.length === 0 ? (
        <EmptyAdd
          icon={<TrendingUp size={18} />}
          title="No investment added"
          text="FD, RD, SIP, mutual funds, stocks, gold, PPF… Money you put in comes from your transfers; update the current value whenever you check your app."
          onAdd={() => nav('/r/accounts/new?type=investment')}
        />
      ) : (
        <List>
          {groups.invest.map((a) => {
            const s = investmentStatus(a);
            return (
              <ListRow
                key={a.id}
                icon={<BrandLogo name={a.lender || a.name} size={36} fallback={<IconBubble tone="income"><TrendingUp size={16} /></IconBubble>} />}
                title={a.name}
                subtitle={[a.investment_kind ? optionLabel(INVESTMENT_KINDS, a.investment_kind) : 'Investment', `Put in ${formatINR(s.invested)}`, a.installment_paise && a.installment_day ? `SIP ${formatINR(a.installment_paise)} on ${a.installment_day}` : null].filter(Boolean).join(' · ')}
                right={
                  <span className="flex flex-col items-end">
                    <span className="text-[14px] font-semibold">{formatINR(s.value)}</span>
                    {s.gainPct !== null && a.market_value_paise != null && (
                      <span className={'text-[11.5px] font-semibold ' + (s.gain >= 0 ? 'text-income' : 'text-expense')}>
                        {s.gain >= 0 ? '+' : ''}{formatINR(s.gain)} ({s.gainPct}%)
                      </span>
                    )}
                  </span>
                }
                onClick={() => setInvest({ a, mode: 'add' })}
              />
            );
          })}
        </List>
      )}

      {/* ---------- Insurance ---------- */}
      <SectionTitle right={<AddLink onClick={() => nav('/r/insurance_policies/new')} label="Add" />}>Insurance</SectionTitle>
      {policies.length === 0 ? (
        <p className="px-1 text-[12.5px] text-muted">Add health, term, vehicle or LIC policies — you get a reminder before each premium is due.</p>
      ) : (
        <List>
          {policies.map((p) => {
            const days = p.next_due_date ? Math.round((new Date(p.next_due_date + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / 86400000) : null;
            return (
              <ListRow
                key={p.id}
                icon={<BrandLogo name={p.insurer || p.name} size={36} fallback={<IconBubble tone="blue"><ShieldCheck size={16} /></IconBubble>} />}
                title={p.name}
                subtitle={[optionLabel(POLICY_TYPES, p.policy_type), p.sum_assured_paise ? `Cover ${formatINR(p.sum_assured_paise)}` : null, p.next_due_date ? `Premium ${relativeDay(p.next_due_date)}` : null].filter(Boolean).join(' · ')}
                right={
                  p.status !== 'active' ? <Badge>{p.status}</Badge> : days !== null && days <= 15 ? <Badge tone={days < 0 ? 'danger' : 'amber'}>{days < 0 ? 'Overdue' : `${days} d`}</Badge> : p.premium_paise ? <span className="text-[13.5px] font-semibold">{formatINR(p.premium_paise)}</span> : null
                }
                onClick={() => nav(`/r/insurance_policies/${p.id}`)}
                chevron
              />
            );
          })}
        </List>
      )}

      {/* ---------- Credit score ---------- */}
      <SectionTitle right={<AddLink onClick={() => nav('/r/credit_scores/new')} label="Add" />}>Credit score</SectionTitle>
      <Card className="space-y-2">
        {latestScore ? (
          <>
            <div className="flex items-center gap-3">
              <ScoreRing score={latestScore.score} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{scoreLabel(latestScore.score)}</p>
                <p className="text-[12.5px] text-muted">{String(latestScore.bureau).toUpperCase()} · checked {formatDate(latestScore.checked_on)}</p>
                {scores[1] && (
                  <p className={'text-[12.5px] font-semibold ' + (latestScore.score >= scores[1].score ? 'text-income' : 'text-expense')}>
                    {latestScore.score >= scores[1].score ? '▲' : '▼'} {Math.abs(latestScore.score - scores[1].score)} since {formatDate(scores[1].checked_on)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[12px] text-muted">Pay every bill by the due date, keep card use under 30%, and avoid many loan applications together. You can check your score free on the CIBIL website or apps like Paytm, CRED or OneScore.</p>
          </>
        ) : (
          <p className="text-[13px] text-muted">Note your CIBIL / Experian score whenever you check it to see the trend over time.</p>
        )}
      </Card>

      {/* ---------- Tools ---------- */}
      <SectionTitle>Tools</SectionTitle>
      <List>
        <ListRow icon={<IconBubble tone="primary"><Calculator size={16} /></IconBubble>} title="EMI, SIP & FD calculators" subtitle="Plan before you borrow or invest" onClick={() => nav('/money-tools/calculators')} chevron />
        <ListRow icon={<IconBubble tone="teal"><CalendarClock size={16} /></IconBubble>} title="Subscriptions & bills" subtitle="Netflix, recharge, rent…" onClick={() => nav('/recurring')} chevron />
        <ListRow icon={<IconBubble tone="amber"><Gauge size={16} /></IconBubble>} title="Budgets" subtitle="Monthly limits by category" onClick={() => nav('/budgets')} chevron />
      </List>
      <p className="px-1 text-[11.5px] text-muted">
        Minimum due is an estimate (5% of the bill, at least ₹200) — check your card statement for the exact figure. Never save card numbers, CVV, PIN or OTP here.
      </p>

      <PayBillSheet a={payBill} spend={groups.spend} moves={payBill ? moves.get(payBill.id) ?? [] : []} onClose={() => setPayBill(null)} onDone={load} />
      <PayEmiSheet a={payEmi} spend={groups.spend} onClose={() => setPayEmi(null)} onDone={load} />
      <ScheduleSheet a={plan} onClose={() => setPlan(null)} />
      <InvestSheet x={invest} spend={groups.spend} onClose={() => setInvest(null)} onDone={load} onMode={(mode) => invest && setInvest({ ...invest, mode })} />
    </Page>
  );
}

/** the company's own logo when the name is known (SBI Card, Groww, LIC…), else the fallback icon */
function BrandLogo({ name, size = 36, fallback }: { name: string; size?: number; fallback: ReactNode }) {
  const d = brandDomain(name);
  return d ? <DomainLogo domain={d} size={size} fallback={fallback} /> : <>{fallback}</>;
}

function AddLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-[13px] font-semibold text-primary">
      <Plus size={14} /> {label}
    </button>
  );
}

function EmptyAdd({ icon, title, text, onAdd }: { icon: ReactNode; title: string; text: string; onAdd: () => void }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2.5">
        <IconBubble tone="primary">{icon}</IconBubble>
        <p className="text-[14.5px] font-semibold">{title}</p>
      </div>
      <p className="text-[12.5px] text-muted">{text}</p>
      <Button size="sm" onClick={onAdd}>
        <Plus size={15} /> Add
      </Button>
    </Card>
  );
}

const scoreLabel = (s: number) => (s >= 750 ? 'Excellent' : s >= 700 ? 'Good' : s >= 650 ? 'Fair' : 'Needs work');

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, (score - 300) / 600));
  const c = score >= 750 ? 'var(--tone-income)' : score >= 650 ? 'var(--warn, #f59e0b)' : 'var(--tone-expense)';
  const R = 30;
  const L = 2 * Math.PI * R;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" aria-label={`Score ${score}`}>
      <circle cx="38" cy="38" r={R} fill="none" stroke="var(--hairline)" strokeWidth="7" />
      <circle cx="38" cy="38" r={R} fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${L * pct} ${L}`} transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle" fontSize="17" fontWeight="700" fill="currentColor">{score}</text>
    </svg>
  );
}

function CardBlock({ a, moves, onPay }: { a: CreditAccount; moves: { txn_date: string; signed_paise: number }[]; onPay: () => void }) {
  const nav = useNavigate();
  const st = cardStatus(a, moves);
  const overdue = st.daysLeft !== null && st.daysLeft < 0 && (st.billAmount ?? st.owed) > 0;
  return (
    <div className="space-y-2">
      <BankCard account={a} extra={a} />
      <Card className="space-y-2.5">
        {st.limit != null && (
          <div>
            <div className="mb-1 flex justify-between text-[12.5px]">
              <span className="text-muted">Used {formatINR(st.owed)}</span>
              <span className="font-semibold">Available {formatINR(st.available)}</span>
            </div>
            <ProgressBar pct={Math.min(100, st.utilization ?? 0)} color={(st.utilization ?? 0) > 30 ? 'var(--tone-expense)' : 'var(--primary-2)'} />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Mini label="Bill to pay" value={st.billAmount !== null ? formatINR(st.billAmount) : formatINR(st.owed)} strong />
          <Mini label="Min. due (est.)" value={st.minDue !== null ? formatINR(st.minDue) : '—'} />
          <Mini label="Not billed yet" value={st.unbilled !== null ? formatINR(st.unbilled) : '—'} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted">
            {st.dueDate ? (
              <>
                Due <b className={overdue ? 'text-expense' : 'text-fg'}>{formatDate(st.dueDate)}</b>
                {st.daysLeft !== null && (st.daysLeft >= 0 ? ` · ${st.daysLeft === 0 ? 'today' : `${st.daysLeft} days left`}` : ' · overdue')}
              </>
            ) : (
              'Add bill day & due day to see the bill'
            )}
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => nav(`/r/expenses/new?account_id=${a.id}`)}>Spend</Button>
            <Button size="sm" variant="primary" onClick={onPay} disabled={st.owed <= 0}>Pay bill</Button>
          </div>
        </div>
        {a.interest_rate_bp ? (
          <p className="text-[11.5px] text-muted">Not paying in full costs about {paiseToInput(a.interest_rate_bp)}% a year on the unpaid part — pay the full bill to avoid interest.</p>
        ) : null}
      </Card>
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-[12px] bg-[var(--field)] px-1.5 py-2">
      <p className="text-[10.5px] text-muted">{label}</p>
      <p className={'truncate text-[13.5px] ' + (strong ? 'font-bold' : 'font-semibold')}>{value}</p>
    </div>
  );
}

function LoanBlock({ a, onPay, onPlan }: { a: CreditAccount; onPay: () => void; onPlan: () => void }) {
  const nav = useNavigate();
  const st = loanStatus(a);
  return (
    <Card className="space-y-2.5">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => nav(`/r/accounts/${a.id}`)}>
        <BrandLogo name={a.lender || a.name} size={40} fallback={<IconBubble tone="blue"><Landmark size={17} /></IconBubble>} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{a.name}</p>
          <p className="truncate text-[12.5px] text-muted">
            {[a.loan_kind ? optionLabel(LOAN_KINDS, a.loan_kind) : 'Loan', a.lender, a.interest_rate_bp ? `${paiseToInput(a.interest_rate_bp)}%` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="text-right">
          <span className="block text-[11px] text-muted">Left to pay</span>
          <span className="block text-[16px] font-bold text-expense">{formatINR(st.owed)}</span>
        </span>
      </button>
      {st.paidPct !== null && (
        <div>
          <div className="mb-1 flex justify-between text-[12px] text-muted">
            <span>{st.paidPct}% repaid</span>
            <span>of {formatINR(a.principal_paise)}</span>
          </div>
          <ProgressBar pct={st.paidPct} color="var(--tone-income)" />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Mini label="EMI" value={a.installment_paise ? formatINR(a.installment_paise) : '—'} strong />
        <Mini label="Next EMI" value={st.nextEmi ? relativeDay(st.nextEmi) : '—'} />
        <Mini label="EMIs left" value={st.monthsLeft !== null ? String(st.monthsLeft) : '—'} />
      </div>
      {st.finishOn && (
        <p className="text-[12px] text-muted">
          Finishes around <b className="text-fg">{formatDate(st.finishOn)}</b>
          {st.totalInterestLeft ? ` · interest still to pay ≈ ${formatINR(st.totalInterestLeft)}` : ''}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={onPlan} disabled={!a.installment_paise || st.owed <= 0}>
          <ListOrdered size={15} /> EMI plan
        </Button>
        <Button size="sm" variant="primary" onClick={onPay} disabled={st.owed <= 0}>
          Pay EMI
        </Button>
      </div>
    </Card>
  );
}

/* ---------------- sheets ---------------- */

function AccountPick({ value, onChange, list }: { value: string; onChange: (v: string) => void; list: CreditAccount[] }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name} · {formatINR(x.balance_paise)}
        </option>
      ))}
    </select>
  );
}

function PayBillSheet({ a, spend, moves, onClose, onDone }: { a: CreditAccount | null; spend: CreditAccount[]; moves: { txn_date: string; signed_paise: number }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const st = a ? cardStatus(a, moves) : null;
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!a || !st) return;
    setFrom(a.autopay_account_id && spend.some((s) => s.id === a.autopay_account_id) ? a.autopay_account_id : spend[0]?.id ?? '');
    setAmount(paiseToInput(st.billAmount && st.billAmount > 0 ? st.billAmount : st.owed));
    setDate(todayISO());
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id]);
  if (!a || !st) return null;
  const save = async () => {
    const p = parseRupeesToPaise(amount);
    if (!p || p <= 0) return setErr('Enter the amount you paid.');
    if (!from) return setErr('Choose the account you paid from.');
    setBusy(true);
    setErr('');
    try {
      await saveMoneyEntry('transfers', null, { title: `${a.type === 'pay_later' ? 'Pay later' : 'Card'} bill — ${a.name}` }, [
        { direction: 'out', account_id: from, amount_paise: p, txn_date: date },
        { direction: 'in', account_id: a.id, amount_paise: p, txn_date: date },
      ], null);
      toast('Bill payment saved');
      onClose();
      onDone();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const presets: [string, number | null][] = [
    ['Full bill', st.billAmount],
    ['Minimum', st.minDue],
    ['All dues', st.owed],
  ];
  return (
    <Sheet open onClose={onClose} title={`Pay ${a.name}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {presets
            .filter(([, v]) => v !== null && v > 0)
            .map(([l, v]) => (
              <button key={l} type="button" className="liquid h-8 rounded-full px-3 text-[12.5px] font-semibold" onClick={() => setAmount(paiseToInput(v!))}>
                {l} · {formatINR(v)}
              </button>
            ))}
        </div>
        <FormRow label="Amount paid (₹)">
          <input className="field text-[18px] font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        <FormRow label="Paid from">
          <AccountPick value={from} onChange={setFrom} list={spend} />
        </FormRow>
        <FormRow label="Date">
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <p className="text-[12px] text-muted">Saved as a transfer: your bank balance goes down and the card's due goes down by the same amount. It is not counted as a new expense (the spends already were).</p>
        {err && <p className="text-[13px] text-danger">{err}</p>}
        <Button variant="primary" full size="lg" loading={busy} onClick={save}>
          Save payment
        </Button>
      </div>
    </Sheet>
  );
}

function PayEmiSheet({ a, spend, onClose, onDone }: { a: CreditAccount | null; spend: CreditAccount[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!a) return;
    const s = emiSplit(a);
    setFrom(a.autopay_account_id && spend.some((x) => x.id === a.autopay_account_id) ? a.autopay_account_id : spend[0]?.id ?? '');
    setPrincipal(paiseToInput(s.principal));
    setInterest(paiseToInput(s.interest));
    setDate(a.installment_day ? (nextOnDay(a.installment_day) <= todayISO() ? nextOnDay(a.installment_day) : todayISO()) : todayISO());
    setNote('');
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id]);
  if (!a) return null;
  const p = parseRupeesToPaise(principal || '0') ?? 0;
  const i = parseRupeesToPaise(interest || '0') ?? 0;
  const save = async () => {
    if (p + i <= 0) return setErr('Enter the EMI amount.');
    if (!from) return setErr('Choose the account the EMI was paid from.');
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.rpc('pay_loan_emi', { p_loan: a.id, p_from: from, p_date: date, p_principal: p, p_interest: i, p_note: note || null });
      if (error) throw error;
      toast('EMI saved');
      onClose();
      onDone();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`Pay EMI · ${a.name}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Principal (₹)" hint="Reduces what you owe">
            <input className="field font-semibold" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </FormRow>
          <FormRow label="Interest (₹)" hint="Saved as an expense">
            <input className="field font-semibold" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} />
          </FormRow>
        </div>
        <p className="text-[13px]">
          Total EMI <b>{formatINR(p + i)}</b>
          {a.installment_paise && p + i !== a.installment_paise ? <span className="text-muted"> · your EMI is {formatINR(a.installment_paise)}</span> : null}
        </p>
        <FormRow label="Paid from">
          <AccountPick value={from} onChange={setFrom} list={spend} />
        </FormRow>
        <FormRow label="Date">
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <FormRow label="Note (optional)">
          <input className="field" value={note} placeholder="e.g. Nov EMI, part prepayment" onChange={(e) => setNote(e.target.value)} />
        </FormRow>
        <p className="text-[12px] text-muted">The split is worked out from your rate and what you still owe — change it to match your bank statement if needed. For a prepayment, put the whole amount in Principal.</p>
        {err && <p className="text-[13px] text-danger">{err}</p>}
        <Button variant="primary" full size="lg" loading={busy} onClick={save}>
          Save EMI
        </Button>
      </div>
    </Sheet>
  );
}

function ScheduleSheet({ a, onClose }: { a: CreditAccount | null; onClose: () => void }) {
  if (!a || !a.installment_paise) return null;
  const rows = emiSchedule(owed(a), a.interest_rate_bp ?? 0, a.installment_paise, a.installment_day ? nextOnDay(a.installment_day) : todayISO());
  const done = rows.length && rows[rows.length - 1].left === 0;
  return (
    <Sheet open onClose={onClose} title={`EMI plan · ${a.name}`}>
      {!rows.length || !done ? (
        <p className="text-[13.5px] text-muted">With this EMI the loan never finishes (EMI is smaller than the monthly interest). Check the EMI amount and rate.</p>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-muted">
            {rows.length} EMIs left · total interest ≈ {formatINR(rows.reduce((s, r) => s + r.interest, 0))} · estimate from what you owe today
          </p>
          <div className="overflow-hidden rounded-[14px]" style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
            <table className="w-full text-[12px] tabular">
              <thead>
                <tr className="bg-[var(--field)] text-muted">
                  <th className="px-2 py-1.5 text-left font-semibold">#</th>
                  <th className="px-1 py-1.5 text-left font-semibold">Date</th>
                  <th className="px-1 py-1.5 text-right font-semibold">Principal</th>
                  <th className="px-1 py-1.5 text-right font-semibold">Interest</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Left</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.n} className="border-t border-[var(--hairline)]">
                    <td className="px-2 py-1.5">{r.n}</td>
                    <td className="px-1 py-1.5">{formatDate(r.date)}</td>
                    <td className="px-1 py-1.5 text-right">{formatINR(r.principal)}</td>
                    <td className="px-1 py-1.5 text-right text-muted">{formatINR(r.interest)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatINR(r.left)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Sheet>
  );
}

function InvestSheet({
  x, spend, onClose, onDone, onMode,
}: { x: { a: CreditAccount; mode: 'add' | 'value' } | null; spend: CreditAccount[]; onClose: () => void; onDone: () => void; onMode: (m: 'add' | 'value') => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!x) return;
    setFrom(x.a.autopay_account_id && spend.some((s) => s.id === x.a.autopay_account_id) ? x.a.autopay_account_id : spend[0]?.id ?? '');
    setAmount(x.mode === 'value' ? paiseToInput(x.a.market_value_paise ?? x.a.balance_paise) : x.a.installment_paise ? paiseToInput(x.a.installment_paise) : '');
    setDate(todayISO());
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x?.a.id, x?.mode]);
  if (!x) return null;
  const { a, mode } = x;
  const save = async () => {
    const p = parseRupeesToPaise(amount);
    if (p === null || p < 0 || (mode === 'add' && p === 0)) return setErr('Enter a valid amount.');
    setBusy(true);
    setErr('');
    try {
      if (mode === 'add') {
        await saveMoneyEntry('transfers', null, { title: `Invested — ${a.name}` }, [
          { direction: 'out', account_id: from, amount_paise: p, txn_date: date },
          { direction: 'in', account_id: a.id, amount_paise: p, txn_date: date },
        ], null);
        toast('Investment saved');
      } else {
        await updateRecord('accounts', a.id, { market_value_paise: p, market_value_at: date });
        toast('Current value updated');
      }
      onClose();
      onDone();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={a.name}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant={mode === 'add' ? 'primary' : 'glass'} onClick={() => onMode('add')}>
            <Plus size={15} /> Add money
          </Button>
          <Button size="sm" variant={mode === 'value' ? 'primary' : 'glass'} onClick={() => onMode('value')}>
            <RefreshCw size={15} /> Update value
          </Button>
        </div>
        <FormRow label={mode === 'add' ? 'Amount put in (₹)' : 'Current value today (₹)'}>
          <input className="field text-[18px] font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        {mode === 'add' && (
          <FormRow label="From account">
            <AccountPick value={from} onChange={setFrom} list={spend} />
          </FormRow>
        )}
        <FormRow label="Date">
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <p className="text-[12px] text-muted">
          {mode === 'add'
            ? 'Saved as a transfer to this investment — your bank balance goes down, your investment goes up. Not counted as an expense.'
            : 'Type the value shown in your investment app or passbook. Gain / loss = current value − money put in.'}
        </p>
        {err && <p className="text-[13px] text-danger">{err}</p>}
        <Button variant="primary" full size="lg" loading={busy} onClick={save}>
          Save
        </Button>
        <button type="button" className="w-full text-center text-[13px] font-semibold text-primary" onClick={() => { onClose(); nav(`/r/accounts/${a.id}`); }}>
          Open details
        </button>
      </div>
    </Sheet>
  );
}
