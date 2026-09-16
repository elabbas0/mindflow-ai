import { getItemStore, type ItemRecord } from '../events/items.repository.js';
import { CATEGORIES } from './category-fields.js';

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

const CATEGORY_WORDS: { id: string; words: string[] }[] = [
  { id: 'todo', words: ['todo', 'task', 'tapşırıq', 'tapsiriq', 'tapshiriq'] },
  { id: 'meetings', words: ['meeting', 'görüş', 'gorus'] },
  { id: 'projects', words: ['project', 'proyekt', 'layihə', 'layihe'] },
  { id: 'notes', words: ['note', 'qeyd', 'not'] },
];

export interface ListRequest {
  category?: string;
}

export function parseListRequest(text: string): ListRequest | null {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 60) return null;

  const first = t.split(/\s+/)[0];
  if (first.startsWith('/')) {
    if (!(first in LIST_COMMANDS)) return null;
    return { category: LIST_COMMANDS[first] ?? findCategoryWord(t) };
  }
  if (!LIST_PHRASES.some((re) => re.test(t))) return null;
  return { category: findCategoryWord(t) };
}

function findCategoryWord(t: string): string | undefined {
  for (const entry of CATEGORY_WORDS) {
    if (entry.words.some((w) => t.includes(w))) return entry.id;
  }
  return undefined;
}

function lineFor(fields: Record<string, string>): string {
  const title = fields.title || fields.description || fields.notes || 'Untitled';
  const extras = [fields.date, fields.time ?? fields.deadline, fields.location].filter(
    (v): v is string => !!v,
  );
  return extras.length > 0 ? `${title} — ${extras.join(' ')}` : title;
}

export async function listUserItems(userId: number, category?: string): Promise<string> {
  const items = await getItemStore().listByUser(userId);
  const wanted = category ? items.filter((item) => item.category === category) : items;
  if (wanted.length === 0) return 'You have no saved items yet. Send me something first!';

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
