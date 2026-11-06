-- =====================================================================
-- DeepBoost Life — Payment breakdown for every money entry
--  * payment_lines: each part of a payment (account, app, amount, date,
--    time, UTR, paid by / to, note) for incomes, expenses, udhaar, udhaar
--    repayments and transfers
--  * balances are computed from lines
--  * existing data is copied into lines and balances are checked to be
--    exactly the same as before (otherwise the whole migration is undone)
--  * income can be linked to expenses, udhaar given and transfers
--  * save_money_entry(): saves an entry + its lines + income links in one go
-- =====================================================================

-- ---------- 0. Remember balances before changing anything ----------
drop table if exists _old_balances;
create temp table _old_balances as
  select id, balance_paise from public.account_balances;

-- ---------- 1. Table ----------
create table if not exists public.payment_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_table text not null check (parent_table in ('incomes', 'expenses', 'loans', 'loan_repayments', 'transfers')),
  parent_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  account_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  payment_app text,
  payment_method text,
  txn_date date not null default current_date,
  txn_time time,
  reference text,
  party_name text,
  notes text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id)
);
create index if not exists payment_lines_parent on public.payment_lines (parent_table, parent_id);
create index if not exists payment_lines_account on public.payment_lines (account_id, txn_date);
select public.setup_record_table('payment_lines');
drop trigger if exists trg_links on public.payment_lines;
create trigger trg_links before insert or update on public.payment_lines for each row
  execute function public.check_parents_active('account_id:accounts');

-- How many payment parts an entry has (for lists)
do $$
declare t text;
begin
  foreach t in array array['incomes', 'expenses', 'loans', 'loan_repayments', 'transfers'] loop
    execute format('alter table public.%I add column if not exists line_count integer not null default 1', t);
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transfers_id_user_key') then
    alter table public.transfers add constraint transfers_id_user_key unique (id, user_id);
  end if;
end $$;

-- ---------- 2. Copy existing entries into lines (once) ----------
alter table public.payment_lines disable trigger trg_history;
alter table public.payment_lines disable trigger trg_links;

do $$
begin
  if exists (select 1 from public.payment_lines) then
    return; -- already backfilled
  end if;

  -- incomes / expenses (with or without the old "sources" split)
  insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, payment_app, payment_method,
                                    txn_date, txn_time, reference, party_name, sort)
  select i.user_id, 'incomes', i.id, 'in', i.account_id, i.amount_paise, i.payment_app, i.payment_method,
         i.txn_date, i.txn_time, i.reference, i.payer_name, 0
    from public.incomes i where jsonb_array_length(i.sources) = 0
  union all
  select i.user_id, 'incomes', i.id, 'in', (s.v ->> 'account_id')::uuid, (s.v ->> 'amount_paise')::bigint,
         coalesce(s.v ->> 'payment_app', i.payment_app), i.payment_method, i.txn_date, i.txn_time, i.reference, i.payer_name, s.n::int
    from public.incomes i, jsonb_array_elements(i.sources) with ordinality s(v, n) where jsonb_array_length(i.sources) > 0
  union all
  select e.user_id, 'expenses', e.id, 'out', e.account_id, e.amount_paise, e.payment_app, e.payment_method,
         e.txn_date, e.txn_time, e.reference, null, 0
    from public.expenses e where jsonb_array_length(e.sources) = 0
  union all
  select e.user_id, 'expenses', e.id, 'out', (s.v ->> 'account_id')::uuid, (s.v ->> 'amount_paise')::bigint,
         coalesce(s.v ->> 'payment_app', e.payment_app), e.payment_method, e.txn_date, e.txn_time, e.reference, null, s.n::int
    from public.expenses e, jsonb_array_elements(e.sources) with ordinality s(v, n) where jsonb_array_length(e.sources) > 0;

  -- udhaar: lent = money out, borrowed = money in
  insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, txn_date, party_name)
  select l.user_id, 'loans', l.id, case when l.direction = 'lent' then 'out' else 'in' end, l.account_id, l.principal_paise, l.start_date, l.person
    from public.loans l;

  -- repayments: on a "lent" loan money comes in, on "borrowed" it goes out
  insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, txn_date, party_name)
  select r.user_id, 'loan_repayments', r.id, case when l.direction = 'lent' then 'in' else 'out' end, r.account_id,
         r.principal_paise + r.interest_paise, r.txn_date, l.person
    from public.loan_repayments r join public.loans l on l.id = r.loan_id;

  -- transfers: one line out of the source, one line into the destination
  insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, txn_date, txn_time, sort)
  select t.user_id, 'transfers', t.id, 'out', t.from_account_id, t.amount_paise, t.txn_date, t.txn_time, 0 from public.transfers t
  union all
  select t.user_id, 'transfers', t.id, 'in', t.to_account_id, t.amount_paise, t.txn_date, t.txn_time, 1 from public.transfers t;

  update public.incomes set line_count = greatest(1, jsonb_array_length(sources));
  update public.expenses set line_count = greatest(1, jsonb_array_length(sources));
