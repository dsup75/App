import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ListTodo, FileText, Briefcase, Megaphone, Link2, HandCoins,
  PiggyBank, BookOpen, Timer, ClipboardCheck, CalendarDays, StickyNote, ShoppingCart, Users, Repeat, QrCode,
  Landmark, Tag, GraduationCap, Flame, Gauge, CalendarClock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatINR } from '../lib/money';
import { formatDate, relativeDay } from '../lib/dates';
import { optionLabel, UPI_APPS, TASK_STATUS, CHAPTER_STATUS, PROJECT_STATUS, CAMPAIGN_STATUS, PLATFORMS, CLIENT_STATUS, FREQUENCIES, type TableName } from '../lib/tables';
import { IconBubble, ListRow, Badge, type Tone } from './ui';
import { useUsage } from '../lib/useUsage';

export const TABLE_ICON: Record<TableName, { icon: LucideIcon; tone: Tone }> = {
  incomes: { icon: ArrowDownLeft, tone: 'income' },
  expenses: { icon: ArrowUpRight, tone: 'expense' },
  transfers: { icon: ArrowLeftRight, tone: 'violet' },
  accounts: { icon: Landmark, tone: 'amber' },
  categories: { icon: Tag, tone: 'muted' },
  payment_requests: { icon: QrCode, tone: 'teal' },
  tasks: { icon: ListTodo, tone: 'blue' },
  clients: { icon: Briefcase, tone: 'primary' },
  projects: { icon: FileText, tone: 'blue' },
  campaigns: { icon: Megaphone, tone: 'pink' },
  invoices: { icon: FileText, tone: 'teal' },
  allocations: { icon: Link2, tone: 'violet' },
  loans: { icon: HandCoins, tone: 'amber' },
  loan_repayments: { icon: Repeat, tone: 'amber' },
  savings_goals: { icon: PiggyBank, tone: 'pink' },
  savings_entries: { icon: PiggyBank, tone: 'pink' },
  groups: { icon: Users, tone: 'violet' },
  group_members: { icon: Users, tone: 'violet' },
  group_expenses: { icon: Users, tone: 'violet' },
  group_settlements: { icon: Repeat, tone: 'violet' },
  habits: { icon: Flame, tone: 'amber' },
  events: { icon: CalendarDays, tone: 'blue' },
  notes: { icon: StickyNote, tone: 'amber' },
  shopping_items: { icon: ShoppingCart, tone: 'teal' },
  subjects: { icon: BookOpen, tone: 'blue' },
  chapters: { icon: BookOpen, tone: 'blue' },
  study_sessions: { icon: Timer, tone: 'primary' },
  mock_tests: { icon: ClipboardCheck, tone: 'violet' },
  exams: { icon: GraduationCap, tone: 'expense' },
  client_contacts: { icon: Users, tone: 'teal' },
  custom_options: { icon: Tag, tone: 'muted' },
  budgets: { icon: Gauge, tone: 'amber' },
  recurring_rules: { icon: CalendarClock, tone: 'teal' },
};

