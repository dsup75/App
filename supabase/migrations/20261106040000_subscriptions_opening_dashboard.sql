-- =====================================================================
-- DeepBoost Life — Subscriptions, opening balance date, budget scopes,
-- one-call Home dashboard. Only adds columns / functions; no data removed.
-- =====================================================================

-- ---------- 1. Opening balance "as on" date ----------
-- Balance = opening balance + money in/out ON or AFTER this date (empty = all entries)
alter table public.accounts add column if not exists opening_date date;

drop view if exists public.account_balances;
create view public.account_balances with (security_invoker = true) as
select a.id, a.user_id, a.name, a.type, a.upi_app, a.upi_id, a.opening_balance_paise, a.opening_date,
       (a.opening_balance_paise + coalesce((select sum(m.signed_paise) from public.account_movements m
                                             where m.account_id = a.id and (a.opening_date is null or m.txn_date >= a.opening_date)), 0))::bigint as balance_paise
  from public.accounts a
 where a.deleted_at is null;
grant select on public.account_balances to authenticated;
revoke all on public.account_balances from anon;

-- ---------- 2. Budgets: by category, by account, any date range ----------
alter table public.budgets add column if not exists account_id uuid;
alter table public.budgets add column if not exists start_date date;
alter table public.budgets add column if not exists end_date date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'budgets_account_fk') then
    alter table public.budgets add constraint budgets_account_fk foreign key (account_id, user_id) references public.accounts (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'budgets_range_check') then
    alter table public.budgets add constraint budgets_range_check
      check ((start_date is null and end_date is null) or (start_date is not null and end_date is not null and end_date >= start_date));
  end if;
end $$;
drop trigger if exists trg_links on public.budgets;
create trigger trg_links before insert or update on public.budgets for each row
  execute function public.check_parents_active('category_id:categories', 'account_id:accounts');

-- ---------- 3. Subscriptions on recurring entries ----------
alter table public.recurring_rules add column if not exists status text not null default 'active';
alter table public.recurring_rules add column if not exists end_date date;
alter table public.recurring_rules add column if not exists remind_days integer not null default 1;
alter table public.recurring_rules add column if not exists is_subscription boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_status_check') then
    alter table public.recurring_rules add constraint recurring_rules_status_check check (status in ('active', 'paused', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_remind_check') then
    alter table public.recurring_rules add constraint recurring_rules_remind_check check (remind_days between 0 and 30);
  end if;
end $$;
update public.recurring_rules set status = case when active then 'active' else 'paused' end where status = 'active' and not active;

-- "active" follows status (kept for older app versions)
create or replace function public.recurring_sync_active()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.active is distinct from old.active and new.status is not distinct from old.status then
    new.status := case when new.active then 'active' else 'paused' end;  -- old app toggled "active"
  end if;
  new.active := new.status = 'active';
  return new;
end $$;
drop trigger if exists trg_recurring_active on public.recurring_rules;
create trigger trg_recurring_active before insert or update on public.recurring_rules for each row
  execute function public.recurring_sync_active();

-- Entries created from a subscription / recurring rule (payment history + no duplicates)
do $$
declare t text;
begin
  foreach t in array array['incomes', 'expenses'] loop
    execute format('alter table public.%I add column if not exists recurring_rule_id uuid', t);
    execute format('alter table public.%I add column if not exists due_for date', t);
    if not exists (select 1 from pg_constraint where conname = t || '_recurring_fk') then
      execute format('alter table public.%I add constraint %I foreign key (recurring_rule_id, user_id) references public.recurring_rules (id, user_id)', t, t || '_recurring_fk');
    end if;
    execute format('create unique index if not exists %I on public.%I (recurring_rule_id, due_for) where deleted_at is null and recurring_rule_id is not null', t || '_recurring_once', t);
  end loop;
end $$;

-- No two live subscriptions / recurring entries with the same name and type
do $$ begin
  create unique index if not exists recurring_rules_unique_title on public.recurring_rules (user_id, kind, lower(title))
    where deleted_at is null and status <> 'cancelled';
exception when unique_violation then
  raise notice 'Existing duplicates found — unique name rule skipped';
end $$;

-- ---------- 4. Home dashboard in one call ----------
create or replace function public.home_dashboard(p_today date, p_from date, p_to date, p_six_from date, p_week date, p_day_start timestamptz)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'open', coalesce((select jsonb_agg(t order by t.due_date nulls last) from (
        select * from public.tasks where deleted_at is null and status in ('pending', 'in_progress', 'waiting')
           and (due_date <= p_today or due_date is null) order by due_date nulls last limit 200) t), '[]'::jsonb),
    'done_today', coalesce((select jsonb_agg(t) from (
        select * from public.tasks where deleted_at is null and status = 'completed' and completed_at >= p_day_start limit 200) t), '[]'::jsonb),
    'incomes', coalesce((select jsonb_agg(i order by i.txn_date desc) from public.incomes i
        where i.deleted_at is null and i.txn_date between p_from and p_to), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(e order by e.txn_date desc) from public.expenses e
        where e.deleted_at is null and e.txn_date between p_from and p_to), '[]'::jsonb),
    'six', coalesce((select jsonb_agg(jsonb_build_object('amount_paise', amount_paise, 'txn_date', txn_date, 'area', area)) from public.expenses
        where deleted_at is null and txn_date between p_six_from and p_to), '[]'::jsonb),
    'transfers', coalesce((select jsonb_agg(jsonb_build_object('amount_paise', amount_paise)) from public.transfers
        where deleted_at is null and txn_date between p_from and p_to), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(h) from public.habits h where h.deleted_at is null), '[]'::jsonb),
    'habit_logs', coalesce((select jsonb_agg(jsonb_build_object('habit_id', habit_id, 'log_date', log_date)) from public.habit_logs where log_date = p_today), '[]'::jsonb),
    'study_minutes', coalesce((select sum(minutes) from public.study_sessions where deleted_at is null and session_date = p_today), 0),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'amount_paise', i.amount_paise, 'due_date', i.due_date, 'invoice_no', i.invoice_no,
        'client_id', i.client_id, 'received_paise', coalesce(t.received_paise, 0)))
        from public.invoices i left join public.invoice_totals t on t.id = i.id where i.deleted_at is null and i.status = 'sent'), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'amount_paise', amount_paise, 'due_date', due_date, 'title', title))
        from public.payment_requests where deleted_at is null and status = 'pending'), '[]'::jsonb),
    'loans', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('principal_repaid_paise', coalesce(t.principal_repaid_paise, 0)))
        from public.loans l left join public.loan_totals t on t.id = l.id
        where l.deleted_at is null and l.due_date is not null and l.due_date <= p_week), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'event_date', event_date)) from public.events
        where deleted_at is null and event_date between p_today and p_week), '[]'::jsonb),
    'week_tasks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date)) from public.tasks
        where deleted_at is null and status in ('pending', 'in_progress', 'waiting') and due_date > p_today and due_date <= p_week), '[]'::jsonb),
    'follow_ups', (select count(*) from public.tasks where deleted_at is null and client_id is not null
        and status in ('pending', 'in_progress', 'waiting') and task_type in ('follow_up', 'approval')),
    'next_exam', (select to_jsonb(x) from public.exams x where x.deleted_at is null and x.exam_date >= p_today order by x.exam_date limit 1),
    'balance', coalesce((select sum(balance_paise) from public.account_balances), 0)
  );
$$;
revoke execute on function public.home_dashboard(date, date, date, date, date, timestamptz) from public, anon;
grant execute on function public.home_dashboard(date, date, date, date, date, timestamptz) to authenticated;
