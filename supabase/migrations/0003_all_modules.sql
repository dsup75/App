-- =====================================================================
-- DeepBoost Life — 0003: all remaining modules
-- Run in Supabase → SQL Editor AFTER 0001 and 0002. Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Applies RLS, permanent-ID trigger, edit history and grants to a record table.
create or replace function public.setup_record_table(t text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists "own_select" on public.%I', t);
  execute format('drop policy if exists "own_insert" on public.%I', t);
  execute format('drop policy if exists "own_update" on public.%I', t);
  execute format('drop policy if exists "own_delete_from_bin" on public.%I', t);
  execute format('create policy "own_select" on public.%I for select using (user_id = (select auth.uid()))', t);
  execute format('create policy "own_insert" on public.%I for insert with check (user_id = (select auth.uid()))', t);
  execute format('create policy "own_update" on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  execute format('create policy "own_delete_from_bin" on public.%I for delete using (user_id = (select auth.uid()) and deleted_at is not null)', t);
  execute format('drop trigger if exists trg_before_update on public.%I', t);
  execute format('create trigger trg_before_update before update on public.%I for each row execute function public.record_before_update()', t);
  execute format('drop trigger if exists trg_history on public.%I', t);
  execute format('create trigger trg_history after insert or update on public.%I for each row execute function public.log_edit_history()', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
end $$;

-- Generic "linked record must not be in the Recycle Bin" check.
-- Trigger args: 'column:table', e.g. 'client_id:clients'
create or replace function public.check_parents_active()
returns trigger language plpgsql as $$
declare
  arg text; col text; tbl text; val text; is_deleted boolean;
begin
  if new.deleted_at is not null then return new; end if;
  foreach arg in array tg_argv loop
    col := split_part(arg, ':', 1);
    tbl := split_part(arg, ':', 2);
    val := to_jsonb(new) ->> col;
    if val is null then continue; end if;
    -- On update, only re-check when the link changed or the row is being restored
    if tg_op = 'UPDATE' and (to_jsonb(old) ->> col) is not distinct from val and old.deleted_at is null then
      continue;
    end if;
    execute format('select deleted_at is not null from public.%I where id = $1', tbl) into is_deleted using val::uuid;
    if is_deleted then
      raise exception 'LINKED_DELETED: A linked item (%) is in the Recycle Bin. Restore it first.', replace(tbl, '_', ' ');
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Multiple UPI apps: each account can be a UPI app with its own UPI ID
-- ---------------------------------------------------------------------
alter table public.accounts add column if not exists upi_app text;
alter table public.accounts add column if not exists upi_id text;
alter table public.accounts drop constraint if exists accounts_upi_app_check;
alter table public.accounts add constraint accounts_upi_app_check
  check (upi_app is null or upi_app in ('gpay', 'phonepe', 'paytm', 'bhim', 'amazonpay', 'cred', 'bank_app', 'other'));

alter table public.payment_requests add column if not exists account_id uuid;
alter table public.payment_requests drop constraint if exists payment_requests_account_fk;
alter table public.payment_requests add constraint payment_requests_account_fk
  foreign key (account_id, user_id) references public.accounts (id, user_id);

-- ---------------------------------------------------------------------
-- Clients, projects, campaigns
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  contact_person text,
  phone text,
  email text,
  business_type text,
  status text not null default 'active' check (status in ('lead', 'active', 'paused', 'ended')),
  start_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active' check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  start_date date,
  deadline date,
  budget_paise bigint check (budget_paise is null or budget_paise >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  project_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  platform text not null default 'meta' check (platform in ('meta', 'google', 'youtube', 'linkedin', 'other')),
  objective text,
  status text not null default 'planned' check (status in ('planned', 'active', 'paused', 'completed')),
  budget_paise bigint check (budget_paise is null or budget_paise >= 0),
  start_date date,
  end_date date,
  creative_requirements text,
  ad_copy text,
  results text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id)
);

-- Client tasks reuse the tasks table
alter table public.tasks add column if not exists client_id uuid;
alter table public.tasks add column if not exists project_id uuid;
alter table public.tasks add column if not exists task_type text not null default 'task';
alter table public.tasks drop constraint if exists tasks_task_type_check;
alter table public.tasks add constraint tasks_task_type_check
  check (task_type in ('task', 'follow_up', 'approval', 'creative', 'meeting'));
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('pending', 'in_progress', 'waiting', 'completed', 'cancelled'));
alter table public.tasks drop constraint if exists tasks_client_fk;
alter table public.tasks add constraint tasks_client_fk foreign key (client_id, user_id) references public.clients (id, user_id);
alter table public.tasks drop constraint if exists tasks_project_fk;
alter table public.tasks add constraint tasks_project_fk foreign key (project_id, user_id) references public.projects (id, user_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_id_user_key') then
    alter table public.tasks add constraint tasks_id_user_key unique (id, user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Invoices (payments are incomes linked by invoice_id → never double counted)
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  invoice_no text not null,
  title text not null default 'Services',
  period text,
  issue_date date not null default current_date,
  due_date date,
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'sent' check (status in ('draft', 'sent', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id)
);

alter table public.incomes add column if not exists invoice_id uuid;
alter table public.incomes add column if not exists client_id uuid;
alter table public.incomes drop constraint if exists incomes_invoice_fk;
alter table public.incomes add constraint incomes_invoice_fk foreign key (invoice_id, user_id) references public.invoices (id, user_id);
alter table public.incomes drop constraint if exists incomes_client_fk;
alter table public.incomes add constraint incomes_client_fk foreign key (client_id, user_id) references public.clients (id, user_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incomes_id_user_key') then
    alter table public.incomes add constraint incomes_id_user_key unique (id, user_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_id_user_key') then
    alter table public.expenses add constraint expenses_id_user_key unique (id, user_id);
  end if;
end $$;
alter table public.expenses add column if not exists client_id uuid;
alter table public.expenses drop constraint if exists expenses_client_fk;
alter table public.expenses add constraint expenses_client_fk foreign key (client_id, user_id) references public.clients (id, user_id);

-- ---------------------------------------------------------------------
-- Allocations: which income funded which expense (no new income/expense)
-- ---------------------------------------------------------------------
create table if not exists public.allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  income_id uuid not null,
  expense_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (income_id, user_id) references public.incomes (id, user_id),
  foreign key (expense_id, user_id) references public.expenses (id, user_id)
);

create or replace function public.check_allocation()
returns trigger language plpgsql as $$
declare inc bigint; exp bigint; used_inc bigint; used_exp bigint;
begin
  if new.deleted_at is not null then return new; end if;
  select amount_paise into inc from public.incomes where id = new.income_id;
  select amount_paise into exp from public.expenses where id = new.expense_id;
  select coalesce(sum(amount_paise), 0) into used_inc from public.allocations
   where income_id = new.income_id and deleted_at is null and id <> new.id;
  select coalesce(sum(amount_paise), 0) into used_exp from public.allocations
   where expense_id = new.expense_id and deleted_at is null and id <> new.id;
  if used_inc + new.amount_paise > inc then
    raise exception 'APP_ERROR: Too much allocated. Only ₹% of this income is still unallocated.', ((inc - used_inc) / 100.0)::numeric(14, 2);
  end if;
  if used_exp + new.amount_paise > exp then
    raise exception 'APP_ERROR: Too much allocated. Only ₹% of this expense is still unfunded.', ((exp - used_exp) / 100.0)::numeric(14, 2);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Udhaar / loans
-- ---------------------------------------------------------------------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction text not null check (direction in ('lent', 'borrowed')),
  person text not null check (char_length(person) between 1 and 120),
  principal_paise bigint not null check (principal_paise > 0),
  account_id uuid not null,
  start_date date not null default current_date,
  due_date date,
  interest_type text not null default 'none' check (interest_type in ('none', 'simple')),
  interest_rate_bp integer not null default 0 check (interest_rate_bp >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id)
);

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id uuid not null,
  title text not null default 'Repayment',
  principal_paise bigint not null default 0 check (principal_paise >= 0),
  interest_paise bigint not null default 0 check (interest_paise >= 0),
  account_id uuid not null,
  txn_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (principal_paise + interest_paise > 0),
  unique (id, user_id),
  foreign key (loan_id, user_id) references public.loans (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id)
);

-- ---------------------------------------------------------------------
-- Savings goals (contributions/withdrawals are earmarks, not income)
-- ---------------------------------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  target_paise bigint not null check (target_paise > 0),
  target_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null,
  title text not null default 'Contribution',
  amount_paise bigint not null check (amount_paise <> 0),
  txn_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id)
);

