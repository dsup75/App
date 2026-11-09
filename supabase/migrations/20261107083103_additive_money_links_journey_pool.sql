-- ADDITIVE ONLY: new table, helper functions, views. No existing object is altered.

create table public.money_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  source_table text not null check (source_table in ('incomes','transfers','loans','loan_repayments')),
  source_id uuid not null,
  target_table text not null check (target_table in ('expenses','transfers','loans','loan_repayments')),
  target_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  account_id uuid,
  link_type text not null default 'income' check (link_type in ('income','refund','reimbursement','received','transfer','other')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint money_links_id_user_id_key unique (id, user_id),
  constraint money_links_no_self check (not (source_table = target_table and source_id = target_id)),
  constraint money_links_account_fk foreign key (account_id, user_id) references public.accounts (id, user_id)
);
create index money_links_source_idx on public.money_links (user_id, source_table, source_id) where deleted_at is null;
create index money_links_target_idx on public.money_links (user_id, target_table, target_id) where deleted_at is null;

create or replace function public.money_node_amount(p_table text, p_id uuid, p_user uuid)
returns bigint language sql stable set search_path to 'public' as $$
  select case p_table
    when 'incomes' then (select x.amount_paise from public.incomes x where x.id = p_id and x.user_id = p_user and x.deleted_at is null)
    when 'expenses' then (select x.amount_paise from public.expenses x where x.id = p_id and x.user_id = p_user and x.deleted_at is null)
    when 'transfers' then (select x.amount_paise from public.transfers x where x.id = p_id and x.user_id = p_user and x.deleted_at is null)
    when 'loans' then (select x.principal_paise from public.loans x where x.id = p_id and x.user_id = p_user and x.deleted_at is null)
    when 'loan_repayments' then (select x.principal_paise + x.interest_paise from public.loan_repayments x where x.id = p_id and x.user_id = p_user and x.deleted_at is null)
  end;
$$;

create or replace function public.money_source_used(p_table text, p_id uuid, p_exclude uuid)
returns bigint language sql stable set search_path to 'public' as $$
  select (
    coalesce((select sum(m.amount_paise) from public.money_links m
               where m.source_table = p_table and m.source_id = p_id and m.deleted_at is null
                 and m.id is distinct from p_exclude), 0)
    + case when p_table = 'incomes'
        then coalesce((select sum(a.amount_paise) from public.allocations a where a.income_id = p_id and a.deleted_at is null), 0)
        else 0 end
  )::bigint;
$$;

create or replace function public.money_target_used(p_table text, p_id uuid, p_exclude uuid)
returns bigint language sql stable set search_path to 'public' as $$
  select (
    coalesce((select sum(m.amount_paise) from public.money_links m
               where m.target_table = p_table and m.target_id = p_id and m.deleted_at is null
                 and m.id is distinct from p_exclude), 0)
    + case p_table
        when 'expenses' then coalesce((select sum(a.amount_paise) from public.allocations a where a.expense_id = p_id and a.deleted_at is null), 0)
        when 'loans' then coalesce((select sum(a.amount_paise) from public.allocations a where a.loan_id = p_id and a.deleted_at is null), 0)
        when 'transfers' then coalesce((select sum(a.amount_paise) from public.allocations a where a.transfer_id = p_id and a.deleted_at is null), 0)
        else 0 end
  )::bigint;
$$;

create or replace function public.check_money_link()
returns trigger language plpgsql set search_path to 'public' as $$
declare src bigint; tgt bigint; su bigint; tu bigint;
begin
  if new.deleted_at is not null then return new; end if;
  src := public.money_node_amount(new.source_table, new.source_id, new.user_id);
  if src is null then
    raise exception 'APP_ERROR: The money source was not found or is in the Recycle Bin.';
  end if;
  tgt := public.money_node_amount(new.target_table, new.target_id, new.user_id);
  if tgt is null then
    raise exception 'APP_ERROR: The linked entry was not found or is in the Recycle Bin.';
  end if;
  if new.source_table = 'loans' and not exists (
       select 1 from public.loans l where l.id = new.source_id and l.direction = 'borrowed') then
    raise exception 'APP_ERROR: Only a borrowed loan can be a money source.';
  end if;
  if new.source_table = 'loan_repayments' and not exists (
       select 1 from public.loan_repayments r join public.loans l on l.id = r.loan_id
        where r.id = new.source_id and l.direction = 'lent') then
    raise exception 'APP_ERROR: Only a repayment received on money you lent can be a money source.';
  end if;
  su := public.money_source_used(new.source_table, new.source_id, new.id);
  tu := public.money_target_used(new.target_table, new.target_id, new.id);
  if su + new.amount_paise > src then
    raise exception 'APP_ERROR: Too much taken from this source. Only ₹% of it is left.', ((src - su) / 100.0)::numeric(14, 2);
  end if;
  if tu + new.amount_paise > tgt then
    raise exception 'APP_ERROR: Linked money (₹%) is more than this entry.', ((tu + new.amount_paise) / 100.0)::numeric(14, 2);
  end if;
  return new;
