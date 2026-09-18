import { answerCallbackQuery, sendMessage } from '../../infra/telegram/client.js';
import { getItemStore } from '../events/items.repository.js';
import { getExtractionProvider } from '../extraction/extraction.provider.js';
import type { TelegramUpdate } from '../telegram/telegram.schemas.js';
import { isVoiceConfigured, transcribeTelegramVoice } from '../transcription/transcription.service.js';
import { getSessionStore, type Session } from './session.store.js';
import { getUserStore } from '../users/users.repository.js';
import { listUserItems, parseListRequest } from './list-intent.js';
import { CATEGORIES, CATEGORY_IDS, FIELD_LABELS, FIELD_ORDER, type CategoryId } from './category-fields.js';
import { resolveDateField } from './dates.js';
import { resolveTimeField } from './times.js';

const GREETINGS = new Set(['salam', 'salam aleykum', 'salam aleyküm', 'salam aleykum', 'hello', 'hi', 'hey', 'saj', 'salamlar']);

function isGreeting(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[!.,?]+$/, '');
  return GREETINGS.has(t) || /^salam\b/i.test(t);
}

// Azerbaijani stems: only Azerbaijani suffixes may follow, so "sabahdan"
// and "görüşlərim" count while English lookalikes ("variable", "send") don't.
const AZ_SUFFIX =
  '(?:dan|dən|den|tan|tən|lar|lər|ler|da|də|de|nın|nin|nun|nün|ın|in|un|ün|ım|im|um|üm|ya|yə|yı|yi|yu|yü|nı|ni|nu|nü|dır|dir|dur|dür|sınız|siniz|sunuz|sünüz)*';
const AZ_STEMS = [
  'salam',
  'sabah',
  'bugun',
  'bugün',
  'sragagun',
  'sırağa',
  'hansi',
  'hansı',
  'nece',
  'necə',
  'ne',
  'nə',
  'gorus',
  'görüş',
  'tapsiriq',
  'tapşırıq',
  'tapshiriq',
  'layihe',
  'layihə',
  'proyekt',
  'qeyd',
  'tesekkur',
  'təşəkkür',
  'xahis',
  'xahiş',
  'zahmet',
  'zəhmət',
  'ad',
  'soyad',
  'axsam',
  'axşam',
  'gun',
  'gün',
  'tarix',
  'vaxt',
  'mekan',
  'məkan',
  'men',
  'mən',
  'menim',
  'mənim',
  'sen',
  'sən',
  'biz',
  'siz',
  'var',
  'yox',
  'deyil',
  'üçün',
  'ucun',
  'cün',
  'çün',
  'ile',
  'ilə',
  'kimi',
  'qeder',
  'qədər',
  'sonra',
  'evvel',
  'əvvəl',
  'bele',
  'belə',
  'hec',
  'heç',
  'cox',
  'çox',
  'yeni',
  'lazim',
  'lazım',
  'gerek',
  'gərək',
  'olar',
  'olmaz',
  'necesen',
  'necəsən',
  'sagol',
  'sağol',
  'buyur',
  'goster',
  'göstər',
  'hamisi',
  'hamısı',
  'görə',
  'gore',
  'ki',
  'cunki',
  'çünki',
];
const AZ_RE = new RegExp(`\\b(?:${AZ_STEMS.join('|')})${AZ_SUFFIX}\\b`);
const EN_RE =
  /\b(the|and|what|how|my|your|today|tomorrow|meeting|meetings|task|tasks|todo|todos|project|projects|note|notes|list|show|from|starting|since|after|have|has|are|is|do|does|will|would|want|need|please|thanks|thank)\b/i;

/**
 * 'az' when the message carries Azerbaijani markers, 'en' for English ones,
 * null when neutral (commands, numbers, names, dates).
 */
export function detectMarkers(text: string): 'az' | 'en' | null {
  const lower = text.toLowerCase();
  if (/[əğıöşüç]/.test(lower)) return 'az';
  if (AZ_RE.test(lower)) return 'az';
  if (EN_RE.test(lower)) return 'en';
  return null;
}

