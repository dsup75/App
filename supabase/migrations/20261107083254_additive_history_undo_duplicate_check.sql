-- ADDITIVE ONLY. Reads the existing edit_history; adds a readable view, a safe undo function and a read-only duplicate checker.

create or replace view public.transaction_history with (security_invoker = true) as
select h.id, h.user_id, h.table_name, h.record_id, h.field, h.old_value, h.new_value, h.changed_at,
       case
         when h.field = '__created' then 'created'
         when h.field = 'deleted_at' and (h.old_value is null or h.old_value = 'null'::jsonb)
              and h.new_value is not null and h.new_value <> 'null'::jsonb then 'deleted'
         when h.field = 'deleted_at' and h.old_value is not null and h.old_value <> 'null'::jsonb
              and (h.new_value is null or h.new_value = 'null'::jsonb) then 'restored'
         else 'edited'
       end as event_type,
       public.money_parent_title(h.table_name, h.record_id) as title,
       (h.table_name in ('incomes','expenses','transfers','loans','loan_repayments','money_links')) as can_try_undo
  from public.edit_history h
 where h.table_name in ('incomes','expenses','transfers','loans','loan_repayments','allocations','payment_lines',
                        'money_links','reconciliations','reconciliation_adjustments');

create or replace function public.undo_change(p_history_id uuid)
returns jsonb language plpgsql set search_path to 'public' as $$
declare
  h public.edit_history%rowtype;
  cur jsonb;
  v_deleted boolean;
  v_money_fields text[] := array['amount_paise','principal_paise','interest_paise','account_id','from_account_id',
                                 'to_account_id','txn_date','start_date','sources','direction','loan_id'];
  v_new_total bigint;
  v_amt bigint;
