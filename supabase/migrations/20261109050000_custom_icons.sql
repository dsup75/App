-- ADDITIVE ONLY. Universal custom icons & logos.
-- Uploaded images live in a private Storage bucket "icons" under <user_id>/...
-- entity_icons links an icon (library name or uploaded image) to any record, without changing existing tables.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('icons', 'icons', false, 524288, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "icons_own_select" on storage.objects;
create policy "icons_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'icons' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "icons_own_insert" on storage.objects;
create policy "icons_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'icons' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "icons_own_delete" on storage.objects;
create policy "icons_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'icons' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- uploaded icons ----------
create table if not exists public.custom_icons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null check (char_length(path) between 3 and 300),
  name text check (name is null or char_length(name) <= 60),
  mime text not null default 'image/png' check (mime in ('image/png', 'image/webp', 'image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 524288),
  keep_colors boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  unique (user_id, path),
  check (split_part(path, '/', 1) = user_id::text)
);
select public.setup_record_table('custom_icons');
revoke all on public.custom_icons from anon;

-- ---------- which record uses which icon ----------
create table if not exists public.entity_icons (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_table text not null check (entity_table ~ '^[a-z_]{2,40}$'),
  entity_id text not null check (char_length(entity_id) between 1 and 80),
  kind text not null check (kind in ('library', 'custom')),
  library_name text check (library_name is null or library_name ~ '^[A-Za-z0-9]{2,40}$'),
  custom_icon_id uuid,
  tone text check (tone is null or tone in ('primary', 'income', 'expense', 'muted', 'blue', 'violet', 'amber', 'pink', 'teal', 'none')),
  fit text not null default 'contain' check (fit in ('contain', 'cover')),
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_table, entity_id),
  foreign key (custom_icon_id, user_id) references public.custom_icons (id, user_id) on delete cascade,
  check ((kind = 'library' and library_name is not null) or (kind = 'custom' and custom_icon_id is not null))
);
alter table public.entity_icons enable row level security;
drop policy if exists "own_all" on public.entity_icons;
create policy "own_all" on public.entity_icons for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.entity_icons to authenticated;
revoke all on public.entity_icons from anon;
