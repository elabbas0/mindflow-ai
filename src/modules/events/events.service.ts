import { extractEventDraft } from '../extraction/extraction.service.js';
import { saveEvent, type SavedEvent } from './events.repository.js';

/** Text -> GPT-4o draft -> Supabase row. */
export async function createEventFromText(userId: number, text: string): Promise<SavedEvent> {
  const draft = await extractEventDraft(text);
  return saveEvent(userId, draft);
}
