-- =====================================================================
-- DeepBoost Life — Bill / screenshot photos on any record
-- Files live in a private Storage bucket under <user_id>/...
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "attachments_own_select" on storage.objects;
create policy "attachments_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "attachments_own_insert" on storage.objects;
create policy "attachments_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "attachments_own_delete" on storage.objects;
create policy "attachments_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_table text not null check (char_length(parent_table) between 1 and 40),
  parent_id uuid not null,
  path text not null unique check (split_part(path, '/', 1) = user_id::text),
  mime text,
  size_bytes integer,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index if not exists attachments_parent on public.attachments (parent_table, parent_id);
select public.setup_record_table('attachments');
-- photos can be removed straight away (the file is removed too)
drop policy if exists "own_delete" on public.attachments;
create policy "own_delete" on public.attachments for delete using (user_id = (select auth.uid()));
