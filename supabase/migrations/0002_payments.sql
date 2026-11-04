-- =====================================================================
-- DeepBoost Life — 0002: who paid, payment method, UPI payment requests
-- Run in Supabase → SQL Editor AFTER 0001. Safe to run twice.
-- =====================================================================

-- ---------- Who paid / how (on incomes) ----------
alter table public.incomes add column if not exists client_name text;
alter table public.incomes add column if not exists payer_type text;
alter table public.incomes add column if not exists payer_name text;
alter table public.incomes add column if not exists payment_method text;
alter table public.incomes add column if not exists reference text;
alter table public.incomes add column if not exists payment_request_id uuid;

alter table public.incomes drop constraint if exists incomes_payer_type_check;
alter table public.incomes add constraint incomes_payer_type_check
  check (payer_type is null or payer_type in ('client', 'client_staff', 'other'));
alter table public.incomes drop constraint if exists incomes_payment_method_check;
alter table public.incomes add constraint incomes_payment_method_check
  check (payment_method is null or payment_method in ('upi', 'bank', 'cash', 'payment_link', 'card', 'cheque', 'other'));

-- ---------- UPI details for payment requests ----------
alter table public.user_settings add column if not exists upi_id text;
alter table public.user_settings add column if not exists upi_name text;

-- ---------- Payment requests ----------
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  client_name text,
  amount_paise bigint not null check (amount_paise > 0),
  due_date date,
  note text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists payment_requests_user on public.payment_requests (user_id, status, due_date);

alter table public.incomes drop constraint if exists incomes_payment_request_fk;
alter table public.incomes add constraint incomes_payment_request_fk
  foreign key (payment_request_id, user_id) references public.payment_requests (id, user_id);

alter table public.payment_requests enable row level security;
drop policy if exists "own_select" on public.payment_requests;
drop policy if exists "own_insert" on public.payment_requests;
drop policy if exists "own_update" on public.payment_requests;
drop policy if exists "own_delete_from_bin" on public.payment_requests;
create policy "own_select" on public.payment_requests for select using (user_id = (select auth.uid()));
create policy "own_insert" on public.payment_requests for insert with check (user_id = (select auth.uid()));
create policy "own_update" on public.payment_requests for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own_delete_from_bin" on public.payment_requests for delete
  using (user_id = (select auth.uid()) and deleted_at is not null);

drop trigger if exists trg_before_update on public.payment_requests;
create trigger trg_before_update before update on public.payment_requests
  for each row execute function public.record_before_update();
drop trigger if exists trg_history on public.payment_requests;
create trigger trg_history after insert or update on public.payment_requests
  for each row execute function public.log_edit_history();

grant select, insert, update, delete on public.payment_requests to authenticated;

-- paid_at follows status
create or replace function public.payment_requests_paid_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' then
    if tg_op = 'INSERT' or old.status is distinct from 'paid' then new.paid_at := coalesce(new.paid_at, now()); end if;
  else
    new.paid_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_paid_at on public.payment_requests;
create trigger trg_paid_at before insert or update on public.payment_requests
  for each row execute function public.payment_requests_paid_at();

-- A request is "paid" while an active income is linked to it; back to "pending"
-- if that income is deleted (cancelled requests are left alone).
create or replace function public.sync_request_status()
returns trigger language plpgsql as $$
declare rid uuid;
begin
  foreach rid in array array[
    case when tg_op <> 'INSERT' then old.payment_request_id end,
    new.payment_request_id
  ] loop
    if rid is null then continue; end if;
    update public.payment_requests r
       set status = case when exists (
             select 1 from public.incomes i where i.payment_request_id = rid and i.deleted_at is null
           ) then 'paid' else 'pending' end
     where r.id = rid and r.status <> 'cancelled'
       and r.status is distinct from (case when exists (
             select 1 from public.incomes i where i.payment_request_id = rid and i.deleted_at is null
           ) then 'paid' else 'pending' end);
  end loop;
  return new;
end $$;
drop trigger if exists trg_request_status on public.incomes;
create trigger trg_request_status after insert or update on public.incomes
  for each row execute function public.sync_request_status();

-- ---------- Recycle bin view now includes requests ----------
create or replace view public.recycle_bin with (security_invoker = true) as
          select 'accounts'::text   as table_name, id, user_id, name  as title, null::bigint as amount_paise, deleted_at from public.accounts   where deleted_at is not null
union all select 'categories'::text,                id, user_id, name,           null::bigint,                deleted_at from public.categories where deleted_at is not null
union all select 'incomes'::text,                   id, user_id, title,          amount_paise,                deleted_at from public.incomes    where deleted_at is not null
union all select 'expenses'::text,                  id, user_id, title,          amount_paise,                deleted_at from public.expenses   where deleted_at is not null
union all select 'transfers'::text,                 id, user_id, title,          amount_paise,                deleted_at from public.transfers  where deleted_at is not null
union all select 'tasks'::text,                     id, user_id, title,          null::bigint,                deleted_at from public.tasks      where deleted_at is not null
union all select 'payment_requests'::text,          id, user_id, title,          amount_paise,                deleted_at from public.payment_requests where deleted_at is not null;

grant select on public.recycle_bin to authenticated;
revoke all on public.recycle_bin from anon;