end $$;

create trigger trg_money_link before insert or update on public.money_links
  for each row execute function public.check_money_link();

select public.setup_record_table('money_links');
revoke all on public.money_links from anon;

-- Unified read-only view: existing allocations + new money_links (no data copied or migrated)
create or replace view public.all_money_links with (security_invoker = true) as
select a.id, a.user_id, 'allocation'::text as origin,
       'incomes'::text as source_table, a.income_id as source_id,
       (case when a.expense_id is not null then 'expenses' when a.loan_id is not null then 'loans' else 'transfers' end)::text as target_table,
       coalesce(a.expense_id, a.loan_id, a.transfer_id) as target_id,
       a.amount_paise, null::uuid as account_id, 'income'::text as link_type, a.created_at
  from public.allocations a
 where a.deleted_at is null
union all
select m.id, m.user_id, 'money_link'::text, m.source_table, m.source_id, m.target_table, m.target_id,
       m.amount_paise, m.account_id, m.link_type, m.created_at
  from public.money_links m
 where m.deleted_at is null;

create or replace view public.money_source_status with (security_invoker = true) as
with src as (
  select 'incomes'::text as source_table, i.id as source_id, i.user_id, i.title, i.amount_paise, i.txn_date, i.account_id
    from public.incomes i where i.deleted_at is null
  union all
  select 'transfers', t.id, t.user_id, t.title, t.amount_paise, t.txn_date, t.to_account_id
    from public.transfers t where t.deleted_at is null
  union all
  select 'loans', l.id, l.user_id, l.person, l.principal_paise, l.start_date, l.account_id
    from public.loans l where l.deleted_at is null and l.direction = 'borrowed'
  union all
  select 'loan_repayments', r.id, r.user_id, r.title, r.principal_paise + r.interest_paise, r.txn_date, r.account_id
    from public.loan_repayments r join public.loans l on l.id = r.loan_id
   where r.deleted_at is null and l.deleted_at is null and l.direction = 'lent'
)
select s.source_table, s.source_id, s.user_id, s.title, s.amount_paise, s.txn_date, s.account_id,
       coalesce(u.used, 0)::bigint as used_paise,
       (s.amount_paise - coalesce(u.used, 0))::bigint as remaining_paise
  from src s
  left join lateral (
    select sum(l.amount_paise) as used from public.all_money_links l
     where l.source_table = s.source_table and l.source_id = s.source_id
  ) u on true;

-- Unallocated tracker: transfers are shown separately and are NEVER counted as received income
create or replace view public.money_pool_summary with (security_invoker = true) as
select i.user_id,
       coalesce(sum(i.amount_paise), 0)::bigint as received_paise,
       coalesce(sum(u.spent), 0)::bigint as allocated_to_expenses_paise,
       coalesce(sum(u.lent), 0)::bigint as allocated_to_loans_paise,
       coalesce(sum(u.moved), 0)::bigint as transferred_paise,
       (coalesce(sum(i.amount_paise), 0) - coalesce(sum(u.spent + u.lent + u.moved), 0))::bigint as remaining_paise,
       (select coalesce(sum(t.amount_paise), 0) from public.transfers t
         where t.user_id = i.user_id and t.deleted_at is null)::bigint as transfer_volume_paise_not_income
  from public.incomes i
  left join lateral (
    select coalesce(sum(l.amount_paise) filter (where l.target_table = 'expenses'), 0) as spent,
           coalesce(sum(l.amount_paise) filter (where l.target_table in ('loans','loan_repayments')), 0) as lent,
           coalesce(sum(l.amount_paise) filter (where l.target_table = 'transfers'), 0) as moved
      from public.all_money_links l
     where l.source_table = 'incomes' and l.source_id = i.id
  ) u on true
 where i.deleted_at is null
 group by i.user_id;

