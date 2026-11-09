-- ADDITIVE ONLY. Backup import knows the new tables (focus, revision, gadgets, health, screen time, icons).
-- Same rules as before: only missing rows are added, nothing is overwritten or deleted.

create or replace function public.import_backup_rows(p_table text, p_rows jsonb)
returns integer language plpgsql set search_path to 'public' as $$
declare v_cols text; v_n integer;
begin
  if not (p_table = any (array[
    'accounts','categories','custom_options','clients','client_contacts','projects','campaigns','subjects','chapters','exams',
    'habits','habit_logs','tasks','events','notes','shopping_items','savings_goals','savings_entries','groups','group_members',
    'group_expenses','group_settlements','invoices','payment_requests','incomes','expenses','transfers','loans','loan_repayments',
    'payment_lines','allocations','money_links','budgets','recurring_rules','study_sessions','mock_tests','reconciliations',
    'reconciliation_adjustments','entry_reversals','checklist_items',
    'focus_sessions','revision_settings','revisions','gadgets','health_profile','body_measurements','activity_daily','screen_time_daily',
    'custom_icons','entity_icons'])) then
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

revoke execute on function public.import_backup_rows(text, jsonb) from public, anon;
grant execute on function public.import_backup_rows(text, jsonb) to authenticated;

-- A study session restored from a backup does not plan a second revision (the backup has them).
create or replace function public.plan_revision_after_session()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_int integer[]; v_auto boolean;
begin
  if new.chapter_id is null or new.deleted_at is not null or coalesce(new.minutes, 0) < 1 then
    return new;
  end if;
  -- rows coming back from a backup already bring their own revisions
  if coalesce(current_setting('app.money_rpc', true), '') = 'on' then
    return new;
  end if;
  select coalesce((select auto_schedule from public.revision_settings where user_id = new.user_id), true) into v_auto;
  if not v_auto then return new; end if;
  if exists (select 1 from public.revisions r where r.user_id = new.user_id and r.chapter_id = new.chapter_id
              and r.status = 'pending' and r.deleted_at is null) then
    return new;  -- already planned: no duplicate
  end if;
  -- chapter already went through revisions? then a new study session starts a fresh cycle only if none is pending
  v_int := public.revision_intervals(new.user_id);
  insert into public.revisions (user_id, chapter_id, subject_id, study_session_id, step, interval_days, due_date)
  select new.user_id, new.chapter_id, coalesce(new.subject_id, c.subject_id), new.id, 1, v_int[1], new.session_date + v_int[1]
    from public.chapters c where c.id = new.chapter_id and c.user_id = new.user_id and c.deleted_at is null
  on conflict do nothing;
  return new;
end $$;
