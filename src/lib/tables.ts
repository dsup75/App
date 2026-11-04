import { todayISO } from './dates';
import { formatINR } from './money';

export type TableName =
  | 'incomes' | 'expenses' | 'transfers' | 'tasks' | 'accounts' | 'categories' | 'payment_requests'
  | 'clients' | 'projects' | 'campaigns' | 'invoices' | 'allocations' | 'loans' | 'loan_repayments'
  | 'savings_goals' | 'savings_entries' | 'groups' | 'group_members' | 'group_expenses' | 'group_settlements'
  | 'habits' | 'events' | 'notes' | 'shopping_items' | 'subjects' | 'chapters' | 'study_sessions' | 'mock_tests' | 'exams';

export type FieldType =
  | 'text' | 'textarea' | 'money' | 'signed_money' | 'date' | 'time' | 'select'
  | 'account' | 'category' | 'ref' | 'int' | 'bool' | 'rate' | 'json';

export interface Option {
  value: string;
  label: string;
}

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Option[];
  categoryKind?: 'income' | 'expense';
  /** for type 'ref': which table the id points to */
  refTable?: TableName;
  /** for type 'ref': only show options whose `filterBy` column equals this form field's value */
  filterBy?: { column: string; field: string };
  placeholder?: string;
  hint?: string;
  default?: () => unknown;
  hidden?: boolean;
}

export interface TableDef {
  table: TableName;
  label: string;
  plural: string;
  titleField: string;
  financial: boolean;
  fields: Field[];
  validate?: (v: Record<string, any>) => string | null;
}

