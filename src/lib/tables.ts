import { todayISO } from './dates';

export type TableName = 'incomes' | 'expenses' | 'transfers' | 'tasks' | 'accounts' | 'categories';

export type FieldType = 'text' | 'textarea' | 'money' | 'signed_money' | 'date' | 'select' | 'account' | 'category';

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
  placeholder?: string;
  default?: () => unknown;
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

export const AREAS: Option[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'study', label: 'Study' },
  { value: 'business', label: 'Business' },
];

export const PRIORITIES: Option[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const TASK_STATUS: Option[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ACCOUNT_TYPES: Option[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'custom', label: 'Custom' },
];

export const CATEGORY_KINDS: Option[] = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

const notes: Field = { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional' };

export const TABLES: Record<TableName, TableDef> = {
  incomes: {
    table: 'incomes',
    label: 'Income',
    plural: 'Incomes',
    titleField: 'title',
    financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Solar Ji payment' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'account_id', label: 'Received in', type: 'account', required: true },
      { key: 'category_id', label: 'Category', type: 'category', categoryKind: 'income' },
      { key: 'area', label: 'Area', type: 'select', options: AREAS, default: () => 'personal' },
      { key: 'txn_date', label: 'Date', type: 'date', required: true, default: todayISO },
      notes,
    ],
  },
  expenses: {
    table: 'expenses',
    label: 'Expense',
    plural: 'Expenses',
    titleField: 'title',
    financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Physics book' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'account_id', label: 'Paid from', type: 'account', required: true },
      { key: 'category_id', label: 'Category', type: 'category', categoryKind: 'expense' },
      { key: 'area', label: 'Area', type: 'select', options: AREAS, default: () => 'personal' },
      { key: 'txn_date', label: 'Date', type: 'date', required: true, default: todayISO },
      notes,
    ],
  },
  transfers: {
    table: 'transfers',
    label: 'Transfer',
    plural: 'Transfers',
    titleField: 'title',
    financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, default: () => 'Transfer' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'from_account_id', label: 'From account', type: 'account', required: true },
      { key: 'to_account_id', label: 'To account', type: 'account', required: true },
      { key: 'txn_date', label: 'Date', type: 'date', required: true, default: todayISO },
      notes,
    ],
    validate: (v) =>
      v.from_account_id && v.from_account_id === v.to_account_id ? 'From and To accounts must be different.' : null,
  },
  tasks: {
    table: 'tasks',
    label: 'Task',
    plural: 'Tasks',
    titleField: 'title',
    financial: false,
    fields: [
      { key: 'title', label: 'Task', type: 'text', required: true, placeholder: 'What needs to be done?' },
      { key: 'area', label: 'Area', type: 'select', options: AREAS, default: () => 'personal' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: () => 'medium' },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUS, default: () => 'pending' },
      { key: 'due_date', label: 'Due date', type: 'date', default: todayISO },
      notes,
    ],
  },
  accounts: {
    table: 'accounts',
    label: 'Account',
    plural: 'Accounts',
    titleField: 'name',
    financial: true,
    fields: [
      { key: 'name', label: 'Account name', type: 'text', required: true, placeholder: 'e.g. SBI, Paytm' },
      { key: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES, default: () => 'bank' },
      { key: 'opening_balance_paise', label: 'Opening balance (₹)', type: 'signed_money', default: () => 0 },
      notes,
    ],
  },
  categories: {
    table: 'categories',
    label: 'Category',
    plural: 'Categories',
    titleField: 'name',
    financial: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'kind', label: 'Type', type: 'select', options: CATEGORY_KINDS, default: () => 'expense' },
    ],
  },
};

export function isTableName(t: string | undefined): t is TableName {
  return !!t && t in TABLES;
}

export const META_LABELS: Record<string, string> = {
  __created: 'Created',
  deleted_at: 'Deleted / Restored',
  completed_at: 'Completed at',
};

export function fieldLabel(table: TableName, key: string): string {
  return TABLES[table].fields.find((f) => f.key === key)?.label ?? META_LABELS[key] ?? key;
}

export function optionLabel(options: Option[] | undefined, value: unknown): string {
  return options?.find((o) => o.value === value)?.label ?? String(value ?? '—');
}
