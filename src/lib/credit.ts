// Credit cards, pay later, loans and investments — all worked out from your own entries.
// Cards / pay later / loans are accounts whose balance goes below zero: minus = what you owe.
import { supabase } from './supabase';
import { toISODate, todayISO } from './dates';
import { isLiability, isSpendable } from './tables';

export interface CreditAccount {
  id: string;
  name: string;
  type: string;
  balance_paise: number;
  opening_balance_paise: number;
  opening_date: string | null;
  upi_app?: string | null;
  card_last4?: string | null;
  card_network?: 'rupay' | 'visa' | 'mastercard' | 'amex' | 'diners' | null;
  card_color?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  credit_limit_paise?: number | null;
  statement_day?: number | null;
  due_day?: number | null;
  interest_rate_bp?: number | null;
  lender?: string | null;
  loan_kind?: string | null;
  principal_paise?: number | null;
  tenure_months?: number | null;
  installment_paise?: number | null;
  installment_day?: number | null;
  plan_start_date?: string | null;
  maturity_date?: string | null;
  investment_kind?: string | null;
  market_value_paise?: number | null;
  market_value_at?: string | null;
  autopay_account_id?: string | null;
}

const ACCOUNT_COLS =
  'id,name,type,upi_app,opening_balance_paise,opening_date,card_last4,card_network,card_color,account_holder,account_number,credit_limit_paise,statement_day,due_day,interest_rate_bp,lender,loan_kind,principal_paise,tenure_months,installment_paise,installment_day,plan_start_date,maturity_date,investment_kind,market_value_paise,market_value_at,autopay_account_id';

/** All active accounts with balance + credit details. Works even before the credit update reaches the server. */
export async function fetchCreditAccounts(): Promise<CreditAccount[]> {
  const [b, a] = await Promise.all([
    supabase.from('account_balances').select('id,balance_paise'),
    supabase.from('accounts').select(ACCOUNT_COLS).is('deleted_at', null).order('name'),
  ]);
  if (b.error) throw b.error;
  let rows: any[] | null = a.data as any[] | null;
  if (a.error) {
    // older server without the new columns
    const basic = await supabase.from('accounts').select('id,name,type,upi_app,opening_balance_paise,opening_date,card_network,card_color,account_holder,account_number').is('deleted_at', null).order('name');
    if (basic.error) throw basic.error;
    rows = basic.data as any[];
  }
  const bal = new Map(((b.data ?? []) as any[]).map((x) => [x.id, Number(x.balance_paise) || 0]));
  return (rows ?? []).map((r) => ({ ...r, balance_paise: bal.get(r.id) ?? 0 }));
}

/** what you owe on a card / loan (0 if the account is in credit) */
export const owed = (a: { balance_paise: number }) => Math.max(0, -a.balance_paise);

const pad = (n: number) => String(n).padStart(2, '0');
/** the given day in a month, clamped to the month's length (31 → 30 Nov) */
function dayIn(y: number, m0: number, day: number): Date {
  const last = new Date(y, m0 + 1, 0).getDate();
  return new Date(y, m0, Math.min(day, last));
}
export function daysBetween(fromISO: string, toISO: string): number {
  const [a, b] = [fromISO, toISO].map((s) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86400000);
}
/** next date (today or later) that falls on this day of the month */
export function nextOnDay(day: number, from = new Date()): string {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let d = dayIn(base.getFullYear(), base.getMonth(), day);
  if (d < base) d = dayIn(base.getFullYear(), base.getMonth() + 1, day);
  return toISODate(d);
}
/** most recent date (today or earlier) on this day of the month */
export function lastOnDay(day: number, from = new Date()): string {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let d = dayIn(base.getFullYear(), base.getMonth(), day);
  if (d > base) d = dayIn(base.getFullYear(), base.getMonth() - 1, day);
  return toISODate(d);
}

export interface CardStatus {
  owed: number;
  limit: number | null;
  available: number | null;
  utilization: number | null; // 0..100+
  statementDate: string | null;
  billAmount: number | null; // still to pay from the last bill
  unbilled: number | null; // spent since the last bill
  dueDate: string | null;
  daysLeft: number | null;
  minDue: number | null; // estimate: 5% of the bill (min ₹200), or the whole bill if small
}

/**
 * Card bill from your entries: what you owed on the bill date, minus what you paid after it.
 * `moves` = this card's movements (signed: spend negative, payment positive).
 */
