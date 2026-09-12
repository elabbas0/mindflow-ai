import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { getSupabase } from '../../infra/supabase/client.js';

export interface ItemRecord {
  id: string;
  userId: number;
  category: string;
  fields: Record<string, string>;
}

export interface ItemStore {
  save(item: { userId: number; category: string; fields: Record<string, string> }): Promise<ItemRecord>;
  listByUser(userId: number): Promise<ItemRecord[]>;
}

class MemoryItemStore implements ItemStore {
  private items: ItemRecord[] = [];

  async save(item: { userId: number; category: string; fields: Record<string, string> }): Promise<ItemRecord> {
    const record = { ...item, id: randomUUID() };
    this.items.push(record);
    return record;
  }

  async listByUser(userId: number): Promise<ItemRecord[]> {
    return this.items.filter((item) => item.userId === userId).reverse();
  }
}

interface ItemRow {
  id: string;
  user_id: number;
  category: string;
  fields: Record<string, string>;
}

class SupabaseItemStore implements ItemStore {
  async save(item: { userId: number; category: string; fields: Record<string, string> }): Promise<ItemRecord> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('items')
      .insert({ user_id: item.userId, category: item.category, fields: item.fields })
      .select('id, user_id, category, fields')
      .single();
    if (error) throw new Error(`Supabase item insert failed: ${error.message}`);
    const row = data as unknown as ItemRow;
    return { id: row.id, userId: row.user_id, category: row.category, fields: row.fields };
  }

  async listByUser(userId: number): Promise<ItemRecord[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('items')
      .select('id, user_id, category, fields')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`Supabase items query failed: ${error.message}`);
    return (data as unknown as ItemRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      fields: row.fields,
    }));
  }
}

let store: ItemStore | null = null;

export function getItemStore(): ItemStore {
  if (!store) store = env.STORE === 'supabase' ? new SupabaseItemStore() : new MemoryItemStore();
  return store;
}
