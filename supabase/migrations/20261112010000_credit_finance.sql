-- ADDITIVE ONLY. Credit & finance: credit cards, pay later, bank/app loans with EMI, investments,
-- insurance policies and credit score history.
--
-- How money stays correct: cards, pay later and loans are accounts whose balance goes below zero
-- (minus = what you owe). Spending on a card = an expense from the card account. Paying the card bill
-- = a transfer bank -> card. A loan's money arriving = transfer loan -> bank. An EMI = transfer
-- bank -> loan (principal) + an expense (interest). Investments are accounts too: money put in =
-- transfer bank -> investment; today's market value is kept separately.
-- Nothing existing is changed or removed; "Total balance" now counts only spendable money
-- (cash, bank, UPI, wallet) and card/loan dues are shown on their own.

-- ---------- 1. Account types + details ----------
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('cash', 'bank', 'upi', 'wallet', 'custom', 'credit_card', 'pay_later', 'loan', 'investment'));

alter table public.accounts drop constraint if exists accounts_card_network_check;
alter table public.accounts add constraint accounts_card_network_check
  check (card_network is null or card_network in ('rupay', 'visa', 'mastercard', 'amex', 'diners'));

alter table public.accounts add column if not exists card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
alter table public.accounts add column if not exists credit_limit_paise bigint check (credit_limit_paise is null or credit_limit_paise >= 0);
alter table public.accounts add column if not exists statement_day smallint check (statement_day is null or statement_day between 1 and 31);
alter table public.accounts add column if not exists due_day smallint check (due_day is null or due_day between 1 and 31);
alter table public.accounts add column if not exists interest_rate_bp integer check (interest_rate_bp is null or interest_rate_bp between 0 and 100000);
alter table public.accounts add column if not exists lender text check (lender is null or char_length(lender) <= 80);
alter table public.accounts add column if not exists loan_kind text check (loan_kind is null or loan_kind in
  ('home', 'personal', 'car', 'two_wheeler', 'education', 'gold', 'business', 'consumer', 'card_emi', 'mobile', 'other'));
alter table public.accounts add column if not exists principal_paise bigint check (principal_paise is null or principal_paise >= 0);
alter table public.accounts add column if not exists tenure_months integer check (tenure_months is null or tenure_months between 1 and 600);
alter table public.accounts add column if not exists installment_paise bigint check (installment_paise is null or installment_paise >= 0);
alter table public.accounts add column if not exists installment_day smallint check (installment_day is null or installment_day between 1 and 31);
alter table public.accounts add column if not exists plan_start_date date;
alter table public.accounts add column if not exists maturity_date date;
alter table public.accounts add column if not exists investment_kind text check (investment_kind is null or investment_kind in
  ('fd', 'rd', 'sip', 'mutual_fund', 'stocks', 'gold', 'ppf', 'nps', 'epf', 'bonds', 'crypto', 'other'));
alter table public.accounts add column if not exists market_value_paise bigint check (market_value_paise is null or market_value_paise >= 0);
alter table public.accounts add column if not exists market_value_at date;
alter table public.accounts add column if not exists autopay_account_id uuid;
do $$ begin
  alter table public.accounts add constraint accounts_autopay_fk foreign key (autopay_account_id, user_id) references public.accounts (id, user_id);
exception when duplicate_object then null; end $$;

-- ---------- 2. Insurance policies ----------
create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  policy_type text not null default 'health' check (policy_type in ('life', 'term', 'health', 'vehicle', 'home', 'travel', 'accident', 'other')),
  insurer text check (insurer is null or char_length(insurer) <= 80),
  policy_number text check (policy_number is null or char_length(policy_number) <= 40),
  sum_assured_paise bigint check (sum_assured_paise is null or sum_assured_paise >= 0),
  premium_paise bigint check (premium_paise is null or premium_paise >= 0),
  premium_frequency text not null default 'yearly' check (premium_frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly', 'single')),
  next_due_date date,
  start_date date,
  end_date date,
  insured_person text check (insured_person is null or char_length(insured_person) <= 80),
  nominee text check (nominee is null or char_length(nominee) <= 80),
  account_id uuid,
  status text not null default 'active' check (status in ('active', 'lapsed', 'matured', 'closed')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id)
);
create index if not exists insurance_user_due on public.insurance_policies (user_id, next_due_date) where deleted_at is null;
select public.setup_record_table('insurance_policies');
revoke all on public.insurance_policies from anon;