export function cardStatus(a: CreditAccount, moves: { txn_date: string; signed_paise: number }[], today = todayISO()): CardStatus {
  const ow = owed(a);
  const limit = a.credit_limit_paise ?? null;
  const out: CardStatus = {
    owed: ow,
    limit,
    available: limit != null ? Math.max(0, limit - ow) : null,
    utilization: limit ? Math.round((ow / limit) * 1000) / 10 : null,
    statementDate: null,
    billAmount: null,
    unbilled: null,
    dueDate: null,
    daysLeft: null,
    minDue: null,
  };
  if (!a.statement_day) {
    if (a.due_day) {
      out.dueDate = nextOnDay(a.due_day);
      out.daysLeft = daysBetween(today, out.dueDate);
    }
    return out;
  }
  const stmt = lastOnDay(a.statement_day);
  const after = moves.filter((m) => m.txn_date > stmt);
  const spentAfter = after.filter((m) => m.signed_paise < 0).reduce((s, m) => s - m.signed_paise, 0);
  const paidAfter = after.filter((m) => m.signed_paise > 0).reduce((s, m) => s + m.signed_paise, 0);
  const balanceAtStmt = a.balance_paise - after.reduce((s, m) => s + m.signed_paise, 0);
  const billed = Math.max(0, -balanceAtStmt);
  const bill = Math.max(0, billed - paidAfter);
  out.statementDate = stmt;
  out.billAmount = bill;
  out.unbilled = spentAfter;
  if (a.due_day) {
    // due date = the first "due day" after the bill date
    const [y, m, d] = stmt.split('-').map(Number);
    let due = dayIn(y, m - 1, a.due_day);
    if (due.getDate() <= d && due <= new Date(y, m - 1, d)) due = dayIn(y, m, a.due_day);
    out.dueDate = toISODate(due);
    out.daysLeft = daysBetween(today, out.dueDate);
  }
  out.minDue = bill <= 0 ? 0 : bill <= 20000 ? bill : Math.max(20000, Math.round(bill * 0.05));
  return out;
}

/** Monthly EMI for a loan (reducing balance). rateBp = yearly % × 100. */
export function emiFor(principal: number, rateBp: number, months: number): number {
  if (months <= 0) return 0;
  const r = rateBp / 10000 / 12;
  if (r === 0) return Math.round(principal / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principal * r * f) / (f - 1));
}

export interface ScheduleRow {
  n: number;
  date: string;
  emi: number;
  interest: number;
  principal: number;
  left: number;
}

/** EMI-by-EMI plan from what you owe now. Stops when paid off (max 600 rows). */
export function emiSchedule(outstanding: number, rateBp: number, emi: number, firstDate: string): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const r = rateBp / 10000 / 12;
  let left = outstanding;
  const [y, m, d] = firstDate.split('-').map(Number);
  for (let n = 1; left > 0 && n <= 600; n++) {
    const interest = Math.round(left * r);
    if (emi <= interest) break; // EMI too small to ever finish
    const principal = Math.min(left, emi - interest);
    left -= principal;
    const dt = dayIn(y, m - 1 + (n - 1), d);
    rows.push({ n, date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, emi: principal + interest, interest, principal, left });
  }
  return rows;
}

/** This month's EMI split for a loan: interest on what you owe now, the rest goes to principal. */
export function emiSplit(a: CreditAccount): { principal: number; interest: number; emi: number } {
  const left = owed(a);
  const emi = a.installment_paise ?? 0;
  const interest = Math.round((left * (a.interest_rate_bp ?? 0)) / 10000 / 12);
  const principal = Math.max(0, Math.min(left, emi - interest));
  return { principal, interest: Math.min(interest, emi || interest), emi: emi || principal + interest };
}

export interface LoanStatus {
  owed: number;
  paidPct: number | null;
  nextEmi: string | null;
  daysLeft: number | null;
  monthsLeft: number | null;
  finishOn: string | null;
  totalInterestLeft: number | null;
}

export function loanStatus(a: CreditAccount, today = todayISO()): LoanStatus {
  const ow = owed(a);
  const principal = a.principal_paise ?? null;
  const nextEmi = a.installment_day ? nextOnDay(a.installment_day) : null;
  let monthsLeft: number | null = null;
  let finishOn: string | null = null;
  let totalInterestLeft: number | null = null;
  if (a.installment_paise && ow > 0) {
    const sch = emiSchedule(ow, a.interest_rate_bp ?? 0, a.installment_paise, nextEmi ?? today);
    if (sch.length && sch[sch.length - 1].left === 0) {
      monthsLeft = sch.length;
      finishOn = sch[sch.length - 1].date;
      totalInterestLeft = sch.reduce((s, x) => s + x.interest, 0);
    }
  }
  return {
    owed: ow,
    paidPct: principal ? Math.max(0, Math.min(100, Math.round(((principal - ow) / principal) * 100))) : null,
    nextEmi,
    daysLeft: nextEmi ? daysBetween(today, nextEmi) : null,
    monthsLeft,
    finishOn,
    totalInterestLeft,
  };
}

