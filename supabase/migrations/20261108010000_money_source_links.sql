-- Additive money-source lineage foundation.
-- This table records relationships only. It does not create payment_lines,
-- allocations, or account movements and therefore cannot change balances.

create table if not exists public.money_source_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_table text not null check (
    source_table in ('incomes', 'expenses', 'transfers', 'loans', 'loan_repayments')
  ),
  source_id uuid not null,
  target_table text not null check (
    target_table in ('incomes', 'expenses', 'transfers', 'loans', 'loan_repayments')
  ),
  target_id uuid not null,
  relation_type text not null default 'derived_from'
    check (relation_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  amount_paise bigint not null check (amount_paise > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check (source_table <> target_table or source_id <> target_id)
);

-- Keep the same user-owned row security, history, timestamps and grants
-- convention used by the app's existing record tables.
select public.setup_record_table('money_source_links');

create index if not exists money_source_links_source_idx
  on public.money_source_links (user_id, source_table, source_id)
  where deleted_at is null;

create index if not exists money_source_links_target_idx
  on public.money_source_links (user_id, target_table, target_id)
  where deleted_at is null;

create unique index if not exists money_source_links_active_unique
  on public.money_source_links
    (user_id, source_table, source_id, target_table, target_id, relation_type)
  where deleted_at is null;

-- Polymorphic source/target IDs cannot use ordinary foreign keys. Validate
-- both endpoints against the allowed existing money tables and the same
-- owner, without changing any parent record or its payment lines.
create or replace function public.validate_money_source_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source_user uuid;
  v_target_user uuid;
  v_source_active boolean;
  v_target_active boolean;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.source_table not in ('incomes', 'expenses', 'transfers', 'loans', 'loan_repayments')
     or new.target_table not in ('incomes', 'expenses', 'transfers', 'loans', 'loan_repayments') then
    raise exception 'APP_ERROR: Unsupported money record type.';
  end if;

  if new.source_table = new.target_table and new.source_id = new.target_id then
    raise exception 'APP_ERROR: A money record cannot link to itself.';
  end if;

  execute format(
    'select user_id, deleted_at is null from public.%I where id = $1',
    new.source_table
  ) into v_source_user, v_source_active using new.source_id;

  if v_source_user is distinct from new.user_id or v_source_active is distinct from true then
    raise exception 'APP_ERROR: The source money record is unavailable.';
  end if;

  execute format(
    'select user_id, deleted_at is null from public.%I where id = $1',
    new.target_table
  ) into v_target_user, v_target_active using new.target_id;

  if v_target_user is distinct from new.user_id or v_target_active is distinct from true then
    raise exception 'APP_ERROR: The target money record is unavailable.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_money_source_link on public.money_source_links;
create trigger trg_validate_money_source_link
  before insert or update on public.money_source_links
  for each row execute function public.validate_money_source_link();

-- No changes to account_movements, account_balances, allocations,
-- save_money_entry(), or existing transaction forms are made here.
