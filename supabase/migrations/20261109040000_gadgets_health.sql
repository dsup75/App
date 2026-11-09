-- ADDITIVE ONLY. Gadgets hub, body measurements (scale), daily activity and screen-time totals.
-- No existing table is changed.

-- ---------- 1. Gadgets (devices the user added) ----------
create table if not exists public.gadgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'other' check (kind in ('scale', 'watch', 'earbuds', 'phone', 'other')),
  model text check (model is null or char_length(model) <= 80),
  companion_app text check (companion_app is null or char_length(companion_app) <= 80),
  ble_address text check (ble_address is null or ble_address ~ '^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$'),
  category text check (category is null or char_length(category) <= 40),
  last_sync_at timestamptz,
  last_status text check (last_status is null or char_length(last_status) <= 200),
  settings jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
select public.setup_record_table('gadgets');
revoke all on public.gadgets from anon;

-- ---------- 2. Health profile (height for BMI) ----------
create table if not exists public.health_profile (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  height_cm numeric(5,1) check (height_cm is null or height_cm between 50 and 250),
  weight_goal_kg numeric(5,2) check (weight_goal_kg is null or weight_goal_kg between 10 and 400),
  screen_goal_minutes integer check (screen_goal_minutes is null or screen_goal_minutes between 10 and 1440),
  updated_at timestamptz not null default now()
);
alter table public.health_profile enable row level security;
drop policy if exists "own_all" on public.health_profile;
create policy "own_all" on public.health_profile for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.health_profile to authenticated;
revoke all on public.health_profile from anon;

-- ---------- 3. Body measurements (manual or from a device) ----------
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight_kg numeric(5,2) not null check (weight_kg between 10 and 400),
  bmi numeric(4,1) check (bmi is null or bmi between 5 and 100),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or body_fat_pct between 1 and 80),
  muscle_kg numeric(5,2) check (muscle_kg is null or muscle_kg between 1 and 200),
  bone_kg numeric(4,2) check (bone_kg is null or bone_kg between 0.1 and 20),
  water_pct numeric(4,1) check (water_pct is null or water_pct between 10 and 90),
  visceral_fat numeric(4,1) check (visceral_fat is null or visceral_fat between 0 and 60),
  bmr_kcal integer check (bmr_kcal is null or bmr_kcal between 300 and 6000),
  metabolic_age integer check (metabolic_age is null or metabolic_age between 5 and 120),
  source text not null default 'manual' check (source in ('manual', 'scale_ble', 'health_connect')),
  gadget_id uuid,
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (gadget_id, user_id) references public.gadgets (id, user_id)
);
-- full (not partial) so app upserts can use it; a deleted synced reading is not re-added
create unique index if not exists body_measurements_no_dup on public.body_measurements (user_id, measured_at, source);
create index if not exists body_measurements_time on public.body_measurements (user_id, measured_at desc) where deleted_at is null;
select public.setup_record_table('body_measurements');
revoke all on public.body_measurements from anon;

-- ---------- 4. Daily activity (from Health Connect or a watch) ----------
create table if not exists public.activity_daily (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  source text not null check (source in ('health_connect', 'watch_ble', 'manual')),
  steps integer check (steps is null or steps between 0 and 200000),
  distance_m integer check (distance_m is null or distance_m between 0 and 500000),
  calories_kcal integer check (calories_kcal is null or calories_kcal between 0 and 20000),
  heart_rate_avg integer check (heart_rate_avg is null or heart_rate_avg between 20 and 250),
  sleep_minutes integer check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, source)
);
alter table public.activity_daily enable row level security;
drop policy if exists "own_all" on public.activity_daily;
create policy "own_all" on public.activity_daily for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.activity_daily to authenticated;
revoke all on public.activity_daily from anon;

-- ---------- 5. Screen time: only the daily total (app-wise data stays on the phone) ----------
create table if not exists public.screen_time_daily (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  total_minutes integer not null check (total_minutes between 0 and 1440),
  unlocks integer check (unlocks is null or unlocks >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.screen_time_daily enable row level security;
drop policy if exists "own_all" on public.screen_time_daily;
create policy "own_all" on public.screen_time_daily for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.screen_time_daily to authenticated;
revoke all on public.screen_time_daily from anon;
