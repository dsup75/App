import { createClient } from '@supabase/supabase-js';
import { PUBLIC_CONFIG } from '../config';

// Build-time env (GitHub secrets) wins; otherwise the public config file is used.
// The anon/publishable key is public by design — data is protected by Row Level Security.
const url = import.meta.env.VITE_SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || PUBLIC_CONFIG.supabaseAnonKey;

export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'));

export const supabase = createClient(isConfigured ? url : 'https://not-configured.supabase.co', key || 'none', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
