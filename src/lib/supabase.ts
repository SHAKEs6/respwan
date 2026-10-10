import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
}) : null;

export const isSupabaseConfigured = Boolean(supabase);
