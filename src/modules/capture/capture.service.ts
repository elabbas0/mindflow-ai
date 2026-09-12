import { answerCallbackQuery, sendMessage } from '../../infra/telegram/client.js';
import { getItemStore } from '../events/items.repository.js';
import { getExtractionProvider } from '../extraction/extraction.provider.js';
import type { TelegramUpdate } from '../telegram/telegram.schemas.js';
import { getSessionStore, type Session } from './session.store.js';
import { getUserStore } from '../users/users.repository.js';
import { CATEGORY_IDS, FIELD_LABELS, FIELD_ORDER, type CategoryId } from './category-fields.js';

const GREETING = `Hi! I'm MindFlow 🧠\nSend me anything — a task, a meeting, a project idea, or a note — and I'll organize it for you.`;

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
    await sendMessage(chatId, 'Voice notes are coming soon — please send text for now.');
    return;
  }

  const text = (message.text ?? '').trim();
  if (text === '/start') {
    await getUserStore().getOrCreate(telegramId);
    await getSessionStore().clear(chatId);
    await sendMessage(chatId, GREETING);
    return;
  }

  const sessions = getSessionStore();
  const session = await sessions.get(chatId);
  if (session && session.status === 'awaiting_field') {
    await handleFieldAnswer(chatId, session, text);
    return;
  }
  if (!text) return;

  await getUserStore().getOrCreate(telegramId);
  await sessions.save({
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