/** Investment: money put in (balance from your entries) vs what it is worth now. */
export function investmentStatus(a: CreditAccount) {
  const invested = a.balance_paise;
  const value = a.market_value_paise ?? invested;
  const gain = value - invested;
  return { invested, value, gain, gainPct: invested > 0 ? Math.round((gain / invested) * 1000) / 10 : null };
}

export interface NetWorth {
  cash: number;
  investments: number;
  lent: number;
  cardDues: number;
  loanDues: number;
  borrowed: number;
  assets: number;
  liabilities: number;
  net: number;
}

/** Everything you have minus everything you owe (udhaar with people included). */
export async function fetchNetWorth(accounts: CreditAccount[]): Promise<NetWorth> {
  const [loans, totals] = await Promise.all([
    supabase.from('loans').select('id,direction,principal_paise').is('deleted_at', null),
    supabase.from('loan_totals').select('id,principal_repaid_paise'),
  ]);
  const repaid = new Map(((totals.data ?? []) as any[]).map((t) => [t.id, Number(t.principal_repaid_paise) || 0]));
  let lent = 0;
  let borrowed = 0;
  for (const l of (loans.data ?? []) as any[]) {
    const left = Math.max(0, Number(l.principal_paise) - (repaid.get(l.id) ?? 0));
    if (l.direction === 'lent') lent += left;
    else borrowed += left;
  }
  const cash = accounts.filter((a) => isSpendable(a.type)).reduce((s, a) => s + a.balance_paise, 0);
  const investments = accounts.filter((a) => a.type === 'investment').reduce((s, a) => s + investmentStatus(a).value, 0);
  const cardDues = accounts.filter((a) => a.type === 'credit_card' || a.type === 'pay_later').reduce((s, a) => s + owed(a), 0);
  const loanDues = accounts.filter((a) => a.type === 'loan').reduce((s, a) => s + owed(a), 0);
  const assets = cash + investments + lent + accounts.filter((a) => isLiability(a.type) && a.balance_paise > 0).reduce((s, a) => s + a.balance_paise, 0);
  const liabilities = cardDues + loanDues + borrowed;
  return { cash, investments, lent, cardDues, loanDues, borrowed, assets, liabilities, net: assets - liabilities };
}

/** Upcoming money dates for Home / reminders: card bills, EMIs, SIPs, premiums. */
export interface MoneyDate {
  date: string;
  title: string;
  kind: 'Card bill' | 'EMI' | 'SIP' | 'Premium' | 'Pay later';
  amount: number | null;
  to: string;
}

export async function upcomingMoneyDates(days = 7): Promise<MoneyDate[]> {
  const out: MoneyDate[] = [];
  const today = todayISO();
  const end = toISODate(new Date(Date.now() + days * 86400000));
  let accounts: CreditAccount[] = [];
  try {
    accounts = (await fetchCreditAccounts()).filter((a) => !isSpendable(a.type));
  } catch {
    return out;
  }
  for (const a of accounts) {
    if ((a.type === 'credit_card' || a.type === 'pay_later') && a.due_day && owed(a) > 0) {
      const d = nextOnDay(a.due_day);
      if (d <= end) out.push({ date: d, title: a.name, kind: a.type === 'pay_later' ? 'Pay later' : 'Card bill', amount: owed(a), to: `/credit` });
    }
    if (a.type === 'loan' && a.installment_day && owed(a) > 0) {
      const d = nextOnDay(a.installment_day);
      if (d <= end) out.push({ date: d, title: a.name, kind: 'EMI', amount: a.installment_paise ?? null, to: `/credit` });
    }
    if (a.type === 'investment' && a.installment_day && a.installment_paise) {
      const d = nextOnDay(a.installment_day);
      if (d <= end) out.push({ date: d, title: a.name, kind: 'SIP', amount: a.installment_paise, to: `/credit` });
    }
  }
  const pol = await supabase.from('insurance_policies').select('id,name,premium_paise,next_due_date').is('deleted_at', null).eq('status', 'active').gte('next_due_date', today).lte('next_due_date', end);
  for (const p of (pol.data ?? []) as any[]) out.push({ date: p.next_due_date, title: p.name, kind: 'Premium', amount: p.premium_paise, to: `/r/insurance_policies/${p.id}` });
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
