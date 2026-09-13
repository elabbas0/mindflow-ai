import { answerCallbackQuery, sendMessage } from '../../infra/telegram/client.js';
import { getItemStore } from '../events/items.repository.js';
import { getExtractionProvider } from '../extraction/extraction.provider.js';
import type { TelegramUpdate } from '../telegram/telegram.schemas.js';
import { isVoiceConfigured, transcribeTelegramVoice } from '../transcription/transcription.service.js';
import { getSessionStore, type Session } from './session.store.js';
import { getUserStore } from '../users/users.repository.js';
import { listUserItems, parseListRequest } from './list-intent.js';
import { CATEGORIES, CATEGORY_IDS, FIELD_LABELS, FIELD_ORDER, type CategoryId } from './category-fields.js';

const GREETINGS = new Set(['salam', 'salam aleykum', 'salam aleyküm', 'salam aleykum', 'hello', 'hi', 'hey', 'saj', 'salamlar']);

function isGreeting(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[!.,?]+$/, '');
  return GREETINGS.has(t) || /^salam\b/i.test(t);
}

function detectLang(text: string): 'az' | 'en' {
  const lower = text.toLowerCase();
  if (/[əğıöşüç]/.test(lower)) return 'az';
  if (/\b(salam|təşəkkür|tesekkur|xahiş|zahmet|zəhmət|sabah|axşam|axsam|bugün|bu gun|adım|adim|soyad|siyahı|siyahi|tapşırıq|tapsiriq|lazım|lazim|görüş|gorus|layihə|layihe|qeyd|vaxt|tarix|məkan|mekan)\b/i.test(lower)) return 'az';
  return 'en';
}

const STR: Record<'en' | 'az', Record<string, string>> = {
  en: {
    greeting: `Hi! I'm MindFlow 🧠\nSend me anything — a task, a meeting, a project idea, or a note — and I'll organize it for you.`,
    help: `Here's how I work:\n1. Send me anything (text or voice).\n2. Pick one of 4 categories.\n3. Answer my follow-up questions, one at a time.\n\nCommands:\n/start — start over\ncancel — stop what we're doing\n/list — show my saved items\n/help — show this message`,
    gmail_prompt: 'Welcome to MindFlow! Please share your gmail address to set up your account.',
    invalid_gmail: 'That does not look like a valid gmail address. Please try again.',
    thanks_first_name: 'Thanks! What is your first name?',
    ask_first_name: 'Please enter your first name.',
    ask_last_name: 'And your last name?',
    ask_last_name_please: 'Please enter your last name.',
    voice_not_setup: 'Voice notes are not set up yet — please send text for now.',
    voice_error: 'Sorry, I could not hear that voice note. Please try again or send text.',
    cancelled: 'Cancelled. Send me anything to start over.',
    choose_category: 'Please choose a category:',
    ask_field: 'Please enter the {field}.',
    saved_to: '✅ Saved to {label}',
    invalid_name: 'That doesn’t look like a valid name. Please enter your real name.',
  },
  az: {
    greeting: `Salam! Mən MindFlow 🧠\nMənə istənilən şeyi göndərin — tapşırıq, görüş, layihə ideyası və ya qeyd — və mən onu sizin üçün təşkil edim.`,
    help: `Mən belə işləyirəm:\n1. Mənə istənilən şeyi (mətn və ya səs) göndərin.\n2. 4 kateqoriyadan birini seçin.\n3. Suallarıma bir-bir cavab verin.\n\nƏmrlər:\n/start — yenidən başla\ncancel — ləğv et\n/list — yadda saxlanılanları göstər\n/help — kömək`,
    gmail_prompt: 'MindFlow-a xoş gəldiniz! Hesabınızı qurmaq üçün gmail ünvanınızı göndərin.',
    invalid_gmail: 'Bu düzgün gmail ünvanı kimi görünmür. Zəhmət olmasa yenidən cəhd edin.',
    thanks_first_name: 'Təşəkkürlər! Adınız nədir?',
    ask_first_name: 'Zəhmət olmasa adınızı daxil edin.',
    ask_last_name: 'Bəs soyadınız?',
    ask_last_name_please: 'Zəhmət olmasa soyadınızı daxil edin.',
    voice_not_setup: 'Səsli mesajlar hələ aktiv deyil — zəhmət olmasa mətn göndərin.',
    voice_error: 'Bağışlayın, səsli mesajı anlaya bilmədim. Zəhmət olmasa yenidən cəhd edin və ya mətn göndərin.',
    cancelled: 'Ləğv edildi. Yenidən başlamaq üçün mənə istənilən şeyi göndərin.',
    choose_category: 'Zəhmət olmasa kateqoriya seçin:',
    ask_field: 'Zəhmət olmasa {field} daxil edin.',
    saved_to: '✅ {label} yadda saxlanıldı',
    invalid_name: 'Bu ad kimi görünmür. Zəhmət olmasa əsl adınızı daxil edin.',
  },
};

