-- =====================================================================
-- DeepBoost Life — Phase 1 database
-- Run ONCE in Supabase → SQL Editor → New query → paste → Run.
-- Covers: settings, accounts, categories, incomes, expenses, transfers,
-- tasks, edit history, soft delete / recycle bin, balances, RLS.
-- Money is stored as integer paise (bigint). Never floats.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------

-- Keeps id / owner / created_at permanent and bumps updated_at.
create or replace function public.record_before_update()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Edit history (written only by trigger, read by owner)
-- ---------------------------------------------------------------------
create table if not exists public.edit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  reason text,
  changed_at timestamptz not null default now()
);
create index if not exists edit_history_lookup
  on public.edit_history (user_id, table_name, record_id, changed_at desc);

alter table public.edit_history enable row level security;
drop policy if exists "history_select_own" on public.edit_history;
create policy "history_select_own" on public.edit_history
  for select using (user_id = (select auth.uid()));

create or replace function public.log_edit_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb;
  n jsonb := to_jsonb(new);
  k text;
begin
  if tg_op = 'INSERT' then
    insert into public.edit_history (user_id, table_name, record_id, field, old_value, new_value, changed_by)
    values (new.user_id, tg_table_name, new.id, '__created', null, null, coalesce(auth.uid(), new.user_id));
    return new;
  end if;

  o := to_jsonb(old);
  for k in select jsonb_object_keys(n) loop
    if k in ('id', 'user_id', 'created_at', 'updated_at') then
      continue;
    end if;
    if (o -> k) is distinct from (n -> k) then
      insert into public.edit_history (user_id, table_name, record_id, field, old_value, new_value, changed_by)
      values (new.user_id, tg_table_name, new.id, k, o -> k, n -> k, coalesce(auth.uid(), new.user_id));
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- User settings (one row per user; also holds display name)
-- ---------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  currency text not null default 'INR',
  apps_script_url text,
  sync_key text,
  sheet_verified_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apps_script_url_format check (
    apps_script_url is null or apps_script_url ~ '^https://script\.google\.com/'
  )
);
alter table public.user_settings enable row level security;
drop policy if exists "settings_select_own" on public.user_settings;
drop policy if exists "settings_insert_own" on public.user_settings;
drop policy if exists "settings_update_own" on public.user_settings;
create policy "settings_select_own" on public.user_settings for select using (user_id = (select auth.uid()));
create policy "settings_insert_own" on public.user_settings for insert with check (user_id = (select auth.uid()));
create policy "settings_update_own" on public.user_settings for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists trg_settings_touch on public.user_settings;
create trigger trg_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null default 'cash' check (type in ('cash', 'bank', 'upi', 'wallet', 'custom')),
  opening_balance_paise bigint not null default 0,
  currency text not null default 'INR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Incomes
-- ---------------------------------------------------------------------
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  amount_paise bigint not null check (amount_paise > 0),
  account_id uuid not null,
  category_id uuid,
  area text not null default 'personal' check (area in ('personal', 'study', 'business')),
  txn_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);
create index if not exists incomes_user_date on public.incomes (user_id, txn_date desc);
create index if not exists incomes_account on public.incomes (account_id);

-- ---------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  amount_paise bigint not null check (amount_paise > 0),
  account_id uuid not null,
  category_id uuid,
  area text not null default 'personal' check (area in ('personal', 'study', 'business')),
  txn_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);
create index if not exists expenses_user_date on public.expenses (user_id, txn_date desc);
create index if not exists expenses_account on public.expenses (account_id);

-- ---------------------------------------------------------------------
-- Transfers (never count as income or expense)
-- ---------------------------------------------------------------------
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Transfer',
  amount_paise bigint not null check (amount_paise > 0),
  from_account_id uuid not null,
  to_account_id uuid not null,
  txn_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_account_id <> to_account_id),
  foreign key (from_account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id)
);
create index if not exists transfers_user_date on public.transfers (user_id, txn_date desc);

