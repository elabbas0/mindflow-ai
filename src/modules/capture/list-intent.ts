import { getItemStore, type ItemRecord } from '../events/items.repository.js';
import { CATEGORIES } from './category-fields.js';
import { resolveRangeStart } from './dates.js';

const LIST_COMMANDS: Record<string, string | null> = {
  '/list': null,
  '/todos': 'todo',
  '/todo': 'todo',
  '/meetings': 'meetings',
  '/projects': 'projects',
  '/notes': 'notes',
};

const LIST_PHRASES = [
  /\blist\b/,
  /siyahı/,
  /siyahi/,
  /tapşırıq/,
  /tapsiriq/,
  /tapshiriq/,
  /my tasks/,
  /what did i save/,
  /show everything/,
  /hamısını/,
  /nələr var/,
  /neler var/,
  /göstər/,
  /goster/,
];

const RANGE_QUESTION_PHRASES = [
  /hansı/,
  /hansi/,
  /neçə/,
  /nece/,
  /nə qədər/,
  /ne qeder/,
  /how many/,
  /how much/,
  /\bvar\b/,
  /\bfrom\b/,
  /\bsince\b/,
  /sabahdan/,
  /bug[uü]n/,
  /sonra/,
];

const CATEGORY_WORDS: { id: string; words: string[] }[] = [
  { id: 'todo', words: ['todo', 'task', 'tapşırıq', 'tapsiriq', 'tapshiriq'] },
  { id: 'meetings', words: ['meeting', 'görüş', 'gorus'] },
  { id: 'projects', words: ['project', 'proyekt', 'layihə', 'layihe'] },
  { id: 'notes', words: ['note', 'qeyd', 'not'] },
];

export interface ListRequest {
  category?: string;
  fromDate?: string;
}

export function parseListRequest(text: string): ListRequest | null {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 80) return null;

  const first = t.split(/\s+/)[0];
  if (first.startsWith('/')) {
    if (!(first in LIST_COMMANDS)) return null;
    return { category: LIST_COMMANDS[first] ?? findCategoryWord(t) };
  }
  // Date-range questions: "sabahdan hansi goruslerim var?",
  // "from tomorrow, how many meetings/tasks do i have".
  const fromDate = resolveRangeStart(t);
  if (fromDate && RANGE_QUESTION_PHRASES.some((re) => re.test(t))) {
    return { category: findCategoryWord(t), fromDate };
  }
  if (!LIST_PHRASES.some((re) => re.test(t))) return null;
  return { category: findCategoryWord(t) };
}

export function findCategoryWord(t: string): string | undefined {
  const lower = t.toLowerCase();
  const hits = CATEGORY_WORDS.filter((entry) => entry.words.some((w) => lower.includes(w))).map(
    (entry) => entry.id,
  );
  // "meetings/tasks" mentions several categories: count everything.
  if (hits.length !== 1) return undefined;
  return hits[0];
}

function lineFor(fields: Record<string, string>): string {
  const title = fields.title || fields.description || fields.notes || 'Untitled';
  const extras = [fields.date, fields.time ?? fields.deadline, fields.location].filter(
    (v): v is string => !!v,
  );
  return extras.length > 0 ? `${title} — ${extras.join(' ')}` : title;
}

export function itemDate(fields: Record<string, string>): string | null {
  const raw = fields.date ?? fields.deadline ?? null;
  if (!raw) return null;
  const m = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return m ? m[1] : null;
}

export async function listUserItems(userId: number, category?: string, fromDate?: string): Promise<string> {
  const items = await getItemStore().listByUser(userId);
  const wanted = items.filter((item) => {
    if (category && item.category !== category) return false;
    // Range queries count from the date to infinity (inclusive start, no end).
    if (fromDate) {
      const d = itemDate(item.fields);
      if (!d || d < fromDate) return false;
    }
    return true;
  });
  if (wanted.length === 0) {
    if (fromDate) return `No saved items from ${fromDate} onward yet. Send me something first!`;
    return 'You have no saved items yet. Send me something first!';
  }

  const byCategory = new Map<string, ItemRecord[]>();
  for (const item of wanted) {
    const group = byCategory.get(item.category) ?? [];
    group.push(item);
    byCategory.set(item.category, group);
  }

  const blocks: string[] = [];
  for (const cat of CATEGORIES) {
    const group = byCategory.get(cat.id);
    if (!group || group.length === 0) continue;
    const lines = group.slice(0, 10).map((item) => `• ${lineFor(item.fields)}`);
    if (group.length > 10) lines.push(`…and ${group.length - 10} more`);
    blocks.push(`${cat.label} (${group.length})\n${lines.join('\n')}`);
  }
  return blocks.join('\n\n');
}
