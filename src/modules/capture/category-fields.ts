export const CATEGORIES = [
  { id: 'todo', label: 'To Do List' },
  { id: 'projects', label: 'Projects' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'notes', label: 'Notes' },
  { id: 'health', label: 'Health' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

// Order fields are asked in, per category.
// NOTE: health `title` is auto-generated from description and never asked,
// so it is deliberately NOT in FIELD_ORDER.
export const FIELD_ORDER: Record<CategoryId, string[]> = {
  todo: ['date', 'time', 'description'],
  projects: ['title', 'description', 'deadline'],
  meetings: ['title', 'description', 'location', 'date', 'time'],
  notes: ['title', 'description', 'date'],
  health: ['description', 'doctor', 'specialty', 'diagnosis', 'visit_date', 'files'],
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
  doctor: 'Doctor',
  specialty: 'Specialty',
  diagnosis: 'Diagnosis',
  visit_date: 'Visit date',
  files: 'Files',
};

// Required fields enforced on POST/PUT. Existing categories keep all
// FIELD_ORDER fields required; health requires only `description`
// (title is auto-generated, the rest are skippable per PRD).
export const CATEGORY_REQUIRED: Record<CategoryId, string[]> = {
  todo: ['date', 'time', 'description'],
  projects: ['title', 'description', 'deadline'],
  meetings: ['title', 'description', 'location', 'date', 'time'],
  notes: ['title', 'description', 'date'],
  health: ['description'],
};