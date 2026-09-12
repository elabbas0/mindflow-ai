import { env } from '../../config/env.js';
import { getSupabase } from '../../infra/supabase/client.js';

export interface UserRecord {
  telegramId: number;
  gmail: string | null;
}

export interface UserStore {
  getOrCreate(telegramId: number): Promise<{ user: UserRecord; isNew: boolean }>;
}

class MemoryUserStore implements UserStore {
  private users = new Map<number, UserRecord>();

  async getOrCreate(telegramId: number): Promise<{ user: UserRecord; isNew: boolean }> {
    const existing = this.users.get(telegramId);
    if (existing) return { user: existing, isNew: false };
    const user: UserRecord = { telegramId, gmail: null };
    this.users.set(telegramId, user);
    return { user, isNew: true };
  }
}

interface UserRow {
  telegram_id: number;
  gmail: string | null;
}

class SupabaseUserStore implements UserStore {
  async getOrCreate(telegramId: number): Promise<{ user: UserRecord; isNew: boolean }> {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('users')
      .select('telegram_id, gmail')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (data) {
      const row = data as unknown as UserRow;
      return { user: { telegramId: row.telegram_id, gmail: row.gmail }, isNew: false };
    }
    const { data: created, error } = await supabase
      .from('users')
      .insert({ telegram_id: telegramId })
      .select('telegram_id, gmail')
      .single();
    if (error) throw new Error(`Supabase user insert failed: ${error.message}`);
    const row = created as unknown as UserRow;
    return { user: { telegramId: row.telegram_id, gmail: row.gmail }, isNew: true };
  }
}

let store: UserStore | null = null;

export function getUserStore(): UserStore {
  if (!store) store = env.STORE === 'supabase' ? new SupabaseUserStore() : new MemoryUserStore();
  return store;
}