const FIELD_LABELS_I18N: Record<'en' | 'az', Record<string, string>> = {
  en: { title: 'Title', description: 'Description', location: 'Location', date: 'Date', time: 'Time', deadline: 'Deadline', notes: 'Description' },
  az: { title: 'Başlıq', description: 'Təsvir', location: 'Məkan', date: 'Tarix', time: 'Vaxt', deadline: 'Son tarix', notes: 'Təsvir' },
};

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
      await sendMessage(chatId, tr('en', 'voice_not_setup'));
      return;
    }
    let transcript: string;
    try {
      transcript = (await transcribeTelegramVoice(message.voice.file_id)).trim();
    } catch {
      await sendMessage(chatId, tr('en', 'voice_error'));
      return;
    }
    if (!transcript) {
      await sendMessage(chatId, tr('en', 'voice_error'));
      return;
    }
    await handleTextMessage(chatId, telegramId, transcript);
    return;
  }

  await handleTextMessage(chatId, telegramId, (message.text ?? '').trim());
}

function isValidGmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function isValidName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (isGreeting(t)) return false;
  if (/^[^a-zA-ZəğıöşüçəƏĞIÖŞÜÇ]+$/.test(t)) return false;
  if (/\d/.test(t)) return false;
  return true;
}

function nextOnboardingStep(user: { gmail: string | null; firstName: string | null; lastName: string | null }): 'gmail' | 'firstName' | 'lastName' | null {
  if (!user.gmail) return 'gmail';
  if (!user.firstName) return 'firstName';
  if (!user.lastName) return 'lastName';
  return null;
}