-- ---------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  notes text,
  area text not null default 'personal' check (area in ('personal', 'study', 'business')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists tasks_user_due on public.tasks (user_id, due_date);

create or replace function public.tasks_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_completed on public.tasks;
create trigger trg_tasks_completed before insert or update on public.tasks
  for each row execute function public.tasks_completed_at();

-- ---------------------------------------------------------------------
-- Linked-record validation: no new/restored money entry may point to an
-- account or category that is sitting in the Recycle Bin.
-- ---------------------------------------------------------------------
create or replace function public.check_links_active()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_table_name = 'transfers' then
    if exists (select 1 from public.accounts a
               where a.id in (new.from_account_id, new.to_account_id) and a.deleted_at is not null) then
      raise exception 'LINKED_DELETED: An account used by this transfer is in the Recycle Bin. Restore it first.';
    end if;
  else
    if exists (select 1 from public.accounts a where a.id = new.account_id and a.deleted_at is not null) then
      raise exception 'LINKED_DELETED: The account used by this entry is in the Recycle Bin. Restore it first.';
    end if;
    if new.category_id is not null and exists (
         select 1 from public.categories c where c.id = new.category_id and c.deleted_at is not null) then
      raise exception 'LINKED_DELETED: The category used by this entry is in the Recycle Bin. Restore it first.';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['incomes', 'expenses', 'transfers'] loop
    execute format('drop trigger if exists trg_links on public.%I', t);
    execute format('create trigger trg_links before insert or update on public.%I
                    for each row execute function public.check_links_active()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS + permanent IDs + edit history for every record table
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'incomes', 'expenses', 'transfers', 'tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete_from_bin" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select using (user_id = (select auth.uid()))', t);
    execute format('create policy "own_insert" on public.%I for insert with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own_update" on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    -- Permanent delete only allowed for records already in the Recycle Bin
    execute format('create policy "own_delete_from_bin" on public.%I for delete using (user_id = (select auth.uid()) and deleted_at is not null)', t);
    execute format('drop trigger if exists trg_before_update on public.%I', t);
    execute format('create trigger trg_before_update before update on public.%I for each row execute function public.record_before_update()', t);
    execute format('drop trigger if exists trg_history on public.%I', t);
    execute format('create trigger trg_history after insert or update on public.%I for each row execute function public.log_edit_history()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Views (security_invoker = RLS of the caller applies)
-- ---------------------------------------------------------------------
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.opening_balance_paise,
  (a.opening_balance_paise
    + coalesce((select sum(i.amount_paise) from public.incomes i
                where i.account_id = a.id and i.deleted_at is null), 0)
    - coalesce((select sum(e.amount_paise) from public.expenses e
                where e.account_id = a.id and e.deleted_at is null), 0)
    - coalesce((select sum(t.amount_paise) from public.transfers t
                where t.from_account_id = a.id and t.deleted_at is null), 0)
    + coalesce((select sum(t.amount_paise) from public.transfers t
                where t.to_account_id = a.id and t.deleted_at is null), 0)
  )::bigint as balance_paise
from public.accounts a
where a.deleted_at is null;

create or replace view public.recycle_bin with (security_invoker = true) as
          select 'accounts'::text   as table_name, id, user_id, name  as title, null::bigint as amount_paise, deleted_at from public.accounts   where deleted_at is not null
union all select 'categories'::text,                id, user_id, name,           null::bigint,                deleted_at from public.categories where deleted_at is not null
union all select 'incomes'::text,                   id, user_id, title,          amount_paise,                deleted_at from public.incomes    where deleted_at is not null
union all select 'expenses'::text,                  id, user_id, title,          amount_paise,                deleted_at from public.expenses   where deleted_at is not null
union all select 'transfers'::text,                 id, user_id, title,          amount_paise,                deleted_at from public.transfers  where deleted_at is not null
union all select 'tasks'::text,                     id, user_id, title,          null::bigint,                deleted_at from public.tasks      where deleted_at is not null;

-- Explicit API grants (RLS above still decides which rows each user can touch)
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.accounts, public.categories, public.incomes, public.expenses, public.transfers, public.tasks
  to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select on public.edit_history to authenticated;
revoke insert, update, delete on public.edit_history from authenticated, anon;
grant select on public.account_balances, public.recycle_bin to authenticated;
revoke all on public.account_balances, public.recycle_bin from anon;

-- ---------------------------------------------------------------------
-- New user → settings, default accounts and categories
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
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Done. Phase 2+ will add new migration files (0002_..., 0003_...).
