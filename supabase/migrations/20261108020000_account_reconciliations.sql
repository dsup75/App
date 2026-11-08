-- Account reconciliation history. Entries are snapshots only: they never
-- post adjustments, write payment_lines, or change account_balances.
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  actual_balance_paise bigint not null,
  calculated_balance_paise bigint not null,
  difference_paise bigint not null,
  explanation text,
  status text not null default 'reviewed' check (status in ('reviewed', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  check (difference_paise = actual_balance_paise - calculated_balance_paise)
);
select public.setup_record_table('reconciliations');
create index if not exists reconciliations_account_created
  on public.reconciliations (user_id, account_id, created_at desc)
  where deleted_at is null;
