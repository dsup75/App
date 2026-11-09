-- =====================================================================
-- DeepBoost Life — ADDITIVE ONLY
--  * where each source's money is right now (account-wise), so a transfer
--    moves "Arun Singh ₹500" from IPPB to SBI and nothing is counted twice
--  * per-payment-row source links saved with the entry in one transaction
--  * undo by reversal (a new opposite entry; the original is never edited)
--  * checklists for tasks / habits, AI connection URL
-- No existing table, column, view or function is changed.
-- =====================================================================

-- ---------- 1. Every movement of source money, per account ----------
-- Money is traced through the existing links (all_money_links):
--   income ──link──▶ transfer ──link──▶ expense
-- received : a source's money arriving in an account
--            (an income's own payment lines, or the traced money a transfer delivers)
-- spent    : linked out of an account to an expense / udhaar given / repayment paid
-- moved_out: linked out of an account into a transfer
-- A transfer only carries money that was linked into it, so an untraced transfer
-- can never make the same rupee appear in two accounts.
create or replace view public.source_moves with (security_invoker = true) as
select pl.user_id, pl.parent_table as source_table, pl.parent_id as source_id, pl.account_id,
       pl.amount_paise::bigint as delta_paise, 'received'::text as kind, null::uuid as link_id,
       pl.parent_table as ref_table, pl.parent_id as ref_id, pl.txn_date
  from public.payment_lines pl
 where pl.deleted_at is null and pl.direction = 'in'
   and pl.parent_table in ('incomes', 'loans', 'loan_repayments')
   and public.money_parent_active(pl.parent_table, pl.parent_id)
union all
-- traced money a transfer delivers to its "to" account
select l.user_id, 'transfers', t.id, t.to_account_id, l.amount_paise::bigint, 'received', l.id, l.source_table, l.source_id, t.txn_date
  from public.all_money_links l
  join public.transfers t on t.id = l.target_id and t.deleted_at is null
 where l.target_table = 'transfers'
   and public.money_parent_active(l.source_table, l.source_id)
union all
-- money linked out of an account
select l.user_id, l.source_table, l.source_id,
       coalesce(l.account_id,
         case when l.source_table = 'transfers' then (select t.to_account_id from public.transfers t where t.id = l.source_id) else
         case l.target_table
           when 'expenses' then (select e.account_id from public.expenses e where e.id = l.target_id)
           when 'transfers' then (select t.from_account_id from public.transfers t where t.id = l.target_id)
           when 'loans' then (select x.account_id from public.loans x where x.id = l.target_id)
           when 'loan_repayments' then (select r.account_id from public.loan_repayments r where r.id = l.target_id) end end),
       -l.amount_paise::bigint,
       case when l.target_table = 'transfers' then 'moved_out' else 'spent' end,
       l.id, l.target_table, l.target_id,
       case l.target_table
         when 'expenses' then (select e.txn_date from public.expenses e where e.id = l.target_id)
         when 'transfers' then (select t.txn_date from public.transfers t where t.id = l.target_id)
         when 'loans' then (select x.start_date from public.loans x where x.id = l.target_id)
         when 'loan_repayments' then (select r.txn_date from public.loan_repayments r where r.id = l.target_id) end
  from public.all_money_links l
 where public.money_parent_active(l.target_table, l.target_id)
   and public.money_parent_active(l.source_table, l.source_id);

-- Original source names behind a transfer (follows chains of transfers)
create or replace function public.transfer_origin_titles(p_transfer uuid)
returns text language sql stable set search_path to 'public' as $$
  select string_agg(distinct o.from_title, ' + ')
    from public.money_origin('transfers', p_transfer) o
   where o.from_table <> 'transfers';
$$;

-- Where each source's money is now
create or replace view public.source_positions with (security_invoker = true) as
select m.user_id, m.source_table, m.source_id, m.account_id,
       case when m.source_table = 'transfers'
            then coalesce(public.transfer_origin_titles(m.source_id), public.money_parent_title(m.source_table, m.source_id))
            else public.money_parent_title(m.source_table, m.source_id) end as title,
       case when m.source_table = 'transfers' then public.money_parent_title(m.source_table, m.source_id) end as via_title,
       case m.source_table
         when 'incomes' then (select i.txn_date from public.incomes i where i.id = m.source_id)
         when 'loans' then (select x.start_date from public.loans x where x.id = m.source_id)
         when 'transfers' then (select t.txn_date from public.transfers t where t.id = m.source_id)
         else (select r.txn_date from public.loan_repayments r where r.id = m.source_id) end as source_date,
       coalesce(sum(m.delta_paise) filter (where m.kind = 'received'), 0)::bigint as received_paise,
       coalesce(-sum(m.delta_paise) filter (where m.kind = 'moved_out'), 0)::bigint as moved_out_paise,
       coalesce(-sum(m.delta_paise) filter (where m.kind = 'spent'), 0)::bigint as spent_paise,
       coalesce(sum(m.delta_paise), 0)::bigint as available_paise
  from public.source_moves m
 where m.account_id is not null
 group by m.user_id, m.source_table, m.source_id, m.account_id;

grant select on public.source_moves, public.source_positions to authenticated;
revoke all on public.source_moves, public.source_positions from anon;
grant execute on function public.transfer_origin_titles(uuid) to authenticated;

-- ---------- 2. Guard: a link can only use money that is in that account ----------
create or replace function public.check_money_link_account()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_avail bigint; v_title text; v_acc text;
begin
  if new.deleted_at is not null or new.account_id is null then
    return new;
  end if;
  select coalesce(sum(m.delta_paise), 0) into v_avail
    from public.source_moves m
   where m.source_table = new.source_table and m.source_id = new.source_id and m.account_id = new.account_id
     and m.link_id is distinct from new.id;
  if v_avail < new.amount_paise then
    v_title := case when new.source_table = 'transfers'
                    then coalesce(public.transfer_origin_titles(new.source_id), public.money_parent_title(new.source_table, new.source_id))
                    else public.money_parent_title(new.source_table, new.source_id) end;
    select name into v_acc from public.accounts where id = new.account_id;
    raise exception 'APP_ERROR: Only ₹% of "%" is in %.', (greatest(v_avail, 0) / 100.0)::numeric(14, 2), v_title, v_acc;
  end if;
  return new;
end $$;

drop trigger if exists trg_money_link_account on public.money_links;
create trigger trg_money_link_account before insert or update on public.money_links
  for each row execute function public.check_money_link_account();

-- ---------- 3. Save an entry together with its per-row source links ----------
-- p_row_links: null = leave links unchanged; [] = remove; [{source_table, source_id, account_id, amount_paise, link_type?}]
create or replace function public.save_money_entry_with_sources(p_table text, p_id uuid, p_parent jsonb, p_lines jsonb, p_row_links jsonb)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_id uuid; v_link jsonb; v_accounts uuid[];
begin
  v_id := public.save_money_entry(p_table, p_id, p_parent, p_lines, null);
  if p_row_links is null then return v_id; end if;
  if p_table not in ('expenses', 'transfers', 'loans', 'loan_repayments') then
    if jsonb_array_length(p_row_links) > 0 then raise exception 'APP_ERROR: Money sources can only be linked to money going out.'; end if;
    return v_id;
  end if;
  select array_agg(distinct account_id) into v_accounts
    from public.payment_lines where parent_table = p_table and parent_id = v_id and deleted_at is null and direction = 'out';
  update public.money_links set deleted_at = now()
   where target_table = p_table and target_id = v_id and deleted_at is null;
  for v_link in select l from jsonb_array_elements(p_row_links) l loop
    if v_accounts is null or not ((v_link ->> 'account_id')::uuid = any (v_accounts)) then
      raise exception 'APP_ERROR: A linked source must use the account of a money-out row of this entry.';
    end if;
    insert into public.money_links (source_table, source_id, target_table, target_id, amount_paise, account_id, link_type)
    values (v_link ->> 'source_table', (v_link ->> 'source_id')::uuid, p_table, v_id, (v_link ->> 'amount_paise')::bigint,
            (v_link ->> 'account_id')::uuid, coalesce(v_link ->> 'link_type', 'income'));
  end loop;
  return v_id;
end $$;

-- ---------- 4. Undo by reversal ----------
create table if not exists public.entry_reversals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  original_table text not null check (original_table in ('incomes', 'expenses', 'transfers')),
  original_id uuid not null,
  reversal_table text not null check (reversal_table in ('incomes', 'expenses', 'transfers')),
  reversal_id uuid not null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists entry_reversals_original on public.entry_reversals (original_table, original_id);
create index if not exists entry_reversals_reversal on public.entry_reversals (reversal_table, reversal_id);
select public.setup_record_table('entry_reversals');
revoke all on public.entry_reversals from anon;

create or replace function public.reverse_entry(p_table text, p_id uuid, p_reason text default null, p_date date default current_date)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_row jsonb; v_lines jsonb; v_new uuid; v_target text;
begin
  if p_table not in ('incomes', 'expenses', 'transfers') then
    raise exception 'APP_ERROR: Only income, expense and transfer entries can be reversed.';
  end if;
  execute format('select to_jsonb(x) from public.%I x where x.id = $1 and x.user_id = auth.uid() and x.deleted_at is null', p_table)
    into v_row using p_id;
  if v_row is null then raise exception 'APP_ERROR: Entry not found (it may be in the Recycle Bin).'; end if;
  if exists (select 1 from public.entry_reversals r where r.reversal_table = p_table and r.reversal_id = p_id and r.deleted_at is null) then
    raise exception 'APP_ERROR: This entry is itself a reversal.';
  end if;
  if exists (select 1 from public.entry_reversals r
              where r.original_table = p_table and r.original_id = p_id and r.deleted_at is null
                and public.money_parent_active(r.reversal_table, r.reversal_id)) then
    raise exception 'APP_ERROR: This entry is already reversed.';
  end if;
  select jsonb_agg(jsonb_build_object(
           'direction', case when direction = 'in' then 'out' else 'in' end,
           'account_id', account_id, 'amount_paise', amount_paise, 'payment_app', payment_app, 'payment_method', payment_method,
           'txn_date', coalesce(p_date, current_date), 'reference', reference, 'party_name', party_name, 'notes', 'Reversal') order by sort)
    into v_lines
    from public.payment_lines where parent_table = p_table and parent_id = p_id and deleted_at is null;
  if v_lines is null then raise exception 'APP_ERROR: This entry has no payment details to reverse.'; end if;
  v_target := case p_table when 'incomes' then 'expenses' when 'expenses' then 'incomes' else 'transfers' end;
  v_new := public.save_money_entry(v_target, null, jsonb_build_object(
             'title', left('Reversal: ' || coalesce(v_row ->> 'title', ''), 120),
             'area', coalesce(v_row ->> 'area', 'personal'),
             'payment_mode', coalesce(v_row ->> 'payment_mode', 'personal'),
             'payer_type', 'other',
             'notes', coalesce('Reason: ' || nullif(trim(p_reason), ''), 'Reverses an earlier entry')),
           v_lines, null);
  insert into public.entry_reversals (original_table, original_id, reversal_table, reversal_id, reason)
  values (p_table, p_id, v_target, v_new, nullif(trim(p_reason), ''));
  return v_new;
end $$;

-- ---------- 5. Checklists for tasks and habits ----------
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_table text not null check (parent_table in ('tasks', 'habits')),
  parent_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  done_on date,                 -- tasks: done when set; habits: done for that day only
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists checklist_items_parent on public.checklist_items (parent_table, parent_id);
select public.setup_record_table('checklist_items');
revoke all on public.checklist_items from anon;

-- ---------- 6. AI connection (only the Edge Function URL — never an API key) ----------
create table if not exists public.ai_connection (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  function_url text not null check (function_url ~ '^https://[^ ]+$' and char_length(function_url) <= 300),
  last_status text check (last_status in ('connected', 'not_connected', 'setup_pending')),
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ai_connection enable row level security;
drop policy if exists "own_all" on public.ai_connection;
create policy "own_all" on public.ai_connection for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.ai_connection to authenticated;
revoke all on public.ai_connection from anon;

-- ---------- 7. Backup import: adds missing rows only (never overwrites, never deletes) ----------
create or replace function public.import_backup_rows(p_table text, p_rows jsonb)
returns integer language plpgsql set search_path to 'public' as $$
declare v_cols text; v_n integer;
begin
  if not (p_table = any (array[
    'accounts','categories','custom_options','clients','client_contacts','projects','campaigns','subjects','chapters','exams',
    'habits','habit_logs','tasks','events','notes','shopping_items','savings_goals','savings_entries','groups','group_members',
    'group_expenses','group_settlements','invoices','payment_requests','incomes','expenses','transfers','loans','loan_repayments',
    'payment_lines','allocations','money_links','budgets','recurring_rules','study_sessions','mock_tests','reconciliations',
    'reconciliation_adjustments','entry_reversals','checklist_items'])) then
    raise exception 'APP_ERROR: "%" can''t be imported.', p_table;
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'APP_ERROR: Backup data for "%" is not a list.', p_table; end if;
  if jsonb_array_length(p_rows) = 0 then return 0; end if;
  -- payment lines come from the backup itself, so the "older app" line maker must not add more
  perform set_config('app.money_rpc', 'on', true);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER' and column_name <> 'user_id';
  execute format('insert into public.%I (user_id, %s) select auth.uid(), %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                 p_table, v_cols, v_cols, p_table) using p_rows;
  get diagnostics v_n = row_count;
  perform set_config('app.money_rpc', 'off', true);
  return v_n;
end $$;

-- ---------- 8. Grants ----------
revoke execute on function public.import_backup_rows(text, jsonb) from public, anon;
grant execute on function public.import_backup_rows(text, jsonb) to authenticated;
revoke execute on function public.save_money_entry_with_sources(text, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_money_entry_with_sources(text, uuid, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.reverse_entry(text, uuid, text, date) from public, anon;
grant execute on function public.reverse_entry(text, uuid, text, date) to authenticated;
