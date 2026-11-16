-- Health care modules (new, additive only — no existing table, view or function changes except the backup whitelist):
-- 1. medicines + medicine_logs (dose times, before/after food, stock that goes down when you mark a dose taken)
-- 2. vitals (BP, sugar, pulse, SpO2, temperature) — weight stays in body_measurements
-- 3. doctor_appointments + medical_documents (files use the existing private 'attachments' bucket)
-- 4. water_logs, sleep_logs, wellness_settings (water goal)

-- ---------- 1. Medicines ----------
create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  dose text check (dose is null or char_length(dose) <= 40),
  form text not null default 'tablet' check (form in ('tablet', 'capsule', 'syrup', 'injection', 'drops', 'inhaler', 'cream', 'other')),
  for_person text check (for_person is null or char_length(for_person) <= 60),
  take_morning boolean not null default true,
  morning_time time default '08:00',
  take_afternoon boolean not null default false,
  afternoon_time time default '14:00',
  take_night boolean not null default false,
  night_time time default '21:00',
  per_dose integer not null default 1 check (per_dose between 1 and 50),
  food text not null default 'after' check (food in ('before', 'after', 'with', 'any')),
  start_date date not null default current_date,
  end_date date,
  stock_qty integer check (stock_qty is null or stock_qty between 0 and 100000),
  low_stock_days integer not null default 5 check (low_stock_days between 1 and 60),
  reminders boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'finished')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists medicines_user on public.medicines (user_id, status) where deleted_at is null;
select public.setup_record_table('medicines');
revoke all on public.medicines from anon;

create table if not exists public.medicine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  medicine_id uuid not null,
  slot text not null default 'morning' check (slot in ('morning', 'afternoon', 'night', 'extra')),
  taken_on date not null default current_date,
  status text not null default 'taken' check (status in ('taken', 'skipped')),
  qty integer not null default 1 check (qty between 0 and 50),
  taken_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (medicine_id, user_id) references public.medicines (id, user_id) on delete cascade
);
create index if not exists medicine_logs_day on public.medicine_logs (user_id, taken_on desc) where deleted_at is null;
create index if not exists medicine_logs_med on public.medicine_logs (medicine_id) where deleted_at is null;
select public.setup_record_table('medicine_logs');
revoke all on public.medicine_logs from anon;

-- stock follows the log: a "taken" dose uses tablets; deleting it (or marking skipped) puts them back
create or replace function public.medicine_stock_follow_log()
returns trigger language plpgsql set search_path = public as $$
declare
  v_old integer := 0;
  v_new integer := 0;
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is null and old.status = 'taken' then v_old := old.qty; end if;
  end if;
  if new.deleted_at is null and new.status = 'taken' then v_new := new.qty; end if;
  if v_new <> v_old then
    update public.medicines
       set stock_qty = greatest(0, stock_qty - (v_new - v_old))
     where id = new.medicine_id and user_id = new.user_id and stock_qty is not null;
  end if;
  return null;
end $$;
drop trigger if exists trg_medicine_stock on public.medicine_logs;
create trigger trg_medicine_stock after insert or update of deleted_at, status, qty on public.medicine_logs
  for each row execute function public.medicine_stock_follow_log();

-- ---------- 2. Vitals ----------
create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'bp' check (kind in ('bp', 'sugar', 'pulse', 'spo2', 'temperature')),
  systolic integer check (systolic is null or systolic between 50 and 260),
  diastolic integer check (diastolic is null or diastolic between 30 and 180),
  pulse integer check (pulse is null or pulse between 25 and 250),
  sugar_mgdl integer check (sugar_mgdl is null or sugar_mgdl between 20 and 700),
  sugar_timing text check (sugar_timing is null or sugar_timing in ('fasting', 'after_meal', 'random', 'bedtime')),
  spo2 integer check (spo2 is null or spo2 between 50 and 100),
  temperature_f numeric(4,1) check (temperature_f is null or temperature_f between 90 and 110),
  measured_on date not null default current_date,
  measured_time time,
  for_person text check (for_person is null or char_length(for_person) <= 60),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check (
    (kind = 'bp' and systolic is not null and diastolic is not null and systolic > diastolic)
    or (kind = 'sugar' and sugar_mgdl is not null)
    or (kind = 'pulse' and pulse is not null)
    or (kind = 'spo2' and spo2 is not null)
    or (kind = 'temperature' and temperature_f is not null)
  )
);
create index if not exists vitals_user_day on public.vitals (user_id, kind, measured_on desc) where deleted_at is null;
select public.setup_record_table('vitals');
revoke all on public.vitals from anon;

