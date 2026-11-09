-- ADDITIVE ONLY. Smart revision (spaced repetition). Existing study tables are not changed;
-- only a new trigger on study_sessions that adds a revision plan, and chapters.revision_count is
-- increased when the user marks a revision done (that column already exists for this purpose).

-- ---------- 1. Per-user intervals (default Day 1, 3, 7, 14, 30) ----------
create table if not exists public.revision_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  intervals integer[] not null default '{1,3,7,14,30}',
  auto_schedule boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint revision_settings_intervals_ok check (
    cardinality(intervals) between 1 and 10 and 1 <= all (intervals) and 365 >= all (intervals))
);
alter table public.revision_settings enable row level security;
drop policy if exists "own_all" on public.revision_settings;
create policy "own_all" on public.revision_settings for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.revision_settings to authenticated;
revoke all on public.revision_settings from anon;

create or replace function public.revision_intervals(p_user uuid)
returns integer[] language sql stable set search_path to 'public' as $$
  select coalesce((select intervals from public.revision_settings where user_id = p_user), '{1,3,7,14,30}'::integer[]);
$$;

-- ---------- 2. Revisions ----------
create table if not exists public.revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chapter_id uuid not null,
  subject_id uuid,
  study_session_id uuid,
  step integer not null default 1 check (step between 1 and 50),
  interval_days integer not null check (interval_days between 0 and 365),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  feedback text check (feedback in ('easy', 'moderate', 'difficult')),
  done_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (chapter_id, user_id) references public.chapters (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id),
  foreign key (study_session_id, user_id) references public.study_sessions (id, user_id),
  check (status <> 'done' or feedback is not null)
);
-- never two open revisions for the same chapter
create unique index if not exists revisions_one_pending on public.revisions (user_id, chapter_id) where status = 'pending' and deleted_at is null;
create index if not exists revisions_due on public.revisions (user_id, due_date) where status = 'pending' and deleted_at is null;
create index if not exists revisions_chapter on public.revisions (user_id, chapter_id, created_at desc);
select public.setup_record_table('revisions');
revoke all on public.revisions from anon;

-- ---------- 3. Plan the first revision after a chapter study session ----------
create or replace function public.plan_revision_after_session()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_int integer[]; v_auto boolean;
begin
  if new.chapter_id is null or new.deleted_at is not null or coalesce(new.minutes, 0) < 1 then
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

drop trigger if exists trg_plan_revision on public.study_sessions;
create trigger trg_plan_revision after insert on public.study_sessions
  for each row execute function public.plan_revision_after_session();

-- ---------- 4. Manually start a revision plan for a chapter ----------
create or replace function public.start_revision_plan(p_chapter_id uuid, p_first_date date default null)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_id uuid; v_int integer[]; v_subject uuid;
begin
  select id into v_id from public.revisions
   where user_id = auth.uid() and chapter_id = p_chapter_id and status = 'pending' and deleted_at is null;
  if v_id is not null then return v_id; end if;
  select subject_id into v_subject from public.chapters where id = p_chapter_id and user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'APP_ERROR: Chapter not found.'; end if;
  v_int := public.revision_intervals(auth.uid());
  insert into public.revisions (chapter_id, subject_id, step, interval_days, due_date)
  values (p_chapter_id, v_subject, 1, v_int[1], coalesce(p_first_date, current_date + v_int[1]))
  returning id into v_id;
  return v_id;
end $$;

-- ---------- 5. Mark a revision done with feedback and plan the next one ----------
-- easy      -> next step, interval x1.5 (rounded)
-- moderate  -> next step, normal interval
-- difficult -> same step again, half the interval (min 1 day)
-- After the last step with easy/moderate the cycle is complete (nothing more is planned).
create or replace function public.complete_revision(p_id uuid, p_feedback text, p_done_on date default current_date, p_notes text default null)
returns jsonb language plpgsql set search_path to 'public' as $$
declare r public.revisions; v_int integer[]; v_n integer; v_step integer; v_days integer; v_next uuid; v_complete boolean := false;
begin
  if p_feedback not in ('easy', 'moderate', 'difficult') then
    raise exception 'APP_ERROR: Choose Easy, Moderate or Difficult.';
  end if;
  select * into r from public.revisions where id = p_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'APP_ERROR: Revision not found.'; end if;
  if r.status <> 'pending' then raise exception 'APP_ERROR: This revision is already %.', r.status; end if;

  update public.revisions set status = 'done', feedback = p_feedback, done_at = now(),
         notes = coalesce(p_notes, notes) where id = p_id;
  update public.chapters set revision_count = revision_count + 1
   where id = r.chapter_id and user_id = auth.uid();

  v_int := public.revision_intervals(auth.uid());
  v_n := cardinality(v_int);
  if p_feedback = 'difficult' then
    v_step := r.step;
    v_days := greatest(1, (v_int[least(r.step, v_n)] + 1) / 2);
  else
    v_step := r.step + 1;
    if v_step > v_n then
      v_complete := true;
    else
      v_days := v_int[v_step];
      if p_feedback = 'easy' then v_days := least(365, round(v_days * 1.5)::integer); end if;
    end if;
  end if;

  if not v_complete then
    insert into public.revisions (chapter_id, subject_id, study_session_id, step, interval_days, due_date)
    values (r.chapter_id, r.subject_id, r.study_session_id, v_step, v_days, p_done_on + v_days)
    returning id into v_next;
  end if;
  return jsonb_build_object('next_id', v_next, 'next_due', case when v_next is null then null else p_done_on + v_days end,
                            'cycle_complete', v_complete, 'step', v_step);
end $$;

-- ---------- 6. Move a revision to another day (or skip it) ----------
create or replace function public.reschedule_revision(p_id uuid, p_date date)
returns void language plpgsql set search_path to 'public' as $$
begin
  update public.revisions set due_date = p_date
   where id = p_id and user_id = auth.uid() and status = 'pending' and deleted_at is null;
  if not found then raise exception 'APP_ERROR: Revision not found or already done.'; end if;
end $$;

-- ---------- 7. Handy view for lists ----------
create or replace view public.revision_queue with (security_invoker = true) as
select r.id, r.user_id, r.chapter_id, r.subject_id, r.step, r.interval_days, r.due_date, r.status, r.feedback, r.done_at, r.notes,
       c.name as chapter_name, s.name as subject_name, c.revision_count,
       (select count(*) from public.revisions x where x.user_id = r.user_id and x.chapter_id = r.chapter_id and x.status = 'done' and x.deleted_at is null) as done_count
  from public.revisions r
  join public.chapters c on c.id = r.chapter_id and c.user_id = r.user_id and c.deleted_at is null
  left join public.subjects s on s.id = r.subject_id and s.user_id = r.user_id
 where r.deleted_at is null;

grant select on public.revision_queue to authenticated;
revoke all on public.revision_queue from anon;
grant execute on function public.start_revision_plan(uuid, date), public.complete_revision(uuid, text, date, text),
  public.reschedule_revision(uuid, date), public.revision_intervals(uuid) to authenticated;
revoke execute on function public.start_revision_plan(uuid, date), public.complete_revision(uuid, text, date, text),
  public.reschedule_revision(uuid, date), public.revision_intervals(uuid) from anon;