-- ---------- 3. Credit score history ----------
create table if not exists public.credit_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score integer not null check (score between 300 and 900),
  bureau text not null default 'cibil' check (bureau in ('cibil', 'experian', 'equifax', 'crif', 'other')),
  checked_on date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists credit_scores_user_day on public.credit_scores (user_id, checked_on desc) where deleted_at is null;
select public.setup_record_table('credit_scores');
revoke all on public.credit_scores from anon;

-- ---------- 4. Pay an EMI in one step ----------
-- principal -> transfer from your account to the loan (what you owe goes down)
-- interest  -> an expense from your account (money gone)
create or replace function public.pay_loan_emi(p_loan uuid, p_from uuid, p_date date, p_principal bigint, p_interest bigint, p_note text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_loan record;
  v_cat uuid;
  v_transfer uuid;
  v_expense uuid;
begin
  select id, name, type into v_loan from public.accounts where id = p_loan and deleted_at is null;
  if v_loan.id is null or v_loan.type not in ('loan', 'credit_card', 'pay_later') then
    raise exception 'APP_ERROR: Choose the loan or card this EMI is for.';
  end if;
  if p_from is null or p_from = p_loan then raise exception 'APP_ERROR: Choose the account you paid from.'; end if;
  if coalesce(p_principal, 0) < 0 or coalesce(p_interest, 0) < 0 or coalesce(p_principal, 0) + coalesce(p_interest, 0) = 0 then
    raise exception 'APP_ERROR: Enter the EMI amount.';
  end if;
  if coalesce(p_principal, 0) > 0 then
    v_transfer := public.save_money_entry('transfers', null,
      jsonb_build_object('title', left('EMI — ' || v_loan.name, 120), 'notes', nullif(p_note, '')),
      jsonb_build_array(
        jsonb_build_object('direction', 'out', 'account_id', p_from, 'amount_paise', p_principal, 'txn_date', coalesce(p_date, current_date)),
        jsonb_build_object('direction', 'in', 'account_id', p_loan, 'amount_paise', p_principal, 'txn_date', coalesce(p_date, current_date))),
      null);
  end if;
  if coalesce(p_interest, 0) > 0 then
    select id into v_cat from public.categories where deleted_at is null and kind = 'expense' and lower(name) = 'interest & charges' limit 1;
    if v_cat is null then
      insert into public.categories (name, kind) values ('Interest & charges', 'expense') returning id into v_cat;
    end if;
    v_expense := public.save_money_entry('expenses', null,
      jsonb_build_object('title', left('EMI interest — ' || v_loan.name, 120), 'category_id', v_cat, 'notes', nullif(p_note, '')),
      jsonb_build_array(jsonb_build_object('account_id', p_from, 'amount_paise', p_interest, 'txn_date', coalesce(p_date, current_date))),
      null);
  end if;
  return jsonb_build_object('transfer_id', v_transfer, 'expense_id', v_expense);
end $$;
revoke execute on function public.pay_loan_emi(uuid, uuid, date, bigint, bigint, text) from public, anon;
grant execute on function public.pay_loan_emi(uuid, uuid, date, bigint, bigint, text) to authenticated;

-- ---------- 5. Home: spendable balance + dues ----------
create or replace function public.home_dashboard(p_today date, p_from date, p_to date, p_six_from date, p_week date, p_day_start timestamptz)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'open', coalesce((select jsonb_agg(t order by t.due_date nulls last) from (
        select * from public.tasks where deleted_at is null and status in ('pending', 'in_progress', 'waiting')
           and (due_date <= p_today or due_date is null) order by due_date nulls last limit 200) t), '[]'::jsonb),
    'done_today', coalesce((select jsonb_agg(t) from (
        select * from public.tasks where deleted_at is null and status = 'completed' and completed_at >= p_day_start limit 200) t), '[]'::jsonb),
    'incomes', coalesce((select jsonb_agg(i order by i.txn_date desc) from public.incomes i
        where i.deleted_at is null and i.txn_date between p_from and p_to), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(e order by e.txn_date desc) from public.expenses e
        where e.deleted_at is null and e.txn_date between p_from and p_to), '[]'::jsonb),
    'six', coalesce((select jsonb_agg(jsonb_build_object('amount_paise', amount_paise, 'txn_date', txn_date, 'area', area)) from public.expenses
        where deleted_at is null and txn_date between p_six_from and p_to), '[]'::jsonb),
    'transfers', coalesce((select jsonb_agg(jsonb_build_object('amount_paise', amount_paise)) from public.transfers
        where deleted_at is null and txn_date between p_from and p_to), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(h) from public.habits h where h.deleted_at is null), '[]'::jsonb),
    'habit_logs', coalesce((select jsonb_agg(jsonb_build_object('habit_id', habit_id, 'log_date', log_date)) from public.habit_logs where log_date = p_today), '[]'::jsonb),
    'study_minutes', coalesce((select sum(minutes) from public.study_sessions where deleted_at is null and session_date = p_today), 0),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'amount_paise', i.amount_paise, 'due_date', i.due_date, 'invoice_no', i.invoice_no,
        'client_id', i.client_id, 'received_paise', coalesce(t.received_paise, 0)))
        from public.invoices i left join public.invoice_totals t on t.id = i.id where i.deleted_at is null and i.status = 'sent'), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'amount_paise', amount_paise, 'due_date', due_date, 'title', title))
        from public.payment_requests where deleted_at is null and status = 'pending'), '[]'::jsonb),
    'loans', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('principal_repaid_paise', coalesce(t.principal_repaid_paise, 0)))
        from public.loans l left join public.loan_totals t on t.id = l.id
        where l.deleted_at is null and l.due_date is not null and l.due_date <= p_week), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'event_date', event_date)) from public.events
        where deleted_at is null and event_date between p_today and p_week), '[]'::jsonb),
    'week_tasks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date)) from public.tasks
        where deleted_at is null and status in ('pending', 'in_progress', 'waiting') and due_date > p_today and due_date <= p_week), '[]'::jsonb),
    'follow_ups', (select count(*) from public.tasks where deleted_at is null and client_id is not null
        and status in ('pending', 'in_progress', 'waiting') and task_type in ('follow_up', 'approval')),
    'next_exam', (select to_jsonb(x) from public.exams x where x.deleted_at is null and x.exam_date >= p_today order by x.exam_date limit 1),
    -- spendable money only: credit cards, pay later, loans and investments are shown separately
    'balance', coalesce((select sum(balance_paise) from public.account_balances where type in ('cash', 'bank', 'upi', 'wallet', 'custom')), 0),
    'card_due', coalesce((select sum(-balance_paise) from public.account_balances where type in ('credit_card', 'pay_later') and balance_paise < 0), 0),
    'loan_due', coalesce((select sum(-balance_paise) from public.account_balances where type = 'loan' and balance_paise < 0), 0)
  );
