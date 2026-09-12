import { extractCalendarEvent } from '../../infra/openai/client.js';

export interface CalendarEventDraft {
  title: string;
  startsAt: string | null;
  notes: string | null;
}

/** Free text (transcript or message) -> structured event draft via GPT-4o. */
export async function extractEventDraft(text: string): Promise<CalendarEventDraft> {
  return extractCalendarEvent(text);
}
