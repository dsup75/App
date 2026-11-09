-- ADDITIVE ONLY. Reconciliation lives in its own ledger. account_balances / account_movements are NOT touched,
-- so every existing balance and report stays exactly as it was.

create or replace function public.account_balance_as_of(p_account_id uuid, p_as_of date default current_date)
returns bigint language sql stable set search_path to 'public' as $$
  select (a.opening_balance_paise + coalesce((
            select sum(m.signed_paise) from public.account_movements m
             where m.account_id = a.id and m.user_id = a.user_id
               and (a.opening_date is null or m.txn_date >= a.opening_date)
               and m.txn_date <= p_as_of), 0))::bigint
    from public.accounts a
   where a.id = p_account_id and a.user_id = auth.uid() and a.deleted_at is null;
$$;

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  account_id uuid not null,
  as_of_date date not null default current_date,
  actual_balance_paise bigint not null,
  app_balance_paise bigint not null,
  difference_paise bigint generated always as (actual_balance_paise - app_balance_paise) stored,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reconciliations_id_user_id_key unique (id, user_id),
  constraint reconciliations_account_fk foreign key (account_id, user_id) references public.accounts (id, user_id)
);
create index reconciliations_account_idx on public.reconciliations (user_id, account_id, as_of_date desc) where deleted_at is null;

create table public.reconciliation_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  reconciliation_id uuid not null,
  -- signed: positive explains actual > app (money the app is missing); negative explains actual < app
  amount_paise bigint not null check (amount_paise <> 0),
  kind text not null default 'other' check (kind in ('missing_income','missing_expense','bank_fee','interest','rounding','cash_difference','other')),
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reconciliation_adjustments_id_user_id_key unique (id, user_id),
  constraint reconciliation_adjustments_rec_fk foreign key (reconciliation_id, user_id) references public.reconciliations (id, user_id)
);
create index reconciliation_adjustments_rec_idx on public.reconciliation_adjustments (user_id, reconciliation_id) where deleted_at is null;

select public.setup_record_table('reconciliations');
select public.setup_record_table('reconciliation_adjustments');
revoke all on public.reconciliations, public.reconciliation_adjustments from anon;

create or replace function public.create_reconciliation(
  p_account_id uuid, p_actual_paise bigint, p_as_of date default current_date, p_notes text default null)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_app bigint; v_id uuid;
begin
  v_app := public.account_balance_as_of(p_account_id, p_as_of);
  if v_app is null then
    raise exception 'APP_ERROR: Account not found.';
  end if;
  insert into public.reconciliations (account_id, as_of_date, actual_balance_paise, app_balance_paise, notes)
  values (p_account_id, p_as_of, p_actual_paise, v_app, p_notes)
  returning id into v_id;
  return v_id;
end $$;

create or replace view public.reconciliation_summary with (security_invoker = true) as
select r.id, r.user_id, r.account_id, r.as_of_date,
       r.actual_balance_paise, r.app_balance_paise, r.difference_paise,
       coalesce(adj.total, 0)::bigint as adjustments_paise,
       (r.difference_paise - coalesce(adj.total, 0))::bigint as unexplained_paise,
       (r.app_balance_paise + coalesce(adj.total, 0))::bigint as reconciled_balance_paise,
       public.account_balance_as_of(r.account_id, r.as_of_date) as app_balance_now_paise,
       (public.account_balance_as_of(r.account_id, r.as_of_date) - r.app_balance_paise)::bigint as app_drift_paise,
       case when r.difference_paise - coalesce(adj.total, 0) = 0 then 'balanced' else 'unexplained' end as status,
       r.notes, r.created_at
  from public.reconciliations r
  left join lateral (
    select sum(a.amount_paise) as total from public.reconciliation_adjustments a
     where a.reconciliation_id = r.id and a.deleted_at is null
  ) adj on true
 where r.deleted_at is null;

grant select on public.reconciliation_summary to authenticated;
grant execute on function public.account_balance_as_of(uuid, date), public.create_reconciliation(uuid, bigint, date, text) to authenticated;
