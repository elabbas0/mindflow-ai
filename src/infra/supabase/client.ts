import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { NotConfiguredError } from '../../shared/errors.js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new NotConfiguredError('Supabase');
  }
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}