-- Journey downstream: where did this money go?
create or replace function public.money_journey(p_source_table text, p_source_id uuid, p_max_depth int default 8)
returns table (depth int, from_table text, from_id uuid, from_title text,
               to_table text, to_id uuid, to_title text, amount_paise bigint,
               to_account_id uuid, to_account_name text, origin text)
language sql stable set search_path to 'public' as $$
  with recursive walk as (
    select 1 as depth, l.source_table, l.source_id, l.target_table, l.target_id, l.amount_paise, l.account_id, l.origin,
           array[l.source_table || ':' || l.source_id::text, l.target_table || ':' || l.target_id::text] as path
      from public.all_money_links l
     where l.user_id = auth.uid() and l.source_table = p_source_table and l.source_id = p_source_id
    union all
    select w.depth + 1, l.source_table, l.source_id, l.target_table, l.target_id, l.amount_paise, l.account_id, l.origin,
           w.path || (l.target_table || ':' || l.target_id::text)
      from walk w
      join public.all_money_links l
        on l.user_id = auth.uid() and l.source_table = w.target_table and l.source_id = w.target_id
     where w.depth < p_max_depth
       and not ((l.target_table || ':' || l.target_id::text) = any (w.path))
  )
  select w.depth, w.source_table, w.source_id, public.money_parent_title(w.source_table, w.source_id),
         w.target_table, w.target_id, public.money_parent_title(w.target_table, w.target_id), w.amount_paise,
         acc.id, acc.name, w.origin
    from walk w
    left join lateral (
      select a.id, a.name from public.accounts a
       where a.id = coalesce(w.account_id,
         case w.target_table
           when 'transfers' then (select t.to_account_id from public.transfers t where t.id = w.target_id)
           when 'expenses' then (select e.account_id from public.expenses e where e.id = w.target_id)
           when 'loans' then (select l2.account_id from public.loans l2 where l2.id = w.target_id)
           when 'loan_repayments' then (select r.account_id from public.loan_repayments r where r.id = w.target_id)
         end)
    ) acc on true
   order by w.depth, w.amount_paise desc;
$$;

-- Journey upstream: where did the money for this entry originally come from?
create or replace function public.money_origin(p_target_table text, p_target_id uuid, p_max_depth int default 8)
returns table (depth int, from_table text, from_id uuid, from_title text,
               to_table text, to_id uuid, to_title text, amount_paise bigint, origin text)
language sql stable set search_path to 'public' as $$
  with recursive walk as (
    select 1 as depth, l.source_table, l.source_id, l.target_table, l.target_id, l.amount_paise, l.origin,
           array[l.source_table || ':' || l.source_id::text, l.target_table || ':' || l.target_id::text] as path
      from public.all_money_links l
     where l.user_id = auth.uid() and l.target_table = p_target_table and l.target_id = p_target_id
    union all
    select w.depth + 1, l.source_table, l.source_id, l.target_table, l.target_id, l.amount_paise, l.origin,
           w.path || (l.source_table || ':' || l.source_id::text)
      from walk w
      join public.all_money_links l
        on l.user_id = auth.uid() and l.target_table = w.source_table and l.target_id = w.source_id
     where w.depth < p_max_depth
       and not ((l.source_table || ':' || l.source_id::text) = any (w.path))
  )
  select w.depth, w.source_table, w.source_id, public.money_parent_title(w.source_table, w.source_id),
         w.target_table, w.target_id, public.money_parent_title(w.target_table, w.target_id), w.amount_paise, w.origin
    from walk w
   order by w.depth, w.amount_paise desc;
$$;

grant select on public.all_money_links, public.money_source_status, public.money_pool_summary to authenticated;
grant execute on function public.money_journey(text, uuid, int), public.money_origin(text, uuid, int) to authenticated;