-- ---------------------------------------------------------------------
-- Groups & splitting (friends don't need accounts)
-- ---------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'personal' check (kind in ('personal', 'business')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  is_me boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (group_id, user_id) references public.groups (id, user_id)
);

-- payers / shares: [{"member_id": "...", "amount_paise": 123}]
create table if not exists public.group_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  amount_paise bigint not null check (amount_paise > 0),
  txn_date date not null default current_date,
  split_type text not null default 'equal' check (split_type in ('equal', 'custom', 'percent', 'itemwise')),
  payers jsonb not null default '[]',
  shares jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (group_id, user_id) references public.groups (id, user_id)
);

create or replace function public.check_group_expense()
returns trigger language plpgsql as $$
declare paid bigint; owed bigint; bad int;
begin
  select coalesce(sum((e ->> 'amount_paise')::bigint), 0) into paid from jsonb_array_elements(new.payers) e;
  select coalesce(sum((e ->> 'amount_paise')::bigint), 0) into owed from jsonb_array_elements(new.shares) e;
  if paid <> new.amount_paise then
    raise exception 'APP_ERROR: Amounts paid (₹%) must add up to the total (₹%).', (paid / 100.0)::numeric(14, 2), (new.amount_paise / 100.0)::numeric(14, 2);
  end if;
  if owed <> new.amount_paise then
    raise exception 'APP_ERROR: Shares (₹%) must add up to the total (₹%).', (owed / 100.0)::numeric(14, 2), (new.amount_paise / 100.0)::numeric(14, 2);
  end if;
  select count(*) into bad from (
    select e ->> 'member_id' as m from jsonb_array_elements(new.payers) e
    union all select e ->> 'member_id' from jsonb_array_elements(new.shares) e
  ) x where not exists (
    select 1 from public.group_members gm where gm.id::text = x.m and gm.group_id = new.group_id and gm.user_id = new.user_id
  );
  if bad > 0 then
    raise exception 'APP_ERROR: Every payer and share must be a member of this group.';
  end if;
  return new;
