-- ADDITIVE ONLY. Focus-timer sessions for Business and Personal work (Study sessions keep going to
-- study_sessions as before). Lets the timer show what each block of time was used for.
create table if not exists public.timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('business', 'personal')),
  title text not null default 'Focus' check (char_length(title) between 1 and 120),
  minutes integer not null check (minutes between 1 and 1440),
  session_date date not null default current_date,
  started_at timestamptz,
  client_id uuid,
  project_id uuid,
  label text check (label is null or char_length(label) <= 60),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id)
);
create index if not exists timer_sessions_user_day on public.timer_sessions (user_id, session_date desc) where deleted_at is null;
select public.setup_record_table('timer_sessions');
revoke all on public.timer_sessions from anon;

-- backup import knows this table
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
    'custom_icons','entity_icons','timer_sessions'])) then
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
