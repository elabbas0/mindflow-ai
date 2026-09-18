import { env } from '../../config/env.js';
import { getSupabase } from '../../infra/supabase/client.js';

export interface UserRecord {
  telegramId: number;
  gmail: string | null;
  firstName: string | null;
  lastName: string | null;
  lang: 'az' | 'en' | null;
}

export interface UserStore {
  getOrCreate(telegramId: number): Promise<{ user: UserRecord; isNew: boolean }>;
  find(telegramId: number): Promise<UserRecord | null>;
  findByGmail(gmail: string): Promise<UserRecord | null>;
  setGmail(telegramId: number, gmail: string): Promise<UserRecord>;
  setNames(telegramId: number, firstName: string, lastName: string): Promise<UserRecord>;
  setFirstName(telegramId: number, firstName: string): Promise<UserRecord>;
  setLastName(telegramId: number, lastName: string): Promise<UserRecord>;
  setLang(telegramId: number, lang: 'az' | 'en'): Promise<UserRecord>;
}

export let namesColumnExists = true;
export let langColumnExists = true;

function isMissingLangColumn(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? String(err ?? '');
  return /\blang\b/i.test(msg) && /does not exist|Could not find/i.test(msg);
}

function userColumns(): string {
  return langColumnExists
    ? 'telegram_id, gmail, first_name, last_name, lang'
    : 'telegram_id, gmail, first_name, last_name';
}

function isMissingNamesColumn(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? String(err ?? '');
  return /first_name|last_name/i.test(msg) && /does not exist|Could not find/i.test(msg);
}

function toRecord(row: UserRow): UserRecord {
  return {
    telegramId: row.telegram_id,
    gmail: row.gmail,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    lang: row.lang === 'az' || row.lang === 'en' ? row.lang : null,
  };
}

class MemoryUserStore implements UserStore {
  private users = new Map<number, UserRecord>();

