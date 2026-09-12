import { env } from '../../config/env.js';
import { getSupabase } from '../../infra/supabase/client.js';

export type CaptureStatus = 'idle' | 'awaiting_category' | 'awaiting_field';

export interface Draft {
  rawText: string;
  category?: string;
  fields: Record<string, string>;
}

export interface Session {
  chatId: number;
  userId: number;
  status: CaptureStatus;
  draft: Draft;
  pendingField?: string;
}

export interface SessionStore {
  get(chatId: number): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(chatId: number): Promise<void>;
}

class MemorySessionStore implements SessionStore {
  private sessions = new Map<number, Session>();

  async get(chatId: number): Promise<Session | null> {
    return this.sessions.get(chatId) ?? null;
  }

  async save(session: Session): Promise<void> {
    this.sessions.set(session.chatId, session);
  }

  async clear(chatId: number): Promise<void> {
    this.sessions.delete(chatId);
  }
}

interface SessionRow {
  chat_id: number;
  user_id: number;
  status: CaptureStatus;
  draft: Draft;
  pending_field: string | null;
}

class SupabaseSessionStore implements SessionStore {
  async get(chatId: number): Promise<Session | null> {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('sessions')
      .select('chat_id, user_id, status, draft, pending_field')
      .eq('chat_id', chatId)
      .maybeSingle();
    if (!data) return null;
    const row = data as unknown as SessionRow;
    return {
      chatId: row.chat_id,
      userId: row.user_id,
      status: row.status,
      draft: row.draft,
      ...(row.pending_field ? { pendingField: row.pending_field } : {}),
    };
  }

  async save(session: Session): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from('sessions').upsert(
      {
        chat_id: session.chatId,
        user_id: session.userId,
        status: session.status,
        draft: session.draft,
        pending_field: session.pendingField ?? null,
      },
      { onConflict: 'chat_id' },
    );
    if (error) throw new Error(`Supabase session save failed: ${error.message}`);
  }

  async clear(chatId: number): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from('sessions').delete().eq('chat_id', chatId);
    if (error) throw new Error(`Supabase session clear failed: ${error.message}`);
  }
}

let store: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!store) store = env.STORE === 'supabase' ? new SupabaseSessionStore() : new MemorySessionStore();
  return store;
}