end $$;

create table if not exists public.group_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null,
  title text not null default 'Settlement',
  from_member_id uuid not null,
  to_member_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  txn_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_member_id <> to_member_id),
  unique (id, user_id),
  foreign key (group_id, user_id) references public.groups (id, user_id),
  foreign key (from_member_id, user_id) references public.group_members (id, user_id),
  foreign key (to_member_id, user_id) references public.group_members (id, user_id)
);

-- ---------------------------------------------------------------------
-- Daily life
-- ---------------------------------------------------------------------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slot text not null default 'anytime' check (slot in ('morning', 'evening', 'anytime')),
  area text not null default 'personal' check (area in ('personal', 'study', 'business')),
  target_per_week integer not null default 7 check (target_per_week between 1 and 7),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- Check-ins: simple rows, toggled on/off (no recycle bin needed)
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null,
  log_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
alter table public.habit_logs enable row level security;
drop policy if exists "own_all" on public.habit_logs;
create policy "own_all" on public.habit_logs for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.habit_logs to authenticated;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  event_date date not null default current_date,
  start_time time,
  end_time time,
  area text not null default 'personal' check (area in ('personal', 'study', 'business')),
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text,
  area text not null default 'personal' check (area in ('personal', 'study', 'business')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Study
-- ---------------------------------------------------------------------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  exam text not null default 'both' check (exam in ('jee', 'board', 'both', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  class_level text not null default '12' check (class_level in ('11', '12', 'other')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  revision_count integer not null default 0 check (revision_count >= 0),
  is_weak boolean not null default false,
  is_backlog boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Study session',
  subject_id uuid,
  chapter_id uuid,
  minutes integer not null check (minutes between 1 and 1440),
  session_date date not null default current_date,
  kind text not null default 'manual' check (kind in ('pomodoro', 'manual')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id),
  foreign key (chapter_id, user_id) references public.chapters (id, user_id)
);

create table if not exists public.mock_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  exam text not null default 'jee' check (exam in ('jee', 'board', 'other')),
  subject_id uuid,
  test_date date not null default current_date,
  total_marks integer not null check (total_marks > 0),
  marks_per_correct integer not null default 4,
  negative_marks integer not null default 1 check (negative_marks >= 0),
  correct integer not null default 0 check (correct >= 0),
  incorrect integer not null default 0 check (incorrect >= 0),
  unattempted integer not null default 0 check (unattempted >= 0),
  obtained_marks integer,
  weak_chapters text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id)
);

-- obtained = correct*marks - incorrect*negative when not entered manually
create or replace function public.mock_tests_score()
returns trigger language plpgsql as $$
begin
  if new.obtained_marks is null
     or (tg_op = 'UPDATE' and new.obtained_marks is not distinct from old.obtained_marks
         and (new.correct, new.incorrect, new.marks_per_correct, new.negative_marks)
             is distinct from (old.correct, old.incorrect, old.marks_per_correct, old.negative_marks)) then
    new.obtained_marks := new.correct * new.marks_per_correct - new.incorrect * new.negative_marks;
  end if;
  return new;
end $$;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  exam_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Apply RLS / history / grants to every new record table
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'projects', 'campaigns', 'invoices', 'allocations', 'loans', 'loan_repayments',
    'savings_goals', 'savings_entries', 'groups', 'group_members', 'group_expenses', 'group_settlements',
    'habits', 'events', 'notes', 'shopping_items', 'subjects', 'chapters', 'study_sessions', 'mock_tests', 'exams'
  ] loop
    perform public.setup_record_table(t);
  end loop;