/** Sticky language: a marked message switches it, neutral ones keep the stored one. */
export function resolveLang(
  text: string,
  stored: 'az' | 'en' | null,
  tgLang: 'az' | null = null,
): 'az' | 'en' {
  return detectMarkers(text) ?? stored ?? tgLang ?? 'en';
}

const STR: Record<'en' | 'az', Record<string, string>> = {
  en: {
    greeting: `Hi! I'm MindFlow 🧠\nSend me anything — a task, a meeting, a project idea, or a note — and I'll organize it for you.`,
    help: `Here's how I work:\n1. Send me anything (text or voice).\n2. Pick one of 4 categories.\n3. Answer my follow-up questions, one at a time.\n\nCommands:\n/start — start over\ncancel — stop what we're doing\n/list — show my saved items\n/help — show this message`,
    gmail_prompt: 'Welcome to MindFlow! Please share your gmail address to set up your account.',
    invalid_gmail: 'That does not look like a valid gmail address. Please try again.',
    thanks_first_name: 'Thanks! What is your full name? Write name and surname together, like "Aysel Mammadova".',
    ask_first_name: 'Please enter your full name, name and surname together.',
    ask_last_name: 'And your surname? (You can also write name and surname together.)',
    ask_last_name_please: 'Please enter your surname.',
    voice_not_setup: 'Voice notes are not set up yet — please send text for now.',
    voice_error: 'Sorry, I could not hear that voice note. Please try again or send text.',
    cancelled: 'Cancelled. Send me anything to start over.',
    choose_category: 'Please choose a category:',
    ask_field: 'Please enter the {field}.',
    saved_to: '✅ Saved to {label}',
    invalid_name: 'That doesn’t look like a valid name. Please enter your real name.',
    edit_pick: 'Which one do you want to fix? Reply with the number.',
    edit_none: 'You have no saved items yet.',
    edit_confirm: 'Is this the right one?',
    edit_yes: 'Yes, this one',
    edit_no: 'No',
    edit_which_field: 'Which field do you want to change? Reply with the number.',
    edit_new_value: 'Write the new value for {field}.',
    edit_done: '✅ Updated.',
    edit_cancelled: 'OK, left it as is. Send me anything to start over.',
    edit_bad_number: 'That number is not on the list. Try again.',
  },
  az: {
    greeting: `Salam! Mən MindFlow 🧠\nMənə istənilən şeyi göndərin — tapşırıq, görüş, layihə ideyası və ya qeyd — və mən onu sizin üçün təşkil edim.`,
    help: `Mən belə işləyirəm:\n1. Mənə istənilən şeyi (mətn və ya səs) göndərin.\n2. 4 kateqoriyadan birini seçin.\n3. Suallarıma bir-bir cavab verin.\n\nƏmrlər:\n/start — yenidən başla\ncancel — ləğv et\n/list — yadda saxlanılanları göstər\n/help — kömək`,
    gmail_prompt: 'MindFlow-a xoş gəldiniz! Hesabınızı qurmaq üçün gmail ünvanınızı göndərin.',
    invalid_gmail: 'Bu düzgün gmail ünvanı kimi görünmür. Zəhmət olmasa yenidən cəhd edin.',
    thanks_first_name: 'Təşəkkürlər! Ad və soyadınızı birlikdə yazın, məsələn "Aysel Məmmədova".',
    ask_first_name: 'Zəhmət olmasa ad və soyadınızı birlikdə yazın.',
    ask_last_name: 'Bəs soyadınız? (Ad və soyadı birlikdə də yaza bilərsiniz.)',
    ask_last_name_please: 'Zəhmət olmasa soyadınızı daxil edin.',
    voice_not_setup: 'Səsli mesajlar hələ aktiv deyil — zəhmət olmasa mətn göndərin.',
    voice_error: 'Bağışlayın, səsli mesajı anlaya bilmədim. Zəhmət olmasa yenidən cəhd edin və ya mətn göndərin.',
    cancelled: 'Ləğv edildi. Yenidən başlamaq üçün mənə istənilən şeyi göndərin.',
    choose_category: 'Zəhmət olmasa kateqoriya seçin:',
    ask_field: 'Zəhmət olmasa {field} daxil edin.',
    saved_to: '✅ {label} yadda saxlanıldı',
    invalid_name: 'Bu ad kimi görünmür. Zəhmət olmasa əsl adınızı daxil edin.',
    edit_pick: 'Hansı birini düzəltmək istəyirsiniz? Nömrəsini yazın.',
    edit_none: 'Hələ yadda saxlanılan heç nə yoxdur.',
    edit_confirm: 'Bu düzgündür?',
    edit_yes: 'Bəli, budur',
    edit_no: 'Xeyr',
    edit_which_field: 'Hansı sahəni dəyişmək istəyirsiniz? Nömrəsini yazın.',
    edit_new_value: '{field} üçün yeni dəyəri yazın.',
    edit_done: '✅ Yeniləndi.',
    edit_cancelled: 'Oldu, olduğu kimi qaldı. Yenidən başlamaq üçün nəsə göndərin.',
    edit_bad_number: 'Bu nömrə siyahıda yoxdur. Yenidən cəhd edin.',
  },
};