end $$;

alter table public.payment_lines enable trigger trg_history;
alter table public.payment_lines enable trigger trg_links;

-- ---------- 3. Is the entry a line belongs to active? ----------
create or replace function public.money_parent_active(p_table text, p_id uuid)
returns boolean language sql stable set search_path = public as $$
  select case p_table
    when 'incomes' then exists (select 1 from public.incomes x where x.id = p_id and x.deleted_at is null)
    when 'expenses' then exists (select 1 from public.expenses x where x.id = p_id and x.deleted_at is null)
    when 'transfers' then exists (select 1 from public.transfers x where x.id = p_id and x.deleted_at is null)
    when 'loans' then exists (select 1 from public.loans x where x.id = p_id and x.deleted_at is null)
    when 'loan_repayments' then exists (select 1 from public.loan_repayments x join public.loans l on l.id = x.loan_id
                                         where x.id = p_id and x.deleted_at is null and l.deleted_at is null)
    else false end;
$$;

create or replace function public.money_parent_title(p_table text, p_id uuid)
returns text language sql stable set search_path = public as $$
  select case p_table
    when 'incomes' then (select title from public.incomes where id = p_id)
    when 'expenses' then (select title from public.expenses where id = p_id)
    when 'transfers' then (select title from public.transfers where id = p_id)
    when 'loans' then (select case when direction = 'lent' then 'Udhaar given to ' else 'Udhaar from ' end || person from public.loans where id = p_id)
    when 'loan_repayments' then (select r.title || ' · ' || l.person from public.loan_repayments r join public.loans l on l.id = r.loan_id where r.id = p_id)
  end;
$$;

-- ---------- 4. Views ----------
create or replace view public.account_movements with (security_invoker = true) as
select pl.id, pl.user_id, pl.account_id, pl.parent_table, pl.parent_id, pl.direction,
       pl.amount_paise, case when pl.direction = 'in' then pl.amount_paise else -pl.amount_paise end as signed_paise,
       pl.payment_app, pl.payment_method, pl.txn_date, pl.txn_time, pl.reference, pl.party_name, pl.notes,
       public.money_parent_title(pl.parent_table, pl.parent_id) as title, pl.created_at
  from public.payment_lines pl
 where pl.deleted_at is null and public.money_parent_active(pl.parent_table, pl.parent_id);

drop view if exists public.account_balances;
create view public.account_balances with (security_invoker = true) as
select a.id, a.user_id, a.name, a.type, a.upi_app, a.upi_id, a.opening_balance_paise,
       (a.opening_balance_paise + coalesce((select sum(m.signed_paise) from public.account_movements m where m.account_id = a.id), 0))::bigint as balance_paise
  from public.accounts a
 where a.deleted_at is null;

grant select on public.account_movements, public.account_balances to authenticated;
revoke all on public.account_movements, public.account_balances from anon;

-- ---------- 5. Check: balances must be exactly the same as before ----------
do $$
declare bad text;
begin
  select string_agg(o.id::text || ' ' || o.balance_paise || '→' || coalesce(n.balance_paise::text, 'missing'), ', ')
    into bad
    from _old_balances o left join public.account_balances n on n.id = o.id
   where n.balance_paise is distinct from o.balance_paise;
  if bad is not null then
    raise exception 'Balance check failed, nothing changed: %', bad;
  end if;
end $$;
drop table if exists _old_balances;

