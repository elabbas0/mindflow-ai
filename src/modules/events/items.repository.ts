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
  getById(id: string): Promise<ItemRecord | null>;
  update(id: string, patch: { category?: string; fields?: Record<string, string> }): Promise<ItemRecord | null>;
  delete(id: string): Promise<boolean>;
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

  async getById(id: string): Promise<ItemRecord | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async update(
    id: string,
    patch: { category?: string; fields?: Record<string, string> },
  ): Promise<ItemRecord | null> {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    if (patch.category !== undefined) item.category = patch.category;
    if (patch.fields !== undefined) item.fields = { ...item.fields, ...patch.fields };
    return item;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    return true;
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

  async getById(id: string): Promise<ItemRecord | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('items')
      .select('id, user_id, category, fields')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Supabase item query failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as ItemRow;
    return { id: row.id, userId: row.user_id, category: row.category, fields: row.fields };
  }

  async update(
    id: string,
    patch: { category?: string; fields?: Record<string, string> },
  ): Promise<ItemRecord | null> {
    const supabase = getSupabase();
    const current = await this.getById(id);
    if (!current) return null;
    const { data, error } = await supabase
      .from('items')
      .update({
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.fields !== undefined ? { fields: { ...current.fields, ...patch.fields } } : {}),
      })
      .eq('id', id)
      .select('id, user_id, category, fields')
      .single();
    if (error) throw new Error(`Supabase item update failed: ${error.message}`);
    const row = data as unknown as ItemRow;
    return { id: row.id, userId: row.user_id, category: row.category, fields: row.fields };
  }

  async delete(id: string): Promise<boolean> {
    const supabase = getSupabase();
    const { error, count } = await supabase.from('items').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(`Supabase item delete failed: ${error.message}`);
    return (count ?? 0) > 0;
  }
}

let store: ItemStore | null = null;

export function getItemStore(): ItemStore {
  if (!store) store = env.STORE === 'supabase' ? new SupabaseItemStore() : new MemoryItemStore();
  return store;
}