const FIELD_LABELS_I18N: Record<'en' | 'az', Record<string, string>> = {
  en: { title: 'Title', description: 'Description', location: 'Location', date: 'Date', time: 'Time', deadline: 'Deadline', notes: 'Description' },
  az: { title: 'Başlıq', description: 'Təsvir', location: 'Məkan', date: 'Tarix', time: 'Vaxt', deadline: 'Son tarix', notes: 'Təsvir' },
};

const CANCEL_WORDS = new Set(['cancel', '/cancel', 'stop', '/stop', 'ləğv et', 'ləğv', 'legv et', 'legv', 'imtina']);

const EDIT_WORDS = new Set([
  '/edit',
  'edit',
  'düzəliş',
  'duzelis',
  'düzelt',
  'redaktə',
  'redakte',
  'dəyiş',
  'deyis',
  'fix',
  'correct',
]);

interface CallbackSelection {
  id: string;
  data?: string;
  chatId?: number;
}

export async function handleCapture(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    const data = update.callback_query.data ?? '';
    const chatId = update.callback_query.message?.chat.id;
    if (data.startsWith('edit:')) {
      await handleEditCallback({
        id: update.callback_query.id,
        data,
        chatId,
      });
      return;
    }
    await handleCategoryChoice({
      id: update.callback_query.id,
      data,
      chatId,
    });
    return;
  }

  const message = update.message;
  if (!message) return;
  const chatId = message.chat.id;
  const telegramId = message.from?.id ?? chatId;
  const tgLang: 'az' | null =
    message.from?.language_code?.toLowerCase().startsWith('az') ? 'az' : null;

  if (message.voice) {
    const voiceLang = (await getUserStore().find(telegramId))?.lang ?? tgLang ?? 'en';
    if (!isVoiceConfigured()) {
      await sendMessage(chatId, tr(voiceLang, 'voice_not_setup'));
      return;
    }
    let transcript: string;
    try {
      transcript = (await transcribeTelegramVoice(message.voice.file_id)).trim();
    } catch {
      await sendMessage(chatId, tr(voiceLang, 'voice_error'));
      return;
    }
    if (!transcript) {
      await sendMessage(chatId, tr(voiceLang, 'voice_error'));
      return;
    }
    await handleTextMessage(chatId, telegramId, transcript, tgLang);
    return;
  }

  await handleTextMessage(chatId, telegramId, (message.text ?? '').trim(), tgLang);
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

function storedNameOk(name: string | null): boolean {
  if (!name) return false;
  if (name.startsWith('/')) return false;
  return true;
}

