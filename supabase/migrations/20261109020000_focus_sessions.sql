-- ADDITIVE ONLY. Focus-mode (app blocker) session history. No existing table is changed.
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  planned_minutes integer not null default 0 check (planned_minutes between 0 and 1440),
  focused_minutes integer not null default 0 check (focused_minutes between 0 and 1440),
  blocked_attempts integer not null default 0 check (blocked_attempts >= 0),
  mode text not null default 'block' check (mode in ('block', 'allow')),
  apps_count integer not null default 0,
  end_reason text not null default 'completed' check (end_reason in ('completed', 'stopped', 'emergency_exit', 'replaced', 'break')),
  method text check (method in ('accessibility', 'usage_stats')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  unique (user_id, started_at)
);
create index if not exists focus_sessions_user_time on public.focus_sessions (user_id, started_at desc) where deleted_at is null;
select public.setup_record_table('focus_sessions');
revoke all on public.focus_sessions from anon;
