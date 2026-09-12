import { env } from '../../config/env.js';
import { NotConfiguredError } from '../../shared/errors.js';
import { getItemStore } from '../events/items.repository.js';
import { getUserStore } from '../users/users.repository.js';
import { generateText } from '../extraction/gemini.provider.js';

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

  const items = await getItemStore().listByUser(user.telegramId);
  if (items.length === 0) return 'You have no saved items yet. Send something to the Telegram bot first.';

  const lines = items
    .slice(0, 100)
    .map((item) => {
      const fields = Object.entries(item.fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
      return `- [${item.category}] ${fields}`;
    })
    .join('\n');

  const system = `You are the MindFlow assistant. Answer the user's question using ONLY the saved items below. Today is ${todayBaku()} (Asia/Baku). Understand time contexts like today, tomorrow, and next week. If the answer is not in the items, say so briefly. If the question is ambiguous, ask one clarifying question. Reply in the user's language.`;
  const answer = (
    await generateText(env.GEMINI_API_KEY, env.GEMINI_MODEL, system, `${input.question}\n\nSaved items:\n${lines}`, {
      temperature: 0.3,
      maxOutputTokens: 1024,
    })
  ).trim();
  return answer || 'Sorry, I could not find an answer in your saved items.';
}