function nextOnboardingStep(user: { gmail: string | null; firstName: string | null; lastName: string | null }): 'gmail' | 'firstName' | 'lastName' | null {
  if (!user.gmail) return 'gmail';
  if (!storedNameOk(user.firstName)) return 'firstName';
  if (!storedNameOk(user.lastName)) return 'lastName';
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

async function handleTextMessage(
  chatId: number,
  telegramId: number,
  text: string,
  tgLang: 'az' | null = null,
): Promise<void> {
  const users = getUserStore();
  const sessions = getSessionStore();
  const { user } = await users.getOrCreate(telegramId);
  const session = await sessions.get(chatId);
  // Sticky language: a marked message sets it, neutral ones keep it.
  const marked = detectMarkers(text);
  const lang = marked ?? user.lang ?? tgLang ?? 'en';
  if (marked && marked !== user.lang) {
    await users.setLang(telegramId, marked);
  }

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
  if (session && session.status.startsWith('awaiting_edit')) {
    await handleEditAnswer(chatId, telegramId, session, text, lang);
    return;
  }
  if (EDIT_WORDS.has(text.toLowerCase())) {
    await startEdit(chatId, telegramId, lang);
    return;
  }
  if (isGreeting(text) && !session) {
    await sendMessage(chatId, tr(lang, 'greeting'));
    return;
  }
  const listReq = parseListRequest(text);
  if (listReq) {
    await sendMessage(chatId, await listUserItems(telegramId, listReq.category, listReq.fromDate, lang));
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
    if (text === '/help') {
      await sendMessage(chatId, tr(lang, 'help'));
      return;
    }
    const { user: fresh } = await users.getOrCreate(telegramId);
    const nxt = nextOnboardingStep(fresh);
    if (nxt === 'gmail') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_gmail', draft: { rawText: '', fields: {} } });
      await sendMessage(chatId, tr(lang, 'gmail_prompt'));
    } else if (nxt === 'firstName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_first_name', draft: { rawText: '', fields: {} } });
      await sendMessage(chatId, tr(lang, 'thanks_first_name'));
    } else if (nxt === 'lastName') {
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: { rawText: '', fields: {} } });
      await sendMessage(chatId, tr(lang, 'ask_last_name'));
    } else {
      await sendMessage(chatId, tr(lang, 'greeting'));
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
    const pendingLang = pending ? (detectMarkers(pending) ?? lang) : lang;
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
    const pendingLang = session.draft.rawText ? (detectMarkers(session.draft.rawText) ?? lang) : lang;
    if (text.startsWith('/')) {
      await sendMessage(chatId, tr(pendingLang, 'ask_first_name'));
      return;
    }
    const parts = text.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.every(isValidName)) {
      await users.setNames(telegramId, parts[0], parts.slice(1).join(' '));
      await resumeAfterProfile(chatId, telegramId, session.draft.rawText, pendingLang);
      return;
    }
    if (parts.length === 1 && isValidName(parts[0])) {
      await users.setFirstName(telegramId, parts[0]);
      await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: session.draft });
      await sendMessage(chatId, tr(pendingLang, 'ask_last_name'));
      return;
    }
    await sendMessage(chatId, tr(pendingLang, 'invalid_name'));
    return;
  }
  if (session?.status === 'awaiting_last_name') {
    const pendingLang = session.draft.rawText ? (detectMarkers(session.draft.rawText) ?? lang) : lang;
    if (text.startsWith('/')) {
      await sendMessage(chatId, tr(pendingLang, 'ask_last_name'));
      return;
    }
    const parts = text.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.every(isValidName)) {
      await users.setNames(telegramId, parts[0], parts.slice(1).join(' '));
      await resumeAfterProfile(chatId, telegramId, session.draft.rawText, pendingLang);
      return;
    }
    if (parts.length === 1 && isValidName(parts[0])) {
      const current = await users.find(telegramId);
      if (!current?.firstName) {
        await users.setFirstName(telegramId, parts[0]);
        await sessions.save({ chatId, userId: telegramId, status: 'awaiting_last_name', draft: session.draft });
        await sendMessage(chatId, tr(pendingLang, 'ask_last_name'));
        return;
      }
      await users.setLastName(telegramId, parts[0]);
      await resumeAfterProfile(chatId, telegramId, session.draft.rawText, pendingLang);
      return;
    }
    await sendMessage(chatId, tr(pendingLang, 'ask_last_name_please'));
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

async function resumeAfterProfile(chatId: number, telegramId: number, pending: string, lang: 'az' | 'en'): Promise<void> {
  const sessions = getSessionStore();
  if (pending) {
    if (isGreeting(pending)) {
      await sessions.clear(chatId);
      await sendMessage(chatId, tr(lang, 'greeting'));
    } else {
      await startCapture(chatId, telegramId, pending, lang);
    }
  } else {
    await sessions.clear(chatId);
    await sendMessage(chatId, tr(lang, 'greeting'));
  }
}

