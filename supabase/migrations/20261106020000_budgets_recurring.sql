-- =====================================================================
-- DeepBoost Life — Monthly budgets + recurring entries
-- =====================================================================

-- ---------- Budgets: limit per category (or total spending) ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid,                         -- null = all spending
  month text check (month is null or month ~ '^[0-9]{4}-[0-9]{2}$'),  -- null = every month
  area text check (area is null or area in ('personal', 'study', 'business')),
  amount_paise bigint not null check (amount_paise > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);
select public.setup_record_table('budgets');
drop trigger if exists trg_links on public.budgets;
create trigger trg_links before insert or update on public.budgets for each row
  execute function public.check_parents_active('category_id:categories');

-- ---------- Recurring entries: rent, salary, subscriptions, retainers ----------
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'expenses' check (kind in ('incomes', 'expenses')),
  title text not null check (char_length(title) between 1 and 120),
  amount_paise bigint not null check (amount_paise > 0),
  account_id uuid not null,
  category_id uuid,
  client_id uuid,
  payment_app text,
  payment_mode text not null default 'personal' check (payment_mode in ('personal', 'business')),
  area text not null default 'personal' check (area in ('personal', 'study', 'business')),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'yearly')),
  next_date date not null default current_date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id)
);
select public.setup_record_table('recurring_rules');
drop trigger if exists trg_links on public.recurring_rules;
create trigger trg_links before insert or update on public.recurring_rules for each row
  execute function public.check_parents_active('account_id:accounts', 'category_id:categories', 'client_id:clients');

-- ---------- Recycle bin ----------
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
union all select 'custom_options', id, user_id, label, null, deleted_at from public.custom_options where deleted_at is not null
union all select 'budgets', id, user_id, coalesce(month, 'Every month') || ' budget', amount_paise, deleted_at from public.budgets where deleted_at is not null
union all select 'recurring_rules', id, user_id, title, amount_paise, deleted_at from public.recurring_rules where deleted_at is not null;
grant select on public.recycle_bin to authenticated;
revoke all on public.recycle_bin from anon;
