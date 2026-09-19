import { env } from '../../config/env.js';
import { NotConfiguredError } from '../../shared/errors.js';
import { getItemStore } from '../events/items.repository.js';
import { getUserStore } from '../users/users.repository.js';
import { generateText } from '../extraction/gemini.provider.js';
import { findCategoryWord, itemDate, parseListRequest } from '../capture/list-intent.js';
import { detectMarkers } from '../capture/capture.service.js';
import { resolveRangeStart } from '../capture/dates.js';

function todayBaku(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export interface AssistantQuery {
  telegramId?: number;
  gmail?: string;
  question: string;
}

/** PRD web AI Assistant, backend half: answer from the user's saved items. */
export async function askAssistant(input: AssistantQuery): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new NotConfiguredError('Gemini');

  const users = getUserStore();
  const user =
    input.telegramId !== undefined
      ? await users.find(input.telegramId)
      : input.gmail
        ? await users.findByGmail(input.gmail)
        : null;
  if (!user) return 'I could not find your MindFlow account. Start chatting with the Telegram bot first.';

  const allItems = await getItemStore().listByUser(user.telegramId);
  if (allItems.length === 0) return 'You have no saved items yet. Send something to the Telegram bot first.';

  // Answer in the user's language: stored preference wins, else the question.
  const lang = detectMarkers(input.question) ?? user.lang ?? 'en';
  if (lang !== user.lang) {
    await users.setLang(user.telegramId, lang);
  }

  // Deterministic range handling: "sabahdan/from tomorrow" counts from that
  // date to infinity (inclusive start, no upper bound); "bugunden/from today"
  // includes today. Pre-filter here so the model counts exactly.
  const range = parseListRequest(input.question);
  const fromDate = range?.fromDate ?? resolveRangeStart(input.question);
  const category = range?.category ?? findCategoryWord(input.question.toLowerCase());
  const items = allItems.filter((item) => {
    if (category && item.category !== category) return false;
    if (fromDate) {
      const d = itemDate(item.fields);
      if (!d || d < fromDate) return false;
    }
    return true;
  });
  if (fromDate && items.length === 0) {
    return `No saved items from ${fromDate} onward yet. Send something to the Telegram bot first.`;
  }

  const lines = items
    .slice(0, 100)
    .map((item) => {
      const fields = Object.entries(item.fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
      return `- [${item.category}] ${fields}`;
    })
    .join('\n');

  const system = `You are the MindFlow assistant. Answer the user's question using ONLY the saved items below. Today is ${todayBaku()} (Asia/Baku). Date rules: "sabahdan/from tomorrow/starting tomorrow" means date >= ${fromDate ?? 'the resolved start'} inclusive with NO upper bound (to infinity, count everything on and after that day). "bugunden/from today" means date >= today inclusive — today counts. Items below are already filtered to the requested range: count them exactly, do not drop same-day items. Health records contain title/description/doctor/specialty/diagnosis/visit_date/files. Never invent a diagnosis; only quote stored diagnosis. If the answer is not in the items, say so briefly. If the question is ambiguous, ask one clarifying question. Reply in ${lang === 'az' ? 'Azerbaijani' : 'English'}.`;
  const rangeNote = fromDate
    ? `Range start (inclusive, no end): ${fromDate}\nMatching items: ${items.length}\n`
    : '';
  const answer = (
    await generateText(env.GEMINI_API_KEY, env.GEMINI_MODEL, system, `${rangeNote}${input.question}\n\nSaved items:\n${lines}`, {
      temperature: 0.3,
      maxOutputTokens: 1024,
    })
  ).trim();
  return answer || 'Sorry, I could not find an answer in your saved items.';
}
