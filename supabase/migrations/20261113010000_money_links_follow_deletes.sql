-- ADDITIVE / FIX. When an entry goes to the Recycle Bin, the money links that point to it or
-- come from it go with it, and come back when it is restored. Before this, a deleted expense
-- still "used up" its income: the income showed less money left, the source picker hid it,
-- and the Activity list kept showing the old link.
-- Nothing is hard-deleted: links are only marked deleted (same as every other record).

-- ---------- 1. follow the parent's delete / restore ----------
create or replace function public.money_links_follow_parent()
returns trigger language plpgsql set search_path = public as $$
declare r record;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.money_links set deleted_at = new.deleted_at
     where user_id = new.user_id and deleted_at is null
       and ((source_table = tg_table_name and source_id = new.id) or (target_table = tg_table_name and target_id = new.id));
    if tg_table_name = 'incomes' then
      update public.allocations set deleted_at = new.deleted_at where user_id = new.user_id and deleted_at is null and income_id = new.id;
    elsif tg_table_name = 'expenses' then
      update public.allocations set deleted_at = new.deleted_at where user_id = new.user_id and deleted_at is null and expense_id = new.id;
    elsif tg_table_name = 'loans' then
      update public.allocations set deleted_at = new.deleted_at where user_id = new.user_id and deleted_at is null and loan_id = new.id;
    elsif tg_table_name = 'transfers' then
      update public.allocations set deleted_at = new.deleted_at where user_id = new.user_id and deleted_at is null and transfer_id = new.id;
    end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    -- restore only the links that went with it; skip any that no longer fit (money used elsewhere since)
    for r in select id from public.money_links
              where user_id = new.user_id and deleted_at = old.deleted_at
                and ((source_table = tg_table_name and source_id = new.id) or (target_table = tg_table_name and target_id = new.id)) loop
      begin
        update public.money_links set deleted_at = null where id = r.id;
      exception when others then null;
      end;
    end loop;
    for r in select id from public.allocations
              where user_id = new.user_id and deleted_at = old.deleted_at
                and new.id in (income_id, expense_id, loan_id, transfer_id) loop
      begin
        update public.allocations set deleted_at = null where id = r.id;
      exception when others then null;
      end;
    end loop;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['incomes', 'expenses', 'transfers', 'loans', 'loan_repayments'] loop
    execute format('drop trigger if exists trg_links_follow on public.%I', t);
    execute format('create trigger trg_links_follow after update of deleted_at on public.%I for each row execute function public.money_links_follow_parent()', t);
  end loop;
end $$;

-- ---------- 2. tidy links already left behind by deleted entries ----------
do $$
declare v_ts timestamptz;
begin
  update public.money_links m set deleted_at = coalesce(
      (select x.deleted_at from public.expenses x where m.target_table = 'expenses' and x.id = m.target_id),
      (select x.deleted_at from public.transfers x where m.target_table = 'transfers' and x.id = m.target_id),
      (select x.deleted_at from public.loans x where m.target_table = 'loans' and x.id = m.target_id),
      (select x.deleted_at from public.loan_repayments x where m.target_table = 'loan_repayments' and x.id = m.target_id),
      (select x.deleted_at from public.incomes x where m.source_table = 'incomes' and x.id = m.source_id),
      (select x.deleted_at from public.transfers x where m.source_table = 'transfers' and x.id = m.source_id),
      (select x.deleted_at from public.loans x where m.source_table = 'loans' and x.id = m.source_id),
      (select x.deleted_at from public.loan_repayments x where m.source_table = 'loan_repayments' and x.id = m.source_id),
      now())
   where m.deleted_at is null
     and not (public.money_parent_active(m.source_table, m.source_id) and public.money_parent_active(m.target_table, m.target_id));
  update public.allocations a set deleted_at = coalesce(
      (select x.deleted_at from public.expenses x where x.id = a.expense_id),
      (select x.deleted_at from public.loans x where x.id = a.loan_id),
      (select x.deleted_at from public.transfers x where x.id = a.transfer_id),
      (select x.deleted_at from public.incomes x where x.id = a.income_id),
      now())
   where a.deleted_at is null
     and not (public.money_parent_active('incomes', a.income_id)
              and (a.expense_id is null or public.money_parent_active('expenses', a.expense_id))
              and (a.loan_id is null or public.money_parent_active('loans', a.loan_id))
              and (a.transfer_id is null or public.money_parent_active('transfers', a.transfer_id)));
end $$;

-- ---------- 3. the shared view never counts a link to a deleted entry ----------
create or replace view public.all_money_links with (security_invoker = true) as
select a.id, a.user_id, 'allocation'::text as origin,
       'incomes'::text as source_table, a.income_id as source_id,
       (case when a.expense_id is not null then 'expenses' when a.loan_id is not null then 'loans' else 'transfers' end)::text as target_table,
       coalesce(a.expense_id, a.loan_id, a.transfer_id) as target_id,
       a.amount_paise, null::uuid as account_id, 'income'::text as link_type, a.created_at
  from public.allocations a
 where a.deleted_at is null
   and public.money_parent_active('incomes', a.income_id)
   and public.money_parent_active(case when a.expense_id is not null then 'expenses' when a.loan_id is not null then 'loans' else 'transfers' end,
                                  coalesce(a.expense_id, a.loan_id, a.transfer_id))
union all
select m.id, m.user_id, 'money_link'::text, m.source_table, m.source_id, m.target_table, m.target_id,
       m.amount_paise, m.account_id, m.link_type, m.created_at
  from public.money_links m
 where m.deleted_at is null
   and public.money_parent_active(m.source_table, m.source_id)
   and public.money_parent_active(m.target_table, m.target_id);
