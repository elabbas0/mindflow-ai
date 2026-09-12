import { answerCallbackQuery, sendMessage } from '../../infra/telegram/client.js';
import type { TelegramUpdate } from '../telegram/telegram.schemas.js';
import { getSessionStore } from './session.store.js';
import { getUserStore } from '../users/users.repository.js';

export const CATEGORIES = [
  { id: 'todo', label: '📋 To Do List' },
  { id: 'projects', label: '📁 Projects' },
  { id: 'meetings', label: '📅 Meetings' },
  { id: 'notes', label: '📝 Notes' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

const GREETING = `Hi! I'm MindFlow 🧠\nSend me anything — a task, a meeting, a project idea, or a note — and I'll organize it for you.`;

interface CallbackSelection {
  id: string;
  data?: string;
  chatId?: number;
}

/** PRD capture flow step 1: remember the message, ask for a category. */
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
  if (!text) return;

  if (text === '/start') {
    await getUserStore().getOrCreate(telegramId);
    await getSessionStore().clear(chatId);
    await sendMessage(chatId, GREETING);
    return;
  }

  await getUserStore().getOrCreate(telegramId);
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

  const session = await getSessionStore().get(query.chatId);
  if (!session || session.status !== 'awaiting_category') return;

  const label = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  await getSessionStore().save({
    ...session,
    status: 'awaiting_field',
    draft: { ...session.draft, category },
  });
  await sendMessage(query.chatId, `Saved category: ${label}.`);
}