begin
  select * into h from public.edit_history where id = p_history_id and user_id = auth.uid();
  if not found then raise exception 'APP_ERROR: History entry not found.'; end if;
  if h.table_name not in ('incomes','expenses','transfers','loans','loan_repayments','money_links') then
    raise exception 'APP_ERROR: Undo is not available for this kind of record.';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.user_id = $2', h.table_name)
    into cur using h.record_id, auth.uid();
  if cur is null then raise exception 'APP_ERROR: Record not found.'; end if;
  v_deleted := (cur ->> 'deleted_at') is not null;

  -- created -> undo = move to Recycle Bin (same as the app's own delete)
  if h.field = '__created' then
    if v_deleted then raise exception 'APP_ERROR: This entry is already in the Recycle Bin.'; end if;
    execute format('update public.%I set deleted_at = now() where id = $1 and user_id = $2', h.table_name)
      using h.record_id, auth.uid();
    return jsonb_build_object('ok', true, 'action', 'moved_to_recycle_bin');
  end if;

  -- deleted / restored
  if h.field = 'deleted_at' then
    if h.old_value is null or h.old_value = 'null'::jsonb then
      if not v_deleted then raise exception 'APP_ERROR: This entry is not deleted.'; end if;
      execute format('update public.%I set deleted_at = null where id = $1 and user_id = $2', h.table_name)
        using h.record_id, auth.uid();
      return jsonb_build_object('ok', true, 'action', 'restored');
    else
      if v_deleted then raise exception 'APP_ERROR: This entry is already in the Recycle Bin.'; end if;
      execute format('update public.%I set deleted_at = now() where id = $1 and user_id = $2', h.table_name)
        using h.record_id, auth.uid();
      return jsonb_build_object('ok', true, 'action', 'moved_to_recycle_bin');
    end if;
  end if;

  -- field edit -> put the old value back, only if it is still safe
  if v_deleted then raise exception 'APP_ERROR: Restore this entry from the Recycle Bin first.'; end if;
  if not (cur ? h.field) then raise exception 'APP_ERROR: This field can no longer be undone.'; end if;
  if h.field in ('line_count', 'id', 'user_id', 'created_at', 'updated_at') then
    raise exception 'APP_ERROR: This change can only be undone from the edit form.';
  end if;
  if (cur -> h.field) is distinct from h.new_value then
    raise exception 'APP_ERROR: This field was changed again after this edit. Undo the newer change first.';
  end if;
  if h.field = any (v_money_fields) and coalesce((cur ->> 'line_count')::int, 1) > 1 then
    raise exception 'APP_ERROR: This entry has several payment lines. Please change it from the edit form.';
  end if;

  -- never shrink an entry below the money already linked to/from it
  if h.field in ('amount_paise', 'principal_paise', 'interest_paise') then
    if h.table_name = 'loan_repayments' then
      v_new_total := (case when h.field = 'principal_paise' then coalesce(nullif(h.old_value::text, 'null')::bigint, 0)
                           else (cur ->> 'principal_paise')::bigint end)
                   + (case when h.field = 'interest_paise' then coalesce(nullif(h.old_value::text, 'null')::bigint, 0)
                           else (cur ->> 'interest_paise')::bigint end);
    elsif h.field = 'interest_paise' then
      v_new_total := null;
    else
      v_new_total := nullif(h.old_value::text, 'null')::bigint;
    end if;
    if v_new_total is not null then
      v_amt := greatest(public.money_source_used(h.table_name, h.record_id, null),
                        public.money_target_used(h.table_name, h.record_id, null));
      if v_amt > v_new_total then
        raise exception 'APP_ERROR: ₹% is already linked to this entry. Reduce those links first.', (v_amt / 100.0)::numeric(14, 2);
      end if;
    end if;
  end if;

  execute format('update public.%I set %I = (jsonb_populate_record(null::public.%I, $1)).%I where id = $2 and user_id = $3',
                 h.table_name, h.field, h.table_name, h.field)
    using jsonb_build_object(h.field, h.old_value), h.record_id, auth.uid();
  return jsonb_build_object('ok', true, 'action', 'edit_reverted', 'field', h.field);
end $$;

create or replace function public.find_duplicate_candidates(
  p_kind text, p_amount_paise bigint, p_date date, p_account_id uuid default null,
  p_title text default null, p_reference text default null, p_exclude_id uuid default null,
  p_window_days int default 1)
returns table (id uuid, kind text, title text, amount_paise bigint, txn_date date, account_id uuid,
               reference text, score int, reasons text[])
language plpgsql stable set search_path to 'public' as $$
begin
  if p_kind not in ('expenses', 'incomes', 'transfers') then
    raise exception 'APP_ERROR: Unknown entry type.';
  end if;
  return query
  with cand as (
    select e.id, 'expenses'::text as kind, e.title, e.amount_paise, e.txn_date,
           e.account_id, null::uuid as account2_id, e.reference
      from public.expenses e where p_kind = 'expenses' and e.user_id = auth.uid() and e.deleted_at is null
    union all
    select i.id, 'incomes', i.title, i.amount_paise, i.txn_date, i.account_id, null::uuid, i.reference
      from public.incomes i where p_kind = 'incomes' and i.user_id = auth.uid() and i.deleted_at is null
    union all
    select t.id, 'transfers', t.title, t.amount_paise, t.txn_date, t.from_account_id, t.to_account_id, null::text
      from public.transfers t where p_kind = 'transfers' and t.user_id = auth.uid() and t.deleted_at is null
  )
  select c.id, c.kind, c.title, c.amount_paise, c.txn_date, c.account_id, c.reference, s.score, s.reasons
    from cand c
    cross join lateral (
      select (50
              + case when p_account_id is not null and p_account_id in (c.account_id, c.account2_id) then 20 else 0 end
              + case when nullif(btrim(p_reference), '') is not null and lower(btrim(c.reference)) = lower(btrim(p_reference)) then 20 else 0 end
              + case when nullif(btrim(p_title), '') is not null and lower(btrim(c.title)) = lower(btrim(p_title)) then 10 else 0 end
             )::int as score,
             array_remove(array[
               'same amount',
               case when c.txn_date = p_date then 'same date' else 'within ' || p_window_days || ' day(s)' end,
               case when p_account_id is not null and p_account_id in (c.account_id, c.account2_id) then 'same account' end,
               case when nullif(btrim(p_reference), '') is not null and lower(btrim(c.reference)) = lower(btrim(p_reference)) then 'same reference' end,
               case when nullif(btrim(p_title), '') is not null and lower(btrim(c.title)) = lower(btrim(p_title)) then 'same title' end
             ], null) as reasons
    ) s
   where c.amount_paise = p_amount_paise
     and c.txn_date between p_date - p_window_days and p_date + p_window_days
     and c.id is distinct from p_exclude_id
   order by s.score desc, c.txn_date desc
   limit 5;
end $$;

grant select on public.transaction_history to authenticated;
grant execute on function public.undo_change(uuid), public.find_duplicate_candidates(text, bigint, date, uuid, text, text, uuid, int) to authenticated;
