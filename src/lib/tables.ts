import { todayISO } from './dates';
import { formatINR } from './money';

export type TableName =
  | 'incomes' | 'expenses' | 'transfers' | 'tasks' | 'accounts' | 'categories' | 'payment_requests'
  | 'clients' | 'projects' | 'campaigns' | 'invoices' | 'allocations' | 'loans' | 'loan_repayments'
  | 'savings_goals' | 'savings_entries' | 'groups' | 'group_members' | 'group_expenses' | 'group_settlements'
  | 'habits' | 'events' | 'notes' | 'shopping_items' | 'subjects' | 'chapters' | 'study_sessions' | 'mock_tests' | 'exams'
  | 'client_contacts' | 'custom_options' | 'budgets' | 'recurring_rules' | 'insurance_policies' | 'credit_scores'
  | 'medicines' | 'medicine_logs' | 'vitals' | 'doctor_appointments' | 'medical_documents' | 'water_logs' | 'sleep_logs';

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
  /** dropdown the user can extend / trim in Settings → Manage lists */
  listKey?: ListKey;
  /** sensitive: shown masked until tapped */
  mask?: boolean;
  /** detail page shows a one-tap copy button */
  copy?: boolean;
  /** only show this field when the condition holds (e.g. card fields only for credit cards) */
  showIf?: (v: Record<string, any>) => boolean;
}

