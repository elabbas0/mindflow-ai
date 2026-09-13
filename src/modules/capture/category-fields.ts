export const CATEGORIES = [
  { id: 'todo', label: '📋 To Do List' },
  { id: 'projects', label: '📁 Projects' },
  { id: 'meetings', label: '📅 Meetings' },
  { id: 'notes', label: '📝 Notes' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

/** PRD §11: the order missing fields are asked in, per category. */
export const FIELD_ORDER: Record<CategoryId, string[]> = {
  todo: ['date', 'time', 'description'],
  projects: ['title', 'description', 'deadline'],
  meetings: ['title', 'description', 'location', 'date', 'time'],
  notes: ['title', 'description', 'time'],
};

export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  // kept for reading old items that still have a `notes` field
  notes: 'Description',
  location: 'Location',
  date: 'Date',
  time: 'Time',
  deadline: 'Deadline',
};
