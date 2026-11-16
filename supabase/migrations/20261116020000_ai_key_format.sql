-- Gemini key save: accept every key format Google issues (old "AIza…" and newer ones with dots),
-- and clean up spaces / quotes / line breaks that come with copy-paste. Same function, looser check.
create or replace function public.set_ai_key(p_key text)
returns text language plpgsql security definer set search_path to 'public', 'vault' as $$
declare
  v_uid uuid := auth.uid();
  v_key text := regexp_replace(coalesce(p_key, ''), '[\s"''`<>]', '', 'g');
  v_secret uuid;
begin
  if v_uid is null then raise exception 'APP_ERROR: Please sign in again.'; end if;
  if v_key ~* '^key[:=]' then v_key := substr(v_key, 5); end if;
  if v_key !~ '^[A-Za-z0-9_.\-]{20,200}$' then
    raise exception 'APP_ERROR: This does not look like an API key (% letters, has symbols that keys never have). Copy it again from aistudio.google.com → Get API key → Copy.', char_length(v_key);
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
revoke execute on function public.set_ai_key(text) from public, anon;
grant execute on function public.set_ai_key(text) to authenticated;