end $$;

-- Table-specific triggers
drop trigger if exists trg_allocation on public.allocations;
create trigger trg_allocation before insert or update on public.allocations
  for each row execute function public.check_allocation();
drop trigger if exists trg_group_expense on public.group_expenses;
create trigger trg_group_expense before insert or update on public.group_expenses
  for each row execute function public.check_group_expense();
drop trigger if exists trg_mock_score on public.mock_tests;
create trigger trg_mock_score before insert or update on public.mock_tests
  for each row execute function public.mock_tests_score();

-- Linked-record checks (replaces the Phase 1 version for money tables)
drop trigger if exists trg_links on public.incomes;
create trigger trg_links before insert or update on public.incomes for each row
  execute function public.check_parents_active('account_id:accounts', 'category_id:categories', 'client_id:clients', 'invoice_id:invoices', 'payment_request_id:payment_requests');
drop trigger if exists trg_links on public.expenses;
create trigger trg_links before insert or update on public.expenses for each row
  execute function public.check_parents_active('account_id:accounts', 'category_id:categories', 'client_id:clients');
drop trigger if exists trg_links on public.transfers;
create trigger trg_links before insert or update on public.transfers for each row
  execute function public.check_parents_active('from_account_id:accounts', 'to_account_id:accounts');
drop trigger if exists trg_links on public.tasks;
create trigger trg_links before insert or update on public.tasks for each row
  execute function public.check_parents_active('client_id:clients', 'project_id:projects');
drop trigger if exists trg_links on public.payment_requests;
create trigger trg_links before insert or update on public.payment_requests for each row
  execute function public.check_parents_active('account_id:accounts');
drop trigger if exists trg_links on public.projects;
create trigger trg_links before insert or update on public.projects for each row
  execute function public.check_parents_active('client_id:clients');
drop trigger if exists trg_links on public.campaigns;
create trigger trg_links before insert or update on public.campaigns for each row
  execute function public.check_parents_active('client_id:clients', 'project_id:projects');
drop trigger if exists trg_links on public.invoices;
create trigger trg_links before insert or update on public.invoices for each row
  execute function public.check_parents_active('client_id:clients');
drop trigger if exists trg_links on public.allocations;
create trigger trg_links before insert or update on public.allocations for each row
  execute function public.check_parents_active('income_id:incomes', 'expense_id:expenses');
drop trigger if exists trg_links on public.loans;
create trigger trg_links before insert or update on public.loans for each row
  execute function public.check_parents_active('account_id:accounts');
drop trigger if exists trg_links on public.loan_repayments;
create trigger trg_links before insert or update on public.loan_repayments for each row
  execute function public.check_parents_active('loan_id:loans', 'account_id:accounts');
drop trigger if exists trg_links on public.savings_entries;
create trigger trg_links before insert or update on public.savings_entries for each row
  execute function public.check_parents_active('goal_id:savings_goals');
drop trigger if exists trg_links on public.group_members;
create trigger trg_links before insert or update on public.group_members for each row
  execute function public.check_parents_active('group_id:groups');
drop trigger if exists trg_links on public.group_expenses;
create trigger trg_links before insert or update on public.group_expenses for each row
  execute function public.check_parents_active('group_id:groups');
