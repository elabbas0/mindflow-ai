const AZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avqust',
  'sentyabr',
  'oktyabr',
  'noyabr',
  'dekabr',
];

export function todayBaku(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function parseExplicit(text: string): string | null {
  const t = text.trim().toLowerCase();

  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = t.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    let year = m[3] ?? String(new Date().getFullYear());
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  m = t.match(new RegExp(`^(\\d{1,2})\\s+(${AZ_MONTHS.join('|')})(?:\\s+(\\d{4}))?$`));
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = String(AZ_MONTHS.indexOf(m[2]) + 1).padStart(2, '0');
    const base = todayBaku();
    let year = m[3] ?? base.slice(0, 4);
    let iso = `${year}-${month}-${day}`;
    if (!m[3] && iso < base) iso = `${Number(year) + 1}-${month}-${day}`;
    return iso;
  }

  return null;
}

export function resolveDateString(raw: string, baseIso?: string): string | null {
  const base = baseIso ?? todayBaku();
  const t = raw.trim().toLowerCase();
  if (!t) return null;

  const explicit = parseExplicit(t);
  if (explicit) return explicit;

  if (/\bbug[uü]n\b|\bbu\s+g[uü]n\b|\btoday\b/.test(t)) return base;
  if (/\bsabah\b|\btomorrow\b/.test(t)) return addDays(base, 1);
  if (/sra[gh]a?g[uü]n|day after tomorrow/.test(t)) return addDays(base, 2);

  let m = t.match(/(\d+)\s*(g[uü]n|gun|day|days)\s*(sonra|later|after)/);
  if (m) return addDays(base, Number(m[1]));

  m = t.match(/(sonra|in|after)\s*(\d+)\s*(g[uü]n|gun|day|days)/);
  if (m) return addDays(base, Number(m[2]));

  m = t.match(/(\d+)\s*(h[eə]ft[eə]|hefte|week|weeks)\s*(sonra|later|after)/);
  if (m) return addDays(base, Number(m[1]) * 7);

  if (/g[eə]l[eə]n\s+h[eə]ft[eə]|next week/.test(t)) return addDays(base, 7);

  m = t.match(/(\d+)\s*ay\s*sonra|in\s*(\d+)\s*months?/);
  if (m) return addDays(base, Number(m[1] ?? m[2]) * 30);

  return null;
}

export function resolveDateField(raw: string): string {
  const text = raw.trim();
  if (!text) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return resolveDateString(text) ?? text;
}

// Health "doctor visit date" normalizer: a visit already happened, so a
// year-less date that resolves to the future (e.g. "12 sentyabrda" said on
// Sept 19) rolls back to this year instead of forward to next year.
// Explicit years and already-ISO values are left untouched.
export function resolveVisitDateField(raw: string, baseIso?: string): string {
  const text = raw.trim();
  if (!text) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const resolved = resolveDateString(text, baseIso) ?? text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved)) return resolved;
  if (/\b(19|20)\d{2}\b/.test(text)) return resolved;
  const base = baseIso ?? todayBaku();
  if (resolved > base) {
    const [y, m, d] = resolved.split('-').map(Number);
    const rolled = `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return rolled;
  }
  return resolved;
}

// Range queries: "sabahdan ...", "bugündən ...", "from tomorrow ...".
// Returns the inclusive start date (ISO YYYY-MM-DD) with no upper bound,
// or null when the text carries no from-date intent.
export function resolveRangeStart(raw: string, baseIso?: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const hasMarker =
    /\b(from|starting|since|after|sonra)\b/.test(t) || /(dan|den|d\u0259n|tan|t\u0259n)\b/.test(t);
  if (!hasMarker) return null;

  // Strip ablative suffixes so "sabahdan" -> "sabah", "bug\u00fcnd\u0259n" -> "bug\u00fcn".
  const cleaned = t.replace(/(dan|den|d\u0259n|tan|t\u0259n)\b/g, '').replace(/-/g, ' ');
  const loose = resolveDateString(cleaned, baseIso) ?? resolveDateString(t, baseIso);
  if (loose) return loose;

  // Embedded explicit dates inside a question, e.g. "20 sentyabrdan ...".
  const base = baseIso ?? todayBaku();
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dm = cleaned.match(
    new RegExp(`(\\d{1,2})\\s+(${AZ_MONTHS.join('|')})(?:\\s+(\\d{4}))?`),
  );
  if (dm) {
    const day = dm[1].padStart(2, '0');
    const month = String(AZ_MONTHS.indexOf(dm[2]) + 1).padStart(2, '0');
    let year = dm[3] ?? base.slice(0, 4);
    let out = `${year}-${month}-${day}`;
    if (!dm[3] && out < base) out = `${Number(year) + 1}-${month}-${day}`;
    return out;
  }
  const slash = cleaned.match(/(\d{1,2})[.](\d{1,2})(?:[.](\d{2,4}))?/);
  if (slash) {
    const day = slash[1].padStart(2, '0');
    const month = slash[2].padStart(2, '0');
    let year = slash[3] ?? String(new Date().getFullYear());
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }
  return null;
}