function resolveDateFields(fields: Record<string, string>): Record<string, string> {
  const out = { ...fields };
  if (out.date) out.date = resolveDateField(out.date);
  if (out.deadline) out.deadline = resolveDateField(out.deadline);
  if (out.time) out.time = resolveTimeField(out.time);
  return out;
}

async function continueCapture(chatId: number, session: Session, lang: 'az' | 'en' = 'en'): Promise<void> {
  const category = session.draft.category as CategoryId;
  const order = FIELD_ORDER[category] ?? [];
  const normalized = resolveDateFields(normalizeFields(session.draft.fields));
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
  const stored = (await getUserStore().find(session.userId))?.lang ?? null;
  const lang = detectMarkers(session.draft.rawText) ?? stored ?? 'en';
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
  if (!fields[field]) {
    if (field === 'date' || field === 'deadline') fields[field] = resolveDateField(text);
    else if (field === 'time') fields[field] = resolveTimeField(text);
    else fields[field] = text;
  } else if (fields[field] && (field === 'date' || field === 'deadline')) {
    fields[field] = resolveDateField(fields[field]);
  } else if (fields[field] && field === 'time') {
    fields[field] = resolveTimeField(fields[field]);
  }
  await continueCapture(chatId, { ...session, draft: { ...session.draft, fields } }, lang);
}

function shortTitle(fields: Record<string, string>): string {
  return fields.title || fields.description || fields.notes || 'Untitled';
}

async function startEdit(chatId: number, telegramId: number, lang: 'az' | 'en'): Promise<void> {
  const items = await getItemStore().listByUser(telegramId);
  if (items.length === 0) {
    await sendMessage(chatId, tr(lang, 'edit_none'));
    return;
  }
  const picked = items.slice(0, 10);
  const lines = picked.map((item, i) => `${i + 1}. [${item.category}] ${shortTitle(item.fields)}`);
  await getSessionStore().save({
    chatId,
    userId: telegramId,
    status: 'awaiting_edit_pick',
    draft: { rawText: '', fields: {}, editIds: picked.map((item) => item.id) },
  });
  await sendMessage(chatId, `${tr(lang, 'edit_pick')}\n${lines.join('\n')}`);
}

async function askEditConfirm(chatId: number, telegramId: number, itemId: string, lang: 'az' | 'en'): Promise<void> {
  const item = await getItemStore().getById(itemId);
  if (!item || item.userId !== telegramId) {
    await getSessionStore().clear(chatId);
    await sendMessage(chatId, tr(lang, 'edit_none'));
    return;
  }
  await getSessionStore().save({
    chatId,
    userId: telegramId,
    status: 'awaiting_edit_confirm',
    draft: { rawText: '', fields: {}, editId: item.id },
  });
  await sendMessage(
    chatId,
    `${tr(lang, 'edit_confirm')}\n[${item.category}] ${shortTitle(item.fields)}\n${formatSavedItem(item.category, item.fields, lang)}`,
    [
      [
        { text: tr(lang, 'edit_yes'), callback_data: 'edit:yes' },
        { text: tr(lang, 'edit_no'), callback_data: 'edit:no' },
      ],
    ],
  );
}

async function askEditField(chatId: number, telegramId: number, itemId: string, lang: 'az' | 'en'): Promise<void> {
  const item = await getItemStore().getById(itemId);
  if (!item || item.userId !== telegramId) {
    await getSessionStore().clear(chatId);
    await sendMessage(chatId, tr(lang, 'edit_none'));
    return;
  }
  const order = FIELD_ORDER[item.category as CategoryId] ?? Object.keys(item.fields);
  const lines = order.map((name, i) => `${i + 1}. ${fieldLabel(lang, name)}: ${item.fields[name] ?? '—'}`);
  await getSessionStore().save({
    chatId,
    userId: telegramId,
    status: 'awaiting_edit_field',
    draft: { rawText: '', fields: {}, editId: item.id },
  });
  await sendMessage(chatId, `${tr(lang, 'edit_which_field')}\n${lines.join('\n')}`);
}

