import { answerCallbackQuery, sendMessage } from '../../infra/telegram/client.js';
import { getItemStore } from '../events/items.repository.js';
import { getExtractionProvider } from '../extraction/extraction.provider.js';
import type { TelegramUpdate } from '../telegram/telegram.schemas.js';
import { isVoiceConfigured, transcribeTelegramVoice } from '../transcription/transcription.service.js';
import { getSessionStore, type Session } from './session.store.js';
import { getUserStore } from '../users/users.repository.js';
import { listUserItems, parseListRequest } from './list-intent.js';
import { CATEGORIES, CATEGORY_IDS, FIELD_LABELS, FIELD_ORDER, type CategoryId } from './category-fields.js';

const GREETING = `Hi! I'm MindFlow 🧠\nSend me anything — a task, a meeting, a project idea, or a note — and I'll organize it for you.`;

const HELP = `Here's how I work:\n1. Send me anything (text or voice).\n2. Pick one of 4 categories.\n3. Answer my follow-up questions, one at a time.\n\nCommands:\n/start — start over\ncancel — stop what we're doing\n/list — show my saved items\n/help — show this message`;

const CANCEL_WORDS = new Set(['cancel', '/cancel', 'stop', 'ləğv et', 'ləğv', 'legv et', 'legv', 'imtina']);

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

function nextOnboardingStep(user: { gmail: string | null; firstName: string | null; lastName: string | null }): 'gmail' | 'firstName' | 'lastName' | null {
  if (!user.gmail) return 'gmail';
  if (!user.firstName) return 'firstName';
  if (!user.lastName) return 'lastName';
  return null;
}

function formatSavedItem(category: string, fields: Record<string, string>): string {
  const label = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const normalized = { ...fields };
  if (normalized['notes'] && !normalized['description']) normalized['description'] = normalized['notes'];
  const lines = CATEGORIES.find((c) => c.id === category)
    ? FIELD_ORDER[category as CategoryId].map((name) => `• ${FIELD_LABELS[name]}: ${normalized[name] ?? '—'}`)
    : Object.entries(normalized).map(([k, v]) => `• ${FIELD_LABELS[k] ?? k}: ${v}`);
  return `✅ Saved to ${label}\n${lines.join('\n')}`;
}

function needsProfile(user: { gmail: string | null; firstName: string | null; lastName: string | null }): boolean {
  return !!nextOnboardingStep(user);
}

