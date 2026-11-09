// AI connection — like the Apps Script URL: the app only talks to YOUR Supabase Edge Function.
// The Gemini key lives in Supabase → Edge Functions → Secrets (GEMINI_API_KEY) and never in the app.
import { supabase } from './supabase';
import { PUBLIC_CONFIG } from '../config';

export type AiStatus = 'connected' | 'not_connected' | 'setup_pending';

const LOCAL_KEY = 'ai-function-url';
const projectUrl = (import.meta.env.VITE_SUPABASE_URL as string) || PUBLIC_CONFIG.supabaseUrl;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || PUBLIC_CONFIG.supabaseAnonKey;

/** The URL this project's own "assistant" function has (used when nothing is saved) */
export const DEFAULT_AI_URL = projectUrl ? `${projectUrl.replace(/\/$/, '')}/functions/v1/assistant` : '';

export function looksLikeFunctionUrl(u: string): string | null {
  const v = u.trim();
  if (!/^https:\/\/[^\s]+$/.test(v)) return 'Paste the full https:// link of your Edge Function.';
  if (/key=|AIza|apikey|secret/i.test(v)) return 'This looks like it contains a key. Paste only the function URL — keys go in Supabase Secrets.';
  if (v.length > 300) return 'This link is too long.';
  return null;
}

export function getSavedAiUrlLocal(): string {
  try {
    return localStorage.getItem(LOCAL_KEY) ?? '';
  } catch {
    return '';
  }
}

export async function loadAiConnection(): Promise<{ url: string; status: AiStatus | null }> {
  const local = getSavedAiUrlLocal();
  try {
    const { data } = await supabase.from('ai_connection').select('function_url,last_status').maybeSingle();
    if (data?.function_url) {
      try {
        localStorage.setItem(LOCAL_KEY, data.function_url);
      } catch {
        /* ignore */
      }
      return { url: data.function_url, status: (data.last_status as AiStatus) ?? null };
    }
  } catch {
    /* offline — use the phone copy */
  }
  return { url: local, status: null };
}

export async function saveAiUrl(url: string): Promise<void> {
  const v = url.trim();
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('ai_connection').upsert({ user_id: u.user?.id, function_url: v, updated_at: new Date().toISOString() });
  if (error) throw error;
  try {
    localStorage.setItem(LOCAL_KEY, v);
  } catch {
    /* ignore */
  }
}

export async function disconnectAi(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
  await supabase.from('ai_connection').delete().not('user_id', 'is', null);
}

async function recordStatus(status: AiStatus) {
  await supabase.from('ai_connection').update({ last_status: status, last_checked_at: new Date().toISOString() }).not('user_id', 'is', null);
}

/** Calls the assistant. Uses the saved URL, otherwise this project's own function. Never throws: returns {error}. */
export async function callAssistant<T = any>(body: Record<string, unknown>, timeoutMs = 45000): Promise<{ data?: T; error?: string; status?: number }> {
  const url = getSavedAiUrlLocal() || DEFAULT_AI_URL;
  if (!url) return { error: 'AI setup pending — no function URL.' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.session?.access_token ?? anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* not json */
    }
    if (!res.ok || json?.error) return { error: json?.error ?? `HTTP ${res.status}`, status: res.status, data: json };
    return { data: json as T, status: res.status };
  } catch (e) {
    return { error: (e as Error).name === 'AbortError' ? 'The AI took too long to answer.' : 'Could not reach the AI function (check internet / URL).' };
  } finally {
    clearTimeout(t);
  }
}

/** Sends a tiny test message. Never throws. */
export async function testAiConnection(): Promise<{ status: AiStatus; message: string }> {
  const r = await callAssistant<{ ok?: boolean; key?: boolean; answer?: string }>({ mode: 'ping' }, 20000);
  let out: { status: AiStatus; message: string };
  if (r.data?.ok && r.data.key) out = { status: 'connected', message: 'AI Connected ✅' };
  else if (r.data?.ok && r.data.key === false) out = { status: 'setup_pending', message: 'Add your Gemini API key above, then test again.' };
  else if (r.error && /api key/i.test(r.error)) out = { status: 'setup_pending', message: 'Add your Gemini API key above, then test again.' };
  else if (r.status === 404 || r.status === 401 || r.status === 403) out = { status: 'not_connected', message: 'AI setup pending — Function URL check karo.' };
  else if (r.data && !r.error) out = { status: 'connected', message: 'AI Connected ✅' };
  else out = { status: 'not_connected', message: `AI setup pending — Function URL check karo / Secret check karo. (${r.error ?? 'no answer'})` };
  recordStatus(out.status).catch(() => {});
  return out;
}

/* ---------- the user's own Gemini key (stored encrypted in Supabase Vault; the app can never read it back) ---------- */
export async function aiKeyInfo(): Promise<{ last4: string; updated_at: string } | null> {
  const { data, error } = await supabase.from('ai_keys').select('last4, updated_at').maybeSingle();
  if (error || !data) return null;
  return data as { last4: string; updated_at: string };
}

export async function saveAiKey(key: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_ai_key', { p_key: key.trim() });
  if (error) throw error;
  return String(data);
}

export async function removeAiKey(): Promise<void> {
  const { error } = await supabase.rpc('clear_ai_key');
  if (error) throw error;
}