async function handleEditCallback(query: CallbackSelection): Promise<void> {
  if (query.chatId === undefined) return;
  await answerCallbackQuery(query.id);
  const data = query.data ?? '';
  const session = await getSessionStore().get(query.chatId);
  if (!session) return;
  const lang = (await getUserStore().find(session.userId))?.lang ?? 'en';

  if (data === 'edit:yes' && session.status === 'awaiting_edit_confirm' && session.draft.editId) {
    await askEditField(query.chatId, session.userId, session.draft.editId, lang);
    return;
  }
  if (data === 'edit:no') {
    await getSessionStore().clear(query.chatId);
    await sendMessage(query.chatId, tr(lang, 'edit_cancelled'));
    return;
  }
}

async function handleEditAnswer(chatId: number, telegramId: number, session: Session, text: string, lang: 'az' | 'en'): Promise<void> {
  const store = getItemStore();
  const sessions = getSessionStore();

  if (CANCEL_WORDS.has(text.toLowerCase())) {
    await sessions.clear(chatId);
    await sendMessage(chatId, tr(lang, 'cancelled'));
    return;
  }

  if (session.status === 'awaiting_edit_pick') {
    const n = Number(text.trim());
    const ids = session.draft.editIds ?? [];
    if (!Number.isInteger(n) || n < 1 || n > ids.length) {
      await sendMessage(chatId, tr(lang, 'edit_bad_number'));
      return;
    }
    await askEditConfirm(chatId, telegramId, ids[n - 1], lang);
    return;
  }

  if (session.status === 'awaiting_edit_confirm') {
    const t = text.trim().toLowerCase();
    if (['yes', 'y', 'bəli', 'beli', 'hə', 'he'].includes(t)) {
      if (session.draft.editId) await askEditField(chatId, telegramId, session.draft.editId, lang);
      return;
    }
    if (['no', 'n', 'xeyr', 'yox'].includes(t)) {
      await sessions.clear(chatId);
      await sendMessage(chatId, tr(lang, 'edit_cancelled'));
      return;
    }
    if (session.draft.editId) {
      await askEditConfirm(chatId, telegramId, session.draft.editId, lang);
    }
    return;
  }

  if (session.status === 'awaiting_edit_field') {
    const item = session.draft.editId ? await store.getById(session.draft.editId) : null;
    if (!item || item.userId !== telegramId) {
      await sessions.clear(chatId);
      await sendMessage(chatId, tr(lang, 'edit_none'));
      return;
    }
    const order = FIELD_ORDER[item.category as CategoryId] ?? Object.keys(item.fields);
    const n = Number(text.trim());
    let field = '';
    if (Number.isInteger(n) && n >= 1 && n <= order.length) {
      field = order[n - 1];
    } else {
      const lowered = text.trim().toLowerCase();
      field = order.find((name) => name.toLowerCase() === lowered || fieldLabel(lang, name).toLowerCase() === lowered) ?? '';
    }
    if (!field) {
      await sendMessage(chatId, tr(lang, 'edit_bad_number'));
      return;
    }
    await sessions.save({
      chatId,
      userId: telegramId,
      status: 'awaiting_edit_value',
      draft: { rawText: '', fields: {}, editId: item.id, editField: field },
    });
    await sendMessage(chatId, tr(lang, 'edit_new_value', { field: fieldLabel(lang, field) }));
    return;
  }

  if (session.status === 'awaiting_edit_value') {
    const item = session.draft.editId ? await store.getById(session.draft.editId) : null;
    const field = session.draft.editField;
    if (!item || item.userId !== telegramId || !field) {
      await sessions.clear(chatId);
      await sendMessage(chatId, tr(lang, 'edit_none'));
      return;
    }
    const value = field === 'date' || field === 'deadline' ? resolveDateField(text.trim()) : text.trim();
    if (!value) {
      await sendMessage(chatId, tr(lang, 'edit_bad_number'));
      return;
    }
    const updated = await store.update(item.id, { fields: { [field]: value } });
    await sessions.clear(chatId);
    if (!updated) {
      await sendMessage(chatId, tr(lang, 'edit_none'));
      return;
    }
    await sendMessage(chatId, `${tr(lang, 'edit_done')}\n${formatSavedItem(updated.category, updated.fields, lang)}`);
    return;
  }
}