function tr(lang: 'az' | 'en', key: string, vars?: Record<string, string>): string {
  let s = STR[lang][key] ?? STR.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

function fieldLabel(lang: 'az' | 'en', name: string): string {
  return FIELD_LABELS_I18N[lang][name] ?? FIELD_LABELS[name] ?? name;
}

function formatSavedItem(category: string, fields: Record<string, string>, lang: 'az' | 'en' = 'en'): string {
  const label = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const normalized = { ...fields };
  if (normalized['notes'] && !normalized['description']) normalized['description'] = normalized['notes'];
  const lines = CATEGORIES.find((c) => c.id === category)
    ? FIELD_ORDER[category as CategoryId].map((name) => `• ${fieldLabel(lang, name)}: ${normalized[name] ?? '—'}`)
    : Object.entries(normalized).map(([k, v]) => `• ${fieldLabel(lang, k) ?? k}: ${v}`);
  return `${tr(lang, 'saved_to', { label })}\n${lines.join('\n')}`;
}

function needsProfile(user: { gmail: string | null; firstName: string | null; lastName: string | null }): boolean {
  return !!nextOnboardingStep(user);
}

async function handleTextMessage(chatId: number, telegramId: number, text: string): Promise<void> {
  const users = getUserStore();
  const sessions = getSessionStore();
  const { user } = await users.getOrCreate(telegramId);
  const session = await sessions.get(chatId);
  const lang = detectLang(text) as 'az' | 'en';

  if (needsProfile(user) || (session && ['awaiting_gmail', 'awaiting_first_name', 'awaiting_last_name'].includes(session.status))) {
    await handleProfileSetup(chatId, telegramId, session, text, lang);
    return;
  }
  if (text === '/start') {
    await sessions.clear(chatId);
    await sendMessage(chatId, tr(lang, 'greeting'));
    return;
  }
  if (CANCEL_WORDS.has(text.toLowerCase())) {
    if (session && session.status !== 'idle') {
      await sessions.clear(chatId);
      await sendMessage(chatId, tr(lang, 'cancelled'));
    } else {
      await sendMessage(chatId, tr(lang, 'help'));
    }
    return;
  }
  if (text === '/help') {
    await sendMessage(chatId, tr(lang, 'help'));
    return;
  }
  if (isGreeting(text) && !session) {
    await sendMessage(chatId, tr(lang, 'greeting'));
    return;
  }
  const listReq = parseListRequest(text);
  if (listReq) {
    await sendMessage(chatId, await listUserItems(telegramId, listReq.category));
    if (session && session.status === 'awaiting_field' && session.pendingField) {
      await sendMessage(chatId, tr(lang, 'ask_field', { field: fieldLabel(lang, session.pendingField) }));
    }
    return;
  }
  if (session && session.status === 'awaiting_field') {
    await handleFieldAnswer(chatId, session, text, lang);
    return;
  }
  if (!text) return;

  await startCapture(chatId, telegramId, text, lang);
}

/** PRD first-run setup + added name/surname step: completes profile before capture. */
async function handleProfileSetup(
  chatId: number,
  telegramId: number,
  session: Session | null,
  text: string,
  lang: 'az' | 'en' = 'en',
): Promise<void> {
  const users = getUserStore();
  const sessions = getSessionStore();
  if (CANCEL_WORDS.has(text.toLowerCase())) {
    await sessions.clear(chatId);
    await sendMessage(chatId, tr(lang, 'cancelled'));
    return;
  }
  if (text === '/start' || text === '/help') {
    await sessions.clear(chatId);
    await sendMessage(chatId, text === '/help' ? tr(lang, 'help') : tr(lang, 'gmail_prompt'));
    if (text === '/help') return;
    const { user: fresh } = await users.getOrCreate(telegramId);
    const nxt = nextOnboardingStep(fresh);
    if (nxt === 'firstName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_first_name', draft: { rawText: '', fields: {} } });
      await sendMessage(chatId, tr(lang, 'thanks_first_name'));
    } else if (nxt === 'lastName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: { rawText: '', fields: {} } });
      await sendMessage(chatId, tr(lang, 'ask_last_name'));
    } else if (nxt === 'gmail') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_gmail', draft: { rawText: '', fields: {} } });
    }
    return;
  }
  const { user } = await users.getOrCreate(telegramId);

  if (session?.status === 'awaiting_gmail') {
    if (!isValidGmail(text)) {
      await sendMessage(chatId, tr(lang, 'invalid_gmail'));
      return;
    }
    await users.setGmail(telegramId, text);
    const pending = session.draft.rawText;
    const pendingLang = pending ? (detectLang(pending) as 'az' | 'en') : lang;
    const updated = await users.find(telegramId);
    const next = nextOnboardingStep(updated ?? { gmail: text, firstName: null, lastName: null });
    if (next === 'firstName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_first_name', draft: { rawText: pending, fields: {} } });
      await sendMessage(chatId, tr(pendingLang, 'thanks_first_name'));
      return;
    }
    if (next === 'lastName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: { rawText: pending, fields: {} } });
      await sendMessage(chatId, tr(pendingLang, 'ask_last_name'));
      return;
    }
    if (pending) {
      if (isGreeting(pending)) {
        await sessions.clear(chatId);
        await sendMessage(chatId, tr(pendingLang, 'greeting'));
      } else {
        await startCapture(chatId, telegramId, pending, pendingLang);
      }
    } else {
      await sessions.clear(chatId);
      await sendMessage(chatId, tr(pendingLang, 'greeting'));
    }
    return;
  }
  if (session?.status === 'awaiting_first_name') {
    const pendingLang = session.draft.rawText ? (detectLang(session.draft.rawText) as 'az' | 'en') : lang;
    if (!text || !isValidName(text)) {
      await sendMessage(chatId, text && isGreeting(text) ? tr(pendingLang, 'ask_first_name') : tr(pendingLang, 'invalid_name'));
      return;
    }
    const maybeLast = text.trim().split(/\s+/);
    if (maybeLast.length >= 2) {
      if (!maybeLast.every(isValidName)) {
        await sendMessage(chatId, tr(pendingLang, 'invalid_name'));
        return;
      }
      await users.setNames(telegramId, maybeLast[0], maybeLast.slice(1).join(' '));
      const pending2 = session.draft.rawText;
      const useLang = pending2 ? (detectLang(pending2) as 'az' | 'en') : pendingLang;
      if (pending2) {
        if (isGreeting(pending2)) {
          await sessions.clear(chatId);
          await sendMessage(chatId, tr(useLang, 'greeting'));
        } else {
          await startCapture(chatId, telegramId, pending2, useLang);
        }
      } else { await sessions.clear(chatId); await sendMessage(chatId, tr(useLang, 'greeting')); }
      return;
    }
    await users.setFirstName(telegramId, text.trim());
    await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: session.draft });
    await sendMessage(chatId, tr(pendingLang, 'ask_last_name'));
    return;
  }
  if (session?.status === 'awaiting_last_name') {
    const pendingLang = session.draft.rawText ? (detectLang(session.draft.rawText) as 'az' | 'en') : lang;
    if (!text || !isValidName(text)) {
      await sendMessage(chatId, tr(pendingLang, 'ask_last_name_please'));
      return;
    }
    await users.setLastName(telegramId, text.trim());
    const pending3 = session.draft.rawText;
    const useLang = pending3 ? (detectLang(pending3) as 'az' | 'en') : pendingLang;
    if (pending3) {
      if (isGreeting(pending3)) {
        await sessions.clear(chatId);
        await sendMessage(chatId, tr(useLang, 'greeting'));
      } else {
        await startCapture(chatId, telegramId, pending3, useLang);
      }
    } else { await sessions.clear(chatId); await sendMessage(chatId, tr(useLang, 'greeting')); }
    return;
  }

  const next = nextOnboardingStep(user);
  if (next === 'gmail') {
    if (isGreeting(text) && !isValidGmail(text)) {
      await sessions.save({
        chatId,
        userId: telegramId,
        status: 'awaiting_gmail',
        draft: { rawText: text, fields: {} },
      });
      await sendMessage(chatId, tr(lang, 'gmail_prompt'));
      return;
    }
    await sessions.save({
      chatId,
      userId: telegramId,
      status: 'awaiting_gmail',
      draft: { rawText: text === '/start' ? '' : text, fields: {} },
    });
    await sendMessage(chatId, tr(lang, 'gmail_prompt'));
    return;
  }
  if (next === 'firstName') {
    await sessions.save({
      chatId,
      userId: telegramId,
      status: 'awaiting_first_name',
      draft: { rawText: text === '/start' ? '' : text, fields: {} },
    });
    await sendMessage(chatId, tr(lang, 'thanks_first_name'));
    return;
  }
  if (next === 'lastName') {
    await sessions.save({
      chatId,
      userId: telegramId,
      status: 'awaiting_last_name',
      draft: { rawText: text === '/start' ? '' : text, fields: {} },
    });
    await sendMessage(chatId, tr(lang, 'ask_last_name'));
    return;
  }
  if (!text) return;
  await startCapture(chatId, telegramId, text, lang);
}