-- ---------- 6. Income can fund expenses, udhaar given and transfers ----------
alter table public.allocations alter column expense_id drop not null;
alter table public.allocations add column if not exists loan_id uuid;
alter table public.allocations add column if not exists transfer_id uuid;
alter table public.allocations drop constraint if exists allocations_loan_fk;
alter table public.allocations add constraint allocations_loan_fk foreign key (loan_id, user_id) references public.loans (id, user_id);
alter table public.allocations drop constraint if exists allocations_transfer_fk;
alter table public.allocations add constraint allocations_transfer_fk foreign key (transfer_id, user_id) references public.transfers (id, user_id);
alter table public.allocations drop constraint if exists allocations_one_target;
alter table public.allocations add constraint allocations_one_target check (num_nonnulls(expense_id, loan_id, transfer_id) = 1);

create or replace function public.check_allocation()
returns trigger language plpgsql set search_path = public as $$
declare inc bigint; target bigint; used_inc bigint; used_target bigint;
begin
  if new.deleted_at is not null then return new; end if;
  select amount_paise into inc from public.incomes where id = new.income_id;
  if new.expense_id is not null then
    select amount_paise into target from public.expenses where id = new.expense_id;
    select coalesce(sum(amount_paise), 0) into used_target from public.allocations
     where expense_id = new.expense_id and deleted_at is null and id <> new.id;
  elsif new.loan_id is not null then
    select principal_paise into target from public.loans where id = new.loan_id;
    select coalesce(sum(amount_paise), 0) into used_target from public.allocations
     where loan_id = new.loan_id and deleted_at is null and id <> new.id;
  else
    select amount_paise into target from public.transfers where id = new.transfer_id;
    select coalesce(sum(amount_paise), 0) into used_target from public.allocations
     where transfer_id = new.transfer_id and deleted_at is null and id <> new.id;
  end if;
  select coalesce(sum(amount_paise), 0) into used_inc from public.allocations
   where income_id = new.income_id and deleted_at is null and id <> new.id;
  if used_inc + new.amount_paise > inc then
    raise exception 'APP_ERROR: Too much taken from one income. Only ₹% of it is left.', ((inc - used_inc) / 100.0)::numeric(14, 2);
  end if;
  if used_target + new.amount_paise > target then
    raise exception 'APP_ERROR: Linked income (₹%) is more than this entry.', ((used_target + new.amount_paise) / 100.0)::numeric(14, 2);
  end if;
  return new;
end $$;

drop trigger if exists trg_links on public.allocations;
create trigger trg_links before insert or update on public.allocations for each row
  execute function public.check_parents_active('income_id:incomes', 'expense_id:expenses', 'loan_id:loans', 'transfer_id:transfers');

create or replace view public.income_usage with (security_invoker = true) as
select i.id, i.user_id, i.amount_paise,
  coalesce(u.spent + u.lent + u.moved, 0)::bigint as used_paise,
  (i.amount_paise - coalesce(u.spent + u.lent + u.moved, 0))::bigint as left_paise,
  coalesce(u.spent, 0)::bigint as spent_paise,
  coalesce(u.lent, 0)::bigint as lent_paise,
  coalesce(u.moved, 0)::bigint as moved_paise
from public.incomes i
left join lateral (
  select coalesce(sum(a.amount_paise) filter (where a.expense_id is not null), 0) as spent,
         coalesce(sum(a.amount_paise) filter (where a.loan_id is not null), 0) as lent,
         coalesce(sum(a.amount_paise) filter (where a.transfer_id is not null), 0) as moved
    from public.allocations a where a.income_id = i.id and a.deleted_at is null
) u on true
where i.deleted_at is null;

create or replace view public.expense_funding with (security_invoker = true) as
select e.id, e.user_id, e.amount_paise,
  coalesce((select sum(a.amount_paise) from public.allocations a where a.expense_id = e.id and a.deleted_at is null), 0)::bigint as funded_paise
from public.expenses e
where e.deleted_at is null;

grant select on public.income_usage, public.expense_funding to authenticated;
revoke all on public.income_usage, public.expense_funding from anon;