/** One generic row for any record type */
export function RecordLine({ table, row, nameOf }: { table: TableName; row: any; nameOf: (id: string) => string }) {
  const nav = useNavigate();
  const usage = useUsage();
  const { icon: Icon, tone } = TABLE_ICON[table];
  let title: string = row.title ?? row.name ?? row.invoice_no ?? row.person ?? '—';
  let sub = '';
  let right: ReactNode = null;
  const money = (p: number, sign?: 'in' | 'out') => (
    <span className={'shrink-0 text-[14px] font-semibold ' + (sign === 'in' ? 'text-income' : sign === 'out' ? 'text-expense' : '')}>
      {sign === 'out' ? formatINR(-p) : formatINR(p, { sign: sign === 'in' })}
    </span>
  );

  switch (table) {
    case 'incomes':
      sub = [relativeDay(row.txn_date), row.txn_time && String(row.txn_time).slice(0, 5), Number(row.line_count ?? 1) > 1 ? `${row.line_count} payments` : row.payment_app ? optionLabel(UPI_APPS, row.payment_app) : nameOf(row.account_id), row.payer_name].filter(Boolean).join(' · ');
      right = money(row.amount_paise, 'in');
      if (usage?.incomeUsed.get(row.id))
        right = (
          <span className="flex flex-col items-end">
            {right}
            <span className="text-[11px] font-medium text-muted">{formatINR(usage.incomeLeft.get(row.id) ?? 0)} left</span>
          </span>
        );
      break;
    case 'expenses':
      sub = [relativeDay(row.txn_date), row.txn_time && String(row.txn_time).slice(0, 5), Number(row.line_count ?? 1) > 1 ? `${row.line_count} payments` : row.payment_app ? optionLabel(UPI_APPS, row.payment_app) : nameOf(row.account_id), row.category_id && nameOf(row.category_id)].filter(Boolean).join(' · ');
      right = money(row.amount_paise, 'out');
      if (usage?.expenseFunded.get(row.id))
        right = (
          <span className="flex flex-col items-end">
            {right}
            <span className="text-[11px] font-medium text-muted">from income</span>
          </span>
        );
      break;
    case 'transfers':
      sub = `${relativeDay(row.txn_date)} · ${nameOf(row.from_account_id)} → ${nameOf(row.to_account_id)}`;
      right = money(row.amount_paise);
      break;
    case 'allocations':
      title = `${nameOf(row.income_id)} → ${nameOf(row.expense_id)}`;
      right = money(row.amount_paise);
      break;
    case 'tasks':
      sub = [optionLabel(TASK_STATUS, row.status), row.due_date && relativeDay(row.due_date), row.client_id && nameOf(row.client_id)].filter(Boolean).join(' · ');
      break;
    case 'invoices':
      title = `${row.invoice_no} · ${row.title}`;
      sub = [row.period, row.due_date && `Due ${formatDate(row.due_date)}`].filter(Boolean).join(' · ');
      right = money(row.amount_paise);
      break;
    case 'projects':
      sub = [optionLabel(PROJECT_STATUS, row.status), row.deadline && `Deadline ${formatDate(row.deadline)}`].filter(Boolean).join(' · ');
      break;
    case 'campaigns':
      sub = [optionLabel(PLATFORMS, row.platform), optionLabel(CAMPAIGN_STATUS, row.status)].join(' · ');
      if (row.budget_paise) right = money(row.budget_paise);
      break;
    case 'clients':
      sub = [row.business_type, row.contact_person].filter(Boolean).join(' · ') || optionLabel(CLIENT_STATUS, row.status);
      right = <Badge tone={row.status === 'active' ? 'primary' : row.status === 'lead' ? 'blue' : 'muted'}>{optionLabel(CLIENT_STATUS, row.status)}</Badge>;
      break;
    case 'loan_repayments':
      sub = `${relativeDay(row.txn_date)} · ${nameOf(row.account_id)}${row.interest_paise ? ` · interest ${formatINR(row.interest_paise)}` : ''}`;
      right = money(row.principal_paise + row.interest_paise);
      break;
    case 'savings_entries':
      sub = relativeDay(row.txn_date);
      right = money(row.amount_paise, row.amount_paise >= 0 ? 'in' : 'out');
      break;
    case 'chapters':
      sub = [optionLabel(CHAPTER_STATUS, row.status), row.revision_count ? `${row.revision_count} revisions` : null].filter(Boolean).join(' · ');
      if (row.is_weak) right = <Badge tone="danger">Weak</Badge>;
      else if (row.is_backlog) right = <Badge tone="amber">Backlog</Badge>;
      break;
    case 'study_sessions':
      sub = [relativeDay(row.session_date), row.subject_id && nameOf(row.subject_id), row.chapter_id && nameOf(row.chapter_id)].filter(Boolean).join(' · ');
      right = <span className="shrink-0 text-[14px] font-semibold">{row.minutes} min</span>;
      break;
    case 'mock_tests':
      sub = formatDate(row.test_date);
      right = <span className="shrink-0 text-[14px] font-semibold">{row.obtained_marks}/{row.total_marks}</span>;
      break;
    case 'client_contacts':
      sub = [row.role, row.phone].filter(Boolean).join(' · ');
      break;
    case 'exams': {
      const days = Math.round((new Date(row.exam_date + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
      sub = formatDate(row.exam_date);
      right = days >= 0 ? <Badge tone={days <= 30 ? 'danger' : 'blue'}>{days} days</Badge> : <Badge>Done</Badge>;
      break;
    }
    case 'events':
      sub = [relativeDay(row.event_date), row.start_time && String(row.start_time).slice(0, 5)].filter(Boolean).join(' · ');
      break;
    case 'savings_goals':
      sub = row.target_date ? `by ${formatDate(row.target_date)}` : '';
      right = money(row.target_paise);
      break;
    case 'loans':
      title = `${row.direction === 'lent' ? 'Lent to' : 'Borrowed from'} ${row.person}`;
      sub = row.due_date ? `Due ${formatDate(row.due_date)}` : formatDate(row.start_date);
      right = money(row.principal_paise);
      break;
    case 'recurring_rules':
      sub = [optionLabel(FREQUENCIES, row.frequency), row.active ? `next ${relativeDay(row.next_date)}` : 'Paused', nameOf(row.account_id)].join(' · ');
      right = money(row.amount_paise, row.kind === 'incomes' ? 'in' : 'out');
      break;
    case 'budgets':
      title = row.category_id ? nameOf(row.category_id) : 'All spending';
      sub = [row.month ?? 'Every month', row.area].filter(Boolean).join(' · ');
      right = money(row.amount_paise);
      break;
    case 'payment_requests':
      sub = [row.client_name, row.status].filter(Boolean).join(' · ');
      right = money(row.amount_paise);
      break;
    default:
      if (row.amount_paise) right = money(row.amount_paise);
  }

  return (
    <ListRow
      icon={<IconBubble tone={tone}><Icon size={17} /></IconBubble>}
      title={title}
      subtitle={sub || undefined}
      right={right}
      onClick={() => nav(`/r/${table}/${row.id}`)}
    />
  );
}