-- ---------- 3. Doctor appointments + medical vault ----------
create table if not exists public.doctor_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doctor_name text not null check (char_length(doctor_name) between 1 and 80),
  speciality text check (speciality is null or char_length(speciality) <= 60),
  clinic text check (clinic is null or char_length(clinic) <= 100),
  address text check (address is null or char_length(address) <= 200),
  phone text check (phone is null or char_length(phone) <= 20),
  appointment_date date not null default current_date,
  appointment_time time,
  for_person text check (for_person is null or char_length(for_person) <= 60),
  reason text check (reason is null or char_length(reason) <= 300),
  status text not null default 'upcoming' check (status in ('upcoming', 'done', 'cancelled', 'missed')),
  reminders boolean not null default true,
  doctor_notes text check (doctor_notes is null or char_length(doctor_notes) <= 3000),
  follow_up_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists appointments_user_day on public.doctor_appointments (user_id, appointment_date) where deleted_at is null;
select public.setup_record_table('doctor_appointments');
revoke all on public.doctor_appointments from anon;

create table if not exists public.medical_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  doc_type text not null default 'prescription' check (doc_type in ('prescription', 'report', 'scan', 'bill', 'vaccination', 'discharge', 'other')),
  doc_date date not null default current_date,
  doctor_name text check (doctor_name is null or char_length(doctor_name) <= 80),
  for_person text check (for_person is null or char_length(for_person) <= 60),
  appointment_id uuid,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (appointment_id, user_id) references public.doctor_appointments (id, user_id)
);
create index if not exists medical_docs_user on public.medical_documents (user_id, doc_date desc) where deleted_at is null;
select public.setup_record_table('medical_documents');
revoke all on public.medical_documents from anon;

-- ---------- 4. Water, sleep, settings ----------
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  ml integer not null check (ml between 10 and 3000),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists water_user_day on public.water_logs (user_id, logged_on desc) where deleted_at is null;
select public.setup_record_table('water_logs');
revoke all on public.water_logs from anon;

create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sleep_date date not null default current_date,
  bed_time time not null default '23:00',
  wake_time time not null default '07:00',
  quality text not null default 'good' check (quality in ('poor', 'okay', 'good', 'great')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists sleep_user_day on public.sleep_logs (user_id, sleep_date desc) where deleted_at is null;
select public.setup_record_table('sleep_logs');
revoke all on public.sleep_logs from anon;

create table if not exists public.wellness_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  water_goal_ml integer not null default 2500 check (water_goal_ml between 500 and 8000),
  glass_ml integer not null default 250 check (glass_ml between 50 and 1000),
  sleep_goal_minutes integer not null default 480 check (sleep_goal_minutes between 180 and 840),
  water_reminders boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.wellness_settings enable row level security;
drop policy if exists "own_all" on public.wellness_settings;
create policy "own_all" on public.wellness_settings for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.wellness_settings to authenticated;
revoke all on public.wellness_settings from anon;

-- ---------- 5. Backup import knows the new tables (same function, longer list) ----------
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
    'custom_icons','entity_icons','timer_sessions','insurance_policies','credit_scores',
    'medicines','medicine_logs','vitals','doctor_appointments','medical_documents','water_logs','sleep_logs','wellness_settings'])) then
    raise exception 'APP_ERROR: "%" can''t be imported.', p_table;
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'APP_ERROR: Backup data for "%" is not a list.', p_table; end if;
  if jsonb_array_length(p_rows) = 0 then return 0; end if;
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
