-- ADDITIVE ONLY. Lets the user paste their Gemini API key in the app (Settings → AI).
-- The key is stored ENCRYPTED in Supabase Vault. The app can only save or remove it — it can never
-- read it back (only the last 4 characters are shown). Only the "assistant" Edge Function (service role)
-- can read it, to call Gemini for that same user.

create table if not exists public.ai_keys (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  provider text not null default 'gemini' check (provider in ('gemini')),
  secret_id uuid not null,
  last4 text not null check (char_length(last4) = 4),
  updated_at timestamptz not null default now()
);
alter table public.ai_keys enable row level security;
drop policy if exists "own_read" on public.ai_keys;
create policy "own_read" on public.ai_keys for select using (user_id = (select auth.uid()));
revoke all on public.ai_keys from anon, authenticated;
grant select (user_id, provider, last4, updated_at) on public.ai_keys to authenticated;

create or replace function public.set_ai_key(p_key text)
returns text language plpgsql security definer set search_path to 'public', 'vault' as $$
declare v_uid uuid := auth.uid(); v_key text := btrim(coalesce(p_key, '')); v_secret uuid;
begin
  if v_uid is null then raise exception 'APP_ERROR: Please sign in again.'; end if;
  if v_key !~ '^[A-Za-z0-9_\-]{30,120}$' then
    raise exception 'APP_ERROR: This does not look like an API key. Copy it again from aistudio.google.com (it usually starts with AIza).';
  end if;
  select secret_id into v_secret from public.ai_keys where user_id = v_uid;
  if v_secret is not null and exists (select 1 from vault.secrets where id = v_secret) then
    perform vault.update_secret(v_secret, v_key);
  else
    v_secret := vault.create_secret(v_key, 'ai-gemini-' || v_uid::text || '-' || extract(epoch from now())::bigint::text, 'Gemini key for DeepBoost Life user');
  end if;
  insert into public.ai_keys (user_id, provider, secret_id, last4, updated_at)
  values (v_uid, 'gemini', v_secret, right(v_key, 4), now())
  on conflict (user_id) do update set secret_id = excluded.secret_id, last4 = excluded.last4, updated_at = now();
  return right(v_key, 4);
end $$;

create or replace function public.clear_ai_key()
returns void language plpgsql security definer set search_path to 'public', 'vault' as $$
declare v_secret uuid;
begin
  select secret_id into v_secret from public.ai_keys where user_id = auth.uid();
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  delete from public.ai_keys where user_id = auth.uid();
end $$;

-- Only the Edge Function (service role) may call this.
create or replace function public.ai_key_for_user(p_user uuid)
returns text language sql stable security definer set search_path to 'public', 'vault' as $$
  select d.decrypted_secret from public.ai_keys k join vault.decrypted_secrets d on d.id = k.secret_id where k.user_id = p_user;
$$;

revoke execute on function public.set_ai_key(text), public.clear_ai_key(), public.ai_key_for_user(uuid) from public, anon;
grant execute on function public.set_ai_key(text), public.clear_ai_key() to authenticated;
revoke execute on function public.ai_key_for_user(uuid) from authenticated;
grant execute on function public.ai_key_for_user(uuid) to service_role;
