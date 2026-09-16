export const CATEGORIES = [
  { id: 'todo', label: 'To Do List' },
  { id: 'projects', label: 'Projects' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'notes', label: 'Notes' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

// Order fields are asked in, per category.
export const FIELD_ORDER: Record<CategoryId, string[]> = {
  todo: ['date', 'time', 'description'],
  projects: ['title', 'description', 'deadline'],
  meetings: ['title', 'description', 'location', 'date', 'time'],
  notes: ['title', 'description', 'date'],
};

export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  // old items may still have `notes`
  notes: 'Description',
  location: 'Location',
  date: 'Date',
  time: 'Time',
  deadline: 'Deadline',
};