$$;
revoke execute on function public.home_dashboard(date, date, date, date, date, timestamptz) from public, anon;
revoke execute on function public.home_dashboard(date, date, date, date, date, timestamptz) from public, anon;
grant execute on function public.home_dashboard(date, date, date, date, date, timestamptz) to authenticated;

-- ---------- 6. Backup import knows the new tables ----------
create or replace function public.import_backup_rows(p_table text, p_rows jsonb)
returns integer language plpgsql set search_path to 'public' as $$
declare v_cols text; v_n integer;
begin
  if not (p_table = any (array[
    'accounts','categories','custom_options','clients','client_contacts','projects','campaigns','subjects','chapters','exams',
    'habits','habit_logs','tasks','events','notes','shopping_items','savings_goals','savings_entries','groups','group_members',
    'group_expenses','group_settlements','invoices','payment_requests','incomes','expenses','transfers','loans','loan_repayments',
    'payment_lines','allocations','money_links','budgets','recurring_rules','study_sessions','mock_tests','reconciliations',
    'reconciliation_adjustments','entry_reversals','checklist_items',
    'focus_sessions','revision_settings','revisions','gadgets','health_profile','body_measurements','activity_daily','screen_time_daily',
    'custom_icons','entity_icons','timer_sessions','insurance_policies','credit_scores'])) then
    raise exception 'APP_ERROR: "%" can''t be imported.', p_table;
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'APP_ERROR: Backup data for "%" is not a list.', p_table; end if;
  if jsonb_array_length(p_rows) = 0 then return 0; end if;
  perform set_config('app.money_rpc', 'on', true);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER' and column_name <> 'user_id';
  execute format('insert into public.%I (user_id, %s) select auth.uid(), %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                 p_table, v_cols, v_cols, p_table) using p_rows;
  get diagnostics v_n = row_count;
  perform set_config('app.money_rpc', 'off', true);
  return v_n;
end $$;
revoke execute on function public.import_backup_rows(text, jsonb) from public, anon;
grant execute on function public.import_backup_rows(text, jsonb) to authenticated;
