import { getSupabase } from '../../infra/supabase/client.js';
import type { CalendarEventDraft } from '../extraction/extraction.service.js';

export interface SavedEvent extends CalendarEventDraft {
  id: string;
}

/** Persist an event draft. Expects a Supabase table `events`. */
export async function saveEvent(userId: number, draft: CalendarEventDraft): Promise<SavedEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('events')
    .insert({ user_id: userId, title: draft.title, starts_at: draft.startsAt, notes: draft.notes })
    .select('id')
    .single();
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return { ...draft, id: (data as { id: string }).id };
}