-- ---------- 7. Save an entry with its lines and income links ----------
-- p_lines: [{id?, direction?, account_id, amount_paise, payment_app, payment_method, txn_date, txn_time, reference, party_name, notes}]
-- p_links: null = leave links unchanged; otherwise [{id?, income_id, amount_paise}]
create or replace function public.save_money_entry(p_table text, p_id uuid, p_parent jsonb, p_lines jsonb, p_links jsonb default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid := p_id;
  v_parent jsonb := coalesce(p_parent, '{}'::jsonb);
  v_dir text;
  v_total bigint;
  v_in bigint;
  v_out bigint;
  v_first jsonb;
  v_first_in jsonb;
  v_first_out jsonb;
  v_cols text;
  v_count int;
  v_loan_dir text;
  v_interest bigint;
  v_line jsonb;
  v_keep uuid[] := '{}';
  v_target_col text;
  v_links_total bigint;
begin
  if p_table not in ('incomes', 'expenses', 'loans', 'loan_repayments', 'transfers') then
    raise exception 'APP_ERROR: Unknown entry type.';
  end if;
  perform set_config('app.money_rpc', 'on', true);  -- lines are written here, not by the safety-net trigger
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'APP_ERROR: Add at least one payment line.';
  end if;

  -- direction of lines for this entry
  if p_table = 'incomes' then v_dir := 'in';
  elsif p_table = 'expenses' then v_dir := 'out';
  elsif p_table = 'loans' then
    v_loan_dir := coalesce(v_parent ->> 'direction', (select direction from public.loans where id = p_id));
    v_dir := case when v_loan_dir = 'borrowed' then 'in' else 'out' end;
  elsif p_table = 'loan_repayments' then
    select direction into v_loan_dir from public.loans
     where id = coalesce((v_parent ->> 'loan_id')::uuid, (select loan_id from public.loan_repayments where id = p_id));
    if v_loan_dir is null then raise exception 'APP_ERROR: Choose the udhaar this repayment belongs to.'; end if;
    v_dir := case when v_loan_dir = 'lent' then 'in' else 'out' end;
  end if;

  -- totals and basic checks
  select count(*),
         coalesce(sum((l ->> 'amount_paise')::bigint) filter (where coalesce(v_dir, l ->> 'direction') = 'in'), 0),
         coalesce(sum((l ->> 'amount_paise')::bigint) filter (where coalesce(v_dir, l ->> 'direction') = 'out'), 0)
    into v_count, v_in, v_out
    from jsonb_array_elements(p_lines) l;
  if exists (select 1 from jsonb_array_elements(p_lines) l
              where coalesce((l ->> 'amount_paise')::bigint, 0) <= 0 or (l ->> 'account_id') is null
                 or (v_dir is null and coalesce(l ->> 'direction', '') not in ('in', 'out'))) then
    raise exception 'APP_ERROR: Every payment line needs an account and an amount.';
  end if;

  if p_table = 'transfers' then
    if v_in = 0 or v_out = 0 then raise exception 'APP_ERROR: A transfer needs at least one "from" and one "to" account.'; end if;
    if v_in <> v_out then
      raise exception 'APP_ERROR: Money out (₹%) and money in (₹%) must be equal.', (v_out / 100.0)::numeric(14, 2), (v_in / 100.0)::numeric(14, 2);
    end if;
    v_total := v_out;
    select l into v_first_out from jsonb_array_elements(p_lines) l where l ->> 'direction' = 'out' limit 1;
    select l into v_first_in from jsonb_array_elements(p_lines) l where l ->> 'direction' = 'in' limit 1;
    if v_first_out ->> 'account_id' = v_first_in ->> 'account_id' then
      raise exception 'APP_ERROR: The first "from" and "to" accounts must be different.';
    end if;
    v_parent := v_parent || jsonb_build_object(
      'amount_paise', v_total,
      'from_account_id', v_first_out ->> 'account_id', 'to_account_id', v_first_in ->> 'account_id',
      'txn_date', coalesce(v_first_out ->> 'txn_date', current_date::text), 'txn_time', v_first_out ->> 'txn_time',
      'line_count', v_count);
  else
    v_total := v_in + v_out;
    select l into v_first from jsonb_array_elements(p_lines) l limit 1;
    if p_table in ('incomes', 'expenses') then
      v_parent := v_parent || jsonb_build_object(
        'amount_paise', v_total, 'account_id', v_first ->> 'account_id',
        'txn_date', coalesce(v_first ->> 'txn_date', current_date::text), 'txn_time', v_first ->> 'txn_time',
        'payment_app', case when v_count = 1 then v_first ->> 'payment_app' end,
        'payment_method', case when v_count = 1 then v_first ->> 'payment_method' end,
        'reference', case when v_count = 1 then v_first ->> 'reference' end,
        'sources', '[]'::jsonb, 'line_count', v_count);
      if p_table = 'incomes' then
        v_parent := v_parent || jsonb_build_object('payer_name', coalesce(v_parent ->> 'payer_name', v_first ->> 'party_name'));
      end if;
    elsif p_table = 'loans' then
      v_parent := v_parent || jsonb_build_object(
        'principal_paise', v_total, 'account_id', v_first ->> 'account_id',
        'start_date', coalesce(v_first ->> 'txn_date', current_date::text), 'line_count', v_count);
    else -- loan_repayments
      v_interest := coalesce((v_parent ->> 'interest_paise')::bigint, 0);
      if v_interest < 0 or v_interest > v_total then
        raise exception 'APP_ERROR: Interest part (₹%) can''t be more than the total paid (₹%).', (v_interest / 100.0)::numeric(14, 2), (v_total / 100.0)::numeric(14, 2);
      end if;
      v_parent := v_parent || jsonb_build_object(
        'principal_paise', v_total - v_interest, 'interest_paise', v_interest, 'account_id', v_first ->> 'account_id',
        'txn_date', coalesce(v_first ->> 'txn_date', current_date::text), 'line_count', v_count);
    end if;
  end if;

  -- write the entry (only columns that exist in the table)
  select string_agg(quote_ident(k), ', ') into v_cols
    from jsonb_object_keys(v_parent) k
   where k not in ('id', 'user_id', 'created_at', 'updated_at', 'deleted_at')
     and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = p_table and c.column_name = k);

  if v_id is null then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id', p_table, v_cols, v_cols, p_table)
      into v_id using v_parent;
  else
    execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2 returning id', p_table, v_cols, v_cols, p_table)
      into v_id using v_parent, v_id;
    if v_id is null then raise exception 'APP_ERROR: Entry not found.'; end if;
  end if;

  -- lines: update existing, insert new, remove the rest
  for v_line in select l from jsonb_array_elements(p_lines) with ordinality x(l, n) order by n loop
    if (v_line ->> 'id') is not null and exists (select 1 from public.payment_lines where id = (v_line ->> 'id')::uuid and parent_id = v_id and deleted_at is null) then
      update public.payment_lines set
        direction = coalesce(v_dir, v_line ->> 'direction'),
        account_id = (v_line ->> 'account_id')::uuid,
        amount_paise = (v_line ->> 'amount_paise')::bigint,
        payment_app = nullif(v_line ->> 'payment_app', ''),
        payment_method = nullif(v_line ->> 'payment_method', ''),
        txn_date = coalesce((v_line ->> 'txn_date')::date, current_date),
        txn_time = nullif(v_line ->> 'txn_time', '')::time,
        reference = nullif(v_line ->> 'reference', ''),
        party_name = nullif(v_line ->> 'party_name', ''),
        notes = nullif(v_line ->> 'notes', ''),
        sort = coalesce(array_length(v_keep, 1), 0)
      where id = (v_line ->> 'id')::uuid;
      v_keep := v_keep || (v_line ->> 'id')::uuid;
    else
      insert into public.payment_lines (parent_table, parent_id, direction, account_id, amount_paise, payment_app, payment_method,
                                        txn_date, txn_time, reference, party_name, notes, sort)
      values (p_table, v_id, coalesce(v_dir, v_line ->> 'direction'), (v_line ->> 'account_id')::uuid, (v_line ->> 'amount_paise')::bigint,
              nullif(v_line ->> 'payment_app', ''), nullif(v_line ->> 'payment_method', ''),
              coalesce((v_line ->> 'txn_date')::date, current_date), nullif(v_line ->> 'txn_time', '')::time,
              nullif(v_line ->> 'reference', ''), nullif(v_line ->> 'party_name', ''), nullif(v_line ->> 'notes', ''),
              coalesce(array_length(v_keep, 1), 0))
      returning id into v_cols;  -- reuse text var for the new id
      v_keep := v_keep || v_cols::uuid;
    end if;
  end loop;
  update public.payment_lines set deleted_at = now()
   where parent_table = p_table and parent_id = v_id and deleted_at is null and not (id = any (v_keep));

  -- an income can't be made smaller than what is already linked out of it
  if p_table = 'incomes' then
    select coalesce(sum(amount_paise), 0) into v_links_total from public.allocations where income_id = v_id and deleted_at is null;
    if v_links_total > v_total then
      raise exception 'APP_ERROR: ₹% of this income is already linked to expenses/udhaar/transfers. Reduce those links first.', (v_links_total / 100.0)::numeric(14, 2);
    end if;
  end if;

  -- income links
  if p_links is not null then
    v_target_col := case p_table when 'expenses' then 'expense_id' when 'loans' then 'loan_id' when 'transfers' then 'transfer_id' end;
    if v_target_col is null and jsonb_array_length(p_links) > 0 then
      raise exception 'APP_ERROR: Income can only be linked to expenses, udhaar given and transfers.';
    end if;
    if p_table = 'loans' and v_loan_dir = 'borrowed' and jsonb_array_length(p_links) > 0 then
      raise exception 'APP_ERROR: Borrowed money is not paid out of income.';
    end if;
    if v_target_col is not null then
      v_keep := '{}';
      for v_line in select l from jsonb_array_elements(p_links) l loop
        if (v_line ->> 'id') is not null then
          execute format('update public.allocations set income_id = $1, amount_paise = $2 where id = $3 and %I = $4 and deleted_at is null', v_target_col)
            using (v_line ->> 'income_id')::uuid, (v_line ->> 'amount_paise')::bigint, (v_line ->> 'id')::uuid, v_id;
          v_keep := v_keep || (v_line ->> 'id')::uuid;
        else
          execute format('insert into public.allocations (income_id, %I, amount_paise) values ($1, $2, $3) returning id', v_target_col)
            into v_cols using (v_line ->> 'income_id')::uuid, v_id, (v_line ->> 'amount_paise')::bigint;
          v_keep := v_keep || v_cols::uuid;
        end if;
      end loop;
      execute format('update public.allocations set deleted_at = now() where %I = $1 and deleted_at is null and not (id = any ($2))', v_target_col)
        using v_id, v_keep;
      execute format('select coalesce(sum(amount_paise), 0) from public.allocations where %I = $1 and deleted_at is null', v_target_col)
        into v_links_total using v_id;
      if v_links_total > v_total then
        raise exception 'APP_ERROR: Linked income (₹%) is more than this entry (₹%).', (v_links_total / 100.0)::numeric(14, 2), (v_total / 100.0)::numeric(14, 2);
      end if;
    end if;
  end if;

  perform set_config('app.money_rpc', 'off', true);
  return v_id;
