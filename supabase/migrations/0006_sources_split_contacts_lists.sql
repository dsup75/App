-- =====================================================================
-- DeepBoost Life — 0006
--  * Pay / receive from several accounts in one entry (e.g. part cash + part GPay)
--  * Split an expense with other people; their repayments link back to it
--  * Client staff (contacts) — payer names per client
--  * Custom dropdown lists the user can edit (apps, methods, task types, platforms…)
-- Safe to run twice.
-- =====================================================================

-- ---------- Multiple payment sources ----------
-- sources: [{"account_id": "...", "amount_paise": 123, "payment_app": "gpay"}]
alter table public.incomes add column if not exists sources jsonb not null default '[]';
alter table public.expenses add column if not exists sources jsonb not null default '[]';

create or replace function public.check_sources()
returns trigger language plpgsql set search_path = public as $$
declare total bigint; bad int; first_acc uuid;
begin
  if jsonb_typeof(new.sources) <> 'array' then
    raise exception 'APP_ERROR: Invalid payment split.';
  end if;
  if jsonb_array_length(new.sources) = 0 then
    return new;
  end if;
  select coalesce(sum((s ->> 'amount_paise')::bigint), 0) into total from jsonb_array_elements(new.sources) s;
  if total <> new.amount_paise then
    raise exception 'APP_ERROR: Account amounts (₹%) must add up to the total (₹%).',
      (total / 100.0)::numeric(14, 2), (new.amount_paise / 100.0)::numeric(14, 2);
  end if;
  select count(*) into bad from jsonb_array_elements(new.sources) s
   where (s ->> 'amount_paise')::bigint <= 0
      or not exists (select 1 from public.accounts a
                      where a.id::text = s ->> 'account_id' and a.user_id = new.user_id and a.deleted_at is null);
  if bad > 0 then
    raise exception 'APP_ERROR: Each account in the split needs a valid account and an amount above zero.';
  end if;
  select (s ->> 'account_id')::uuid into first_acc from jsonb_array_elements(new.sources) s limit 1;
  new.account_id := first_acc;  -- main account = first source (for lists)
  return new;
end $$;

drop trigger if exists trg_sources on public.incomes;
create trigger trg_sources before insert or update on public.incomes for each row execute function public.check_sources();
drop trigger if exists trg_sources on public.expenses;
create trigger trg_sources before insert or update on public.expenses for each row execute function public.check_sources();

-- ---------- Split an expense with people ----------
-- split_with: [{"name": "Rahul", "amount_paise": 500}]  (their share; your share = amount − sum)
alter table public.expenses add column if not exists split_with jsonb not null default '[]';
alter table public.incomes add column if not exists split_expense_id uuid;
alter table public.incomes drop constraint if exists incomes_split_expense_fk;
alter table public.incomes add constraint incomes_split_expense_fk
  foreign key (split_expense_id, user_id) references public.expenses (id, user_id);

create or replace function public.check_split_with()
returns trigger language plpgsql set search_path = public as $$
declare others bigint; bad int;
begin
  if jsonb_typeof(new.split_with) <> 'array' or jsonb_array_length(new.split_with) = 0 then
    return new;
  end if;
  select coalesce(sum((s ->> 'amount_paise')::bigint), 0) into others from jsonb_array_elements(new.split_with) s;
  select count(*) into bad from jsonb_array_elements(new.split_with) s
   where coalesce(trim(s ->> 'name'), '') = '' or (s ->> 'amount_paise')::bigint <= 0;
  if bad > 0 then
    raise exception 'APP_ERROR: Each person in the split needs a name and an amount.';
  end if;
  if others > new.amount_paise then
    raise exception 'APP_ERROR: Others'' shares (₹%) are more than the expense (₹%).',
      (others / 100.0)::numeric(14, 2), (new.amount_paise / 100.0)::numeric(14, 2);
  end if;
  return new;
end $$;
drop trigger if exists trg_split_with on public.expenses;
create trigger trg_split_with before insert or update on public.expenses for each row execute function public.check_split_with();

-- ---------- Client staff / contacts ----------
create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id)
);
select public.setup_record_table('client_contacts');
drop trigger if exists trg_links on public.client_contacts;
create trigger trg_links before insert or update on public.client_contacts for each row
  execute function public.check_parents_active('client_id:clients');

-- ---------- Editable dropdown lists ----------
create table if not exists public.custom_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_key text not null check (list_key in ('payment_app', 'payment_method', 'task_type', 'platform', 'business_type', 'objective')),
  value text not null check (char_length(value) between 1 and 60),
  label text not null check (char_length(label) between 1 and 60),
  hidden boolean not null default false,   -- hide a built-in choice
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create unique index if not exists custom_options_unique on public.custom_options (user_id, list_key, value) where deleted_at is null;
select public.setup_record_table('custom_options');

-- Custom values must be allowed in these columns (the app validates choices)
alter table public.incomes drop constraint if exists incomes_payment_app_check;
alter table public.expenses drop constraint if exists expenses_payment_app_check;
alter table public.incomes drop constraint if exists incomes_payment_method_check;
alter table public.expenses drop constraint if exists expenses_payment_method_check;
alter table public.accounts drop constraint if exists accounts_upi_app_check;
alter table public.tasks drop constraint if exists tasks_task_type_check;
alter table public.campaigns drop constraint if exists campaigns_platform_check;

-- ---------- Balances: use per-account sources when present ----------
drop view if exists public.account_balances;
create view public.account_balances with (security_invoker = true) as
with
  inc as (
    select i.account_id as acc, i.amount_paise as amt from public.incomes i
     where i.deleted_at is null and jsonb_array_length(i.sources) = 0
    union all
    select (s ->> 'account_id')::uuid, (s ->> 'amount_paise')::bigint
      from public.incomes i, jsonb_array_elements(i.sources) s
     where i.deleted_at is null and jsonb_array_length(i.sources) > 0
  ),
  exp as (
    select e.account_id as acc, e.amount_paise as amt from public.expenses e
     where e.deleted_at is null and jsonb_array_length(e.sources) = 0
    union all
    select (s ->> 'account_id')::uuid, (s ->> 'amount_paise')::bigint
      from public.expenses e, jsonb_array_elements(e.sources) s
     where e.deleted_at is null and jsonb_array_length(e.sources) > 0
  )
select
  a.id, a.user_id, a.name, a.type, a.upi_app, a.upi_id, a.opening_balance_paise,
  (a.opening_balance_paise
    + coalesce((select sum(amt) from inc where inc.acc = a.id), 0)
    - coalesce((select sum(amt) from exp where exp.acc = a.id), 0)
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
grant select on public.account_balances to authenticated;
revoke all on public.account_balances from anon;

-- ---------- Recycle bin includes the new tables ----------
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
union all select 'exams', id, user_id, name, null, deleted_at from public.exams where deleted_at is not null
union all select 'client_contacts', id, user_id, name, null, deleted_at from public.client_contacts where deleted_at is not null
union all select 'custom_options', id, user_id, label, null, deleted_at from public.custom_options where deleted_at is not null;
grant select on public.recycle_bin to authenticated;
revoke all on public.recycle_bin from anon;