  async getOrCreate(telegramId: number): Promise<{ user: UserRecord; isNew: boolean }> {
    const existing = this.users.get(telegramId);
    if (existing) return { user: existing, isNew: false };
    const user: UserRecord = { telegramId, gmail: null, firstName: null, lastName: null, lang: null };
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

  async setNames(telegramId: number, firstName: string, lastName: string): Promise<UserRecord> {
    const { user } = await this.getOrCreate(telegramId);
    user.firstName = firstName;
    user.lastName = lastName;
    return user;
  }

  async setFirstName(telegramId: number, firstName: string): Promise<UserRecord> {
    const { user } = await this.getOrCreate(telegramId);
    user.firstName = firstName;
    return user;
  }

  async setLastName(telegramId: number, lastName: string): Promise<UserRecord> {
    const { user } = await this.getOrCreate(telegramId);
    user.lastName = lastName;
    return user;
  }

  async setLang(telegramId: number, lang: 'az' | 'en'): Promise<UserRecord> {
    const { user } = await this.getOrCreate(telegramId);
    user.lang = lang;
    return user;
  }
}

interface UserRow {
  telegram_id: number;
  gmail: string | null;
  first_name: string | null;
  last_name: string | null;
  lang?: string | null;
}

class SupabaseUserStore implements UserStore {
  async getOrCreate(telegramId: number): Promise<{ user: UserRecord; isNew: boolean }> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .select(userColumns())
        .eq('telegram_id', telegramId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        return { user: toRecord(data as unknown as UserRow), isNew: false };
      }
      const { data: created, error: insErr } = await supabase
        .from('users')
        .insert({ telegram_id: telegramId })
        .select(userColumns())
        .single();
      if (insErr) throw insErr;
      return { user: toRecord(created as unknown as UserRow), isNew: true };
    } catch (err) {
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        return this.getOrCreate(telegramId);
      }
      if (isMissingNamesColumn(err) || isMissingNamesColumn((err as Error)?.message)) {
        namesColumnExists = false;
        const supabase2 = getSupabase();
        const { data } = await supabase2.from('users').select('telegram_id, gmail').eq('telegram_id', telegramId).maybeSingle();
        if (data) {
          const r = data as unknown as { telegram_id: number; gmail: string | null };
          return { user: { telegramId: r.telegram_id, gmail: r.gmail, firstName: 'tmp', lastName: 'tmp', lang: null }, isNew: false };
        }
        const { data: created } = await supabase2.from('users').insert({ telegram_id: telegramId }).select('telegram_id, gmail').single();
        const r2 = created as unknown as { telegram_id: number; gmail: string | null };
        return { user: { telegramId: r2.telegram_id, gmail: r2.gmail, firstName: 'tmp', lastName: 'tmp', lang: null }, isNew: true };
      }
      throw err;
    }
  }

  async find(telegramId: number): Promise<UserRecord | null> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .select(userColumns())
        .eq('telegram_id', telegramId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toRecord(data as unknown as UserRow);
    } catch (err) {
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        return this.find(telegramId);
      }
      if (isMissingNamesColumn(err)) {
        namesColumnExists = false;
        const { data } = await supabase.from('users').select('telegram_id, gmail').eq('telegram_id', telegramId).maybeSingle();
        if (!data) return null;
        const r = data as unknown as { telegram_id: number; gmail: string | null };
        return { telegramId: r.telegram_id, gmail: r.gmail, firstName: 'tmp', lastName: 'tmp', lang: null };
      }
      throw err;
    }
  }

  async findByGmail(gmail: string): Promise<UserRecord | null> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .select(userColumns())
        .ilike('gmail', gmail)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toRecord(data as unknown as UserRow);
    } catch (err) {
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        return this.findByGmail(gmail);
      }
      if (isMissingNamesColumn(err)) {
        namesColumnExists = false;
        const { data } = await supabase.from('users').select('telegram_id, gmail').ilike('gmail', gmail).maybeSingle();
        if (!data) return null;
        const r = data as unknown as { telegram_id: number; gmail: string | null };
        return { telegramId: r.telegram_id, gmail: r.gmail, firstName: 'tmp', lastName: 'tmp', lang: null };
      }
      throw err;
    }
  }

  async setGmail(telegramId: number, gmail: string): Promise<UserRecord> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ gmail })
        .eq('telegram_id', telegramId)
        .select(userColumns())
        .single();
      if (error) throw error;
      return toRecord(data as unknown as UserRow);
    } catch (err) {
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        return this.setGmail(telegramId, gmail);
      }
      if (isMissingNamesColumn(err)) {
        namesColumnExists = false;
        const { data } = await supabase.from('users').update({ gmail }).eq('telegram_id', telegramId).select('telegram_id, gmail').single();
        const r = data as unknown as { telegram_id: number; gmail: string | null };
        return { telegramId: r.telegram_id, gmail: r.gmail, firstName: 'tmp', lastName: 'tmp', lang: null };
      }
      throw err;
    }
  }

  async setNames(telegramId: number, firstName: string, lastName: string): Promise<UserRecord> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ first_name: firstName, last_name: lastName })
        .eq('telegram_id', telegramId)
        .select(userColumns())
        .single();
      if (error) throw error;
      return toRecord(data as unknown as UserRow);
    } catch (err) {
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        return this.setNames(telegramId, firstName, lastName);
      }
      if (isMissingNamesColumn(err)) {
        namesColumnExists = false;
        return { telegramId, gmail: null, firstName, lastName, lang: null };
      }
      throw err;
    }
  }

  async setFirstName(telegramId: number, firstName: string): Promise<UserRecord> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ first_name: firstName })
        .eq('telegram_id', telegramId)
        .select(userColumns())
        .single();
      if (error) throw error;
      return toRecord(data as unknown as UserRow);
    } catch (err) {
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        return this.setFirstName(telegramId, firstName);
      }
      if (isMissingNamesColumn(err)) {
        namesColumnExists = false;
        return { telegramId, gmail: null, firstName, lastName: null, lang: null };
      }
      throw err;
    }
  }

  async setLastName(telegramId: number, lastName: string): Promise<UserRecord> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ last_name: lastName })
        .eq('telegram_id', telegramId)
        .select(userColumns())
        .single();
      if (error) throw error;
      return toRecord(data as unknown as UserRow);
    } catch (err) {
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        return this.setLastName(telegramId, lastName);
      }
      if (isMissingNamesColumn(err)) {
        namesColumnExists = false;
        return { telegramId, gmail: null, firstName: null, lastName, lang: null };
      }
      throw err;
    }
  }

  async setLang(telegramId: number, lang: 'az' | 'en'): Promise<UserRecord> {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ lang })
        .eq('telegram_id', telegramId)
        .select(userColumns())
        .single();
      if (error) throw error;
      return toRecord(data as unknown as UserRow);
    } catch (err) {
      // Column not migrated yet: keep the bot working, just don't remember.
      if (isMissingLangColumn(err)) {
        langColumnExists = false;
        const current = await this.find(telegramId);
        if (current) return current;
        return { telegramId, gmail: null, firstName: null, lastName: null, lang: null };
      }
      throw err;
    }
  }
}

let store: UserStore | null = null;

export function getUserStore(): UserStore {
  if (!store) store = env.STORE === 'supabase' ? new SupabaseUserStore() : new MemoryUserStore();
  return store;
}
