import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { NotConfiguredError } from '../../shared/errors.js';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!env.OPENAI_API_KEY) throw new NotConfiguredError('OpenAI');
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

/** Voice note bytes -> transcript via Whisper. */
export async function transcribeVoice(audio: Buffer, filename = 'voice.ogg'): Promise<string> {
  const openai = getOpenAI();
  const file = await OpenAI.toFile(audio, filename);
  const res = await openai.audio.transcriptions.create({ file, model: 'whisper-1' });
  return res.text;
}

export const CALENDAR_EXTRACTION_PROMPT = `Extract calendar event(s) from the user's message.
Reply with JSON only: {"title": string, "startsAt": string|null, "notes": string|null}.
startsAt must be ISO-8601 or null when no date/time is mentioned.`;

/** Free text -> structured calendar-event draft via GPT-4o. */
export async function extractCalendarEvent(text: string): Promise<{ title: string; startsAt: string | null; notes: string | null }> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: CALENDAR_EXTRACTION_PROMPT },
      { role: 'user', content: text },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as { title?: string; startsAt?: string | null; notes?: string | null };
  return { title: parsed.title ?? text.slice(0, 80), startsAt: parsed.startsAt ?? null, notes: parsed.notes ?? null };
}