async function handleTextMessage(chatId: number, telegramId: number, text: string): Promise<void> {
  const users = getUserStore();
  const sessions = getSessionStore();
  const { user } = await users.getOrCreate(telegramId);
  const session = await sessions.get(chatId);

  if (needsProfile(user) || (session && ['awaiting_gmail', 'awaiting_first_name', 'awaiting_last_name'].includes(session.status))) {
    await handleProfileSetup(chatId, telegramId, session, text);
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
  const listReq = parseListRequest(text);
  if (listReq) {
    await sendMessage(chatId, await listUserItems(telegramId, listReq.category));
    if (session && session.status === 'awaiting_field' && session.pendingField) {
      await sendMessage(chatId, `Please enter the ${FIELD_LABELS[session.pendingField]}.`);
    }
    return;
  }
  if (session && session.status === 'awaiting_field') {
    await handleFieldAnswer(chatId, session, text);
    return;
  }
  if (!text) return;

  await startCapture(chatId, telegramId, text);
}

/** PRD first-run setup + added name/surname step: completes profile before capture. */
async function handleProfileSetup(
  chatId: number,
  telegramId: number,
  session: Session | null,
  text: string,
): Promise<void> {
  const users = getUserStore();
  const sessions = getSessionStore();
  if (CANCEL_WORDS.has(text.toLowerCase())) {
    await sessions.clear(chatId);
    await sendMessage(chatId, 'Cancelled. Send me anything to start over.');
    return;
  }
  if (text === '/start' || text === '/help') {
    await sessions.clear(chatId);
    await sendMessage(chatId, text === '/help' ? HELP : GMAIL_PROMPT);
    if (text === '/help') return;
    const { user: fresh } = await users.getOrCreate(telegramId);
    const nxt = nextOnboardingStep(fresh);
    if (nxt === 'firstName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_first_name', draft: { rawText: '', fields: {} } });
      await sendMessage(chatId, 'Thanks! What is your first name?');
    } else if (nxt === 'lastName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: { rawText: '', fields: {} } });
      await sendMessage(chatId, 'And your last name?');
    } else if (nxt === 'gmail') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_gmail', draft: { rawText: '', fields: {} } });
    }
    return;
  }
  const { user } = await users.getOrCreate(telegramId);

  if (session?.status === 'awaiting_gmail') {
    if (!isValidGmail(text)) {
      await sendMessage(chatId, 'That does not look like a valid gmail address. Please try again.');
      return;
    }
    await users.setGmail(telegramId, text);
    const pending = session.draft.rawText;
    const updated = await users.find(telegramId);
    const next = nextOnboardingStep(updated ?? { gmail: text, firstName: null, lastName: null });
    if (next === 'firstName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_first_name', draft: { rawText: pending, fields: {} } });
      await sendMessage(chatId, 'Thanks! What is your first name?');
      return;
    }
    if (next === 'lastName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: { rawText: pending, fields: {} } });
      await sendMessage(chatId, 'And your last name?');
      return;
    }
    if (pending) {
      await startCapture(chatId, telegramId, pending);
    } else {
      await sessions.clear(chatId);
      await sendMessage(chatId, GREETING);
    }
    return;
  }
  if (session?.status === 'awaiting_first_name') {
    if (!text) {
      await sendMessage(chatId, 'Please enter your first name.');
      return;
    }
    const maybeLast = text.trim().split(/\s+/);
    if (maybeLast.length >= 2) {
      await users.setNames(telegramId, maybeLast[0], maybeLast.slice(1).join(' '));
      const pending2 = session.draft.rawText;
      if (pending2) await startCapture(chatId, telegramId, pending2);
      else { await sessions.clear(chatId); await sendMessage(chatId, GREETING); }
      return;
    }
    await users.setFirstName(telegramId, text.trim());
    await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: session.draft });
    await sendMessage(chatId, 'And your last name?');
    return;
  }
  if (session?.status === 'awaiting_last_name') {
    if (!text) {
      await sendMessage(chatId, 'Please enter your last name.');
      return;
    }
    await users.setLastName(telegramId, text.trim());
    const pending3 = session.draft.rawText;
    if (pending3) await startCapture(chatId, telegramId, pending3);
    else { await sessions.clear(chatId); await sendMessage(chatId, GREETING); }
    return;
  }

  const next = nextOnboardingStep(user);
  if (next === 'gmail') {
    await sessions.save({
      chatId,
      userId: telegramId,
      status: 'awaiting_gmail',
      draft: { rawText: text === '/start' ? '' : text, fields: {} },
    });
    await sendMessage(chatId, GMAIL_PROMPT);
    return;
  }
  if (next === 'firstName') {
    await sessions.save({
      chatId,
      userId: telegramId,
      status: 'awaiting_first_name',
      draft: { rawText: text === '/start' ? '' : text, fields: {} },
    });
    await sendMessage(chatId, 'Thanks! What is your first name?');
    return;
  }
  if (next === 'lastName') {
    await sessions.save({
      chatId,
      userId: telegramId,
      status: 'awaiting_last_name',
      draft: { rawText: text === '/start' ? '' : text, fields: {} },
    });
    await sendMessage(chatId, 'And your last name?');
    return;
  }
  if (!text) return;
  await startCapture(chatId, telegramId, text);
}

function normalizeFields(fields: Record<string, string>): Record<string, string> {
  if (fields['notes'] && !fields['description']) return { ...fields, description: fields['notes'] };
  return fields;
}

/** Ask the next missing field, or save when everything is complete. */
async function continueCapture(chatId: number, session: Session): Promise<void> {
  const category = session.draft.category as CategoryId;
  const order = FIELD_ORDER[category] ?? [];
  const normalized = normalizeFields(session.draft.fields);
  const missing = order.find((name) => !normalized[name]?.trim());
  const sessions = getSessionStore();

  if (!missing) {
    const toSave = { ...normalized };
    delete (toSave as Record<string, string>)['notes'];
    await getItemStore().save({ userId: session.userId, category, fields: toSave });
    await sessions.clear(chatId);
    await sendMessage(chatId, formatSavedItem(category, toSave));
    return;
  }
  // persist normalized so old `notes` counts as `description` going forward
  const nextSession = normalized !== session.draft.fields ? { ...session, draft: { ...session.draft, fields: normalized } } : session;
  await sessions.save({ ...nextSession, status: 'awaiting_field', pendingField: missing });
  await sendMessage(chatId, `Please enter the ${FIELD_LABELS[missing]}.`);
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
