import type { TableName } from './tables';

/** Child records shown on a parent's detail screen, with "+ Add" pre-filled. */
export interface ChildSpec {
  table: TableName;
  fk: string;
  title: string;
  order: string;
  addLabel?: string;
  /** extra query params for the "+ Add" link */
  extra?: Record<string, string>;
}

export const CHILDREN: Partial<Record<TableName, ChildSpec[]>> = {
  clients: [
    { table: 'client_contacts', fk: 'client_id', title: 'Staff / contacts', order: 'name', addLabel: 'Staff' },
    { table: 'tasks', fk: 'client_id', title: 'Client tasks & follow-ups', order: 'due_date', addLabel: 'Task', extra: { area: 'business' } },
    { table: 'invoices', fk: 'client_id', title: 'Invoices', order: 'issue_date', addLabel: 'Invoice' },
    { table: 'incomes', fk: 'client_id', title: 'Payments received', order: 'txn_date', addLabel: 'Payment', extra: { area: 'business' } },
    { table: 'projects', fk: 'client_id', title: 'Projects', order: 'created_at', addLabel: 'Project' },
    { table: 'campaigns', fk: 'client_id', title: 'Campaigns', order: 'created_at', addLabel: 'Campaign' },
    { table: 'expenses', fk: 'client_id', title: 'Expenses for this client', order: 'txn_date', addLabel: 'Expense', extra: { area: 'business' } },
  ],
  projects: [
    { table: 'campaigns', fk: 'project_id', title: 'Campaigns', order: 'created_at', addLabel: 'Campaign' },
    { table: 'tasks', fk: 'project_id', title: 'Tasks', order: 'due_date', addLabel: 'Task', extra: { area: 'business' } },
  ],
  invoices: [{ table: 'incomes', fk: 'invoice_id', title: 'Payments', order: 'txn_date', addLabel: 'Payment', extra: { area: 'business', payment_method: 'upi' } }],
  // incomes / expenses: links are shown in the "Where this income went" / "Paid out of" card
  loans: [{ table: 'loan_repayments', fk: 'loan_id', title: 'Repayments', order: 'txn_date', addLabel: 'Repayment' }],
  savings_goals: [{ table: 'savings_entries', fk: 'goal_id', title: 'Contributions & withdrawals', order: 'txn_date', addLabel: 'Entry' }],
  subjects: [
    { table: 'chapters', fk: 'subject_id', title: 'Chapters', order: 'name', addLabel: 'Chapter' },
    { table: 'study_sessions', fk: 'subject_id', title: 'Study sessions', order: 'session_date', addLabel: 'Session' },
    { table: 'mock_tests', fk: 'subject_id', title: 'Tests', order: 'test_date', addLabel: 'Test' },
  ],
  chapters: [{ table: 'study_sessions', fk: 'chapter_id', title: 'Study sessions', order: 'session_date', addLabel: 'Session' }],
  accounts: [],
  categories: [],
};