const o = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const AREAS = o([['personal', 'Personal'], ['study', 'Study'], ['business', 'Business']]);
export const PRIORITIES = o([['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']]);
export const TASK_STATUS = o([['pending', 'Pending'], ['in_progress', 'In Progress'], ['waiting', 'Waiting for Client'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]);
export const TASK_TYPES = o([['task', 'Task'], ['follow_up', 'Follow-up'], ['approval', 'Pending approval'], ['creative', 'Creative requirement'], ['meeting', 'Meeting / call']]);
export const ACCOUNT_TYPES = o([['cash', 'Cash'], ['bank', 'Bank'], ['upi', 'UPI app'], ['wallet', 'Wallet'], ['custom', 'Custom']]);
export const UPI_APPS = o([['gpay', 'Google Pay'], ['phonepe', 'PhonePe'], ['paytm', 'Paytm'], ['bhim', 'BHIM'], ['amazonpay', 'Amazon Pay'], ['cred', 'CRED'], ['bank_app', 'Bank app'], ['other', 'Other']]);
export const CATEGORY_KINDS = o([['income', 'Income'], ['expense', 'Expense']]);
export const PAYER_TYPES = o([['client', 'Client (company directly)'], ['client_staff', 'Client staff / on behalf'], ['other', 'Other person']]);
export const PAYMENT_METHODS = o([['upi', 'UPI'], ['bank', 'Bank transfer'], ['cash', 'Cash'], ['payment_link', 'Payment link'], ['card', 'Card'], ['cheque', 'Cheque'], ['other', 'Other']]);
export const REQUEST_STATUS = o([['pending', 'Pending'], ['paid', 'Paid'], ['cancelled', 'Cancelled']]);
export const CLIENT_STATUS = o([['lead', 'Lead'], ['active', 'Active'], ['paused', 'Paused'], ['ended', 'Ended']]);
export const PROJECT_STATUS = o([['planned', 'Planned'], ['active', 'Active'], ['on_hold', 'On hold'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]);
export const CAMPAIGN_STATUS = o([['planned', 'Planned'], ['active', 'Active'], ['paused', 'Paused'], ['completed', 'Completed']]);
export const PLATFORMS = o([['meta', 'Meta (FB/IG)'], ['google', 'Google'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['other', 'Other']]);
export const INVOICE_STATUS = o([['draft', 'Draft'], ['sent', 'Sent'], ['cancelled', 'Cancelled']]);
export const LOAN_DIRECTION = o([['lent', 'I lent (they owe me)'], ['borrowed', 'I borrowed (I owe)']]);
export const INTEREST_TYPES = o([['none', 'No interest'], ['simple', 'Simple interest (yearly %)']]);
export const GROUP_KINDS = o([['personal', 'Personal'], ['business', 'Business']]);
export const SLOTS = o([['morning', 'Morning routine'], ['evening', 'Evening routine'], ['anytime', 'Anytime']]);
export const SUBJECT_EXAMS = o([['both', 'JEE + Board'], ['jee', 'JEE'], ['board', 'Board'], ['other', 'Other']]);
export const CHAPTER_STATUS = o([['not_started', 'Not started'], ['in_progress', 'In progress'], ['completed', 'Completed']]);
export const CLASS_LEVELS = o([['11', 'Class 11'], ['12', 'Class 12'], ['other', 'Other']]);
export const TEST_EXAMS = o([['jee', 'JEE'], ['board', 'Board'], ['other', 'Other']]);
export const SESSION_KINDS = o([['manual', 'Manual'], ['pomodoro', 'Pomodoro']]);

const notes: Field = { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional' };
const area: Field = { key: 'area', label: 'Area', type: 'select', options: AREAS, default: () => 'personal' };
const txnDate: Field = { key: 'txn_date', label: 'Date', type: 'date', required: true, default: todayISO };
const clientRef = (required = false): Field => ({ key: 'client_id', label: 'Client', type: 'ref', refTable: 'clients', required });

export const TABLES: Record<TableName, TableDef> = {
  /* ---------------- Money ---------------- */
  incomes: {
    table: 'incomes', label: 'Income', plural: 'Income', titleField: 'title', financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Solar Ji payment' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'account_id', label: 'Received in', type: 'account', required: true },
      { key: 'category_id', label: 'Category', type: 'category', categoryKind: 'income' },
      clientRef(),
      { key: 'invoice_id', label: 'Against invoice', type: 'ref', refTable: 'invoices', filterBy: { column: 'client_id', field: 'client_id' } },
      { key: 'client_name', label: 'Client / company (if not in Clients)', type: 'text', placeholder: 'Optional' },
      { key: 'payer_type', label: 'Received from', type: 'select', options: PAYER_TYPES, default: () => 'client' },
      { key: 'payer_name', label: 'Payer name', type: 'text', placeholder: 'Who actually paid, e.g. Rahul (staff)' },
      { key: 'payment_method', label: 'Payment method', type: 'select', options: PAYMENT_METHODS, default: () => 'upi' },
      { key: 'reference', label: 'UTR / reference no.', type: 'text', placeholder: 'Optional' },
      area, txnDate, notes,
      { key: 'payment_request_id', label: 'Payment request', type: 'text', hidden: true },
    ],
  },
  expenses: {
    table: 'expenses', label: 'Expense', plural: 'Expenses', titleField: 'title', financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Physics book' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'account_id', label: 'Paid from', type: 'account', required: true },
      { key: 'category_id', label: 'Category', type: 'category', categoryKind: 'expense' },
      area,
      { ...clientRef(), label: 'For client (business expense)' },
      txnDate, notes,
    ],
  },
  transfers: {
    table: 'transfers', label: 'Transfer', plural: 'Transfers', titleField: 'title', financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, default: () => 'Transfer' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'from_account_id', label: 'From account', type: 'account', required: true },
      { key: 'to_account_id', label: 'To account', type: 'account', required: true },
      txnDate, notes,
    ],
    validate: (v) => (v.from_account_id && v.from_account_id === v.to_account_id ? 'From and To accounts must be different.' : null),
  },
  accounts: {
    table: 'accounts', label: 'Account', plural: 'Accounts', titleField: 'name', financial: true,
    fields: [
      { key: 'name', label: 'Account name', type: 'text', required: true, placeholder: 'e.g. SBI, GPay, PhonePe' },
      { key: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES, default: () => 'bank' },
      { key: 'upi_app', label: 'UPI app (if any)', type: 'select', options: UPI_APPS },
      { key: 'upi_id', label: 'UPI ID (to receive payments)', type: 'text', placeholder: 'e.g. name@okaxis' },
      { key: 'opening_balance_paise', label: 'Opening balance (₹)', type: 'signed_money', default: () => 0 },
      notes,
    ],
    validate: (v) => (v.upi_id && !/^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,64}$/.test(v.upi_id) ? 'UPI ID looks wrong (example: name@okaxis).' : null),
  },
  categories: {
    table: 'categories', label: 'Category', plural: 'Categories', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'kind', label: 'Type', type: 'select', options: CATEGORY_KINDS, default: () => 'expense' },
    ],
  },
  payment_requests: {
    table: 'payment_requests', label: 'Payment Request', plural: 'Payment Requests', titleField: 'title', financial: true,
    fields: [
      { key: 'title', label: 'For', type: 'text', required: true, placeholder: 'e.g. November ads management' },
      { key: 'client_name', label: 'Client / company', type: 'text', placeholder: 'e.g. Solar Ji' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'account_id', label: 'Receive on (UPI account)', type: 'account', hint: 'QR uses this account’s UPI ID (or the one in Settings)' },
      { key: 'due_date', label: 'Due date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: REQUEST_STATUS, default: () => 'pending' },
      { key: 'note', label: 'Note on payment', type: 'textarea', placeholder: 'Shown in the UPI app (short)' },
    ],
  },
  invoices: {
    table: 'invoices', label: 'Invoice', plural: 'Invoices', titleField: 'invoice_no', financial: true,
    fields: [
      clientRef(true),
      { key: 'invoice_no', label: 'Invoice no.', type: 'text', required: true, placeholder: 'e.g. DB-2026-011' },
      { key: 'title', label: 'Description', type: 'text', required: true, default: () => 'Digital marketing services' },
      { key: 'period', label: 'Billing month', type: 'text', placeholder: 'e.g. November 2026' },
      { key: 'amount_paise', label: 'Invoice amount (₹)', type: 'money', required: true },
      { key: 'issue_date', label: 'Issue date', type: 'date', required: true, default: todayISO },
      { key: 'due_date', label: 'Due date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUS, default: () => 'sent', hint: 'Partial / Paid / Overdue are calculated from payments' },
      notes,
    ],
  },
  allocations: {
    table: 'allocations', label: 'Allocation', plural: 'Allocations', titleField: 'amount_paise', financial: true,
    fields: [
      { key: 'income_id', label: 'From income', type: 'ref', refTable: 'incomes', required: true },
      { key: 'expense_id', label: 'To expense', type: 'ref', refTable: 'expenses', required: true },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      notes,
    ],
  },
  loans: {
    table: 'loans', label: 'Udhaar / Loan', plural: 'Udhaar & Loans', titleField: 'person', financial: true,
    fields: [
      { key: 'direction', label: 'Type', type: 'select', options: LOAN_DIRECTION, default: () => 'lent' },
      { key: 'person', label: 'Person', type: 'text', required: true },
      { key: 'principal_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'account_id', label: 'Account (money went out of / came into)', type: 'account', required: true },
      { key: 'start_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'due_date', label: 'Due date', type: 'date' },
      { key: 'interest_type', label: 'Interest', type: 'select', options: INTEREST_TYPES, default: () => 'none' },
      { key: 'interest_rate_bp', label: 'Interest rate (% per year)', type: 'rate', default: () => 0 },
      notes,
    ],
  },
  loan_repayments: {
    table: 'loan_repayments', label: 'Repayment', plural: 'Repayments', titleField: 'title', financial: true,
    fields: [
      { key: 'loan_id', label: 'Loan', type: 'ref', refTable: 'loans', required: true },
      { key: 'title', label: 'Title', type: 'text', required: true, default: () => 'Repayment' },
      { key: 'principal_paise', label: 'Principal part (₹)', type: 'signed_money', default: () => 0 },
      { key: 'interest_paise', label: 'Interest part (₹)', type: 'signed_money', default: () => 0 },
      { key: 'account_id', label: 'Account', type: 'account', required: true },
      txnDate, notes,
    ],
    validate: (v) =>
      v.principal_paise < 0 || v.interest_paise < 0
        ? 'Amounts cannot be negative.'
        : (v.principal_paise ?? 0) + (v.interest_paise ?? 0) <= 0
          ? 'Enter principal and/or interest.'
          : null,
  },
  savings_goals: {
    table: 'savings_goals', label: 'Savings Goal', plural: 'Savings Goals', titleField: 'name', financial: true,
    fields: [
      { key: 'name', label: 'Goal', type: 'text', required: true, placeholder: 'e.g. Laptop' },
      { key: 'target_paise', label: 'Target (₹)', type: 'money', required: true },
      { key: 'target_date', label: 'Target date', type: 'date' },
      notes,
    ],
  },
  savings_entries: {
    table: 'savings_entries', label: 'Savings Entry', plural: 'Savings Entries', titleField: 'title', financial: true,
    fields: [
      { key: 'goal_id', label: 'Goal', type: 'ref', refTable: 'savings_goals', required: true },
      { key: 'title', label: 'Title', type: 'text', required: true, default: () => 'Contribution' },
      { key: 'amount_paise', label: 'Amount (₹) — use minus for withdrawal', type: 'signed_money', required: true },
      txnDate, notes,
    ],
    validate: (v) => (!v.amount_paise ? 'Amount cannot be zero.' : null),
  },
  groups: {
    table: 'groups', label: 'Group', plural: 'Groups', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Group name', type: 'text', required: true, placeholder: 'e.g. Goa trip, Office lunch' },
      { key: 'kind', label: 'Type', type: 'select', options: GROUP_KINDS, default: () => 'personal' },
      notes,
    ],
  },
  group_members: {
    table: 'group_members', label: 'Member', plural: 'Members', titleField: 'name', financial: false,
    fields: [
      { key: 'group_id', label: 'Group', type: 'ref', refTable: 'groups', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'is_me', label: 'This is me', type: 'bool', default: () => false },
    ],
  },
  group_expenses: {
    table: 'group_expenses', label: 'Group Expense', plural: 'Group Expenses', titleField: 'title', financial: true,
    fields: [
      { key: 'group_id', label: 'Group', type: 'ref', refTable: 'groups', required: true },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'amount_paise', label: 'Total (₹)', type: 'money', required: true },
      { key: 'split_type', label: 'Split', type: 'select', options: o([['equal', 'Equal'], ['custom', 'Custom amounts'], ['percent', 'Percentage'], ['itemwise', 'Item-wise']]) },
      { key: 'payers', label: 'Paid by', type: 'json' },
      { key: 'shares', label: 'Shares', type: 'json' },
      txnDate, notes,
    ],
  },
  group_settlements: {
    table: 'group_settlements', label: 'Settlement', plural: 'Settlements', titleField: 'title', financial: true,
    fields: [
      { key: 'group_id', label: 'Group', type: 'ref', refTable: 'groups', required: true },
      { key: 'title', label: 'Title', type: 'text', required: true, default: () => 'Settlement' },
      { key: 'from_member_id', label: 'Paid by', type: 'ref', refTable: 'group_members', required: true, filterBy: { column: 'group_id', field: 'group_id' } },
      { key: 'to_member_id', label: 'Paid to', type: 'ref', refTable: 'group_members', required: true, filterBy: { column: 'group_id', field: 'group_id' } },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      txnDate, notes,
    ],
    validate: (v) => (v.from_member_id && v.from_member_id === v.to_member_id ? 'Choose two different people.' : null),
  },

  /* ---------------- Daily life ---------------- */
  tasks: {
    table: 'tasks', label: 'Task', plural: 'Tasks', titleField: 'title', financial: false,
    fields: [
      { key: 'title', label: 'Task', type: 'text', required: true, placeholder: 'What needs to be done?' },
      area,
      { key: 'task_type', label: 'Type', type: 'select', options: TASK_TYPES, default: () => 'task' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: () => 'medium' },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUS, default: () => 'pending' },
      { key: 'due_date', label: 'Due date', type: 'date', default: todayISO },
      clientRef(),
      { key: 'project_id', label: 'Project', type: 'ref', refTable: 'projects', filterBy: { column: 'client_id', field: 'client_id' } },
      notes,
    ],
  },
  habits: {
    table: 'habits', label: 'Habit', plural: 'Habits', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Habit', type: 'text', required: true, placeholder: 'e.g. Wake up at 5:30' },
      { key: 'slot', label: 'Routine', type: 'select', options: SLOTS, default: () => 'anytime' },
      area,
      { key: 'target_per_week', label: 'Days per week', type: 'int', default: () => 7 },
      notes,
    ],
    validate: (v) => (v.target_per_week < 1 || v.target_per_week > 7 ? 'Days per week must be 1–7.' : null),
  },
  events: {
    table: 'events', label: 'Event', plural: 'Events', titleField: 'title', financial: false,
    fields: [
      { key: 'title', label: 'Event', type: 'text', required: true },
      { key: 'event_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'start_time', label: 'Start time', type: 'time' },
      { key: 'end_time', label: 'End time', type: 'time' },
      area,
      { key: 'location', label: 'Location', type: 'text' },
      notes,
    ],
  },
  notes: {
    table: 'notes', label: 'Note', plural: 'Notes', titleField: 'title', financial: false,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'body', label: 'Note', type: 'textarea' },
      area,
      { key: 'pinned', label: 'Pin to top', type: 'bool', default: () => false },
    ],
  },
  shopping_items: {
    table: 'shopping_items', label: 'Shopping Item', plural: 'Shopping List', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Item', type: 'text', required: true },
      { key: 'quantity', label: 'Quantity', type: 'text', placeholder: 'e.g. 2 kg' },
      { key: 'done', label: 'Bought', type: 'bool', default: () => false },
    ],
  },

  /* ---------------- Study ---------------- */
  subjects: {
    table: 'subjects', label: 'Subject', plural: 'Subjects', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Subject', type: 'text', required: true },
      { key: 'exam', label: 'For', type: 'select', options: SUBJECT_EXAMS, default: () => 'both' },
    ],
  },
  chapters: {
    table: 'chapters', label: 'Chapter', plural: 'Chapters', titleField: 'name', financial: false,
    fields: [
      { key: 'subject_id', label: 'Subject', type: 'ref', refTable: 'subjects', required: true },
      { key: 'name', label: 'Chapter', type: 'text', required: true },
      { key: 'class_level', label: 'Class', type: 'select', options: CLASS_LEVELS, default: () => '12' },
      { key: 'status', label: 'Status', type: 'select', options: CHAPTER_STATUS, default: () => 'not_started' },
      { key: 'revision_count', label: 'Revisions done', type: 'int', default: () => 0 },
      { key: 'is_weak', label: 'Weak topic', type: 'bool', default: () => false },
      { key: 'is_backlog', label: 'Backlog', type: 'bool', default: () => false },
      notes,
    ],
  },
  study_sessions: {
    table: 'study_sessions', label: 'Study Session', plural: 'Study Sessions', titleField: 'title', financial: false,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, default: () => 'Study session' },
      { key: 'subject_id', label: 'Subject', type: 'ref', refTable: 'subjects' },
      { key: 'chapter_id', label: 'Chapter', type: 'ref', refTable: 'chapters', filterBy: { column: 'subject_id', field: 'subject_id' } },
      { key: 'minutes', label: 'Minutes studied', type: 'int', required: true },
      { key: 'session_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'kind', label: 'Type', type: 'select', options: SESSION_KINDS, default: () => 'manual' },
      notes,
    ],
    validate: (v) => (v.minutes < 1 || v.minutes > 1440 ? 'Minutes must be between 1 and 1440.' : null),
  },
  mock_tests: {
    table: 'mock_tests', label: 'Mock Test', plural: 'Mock Tests', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Test name', type: 'text', required: true, placeholder: 'e.g. Allen Major Test 3' },
      { key: 'exam', label: 'Exam', type: 'select', options: TEST_EXAMS, default: () => 'jee' },
      { key: 'subject_id', label: 'Subject (leave empty for full test)', type: 'ref', refTable: 'subjects' },
      { key: 'test_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'total_marks', label: 'Total marks', type: 'int', required: true, default: () => 300 },
      { key: 'correct', label: 'Correct', type: 'int', default: () => 0 },
      { key: 'incorrect', label: 'Incorrect', type: 'int', default: () => 0 },
      { key: 'unattempted', label: 'Unattempted', type: 'int', default: () => 0 },
      { key: 'marks_per_correct', label: 'Marks per correct', type: 'int', default: () => 4 },
      { key: 'negative_marks', label: 'Negative per wrong', type: 'int', default: () => 1 },
      { key: 'obtained_marks', label: 'Marks obtained (auto if empty)', type: 'int' },
      { key: 'weak_chapters', label: 'Weak chapters', type: 'textarea' },
      notes,
    ],
  },
  exams: {
    table: 'exams', label: 'Exam', plural: 'Exams', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Exam', type: 'text', required: true, placeholder: 'e.g. JEE Main Session 1' },
      { key: 'exam_date', label: 'Date', type: 'date', required: true },
      notes,
    ],
  },

  /* ---------------- Clients ---------------- */
  clients: {
    table: 'clients', label: 'Client', plural: 'Clients', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Client / company', type: 'text', required: true },
      { key: 'contact_person', label: 'Contact person', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'business_type', label: 'Business', type: 'text', placeholder: 'e.g. Solar, Automotive' },
      { key: 'status', label: 'Status', type: 'select', options: CLIENT_STATUS, default: () => 'active' },
      { key: 'start_date', label: 'Start date', type: 'date' },
      notes,
    ],
  },
  projects: {
    table: 'projects', label: 'Project', plural: 'Projects', titleField: 'name', financial: false,
    fields: [
      clientRef(true),
      { key: 'name', label: 'Project', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'select', options: PROJECT_STATUS, default: () => 'active' },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'deadline', label: 'Deadline', type: 'date' },
      { key: 'budget_paise', label: 'Budget (₹)', type: 'money' },
      notes,
    ],
  },
  campaigns: {
    table: 'campaigns', label: 'Campaign', plural: 'Campaigns', titleField: 'name', financial: false,
    fields: [
      clientRef(true),
      { key: 'project_id', label: 'Project', type: 'ref', refTable: 'projects', filterBy: { column: 'client_id', field: 'client_id' } },
      { key: 'name', label: 'Campaign name', type: 'text', required: true },
      { key: 'platform', label: 'Platform', type: 'select', options: PLATFORMS, default: () => 'meta' },
      { key: 'objective', label: 'Objective', type: 'text', placeholder: 'e.g. Leads, Sales, Awareness' },
      { key: 'status', label: 'Status', type: 'select', options: CAMPAIGN_STATUS, default: () => 'planned' },
      { key: 'budget_paise', label: 'Budget (₹)', type: 'money' },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'end_date', label: 'End date', type: 'date' },
      { key: 'creative_requirements', label: 'Creative requirements', type: 'textarea' },
      { key: 'ad_copy', label: 'Ad copy', type: 'textarea' },
      { key: 'results', label: 'Performance / results', type: 'textarea', placeholder: 'e.g. 120 leads, ₹35 CPL' },
      notes,
    ],
  },
};