drop trigger if exists trg_links on public.group_settlements;
create trigger trg_links before insert or update on public.group_settlements for each row
  execute function public.check_parents_active('group_id:groups', 'from_member_id:group_members', 'to_member_id:group_members');
drop trigger if exists trg_links on public.chapters;
create trigger trg_links before insert or update on public.chapters for each row
  execute function public.check_parents_active('subject_id:subjects');
drop trigger if exists trg_links on public.study_sessions;
create trigger trg_links before insert or update on public.study_sessions for each row
  execute function public.check_parents_active('subject_id:subjects', 'chapter_id:chapters');
drop trigger if exists trg_links on public.mock_tests;
create trigger trg_links before insert or update on public.mock_tests for each row
  execute function public.check_parents_active('subject_id:subjects');

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------

-- Account balance = opening + income − expense ± transfers
--   − money lent + money borrowed ± loan repayments (principal + interest)
drop view if exists public.account_balances;
create view public.account_balances with (security_invoker = true) as
select
  a.id, a.user_id, a.name, a.type, a.upi_app, a.upi_id, a.opening_balance_paise,
  (a.opening_balance_paise
    + coalesce((select sum(i.amount_paise) from public.incomes i where i.account_id = a.id and i.deleted_at is null), 0)
    - coalesce((select sum(e.amount_paise) from public.expenses e where e.account_id = a.id and e.deleted_at is null), 0)
    - coalesce((select sum(t.amount_paise) from public.transfers t where t.from_account_id = a.id and t.deleted_at is null), 0)
    + coalesce((select sum(t.amount_paise) from public.transfers t where t.to_account_id = a.id and t.deleted_at is null), 0)
    - coalesce((select sum(l.principal_paise) from public.loans l where l.account_id = a.id and l.direction = 'lent' and l.deleted_at is null), 0)
    + coalesce((select sum(l.principal_paise) from public.loans l where l.account_id = a.id and l.direction = 'borrowed' and l.deleted_at is null), 0)
    + coalesce((select sum(r.principal_paise + r.interest_paise) from public.loan_repayments r join public.loans l on l.id = r.loan_id
                where r.account_id = a.id and r.deleted_at is null and l.deleted_at is null and l.direction = 'lent'), 0)
    - coalesce((select sum(r.principal_paise + r.interest_paise) from public.loan_repayments r join public.loans l on l.id = r.loan_id
                where r.account_id = a.id and r.deleted_at is null and l.deleted_at is null and l.direction = 'borrowed'), 0)
  )::bigint as balance_paise
from public.accounts a
where a.deleted_at is null;

create or replace view public.invoice_totals with (security_invoker = true) as
select v.id, v.user_id,
  coalesce((select sum(i.amount_paise) from public.incomes i where i.invoice_id = v.id and i.deleted_at is null), 0)::bigint as received_paise,
  (select count(*) from public.incomes i where i.invoice_id = v.id and i.deleted_at is null)::int as payment_count
from public.invoices v;

create or replace view public.loan_totals with (security_invoker = true) as
select l.id, l.user_id,
  coalesce((select sum(r.principal_paise) from public.loan_repayments r where r.loan_id = l.id and r.deleted_at is null), 0)::bigint as principal_repaid_paise,
  coalesce((select sum(r.interest_paise) from public.loan_repayments r where r.loan_id = l.id and r.deleted_at is null), 0)::bigint as interest_paid_paise
from public.loans l;

create or replace view public.savings_totals with (security_invoker = true) as
select g.id, g.user_id,
  coalesce((select sum(s.amount_paise) from public.savings_entries s where s.goal_id = g.id and s.deleted_at is null), 0)::bigint as saved_paise
from public.savings_goals g;

create or replace view public.recycle_bin with (security_invoker = true) as
          select 'accounts'::text as table_name, id, user_id, name as title, null::bigint as amount_paise, deleted_at from public.accounts where deleted_at is not null
