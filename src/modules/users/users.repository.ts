import { env } from '../../config/env.js';
import { getSupabase } from '../../infra/supabase/client.js';

export interface UserRecord {
  telegramId: number;
  gmail: string | null;
}

export interface UserStore {
  getOrCreate(telegramId: number): Promise<{ user: UserRecord; isNew: boolean }>;
  find(telegramId: number): Promise<UserRecord | null>;
  findByGmail(gmail: string): Promise<UserRecord | null>;
  setGmail(telegramId: number, gmail: string): Promise<UserRecord>;
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

  async find(telegramId: number): Promise<UserRecord | null> {
    return this.users.get(telegramId) ?? null;
  }

  async findByGmail(gmail: string): Promise<UserRecord | null> {
    const wanted = gmail.toLowerCase();
    for (const user of this.users.values()) {
      if (user.gmail?.toLowerCase() === wanted) return user;
    }
    return null;
  }

  async setGmail(telegramId: number, gmail: string): Promise<UserRecord> {
    const { user } = await this.getOrCreate(telegramId);
    user.gmail = gmail;
    return user;
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

  async find(telegramId: number): Promise<UserRecord | null> {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('users')
      .select('telegram_id, gmail')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (!data) return null;
    const row = data as unknown as UserRow;
    return { telegramId: row.telegram_id, gmail: row.gmail };
  }

  async findByGmail(gmail: string): Promise<UserRecord | null> {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('users')
      .select('telegram_id, gmail')
      .ilike('gmail', gmail)
      .maybeSingle();
    if (!data) return null;
    const row = data as unknown as UserRow;
    return { telegramId: row.telegram_id, gmail: row.gmail };
  }

  async setGmail(telegramId: number, gmail: string): Promise<UserRecord> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('users')
      .update({ gmail })
      .eq('telegram_id', telegramId)
      .select('telegram_id, gmail')
      .single();
    if (error) throw new Error(`Supabase gmail update failed: ${error.message}`);
    const row = data as unknown as UserRow;
    return { telegramId: row.telegram_id, gmail: row.gmail };
  }
}

let store: UserStore | null = null;

export function getUserStore(): UserStore {
  if (!store) store = env.STORE === 'supabase' ? new SupabaseUserStore() : new MemoryUserStore();
  return store;
}
