import { answerCallbackQuery, sendMessage } from '../../infra/telegram/client.js';
import { getItemStore } from '../events/items.repository.js';
import { getExtractionProvider } from '../extraction/extraction.provider.js';
import type { TelegramUpdate } from '../telegram/telegram.schemas.js';
import { isVoiceConfigured, transcribeTelegramVoice } from '../transcription/transcription.service.js';
import { getSessionStore, type Session } from './session.store.js';
import { getUserStore } from '../users/users.repository.js';
import { CATEGORY_IDS, FIELD_LABELS, FIELD_ORDER, type CategoryId } from './category-fields.js';

const GREETING = `Hi! I'm MindFlow 🧠\nSend me anything — a task, a meeting, a project idea, or a note — and I'll organize it for you.`;

const HELP = `Here's how I work:\n1. Send me anything (text or voice).\n2. Pick one of 4 categories.\n3. Answer my follow-up questions, one at a time.\n\nCommands:\n/start — start over\ncancel — stop what we're doing\n/help — show this message`;

const CANCEL_WORDS = new Set(['cancel', '/cancel', 'stop', 'ləğv et', 'ləğv', 'imtina']);

interface CallbackSelection {
  id: string;
  data?: string;
  chatId?: number;
}

/** PRD capture flow: remember the message, pick a category, fill missing fields one by one. */
export async function handleCapture(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCategoryChoice({
      id: update.callback_query.id,
      data: update.callback_query.data,
      chatId: update.callback_query.message?.chat.id,
    });
    return;
  }

  const message = update.message;
  if (!message) return;
  const chatId = message.chat.id;
  const telegramId = message.from?.id ?? chatId;

  if (message.voice) {
    if (!isVoiceConfigured()) {
      await sendMessage(chatId, 'Voice notes are not set up yet — please send text for now.');
      return;
    }
    let transcript: string;
    try {
      transcript = (await transcribeTelegramVoice(message.voice.file_id)).trim();
    } catch {
      await sendMessage(chatId, 'Sorry, I could not hear that voice note. Please try again or send text.');
      return;
    }
    if (!transcript) {
      await sendMessage(chatId, 'Sorry, I could not hear that voice note. Please try again or send text.');
      return;
    }
    await handleTextMessage(chatId, telegramId, transcript);
    return;
  }

  await handleTextMessage(chatId, telegramId, (message.text ?? '').trim());
}

const GMAIL_PROMPT = 'Welcome to MindFlow! Please share your gmail address to set up your account.';

function isValidGmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

async function handleTextMessage(chatId: number, telegramId: number, text: string): Promise<void> {
  const users = getUserStore();
  const sessions = getSessionStore();
  const { user } = await users.getOrCreate(telegramId);
  const session = await sessions.get(chatId);

  if (!user.gmail) {
    await handleGmailSetup(chatId, telegramId, session, text);
    return;
  }
  if (text === '/start') {
    await sessions.clear(chatId);
    await sendMessage(chatId, GREETING);
    return;
  }
  if (CANCEL_WORDS.has(text.toLowerCase())) {
    if (session && session.status !== 'idle') {
      await sessions.clear(chatId);
      await sendMessage(chatId, 'Cancelled. Send me anything to start over.');
    } else {
      await sendMessage(chatId, HELP);
    }
    return;
  }
  if (text === '/help') {
    await sendMessage(chatId, HELP);
    return;
  }
  if (session && session.status === 'awaiting_field') {
    await handleFieldAnswer(chatId, session, text);
    return;
  }
  if (!text) return;

  await startCapture(chatId, telegramId, text);
}

/** PRD first-run setup: brand-new users share a gmail address before anything else. */
async function handleGmailSetup(
  chatId: number,
  telegramId: number,
  session: Session | null,
  text: string,
): Promise<void> {
  const sessions = getSessionStore();
  if (session?.status === 'awaiting_gmail') {
    if (!isValidGmail(text)) {
      await sendMessage(chatId, 'That does not look like a valid gmail address. Please try again.');
      return;
    }
    await getUserStore().setGmail(telegramId, text);
    const pending = session.draft.rawText;
    if (pending) {
      await startCapture(chatId, telegramId, pending);
    } else {
      await sessions.clear(chatId);
      await sendMessage(chatId, GREETING);
    }
    return;
  }
  await sessions.save({
    chatId,
    userId: telegramId,
    status: 'awaiting_gmail',
    draft: { rawText: text === '/start' ? '' : text, fields: {} },
  });
  await sendMessage(chatId, GMAIL_PROMPT);
}

async function startCapture(chatId: number, telegramId: number, text: string): Promise<void> {
  await getSessionStore().save({
    chatId,
    userId: telegramId,
    status: 'awaiting_category',
    draft: { rawText: text, fields: {} },
  });
  await sendMessage(chatId, 'Please choose a category:', [
    [
      { text: '📋 To Do List', callback_data: 'cat:todo' },
      { text: '📁 Projects', callback_data: 'cat:projects' },
    ],
    [
      { text: '📅 Meetings', callback_data: 'cat:meetings' },
      { text: '📝 Notes', callback_data: 'cat:notes' },
    ],
  ]);
}

async function handleCategoryChoice(query: CallbackSelection): Promise<void> {
  if (query.chatId === undefined) return;
  await answerCallbackQuery(query.id);
  const data = query.data ?? '';
  const category = data.startsWith('cat:') ? data.slice('cat:'.length) : '';
  if (!CATEGORY_IDS.has(category)) return;

  const sessions = getSessionStore();
  const session = await sessions.get(query.chatId);
  if (!session || session.status !== 'awaiting_category') return;

  const found = await getExtractionProvider().extract(session.draft.rawText);
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(found)) {
    if (value) fields[key] = value;
  }
  await continueCapture(query.chatId, {
    ...session,
    status: 'awaiting_field',
    draft: { ...session.draft, category, fields },
  });
}

async function handleFieldAnswer(chatId: number, session: Session, text: string): Promise<void> {
  const category = session.draft.category as CategoryId | undefined;
  const field = session.pendingField;
  if (!field || !category || !FIELD_ORDER[category]) {
    await getSessionStore().clear(chatId);
    return;
  }
  if (!text) {
    await sendMessage(chatId, `Please enter the ${FIELD_LABELS[field]}.`);
    return;
  }

  const found = await getExtractionProvider().extract(text);
  const fields = { ...session.draft.fields };
  for (const [key, value] of Object.entries(found)) {
    if (value && !fields[key]) fields[key] = value;
  }
  if (!fields[field]) fields[field] = text;
  await continueCapture(chatId, { ...session, draft: { ...session.draft, fields } });
}

/** Ask the next missing field, or save when everything is complete. */
async function continueCapture(chatId: number, session: Session): Promise<void> {
  const category = session.draft.category as CategoryId;
  const order = FIELD_ORDER[category] ?? [];
  const missing = order.find((name) => !session.draft.fields[name]?.trim());
  const sessions = getSessionStore();

  if (!missing) {
    await getItemStore().save({ userId: session.userId, category, fields: session.draft.fields });
    await sessions.clear(chatId);
    await sendMessage(chatId, 'Saved successfully.');
    return;
  }
  await sessions.save({ ...session, status: 'awaiting_field', pendingField: missing });
  await sendMessage(chatId, `Please enter the ${FIELD_LABELS[missing]}.`);
}