function normalizeFields(fields: Record<string, string>): Record<string, string> {
  if (fields['notes'] && !fields['description']) return { ...fields, description: fields['notes'] };
  return fields;
}

/** Ask the next missing field, or save when everything is complete. */
async function continueCapture(chatId: number, session: Session, lang: 'az' | 'en' = 'en'): Promise<void> {
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
    await sendMessage(chatId, formatSavedItem(category, toSave, lang));
    return;
  }
  // persist normalized so old `notes` counts as `description` going forward
  const nextSession = normalized !== session.draft.fields ? { ...session, draft: { ...session.draft, fields: normalized } } : session;
  await sessions.save({ ...nextSession, status: 'awaiting_field', pendingField: missing });
  await sendMessage(chatId, tr(lang, 'ask_field', { field: fieldLabel(lang, missing) }));
}

async function startCapture(chatId: number, telegramId: number, text: string, lang: 'az' | 'en' = 'en'): Promise<void> {
  await getSessionStore().save({
    chatId,
    userId: telegramId,
    status: 'awaiting_category',
    draft: { rawText: text, fields: {} },
  });
  await sendMessage(chatId, tr(lang, 'choose_category'), [
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
  const lang = detectLang(session.draft.rawText) as 'az' | 'en';
  await continueCapture(query.chatId, {
    ...session,
    status: 'awaiting_field',
    draft: { ...session.draft, category, fields },
  }, lang);
}

async function handleFieldAnswer(chatId: number, session: Session, text: string, lang: 'az' | 'en' = 'en'): Promise<void> {
  const category = session.draft.category as CategoryId | undefined;
  const field = session.pendingField;
  if (!field || !category || !FIELD_ORDER[category]) {
    await getSessionStore().clear(chatId);
    return;
  }
  if (!text) {
    await sendMessage(chatId, tr(lang, 'ask_field', { field: fieldLabel(lang, field) }));
    return;
  }

  const found = await getExtractionProvider().extract(text);
  const fields = { ...session.draft.fields };
  for (const [key, value] of Object.entries(found)) {
    if (value && !fields[key]) fields[key] = value;
  }
  if (!fields[field]) fields[field] = text;
  await continueCapture(chatId, { ...session, draft: { ...session.draft, fields } }, lang);
}