end $$;

revoke execute on function public.save_money_entry(text, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_money_entry(text, uuid, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.setup_record_table(text) from public, anon, authenticated;

-- ---------- 8. Recycle bin: lines are managed with their entry (not listed separately) ----------

-- ---------- 8. Safety net: entries saved without the RPC (older app) still get lines ----------
create or replace function public.sync_default_lines()
returns trigger language plpgsql set search_path = public as $$
declare
  v_keys text[] := array['amount_paise', 'principal_paise', 'interest_paise', 'account_id', 'from_account_id', 'to_account_id',
                         'txn_date', 'start_date', 'txn_time', 'payment_app', 'payment_method', 'reference', 'payer_name', 'sources',
                         'direction', 'loan_id'];
  n jsonb := to_jsonb(new);
  o jsonb;
begin
  if coalesce(current_setting('app.money_rpc', true), '') = 'on' then return null; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if coalesce((o ->> 'line_count')::int, 1) > 1 then return null; end if; -- split entries are edited in the app form only
    if (select jsonb_object_agg(k, coalesce(n -> k, 'null'::jsonb)) from unnest(v_keys) k)
       = (select jsonb_object_agg(k, coalesce(o -> k, 'null'::jsonb)) from unnest(v_keys) k) then
      return null;
    end if;
    update public.payment_lines set deleted_at = now()
     where parent_table = tg_table_name and parent_id = new.id and deleted_at is null;
  end if;

  if tg_table_name = 'incomes' then
    if jsonb_array_length(coalesce(n -> 'sources', '[]'::jsonb)) > 0 then
      insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, payment_app, payment_method, txn_date, txn_time, reference, party_name, sort)
      select new.user_id, 'incomes', new.id, 'in', (s.v ->> 'account_id')::uuid, (s.v ->> 'amount_paise')::bigint, coalesce(s.v ->> 'payment_app', n ->> 'payment_app'),
             n ->> 'payment_method', (n ->> 'txn_date')::date, (n ->> 'txn_time')::time, n ->> 'reference', n ->> 'payer_name', s.i::int
        from jsonb_array_elements(n -> 'sources') with ordinality s(v, i);
    else
      insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, payment_app, payment_method, txn_date, txn_time, reference, party_name)
      values (new.user_id, 'incomes', new.id, 'in', (n ->> 'account_id')::uuid, (n ->> 'amount_paise')::bigint, n ->> 'payment_app', n ->> 'payment_method',
              (n ->> 'txn_date')::date, (n ->> 'txn_time')::time, n ->> 'reference', n ->> 'payer_name');
    end if;
  elsif tg_table_name = 'expenses' then
    if jsonb_array_length(coalesce(n -> 'sources', '[]'::jsonb)) > 0 then
      insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, payment_app, payment_method, txn_date, txn_time, reference, sort)
      select new.user_id, 'expenses', new.id, 'out', (s.v ->> 'account_id')::uuid, (s.v ->> 'amount_paise')::bigint, coalesce(s.v ->> 'payment_app', n ->> 'payment_app'),
             n ->> 'payment_method', (n ->> 'txn_date')::date, (n ->> 'txn_time')::time, n ->> 'reference', s.i::int
        from jsonb_array_elements(n -> 'sources') with ordinality s(v, i);
    else
      insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, payment_app, payment_method, txn_date, txn_time, reference)
      values (new.user_id, 'expenses', new.id, 'out', (n ->> 'account_id')::uuid, (n ->> 'amount_paise')::bigint, n ->> 'payment_app', n ->> 'payment_method',
              (n ->> 'txn_date')::date, (n ->> 'txn_time')::time, n ->> 'reference');
    end if;
  elsif tg_table_name = 'loans' then
    insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, txn_date, party_name)
    values (new.user_id, 'loans', new.id, case when n ->> 'direction' = 'lent' then 'out' else 'in' end, (n ->> 'account_id')::uuid,
            (n ->> 'principal_paise')::bigint, (n ->> 'start_date')::date, n ->> 'person');
  elsif tg_table_name = 'loan_repayments' then
    insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, txn_date, party_name)
    select new.user_id, 'loan_repayments', new.id, case when l.direction = 'lent' then 'in' else 'out' end, (n ->> 'account_id')::uuid,
           (n ->> 'principal_paise')::bigint + (n ->> 'interest_paise')::bigint, (n ->> 'txn_date')::date, l.person
      from public.loans l where l.id = (n ->> 'loan_id')::uuid
       and (n ->> 'principal_paise')::bigint + (n ->> 'interest_paise')::bigint > 0;
  elsif tg_table_name = 'transfers' then
    insert into public.payment_lines (user_id, parent_table, parent_id, direction, account_id, amount_paise, txn_date, txn_time, sort)
    values (new.user_id, 'transfers', new.id, 'out', (n ->> 'from_account_id')::uuid, (n ->> 'amount_paise')::bigint, (n ->> 'txn_date')::date, (n ->> 'txn_time')::time, 0),
           (new.user_id, 'transfers', new.id, 'in', (n ->> 'to_account_id')::uuid, (n ->> 'amount_paise')::bigint, (n ->> 'txn_date')::date, (n ->> 'txn_time')::time, 1);
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['incomes', 'expenses', 'loans', 'loan_repayments', 'transfers'] loop
    execute format('drop trigger if exists trg_default_lines on public.%I', t);
    execute format('create trigger trg_default_lines after insert or update on public.%I for each row execute function public.sync_default_lines()', t);
  end loop;
end $$;