export function isTableName(t: string | undefined): t is TableName {
  return !!t && t in TABLES;
}

/** Column used as the display name for a row in dropdowns / links */
export function displayOf(table: TableName, row: Record<string, any>): string {
  const d = TABLES[table];
  if (table === 'invoices') return `${row.invoice_no} · ${row.title ?? ''}`;
  if (table === 'allocations') return `Allocation ${formatINR(row.amount_paise)}`;
  if (table === 'incomes' || table === 'expenses') return row.amount_paise !== undefined ? `${row.title} · ${formatINR(row.amount_paise)}` : String(row.title);
  if (table === 'loans') return `${row.direction === 'lent' ? 'Lent to' : 'Borrowed from'} ${row.person}`;
  return String(row[d.titleField] ?? '—');
}

export const META_LABELS: Record<string, string> = {
  __created: 'Created',
  deleted_at: 'Deleted / Restored',
  completed_at: 'Completed at',
  paid_at: 'Paid at',
};

export function fieldLabel(table: TableName, key: string): string {
  return TABLES[table].fields.find((f) => f.key === key)?.label ?? META_LABELS[key] ?? key;
}

export function optionLabel(options: Option[] | undefined, value: unknown): string {
  return options?.find((x) => x.value === value)?.label ?? String(value ?? '—');
}