union all select 'categories', id, user_id, name, null, deleted_at from public.categories where deleted_at is not null
union all select 'incomes', id, user_id, title, amount_paise, deleted_at from public.incomes where deleted_at is not null
union all select 'expenses', id, user_id, title, amount_paise, deleted_at from public.expenses where deleted_at is not null
union all select 'transfers', id, user_id, title, amount_paise, deleted_at from public.transfers where deleted_at is not null
union all select 'tasks', id, user_id, title, null, deleted_at from public.tasks where deleted_at is not null
union all select 'payment_requests', id, user_id, title, amount_paise, deleted_at from public.payment_requests where deleted_at is not null
union all select 'clients', id, user_id, name, null, deleted_at from public.clients where deleted_at is not null
union all select 'projects', id, user_id, name, budget_paise, deleted_at from public.projects where deleted_at is not null
union all select 'campaigns', id, user_id, name, budget_paise, deleted_at from public.campaigns where deleted_at is not null
union all select 'invoices', id, user_id, invoice_no || ' · ' || title, amount_paise, deleted_at from public.invoices where deleted_at is not null
union all select 'allocations', id, user_id, 'Allocation', amount_paise, deleted_at from public.allocations where deleted_at is not null
union all select 'loans', id, user_id, person, principal_paise, deleted_at from public.loans where deleted_at is not null
union all select 'loan_repayments', id, user_id, title, principal_paise + interest_paise, deleted_at from public.loan_repayments where deleted_at is not null
union all select 'savings_goals', id, user_id, name, target_paise, deleted_at from public.savings_goals where deleted_at is not null
union all select 'savings_entries', id, user_id, title, amount_paise, deleted_at from public.savings_entries where deleted_at is not null
union all select 'groups', id, user_id, name, null, deleted_at from public.groups where deleted_at is not null
union all select 'group_members', id, user_id, name, null, deleted_at from public.group_members where deleted_at is not null
union all select 'group_expenses', id, user_id, title, amount_paise, deleted_at from public.group_expenses where deleted_at is not null
union all select 'group_settlements', id, user_id, title, amount_paise, deleted_at from public.group_settlements where deleted_at is not null
union all select 'habits', id, user_id, name, null, deleted_at from public.habits where deleted_at is not null
union all select 'events', id, user_id, title, null, deleted_at from public.events where deleted_at is not null
union all select 'notes', id, user_id, title, null, deleted_at from public.notes where deleted_at is not null
union all select 'shopping_items', id, user_id, name, null, deleted_at from public.shopping_items where deleted_at is not null
union all select 'subjects', id, user_id, name, null, deleted_at from public.subjects where deleted_at is not null
union all select 'chapters', id, user_id, name, null, deleted_at from public.chapters where deleted_at is not null
union all select 'study_sessions', id, user_id, title, null, deleted_at from public.study_sessions where deleted_at is not null
union all select 'mock_tests', id, user_id, name, null, deleted_at from public.mock_tests where deleted_at is not null
union all select 'exams', id, user_id, name, null, deleted_at from public.exams where deleted_at is not null;

grant select on public.account_balances, public.invoice_totals, public.loan_totals, public.savings_totals, public.recycle_bin to authenticated;
revoke all on public.account_balances, public.invoice_totals, public.loan_totals, public.savings_totals, public.recycle_bin from anon;

-- ---------------------------------------------------------------------
-- Defaults: study subjects for every user (new and existing)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;

  insert into public.accounts (user_id, name, type) values
    (new.id, 'Cash', 'cash'), (new.id, 'Bank', 'bank'), (new.id, 'UPI', 'upi');

  insert into public.categories (user_id, name, kind) values
    (new.id, 'Salary', 'income'), (new.id, 'Freelance', 'income'),
    (new.id, 'Client Payment', 'income'), (new.id, 'Business', 'income'),
    (new.id, 'Other Income', 'income'),
    (new.id, 'Food', 'expense'), (new.id, 'Travel', 'expense'),
    (new.id, 'Shopping', 'expense'), (new.id, 'Education', 'expense'),
    (new.id, 'Subscriptions', 'expense'), (new.id, 'Business', 'expense'),
    (new.id, 'Personal', 'expense'), (new.id, 'Other', 'expense');

  insert into public.subjects (user_id, name, exam) values
    (new.id, 'Physics', 'both'), (new.id, 'Chemistry', 'both'), (new.id, 'Mathematics', 'both');
  return new;
end $$;

insert into public.subjects (user_id, name, exam)
select u.id, s.name, 'both'
from auth.users u
cross join (values ('Physics'), ('Chemistry'), ('Mathematics')) as s(name)
where not exists (select 1 from public.subjects x where x.user_id = u.id);

-- ---------------------------------------------------------------------
-- Business details printed on invoices
-- ---------------------------------------------------------------------
alter table public.user_settings add column if not exists business_name text;
alter table public.user_settings add column if not exists business_details text;