export type ListKey = 'payment_app' | 'payment_method' | 'task_type' | 'platform';

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
export const ACCOUNT_TYPES = o([
  ['cash', 'Cash'], ['bank', 'Bank'], ['upi', 'UPI app'], ['wallet', 'Wallet'],
  ['credit_card', 'Credit card'], ['pay_later', 'Pay Later (BNPL)'], ['loan', 'Loan (EMI)'], ['investment', 'Investment'], ['custom', 'Custom'],
]);
/** money you can spend (counted in "Total balance") */
export const SPENDABLE_TYPES = ['cash', 'bank', 'upi', 'wallet', 'custom'];
/** you owe this money — balance below zero = due */
export const LIABILITY_TYPES = ['credit_card', 'pay_later', 'loan'];
export const isSpendable = (type?: string | null) => SPENDABLE_TYPES.includes(type ?? 'custom');
export const isLiability = (type?: string | null) => LIABILITY_TYPES.includes(type ?? '');
export const LOAN_KINDS = o([
  ['personal', 'Personal loan'], ['home', 'Home loan'], ['car', 'Car loan'], ['two_wheeler', 'Two-wheeler loan'], ['education', 'Education loan'],
  ['gold', 'Gold loan'], ['business', 'Business loan'], ['consumer', 'Consumer durable (phone, TV…)'], ['mobile', 'Mobile / app loan'], ['card_emi', 'Credit card EMI'], ['other', 'Other'],
]);
export const INVESTMENT_KINDS = o([
  ['fd', 'Fixed deposit (FD)'], ['rd', 'Recurring deposit (RD)'], ['sip', 'SIP'], ['mutual_fund', 'Mutual fund (lump sum)'], ['stocks', 'Stocks'],
  ['gold', 'Gold / SGB'], ['ppf', 'PPF'], ['nps', 'NPS'], ['epf', 'EPF / PF'], ['bonds', 'Bonds'], ['crypto', 'Crypto'], ['other', 'Other'],
]);
export const POLICY_TYPES = o([['health', 'Health'], ['term', 'Term life'], ['life', 'Life / endowment'], ['vehicle', 'Vehicle'], ['accident', 'Personal accident'], ['home', 'Home'], ['travel', 'Travel'], ['other', 'Other']]);
export const PREMIUM_FREQ = o([['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['half_yearly', 'Half-yearly'], ['yearly', 'Yearly'], ['single', 'One time']]);
export const POLICY_STATUS = o([['active', 'Active'], ['lapsed', 'Lapsed'], ['matured', 'Matured'], ['closed', 'Closed']]);
export const BUREAUS = o([['cibil', 'CIBIL'], ['experian', 'Experian'], ['equifax', 'Equifax'], ['crif', 'CRIF High Mark'], ['other', 'Other']]);
export const BANK_ACCOUNT_TYPES = o([['savings', 'Savings'], ['current', 'Current'], ['salary', 'Salary'], ['jan_dhan', 'Jan Dhan'], ['basic', 'Basic savings (BSBDA)'], ['nre', 'NRE'], ['nro', 'NRO'], ['other', 'Other']]);
export const CARD_NETWORKS = o([['rupay', 'RuPay'], ['visa', 'Visa'], ['mastercard', 'Mastercard'], ['amex', 'American Express'], ['diners', 'Diners Club']]);
export const UPI_APPS = o([['gpay', 'Google Pay'], ['phonepe', 'PhonePe'], ['paytm', 'Paytm'], ['bhim', 'BHIM'], ['amazonpay', 'Amazon Pay'], ['cred', 'CRED'], ['bank_app', 'Bank app'], ['netbanking', 'Net banking'], ['card', 'Card'], ['cash', 'Cash'], ['other', 'Other']]);
export const FREQUENCIES = o([['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']]);
export const SUB_STATUS = o([['active', 'Active'], ['paused', 'Paused'], ['cancelled', 'Cancelled']]);
export const RECUR_KINDS = o([['expenses', 'Expense (money out)'], ['incomes', 'Income (money in)']]);
export const PAYMENT_MODES = o([['personal', 'Personal'], ['business', 'Business']]);
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
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


/* ---------- Health care ---------- */
export const MED_FORMS = o([['tablet', 'Tablet'], ['capsule', 'Capsule'], ['syrup', 'Syrup'], ['injection', 'Injection'], ['drops', 'Drops'], ['inhaler', 'Inhaler'], ['cream', 'Cream / ointment'], ['other', 'Other']]);
export const MED_FOOD = o([['after', 'After food'], ['before', 'Before food'], ['with', 'With food'], ['any', 'Any time']]);
export const MED_STATUS = o([['active', 'Taking now'], ['paused', 'Paused'], ['finished', 'Course finished']]);
export const MED_SLOTS = o([['morning', 'Morning'], ['afternoon', 'Afternoon'], ['night', 'Night'], ['extra', 'Extra dose']]);
export const DOSE_STATUS = o([['taken', 'Taken'], ['skipped', 'Skipped']]);
export const VITAL_KINDS = o([['bp', 'Blood pressure'], ['sugar', 'Blood sugar'], ['pulse', 'Pulse'], ['spo2', 'Oxygen (SpO2)'], ['temperature', 'Temperature']]);
export const SUGAR_TIMING = o([['fasting', 'Fasting'], ['after_meal', 'After meal (2 hr)'], ['random', 'Random'], ['bedtime', 'Bedtime']]);
export const APPT_STATUS = o([['upcoming', 'Upcoming'], ['done', 'Visited'], ['cancelled', 'Cancelled'], ['missed', 'Missed']]);
export const DOC_TYPES = o([['prescription', 'Prescription'], ['report', 'Lab report'], ['scan', 'X-ray / scan'], ['bill', 'Medical bill'], ['vaccination', 'Vaccination'], ['discharge', 'Discharge summary'], ['other', 'Other']]);
export const SLEEP_QUALITY = o([['poor', 'Poor'], ['okay', 'Okay'], ['good', 'Good'], ['great', 'Great']]);

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
      { key: 'payment_mode', label: 'Payment mode', type: 'select', options: PAYMENT_MODES, default: () => 'personal' },
      { key: 'payment_method', label: 'Payment method', type: 'select', options: PAYMENT_METHODS, listKey: 'payment_method', default: () => 'upi' },
      { key: 'payment_app', label: 'Received on app', type: 'select', options: UPI_APPS, listKey: 'payment_app' },
      { key: 'reference', label: 'UTR / reference no.', type: 'text', placeholder: 'Optional' },
      { key: 'payment_link', label: 'Payment link', type: 'text', placeholder: 'https://… (optional)' },
      area, txnDate,
      { key: 'txn_time', label: 'Time received', type: 'time', default: nowTime },
      notes,
      { key: 'payment_request_id', label: 'Payment request', type: 'text', hidden: true },
      { key: 'split_expense_id', label: 'Split repayment of', type: 'ref', refTable: 'expenses', hidden: true },
      { key: 'sources', label: 'Received in accounts', type: 'json' },
    ],
  },
  expenses: {
    table: 'expenses', label: 'Expense', plural: 'Expenses', titleField: 'title', financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Physics book' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'account_id', label: 'Paid from', type: 'account', required: true },
      { key: 'category_id', label: 'Category', type: 'category', categoryKind: 'expense' },
      { key: 'payment_mode', label: 'Payment mode', type: 'select', options: PAYMENT_MODES, default: () => 'personal' },
      { key: 'payment_method', label: 'Payment method', type: 'select', options: PAYMENT_METHODS, listKey: 'payment_method', default: () => 'upi' },
      { key: 'payment_app', label: 'Paid with app', type: 'select', options: UPI_APPS, listKey: 'payment_app' },
      { key: 'reference', label: 'UTR / reference no.', type: 'text', placeholder: 'Optional' },
      { key: 'payment_link', label: 'Payment link', type: 'text', placeholder: 'https://… (optional)' },
      area,
      { ...clientRef(), label: 'For client (business expense)' },
      txnDate,
      { key: 'txn_time', label: 'Time paid', type: 'time', default: nowTime },
      notes,
      { key: 'sources', label: 'Paid from accounts', type: 'json' },
      { key: 'split_with', label: 'Split with', type: 'json' },
    ],
  },
  transfers: {
    table: 'transfers', label: 'Transfer', plural: 'Transfers', titleField: 'title', financial: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, default: () => 'Transfer' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'from_account_id', label: 'From account', type: 'account', required: true },
      { key: 'to_account_id', label: 'To account', type: 'account', required: true },
      txnDate,
      { key: 'txn_time', label: 'Time', type: 'time', default: nowTime },
      notes,
    ],
    validate: (v) => (v.from_account_id && v.from_account_id === v.to_account_id ? 'From and To accounts must be different.' : null),
  },
  accounts: {
    table: 'accounts', label: 'Account', plural: 'Accounts', titleField: 'name', financial: true,
    fields: [
      { key: 'name', label: 'Account name', type: 'text', required: true, placeholder: 'e.g. SBI, GPay, SBI Card, Bike loan' },
      { key: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES, default: () => 'bank' },
      { key: 'upi_app', label: 'UPI app (if any)', type: 'select', options: UPI_APPS, listKey: 'payment_app', showIf: (v) => isSpendable(v.type) },
      { key: 'upi_id', label: 'UPI ID (to receive payments)', type: 'text', placeholder: 'e.g. name@okaxis', copy: true, showIf: (v) => isSpendable(v.type) },
      { key: 'opening_balance_paise', label: 'Opening balance (₹)', type: 'signed_money', default: () => 0, hint: 'Card / loan / pay later: enter what you owe with a minus, e.g. -5000.' },
      { key: 'opening_date', label: 'Opening balance as on (date)', type: 'date', hint: 'Only entries from this date count. Leave empty to count all entries.' },
      // credit card / pay later
      { key: 'lender', label: 'Bank / lender / provider', type: 'text', placeholder: 'e.g. SBI Card, HDFC, Simpl, Groww', showIf: (v) => !isSpendable(v.type) },
      { key: 'card_last4', label: 'Card last 4 digits (optional)', type: 'text', placeholder: '4589', hint: 'Only the last 4 digits. Never save the full card number, CVV or PIN.', showIf: (v) => v.type === 'credit_card' },
      { key: 'credit_limit_paise', label: 'Credit limit (₹)', type: 'money', showIf: (v) => v.type === 'credit_card' || v.type === 'pay_later' },
      { key: 'statement_day', label: 'Bill (statement) day of month', type: 'int', placeholder: 'e.g. 15', showIf: (v) => v.type === 'credit_card' || v.type === 'pay_later' },
      { key: 'due_day', label: 'Payment due day of month', type: 'int', placeholder: 'e.g. 5', showIf: (v) => v.type === 'credit_card' || v.type === 'pay_later' },
      // loan
      { key: 'loan_kind', label: 'Loan type', type: 'select', options: LOAN_KINDS, showIf: (v) => v.type === 'loan' },
      { key: 'principal_paise', label: 'Loan amount taken (₹)', type: 'money', showIf: (v) => v.type === 'loan' },
      { key: 'tenure_months', label: 'Tenure (months)', type: 'int', placeholder: 'e.g. 24', showIf: (v) => v.type === 'loan' || v.type === 'investment' },
      // investment
      { key: 'investment_kind', label: 'Investment type', type: 'select', options: INVESTMENT_KINDS, showIf: (v) => v.type === 'investment' },
      { key: 'interest_rate_bp', label: 'Interest rate (% per year)', type: 'rate', showIf: (v) => !isSpendable(v.type) },
      { key: 'installment_paise', label: 'EMI / SIP / RD amount (₹)', type: 'money', showIf: (v) => v.type === 'loan' || v.type === 'investment' },
      { key: 'installment_day', label: 'EMI / SIP day of month', type: 'int', placeholder: 'e.g. 5', showIf: (v) => v.type === 'loan' || v.type === 'investment' },
      { key: 'plan_start_date', label: 'Start date', type: 'date', showIf: (v) => v.type === 'loan' || v.type === 'investment' },
      { key: 'maturity_date', label: 'Maturity / end date', type: 'date', showIf: (v) => v.type === 'investment' || v.type === 'loan' },
      { key: 'market_value_paise', label: 'Current value today (₹)', type: 'money', hint: 'What it is worth now (from your app/statement). Money you put in is tracked by transfers.', showIf: (v) => v.type === 'investment' },
      { key: 'market_value_at', label: 'Current value as on', type: 'date', showIf: (v) => v.type === 'investment' },
      { key: 'autopay_account_id', label: 'Auto-pay / EMI from account (optional)', type: 'account', showIf: (v) => !isSpendable(v.type) },
      // bank details
      { key: 'account_holder', label: 'Account holder name (optional)', type: 'text', showIf: (v) => v.type === 'bank' || v.type === 'credit_card' },
      { key: 'account_number', label: 'Account / loan number (optional)', type: 'text', mask: true, copy: true, hint: 'Shown masked. Never save ATM PIN, UPI PIN, CVV, OTP or net-banking passwords anywhere in the app.', showIf: (v) => v.type !== 'cash' && v.type !== 'credit_card' },
      { key: 'ifsc', label: 'IFSC (optional)', type: 'text', copy: true, placeholder: 'e.g. SBIN0001234', showIf: (v) => v.type === 'bank' },
      { key: 'customer_id', label: 'CIF / customer ID (optional)', type: 'text', mask: true, copy: true, showIf: (v) => v.type === 'bank' || v.type === 'loan' || v.type === 'credit_card' },
      { key: 'branch', label: 'Branch name / address (optional)', type: 'text', showIf: (v) => v.type === 'bank' || v.type === 'loan' },
      { key: 'bank_account_type', label: 'Account type (optional)', type: 'select', options: BANK_ACCOUNT_TYPES, showIf: (v) => v.type === 'bank' },
      { key: 'card_network', label: 'Card network (only if you know it)', type: 'select', options: CARD_NETWORKS, showIf: (v) => v.type === 'bank' || v.type === 'credit_card' },
      { key: 'card_color', label: 'Card colour (optional)', type: 'text', placeholder: '#1E5AA8', hint: 'Hex colour for the card. Leave empty for the bank colour.' },
      notes,
    ],
    validate: (v) =>
      v.upi_id && !/^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,64}$/.test(v.upi_id)
        ? 'UPI ID looks wrong (example: name@okaxis).'
        : v.ifsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v.ifsc)
          ? 'IFSC looks wrong (11 characters, like SBIN0001234).'
          : v.account_number && !/^[0-9A-Za-z -]{4,34}$/.test(v.account_number)
            ? 'Account number looks wrong.'
            : v.card_color && !/^#[0-9A-Fa-f]{6}$/.test(v.card_color)
              ? 'Card colour must look like #1E5AA8.'
              : v.card_last4 && !/^[0-9]{4}$/.test(v.card_last4)
                ? 'Card: enter only the last 4 digits.'
                : [v.statement_day, v.due_day, v.installment_day].some((d) => d != null && (d < 1 || d > 31))
                  ? 'Days must be between 1 and 31.'
                  : null,
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
    table: 'savings_goals', label: 'Goal', plural: 'Goals', titleField: 'name', financial: true,
    fields: [
      { key: 'name', label: 'Goal', type: 'text', required: true, placeholder: 'e.g. Laptop, Insurance, Trip' },
      { key: 'target_paise', label: 'Target (₹)', type: 'money', required: true },
      { key: 'target_date', label: 'Target date', type: 'date' },
      notes,
    ],
  },
  savings_entries: {
    table: 'savings_entries', label: 'Goal Entry', plural: 'Goal Entries', titleField: 'title', financial: true,
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
      { key: 'task_type', label: 'Type', type: 'select', options: TASK_TYPES, listKey: 'task_type', default: () => 'task' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: () => 'medium' },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUS, default: () => 'pending' },
      { key: 'due_date', label: 'Due date', type: 'date', default: todayISO },
      clientRef(),
      { key: 'project_id', label: 'Project', type: 'ref', refTable: 'projects', filterBy: { column: 'client_id', field: 'client_id' } },
      notes,
    ],
  },
  budgets: {
    table: 'budgets', label: 'Budget', plural: 'Budgets', titleField: 'month', financial: false,
    fields: [
      { key: 'amount_paise', label: 'Budget limit (₹)', type: 'money', required: true },
      { key: 'category_id', label: 'Category', type: 'category', categoryKind: 'expense', hint: 'Empty = all categories' },
      { key: 'account_id', label: 'Spent from account', type: 'account', hint: 'Empty = all accounts' },
      { key: 'area', label: 'Area', type: 'select', options: AREAS, hint: 'Empty = all areas' },
      { key: 'month', label: 'Only for month', type: 'text', placeholder: 'YYYY-MM (empty = every month)' },
      { key: 'start_date', label: 'Or custom period: from', type: 'date' },
      { key: 'end_date', label: 'to', type: 'date' },
      notes,
    ],
    validate: (v) =>
      v.month && !/^\d{4}-\d{2}$/.test(v.month)
        ? 'Month must look like 2026-11.'
        : !!v.start_date !== !!v.end_date
          ? 'Give both the start and end date of the period.'
          : v.start_date && v.end_date < v.start_date
            ? 'End date is before the start date.'
            : v.start_date && v.month
              ? 'Use either a month or a custom period, not both.'
              : null,
  },
  recurring_rules: {
    table: 'recurring_rules', label: 'Subscription / recurring', plural: 'Subscriptions & recurring', titleField: 'title', financial: false,
    fields: [
      { key: 'is_subscription', label: 'This is a subscription (Netflix, software, gym…)', type: 'bool', default: () => true },
      { key: 'kind', label: 'Type', type: 'select', options: RECUR_KINDS, required: true, default: () => 'expenses' },
      { key: 'title', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Netflix, Canva Pro, Rent, Arvia retainer' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'money', required: true },
      { key: 'frequency', label: 'Billing cycle', type: 'select', options: FREQUENCIES, required: true, default: () => 'monthly' },
      { key: 'start_date', label: 'Started on (optional)', type: 'date' },
      { key: 'next_date', label: 'Next payment date', type: 'date', required: true, default: todayISO },
      { key: 'account_id', label: 'Paid from / received in', type: 'account', required: true },
      { key: 'payment_app', label: 'App', type: 'select', options: UPI_APPS, listKey: 'payment_app' },
      { key: 'category_id', label: 'Category', type: 'category' },
      { ...clientRef(), label: 'Client (optional)' },
      { key: 'status', label: 'Status', type: 'select', options: SUB_STATUS, required: true, default: () => 'active' },
      { key: 'end_date', label: 'Ends on (optional)', type: 'date', hint: 'After this date it shows as Expired' },
      { key: 'remind_days', label: 'Remind me (days before)', type: 'int', default: () => 1 },
      { key: 'split_group_id', label: 'Share with a split group (optional)', type: 'ref', refTable: 'groups', hint: 'Each payment you log is split equally in that group (paid by you) — e.g. YouTube Premium family plan.' },
      { key: 'payment_mode', label: 'Payment mode', type: 'select', options: PAYMENT_MODES, default: () => 'personal' },
      area,
      notes,
    ],
    validate: (v) =>
      v.remind_days < 0 || v.remind_days > 30
        ? 'Reminder must be 0–30 days before.'
        : v.end_date && v.next_date && v.end_date < v.next_date && v.status === 'active'
          ? 'End date is before the next payment date.'
          : null,
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
  client_contacts: {
    table: 'client_contacts', label: 'Client Staff', plural: 'Client Staff', titleField: 'name', financial: false,
    fields: [
      clientRef(true),
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Sejal' },
      { key: 'role', label: 'Role', type: 'text', placeholder: 'e.g. Accounts, Owner' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
    ],
  },
  custom_options: {
    table: 'custom_options', label: 'List item', plural: 'List items', titleField: 'label', financial: false,
    fields: [
      { key: 'list_key', label: 'List', type: 'text', required: true },
      { key: 'label', label: 'Name', type: 'text', required: true },
      { key: 'value', label: 'Value', type: 'text', required: true },
      { key: 'hidden', label: 'Hidden', type: 'bool', default: () => false },
    ],
  },
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
      { key: 'platform', label: 'Platform', type: 'select', options: PLATFORMS, listKey: 'platform', default: () => 'meta' },
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
  insurance_policies: {
    table: 'insurance_policies', label: 'Insurance policy', plural: 'Insurance', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Policy name', type: 'text', required: true, placeholder: 'e.g. Family health cover' },
      { key: 'policy_type', label: 'Type', type: 'select', options: POLICY_TYPES, default: () => 'health' },
      { key: 'insurer', label: 'Insurance company', type: 'text', placeholder: 'e.g. LIC, Star Health, HDFC Ergo' },
      { key: 'policy_number', label: 'Policy number (optional)', type: 'text', mask: true, copy: true },
      { key: 'insured_person', label: 'Insured person', type: 'text' },
      { key: 'sum_assured_paise', label: 'Cover / sum assured (₹)', type: 'money' },
      { key: 'premium_paise', label: 'Premium (₹)', type: 'money' },
      { key: 'premium_frequency', label: 'Premium paid', type: 'select', options: PREMIUM_FREQ, default: () => 'yearly' },
      { key: 'next_due_date', label: 'Next premium due', type: 'date', hint: 'You get a reminder before this date.' },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'end_date', label: 'Policy end / maturity', type: 'date' },
      { key: 'nominee', label: 'Nominee', type: 'text' },
      { key: 'account_id', label: 'Premium paid from (optional)', type: 'account' },
      { key: 'status', label: 'Status', type: 'select', options: POLICY_STATUS, default: () => 'active' },
      notes,
    ],
  },
  credit_scores: {
    table: 'credit_scores', label: 'Credit score', plural: 'Credit scores', titleField: 'score', financial: false,
    fields: [
      { key: 'score', label: 'Score (300–900)', type: 'int', required: true, placeholder: 'e.g. 760' },
      { key: 'bureau', label: 'Bureau', type: 'select', options: BUREAUS, default: () => 'cibil' },
      { key: 'checked_on', label: 'Checked on', type: 'date', required: true, default: todayISO },
      notes,
    ],
    validate: (v) => (v.score != null && (v.score < 300 || v.score > 900) ? 'Score must be between 300 and 900.' : null),
  },
  medicines: {
    table: 'medicines', label: 'Medicine', plural: 'Medicines', titleField: 'name', financial: false,
    fields: [
      { key: 'name', label: 'Medicine name', type: 'text', required: true, placeholder: 'e.g. Paracetamol' },
      { key: 'dose', label: 'Strength / dose', type: 'text', placeholder: 'e.g. 500 mg, 5 ml' },
      { key: 'form', label: 'Type', type: 'select', options: MED_FORMS, default: () => 'tablet' },
      { key: 'per_dose', label: 'How many each time', type: 'int', default: () => 1, hint: 'Tablets / capsules per dose' },
      { key: 'food', label: 'Food', type: 'select', options: MED_FOOD, default: () => 'after' },
      { key: 'take_morning', label: 'Morning', type: 'bool', default: () => true },
      { key: 'morning_time', label: 'Morning time', type: 'time', default: () => '08:00', showIf: (v) => v.take_morning === true || v.take_morning === 'true' },
      { key: 'take_afternoon', label: 'Afternoon', type: 'bool', default: () => false },
      { key: 'afternoon_time', label: 'Afternoon time', type: 'time', default: () => '14:00', showIf: (v) => v.take_afternoon === true || v.take_afternoon === 'true' },
      { key: 'take_night', label: 'Night', type: 'bool', default: () => false },
      { key: 'night_time', label: 'Night time', type: 'time', default: () => '21:00', showIf: (v) => v.take_night === true || v.take_night === 'true' },
      { key: 'stock_qty', label: 'Tablets in stock (optional)', type: 'int', hint: 'Goes down by itself when you mark a dose as taken.' },
      { key: 'low_stock_days', label: 'Warn me when stock is left for (days)', type: 'int', default: () => 5 },
      { key: 'start_date', label: 'Start date', type: 'date', required: true, default: todayISO },
      { key: 'end_date', label: 'End date (optional)', type: 'date', hint: 'Leave empty for a long-term medicine.' },
      { key: 'for_person', label: 'For (optional)', type: 'text', placeholder: 'e.g. Self, Mummy, Papa' },
      { key: 'reminders', label: 'Remind me at dose times', type: 'bool', default: () => true },
      { key: 'status', label: 'Status', type: 'select', options: MED_STATUS, default: () => 'active' },
      notes,
    ],
    validate: (v) => {
      if (!v.take_morning && !v.take_afternoon && !v.take_night) return 'Pick at least one time: morning, afternoon or night.';
      if (v.per_dose != null && (v.per_dose < 1 || v.per_dose > 50)) return 'How many each time must be 1 to 50.';
      if (v.stock_qty != null && v.stock_qty < 0) return 'Stock cannot be below 0.';
      if (v.low_stock_days != null && (v.low_stock_days < 1 || v.low_stock_days > 60)) return 'Warning days must be 1 to 60.';
      if (v.end_date && v.start_date && v.end_date < v.start_date) return 'End date is before the start date.';
      return null;
    },
  },
  medicine_logs: {
    table: 'medicine_logs', label: 'Dose', plural: 'Doses', titleField: 'slot', financial: false,
    fields: [
      { key: 'medicine_id', label: 'Medicine', type: 'ref', refTable: 'medicines', required: true },
      { key: 'slot', label: 'Time', type: 'select', options: MED_SLOTS, default: () => 'morning' },
      { key: 'status', label: 'Status', type: 'select', options: DOSE_STATUS, default: () => 'taken' },
      { key: 'qty', label: 'How many', type: 'int', default: () => 1 },
      { key: 'taken_on', label: 'Date', type: 'date', required: true, default: todayISO },
      notes,
    ],
  },
  vitals: {
    table: 'vitals', label: 'Vital reading', plural: 'Vitals', titleField: 'kind', financial: false,
    fields: [
      { key: 'kind', label: 'What', type: 'select', options: VITAL_KINDS, default: () => 'bp' },
      { key: 'systolic', label: 'Upper (systolic)', type: 'int', placeholder: 'e.g. 120', showIf: (v) => v.kind === 'bp' },
      { key: 'diastolic', label: 'Lower (diastolic)', type: 'int', placeholder: 'e.g. 80', showIf: (v) => v.kind === 'bp' },
      { key: 'pulse', label: 'Pulse (bpm)', type: 'int', placeholder: 'e.g. 72', showIf: (v) => v.kind === 'bp' || v.kind === 'pulse' },
      { key: 'sugar_mgdl', label: 'Sugar (mg/dL)', type: 'int', placeholder: 'e.g. 95', showIf: (v) => v.kind === 'sugar' },
      { key: 'sugar_timing', label: 'When', type: 'select', options: SUGAR_TIMING, default: () => 'fasting', showIf: (v) => v.kind === 'sugar' },
      { key: 'spo2', label: 'Oxygen SpO2 (%)', type: 'int', placeholder: 'e.g. 98', showIf: (v) => v.kind === 'spo2' },
      { key: 'temperature_f', label: 'Temperature (°F)', type: 'text', placeholder: 'e.g. 98.6', showIf: (v) => v.kind === 'temperature' },
      { key: 'measured_on', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'measured_time', label: 'Time', type: 'time', default: nowTime },
      { key: 'for_person', label: 'For (optional)', type: 'text', placeholder: 'e.g. Self, Papa' },
      notes,
    ],
    validate: (v) => {
      const n = (x: unknown) => x != null && x !== '';
      if (v.kind === 'bp') {
        if (!n(v.systolic) || !n(v.diastolic)) return 'Enter both upper and lower BP numbers.';
        if (v.systolic < 50 || v.systolic > 260 || v.diastolic < 30 || v.diastolic > 180) return 'BP numbers look wrong. Upper 50–260, lower 30–180.';
        if (v.systolic <= v.diastolic) return 'Upper BP must be more than lower BP.';
      }
      if (v.kind === 'sugar' && (!n(v.sugar_mgdl) || v.sugar_mgdl < 20 || v.sugar_mgdl > 700)) return 'Enter sugar between 20 and 700 mg/dL.';
      if ((v.kind === 'pulse' || (v.kind === 'bp' && n(v.pulse))) && (!n(v.pulse) || v.pulse < 25 || v.pulse > 250)) return 'Enter pulse between 25 and 250.';
      if (v.kind === 'spo2' && (!n(v.spo2) || v.spo2 < 50 || v.spo2 > 100)) return 'Enter SpO2 between 50 and 100.';
      if (v.kind === 'temperature') {
        const t = Number(v.temperature_f);
        if (!n(v.temperature_f) || !Number.isFinite(t) || t < 90 || t > 110) return 'Enter temperature in °F, e.g. 98.6 (90–110).';
      }
      return null;
    },
  },
  doctor_appointments: {
    table: 'doctor_appointments', label: 'Appointment', plural: 'Appointments', titleField: 'doctor_name', financial: false,
    fields: [
      { key: 'doctor_name', label: 'Doctor', type: 'text', required: true, placeholder: 'e.g. Dr. Sharma' },
      { key: 'speciality', label: 'Speciality', type: 'text', placeholder: 'e.g. Physician, Dentist, Eye' },
      { key: 'appointment_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'appointment_time', label: 'Time', type: 'time' },
      { key: 'clinic', label: 'Clinic / hospital', type: 'text' },
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text', copy: true },
      { key: 'for_person', label: 'For (optional)', type: 'text', placeholder: 'e.g. Self, Mummy' },
      { key: 'reason', label: 'Reason / problem', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: APPT_STATUS, default: () => 'upcoming' },
      { key: 'reminders', label: 'Remind me (1 day before + 2 hours before)', type: 'bool', default: () => true },
      { key: 'doctor_notes', label: "Doctor's advice / notes", type: 'textarea', placeholder: 'What the doctor said, tests to do, diet…' },
      { key: 'follow_up_date', label: 'Next follow-up date', type: 'date' },
      notes,
    ],
  },
  medical_documents: {
    table: 'medical_documents', label: 'Medical document', plural: 'Medical vault', titleField: 'title', financial: false,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Blood test – CBC' },
      { key: 'doc_type', label: 'Type', type: 'select', options: DOC_TYPES, default: () => 'prescription' },
      { key: 'doc_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'doctor_name', label: 'Doctor / lab', type: 'text' },
      { key: 'for_person', label: 'For (optional)', type: 'text', placeholder: 'e.g. Self, Papa' },
      { key: 'appointment_id', label: 'From appointment (optional)', type: 'ref', refTable: 'doctor_appointments' },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add photos / PDF after saving (Photos section).' },
    ],
  },
  water_logs: {
    table: 'water_logs', label: 'Water', plural: 'Water', titleField: 'ml', financial: false,
    fields: [
      { key: 'ml', label: 'Amount (ml)', type: 'int', required: true, default: () => 250 },
      { key: 'logged_on', label: 'Date', type: 'date', required: true, default: todayISO },
    ],
    validate: (v) => (v.ml != null && (v.ml < 10 || v.ml > 3000) ? 'Enter 10 to 3000 ml.' : null),
  },
  sleep_logs: {
    table: 'sleep_logs', label: 'Sleep', plural: 'Sleep', titleField: 'sleep_date', financial: false,
    fields: [
      { key: 'sleep_date', label: 'Night of', type: 'date', required: true, default: todayISO, hint: 'The date you went to bed.' },
      { key: 'bed_time', label: 'Slept at', type: 'time', required: true, default: () => '23:00' },
      { key: 'wake_time', label: 'Woke up at', type: 'time', required: true, default: () => '07:00' },
      { key: 'quality', label: 'How was it', type: 'select', options: SLEEP_QUALITY, default: () => 'good' },
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
  if (table === 'budgets') return `${row.month ?? 'Monthly'} budget · ${formatINR(row.amount_paise)}`;
  if (table === 'loans') return `${row.direction === 'lent' ? 'Lent to' : 'Borrowed from'} ${row.person}`;
  if (table === 'doctor_appointments' && row.appointment_date) return `${row.doctor_name} · ${row.appointment_date}`;
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
