import { sendMessage } from '../../infra/telegram/client.js';
import { createEventFromText } from '../events/events.service.js';
import { transcribeTelegramVoice } from '../transcription/transcription.service.js';
import type { TelegramUpdate } from './telegram.schemas.js';

/** Route an incoming Telegram update through voice->text -> GPT-4o -> Supabase. */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const userId = message.from?.id ?? chatId;

  try {
    const text = message.voice
      ? await transcribeTelegramVoice(message.voice.file_id)
      : (message.text ?? '');
    if (!text.trim()) return;

    const saved = await createEventFromText(userId, text);
    await sendMessage(chatId, `Saved: ${saved.title}${saved.startsAt ? ` @ ${saved.startsAt}` : ''}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error';
    await sendMessage(chatId, `Sorry, I could not save that event. (${reason})`);
    throw err;
  }
}
