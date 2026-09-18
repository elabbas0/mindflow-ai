// Natural time expressions (Azerbaijani + English) -> 24h "HH:MM".
// "6-nın yarısı" -> 06:30, "6-ya qalmış 15 dəqiqə" -> 05:45,
// "quarter to 6" -> 05:45, "half past 6" -> 06:30, "17:30" -> 17:30.

const AZ_MONTHS_RE = 'yanvar|fevral|mart|aprel|may|iyun|iyul|avqust|sentyabr|oktyabr|noyabr|dekabr';

const AZ_WORDS: Record<string, number> = {
  bir: 1,
  iki: 2,
  'üç': 3,
  uc: 3,
  'dörd': 4,
  dord: 4,
  'beş': 5,
  bes: 5,
  'altı': 6,
  alti: 6,
  yeddi: 7,
  'səkkiz': 8,
  sekkiz: 8,
  doqquz: 9,
  on: 10,
  'on bir': 11,
  'on iki': 12,
};

const EN_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const AZ_WORD_RE = 'on\\s+iki|on\\s+bir|yeddi|səkkiz|sekkiz|doqquz|altı|alti|dörd|dord|beş|bes|üç|uc|iki|bir|on';
const EN_WORD_RE = 'twelve|eleven|three|seven|eight|nine|ten|five|four|six|two|one';
const HOUR_RE = `(\\d{1,2}|${AZ_WORD_RE}|${EN_WORD_RE})`;

const DAYPART_RE = 's[əe]h[əe]r|g[üu]norta|ax[şs]am|gec[əe]|morning|afternoon|evening|night|tonight';

function parseHourToken(tok: string): number | null {
  if (/^\d{1,2}$/.test(tok)) return Number(tok);
  const w = tok.toLowerCase().replace(/\s+/g, ' ');
  return AZ_WORDS[w] ?? EN_WORDS[w] ?? null;
}

function fmt(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function nowBakuMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baku',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

// Dayparts only ever move the hour forward (səhər keeps it as-is).
function applyDaypart(h: number, m: number, t: string): [number, number] {
  if (/s[əe]h[əe]r|\bin the morning\b/.test(t)) return [h, m];
  if (/g[üu]norta|\bin the afternoon\b/.test(t)) return h < 12 ? [h + 12, m] : [h, m];
  if (/ax[şs]am|\bin the evening\b/.test(t)) {
    if (h === 12) return [0, m];
    return h >= 1 && h <= 11 ? [h + 12, m] : [h, m];
  }
  if (/gec[əe]|night|tonight/.test(t)) {
    if (h === 12) return [0, m];
    return h >= 6 && h <= 11 ? [h + 12, m] : [h, m];
  }
  return [h, m];
}

export interface TimeOpts {
  // Loose mode is for dedicated time-field answers ("6", "10 to 6"):
  // bare hours are accepted. Strict mode (full-sentence extraction) only
  // accepts hours with saat/-da/daypart context to avoid eating dates.
  loose?: boolean;
  // Minutes since midnight (Asia/Baku) for relative expressions; testing hook.
  nowMin?: number;
}

export function resolveTimeString(raw: string, opts: TimeOpts = {}): string | null {
  const t = raw.trim().toLowerCase();
  if (!t || t.length > 80) return null;
  const loose = opts.loose ?? false;

  // 1. Explicit HH:MM, optional am/pm.
  let m = t.match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?\b/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    const ap = m[3]?.replace(/\./g, '');
    if (ap === 'pm' && h < 12) return fmt(h + 12, min);
    if (ap === 'am' && h === 12) return fmt(0, min);
    if (ap && h > 12) return null;
    const [hh, mm] = applyDaypart(h, min, t);
    return fmt(hh, mm);
  }

  // 2. H am/pm.
  m = t.match(new RegExp(`${HOUR_RE}\\s*(am|pm|a\\.m\\.|p\\.m\\.)\\b`, 'i'));
  if (m) {
    const h = parseHourToken(m[1]);
    if (h === null || h > 12) return null;
    const ap = m[2].replace(/\./g, '');
    if (ap === 'pm' && h < 12) return fmt(h + 12, 0);
    if (ap === 'am' && h === 12) return fmt(0, 0);
    return fmt(h, 0);
  }

  // 3. noon / midnight.
  if (/\bnoon\b/.test(t)) return fmt(12, 0);
  if (/\bmidnight\b/.test(t)) return fmt(0, 0);

  // 4. Half past: "6-nın yarısı", "altının yarısı", "half past 6".
  m = t.match(new RegExp(`${HOUR_RE}\\s*-?\\s*(?:n[ıi]n|nin|nun|n[üu]n)\\s*yar[ıi]s[ıi]`, 'i'));
  if (m) {
    // Note: "onun yarısı" (half of it) never matches: "un" is not a valid suffix here.
    const h = parseHourToken(m[1].trim());
    if (h === null || h < 1 || h > 12) return null;
    const [hh, mm] = applyDaypart(h, 30, t);
    return fmt(hh, mm);
  }
  m = t.match(new RegExp(`half\\s*past\\s*${HOUR_RE}`, 'i'));
  if (m) {
    const h = parseHourToken(m[1].trim());
    if (h === null || h < 1 || h > 12) return null;
    const [hh, mm] = applyDaypart(h, 30, t);
    return fmt(hh, mm);
  }

  // 5. Quarter past / to (EN).
  m = t.match(new RegExp(`quarter\\s*past\\s*${HOUR_RE}`, 'i'));
  if (m) {
    const h = parseHourToken(m[1].trim());
    if (h === null || h < 1 || h > 12) return null;
    const [hh, mm] = applyDaypart(h, 15, t);
    return fmt(hh, mm);
  }
  m = t.match(new RegExp(`quarter\\s*(?:to|of)\\s*${HOUR_RE}`, 'i'));
  if (m) {
    const h = parseHourToken(m[1].trim());
    if (h === null || h < 1 || h > 12) return null;
    const [hh, mm] = applyDaypart(h === 1 ? 0 : h - 1, 45, t);
    return fmt(hh, mm);
  }
  // "15 minutes past/to 6", "10 past 6" ("10 to 6" only in loose mode:
  // "from 5 to 6" is a range, not a time).
  m = t.match(new RegExp(`(\\d{1,2})\\s*minutes?\\s*(past|to)\\s*${HOUR_RE}`, 'i'));
  if (m) {
    const n = Number(m[1]);
    const h = parseHourToken(m[3].trim());
    if (n < 1 || n > 59 || h === null || h < 1 || h > 12) return null;
    const [hh, mm] = m[2] === 'past' ? [h, n] : [h === 1 ? 0 : h - 1, 60 - n];
    return fmt(...applyDaypart(hh, mm, t));
  }
  m = t.match(new RegExp(`(\\d{1,2})\\s*past\\s*${HOUR_RE}`, 'i'));
  if (m) {
    const n = Number(m[1]);
    const h = parseHourToken(m[2].trim());
    if (n < 1 || n > 59 || h === null || h < 1 || h > 12) return null;
    const [hh, mm] = applyDaypart(h, n, t);
    return fmt(hh, mm);
  }
  if (loose) {
    m = t.match(new RegExp(`(\\d{1,2})\\s*to\\s*${HOUR_RE}`, 'i'));
    if (m) {
      const n = Number(m[1]);
      const h = parseHourToken(m[2].trim());
      if (n < 1 || n > 59 || h === null || h < 1 || h > 12) return null;
      const [hh, mm] = applyDaypart(h === 1 ? 0 : h - 1, 60 - n, t);
      return fmt(hh, mm);
    }
  }

  // 6. Azerbaijani past/to with dəqiqə.
  // To: "6-ya qalmış 15 dəqiqə", "6-ya 15 dəqiqə qalıb", "15 dəqiqə 6-ya qalıb".
  const hourDat = `${HOUR_RE}\\s*-?\\s*(?:ya|y[əe]|[aə])`;
  const minWord = 'd[əe]qiq[əe]';
  let toH: number | null = null;
  let toN = 0;
  m = t.match(new RegExp(`${hourDat}\\s*qalm[ıi][şs]\\s*(\\d{1,2})\\s*${minWord}`));
  if (m) {
    toH = parseHourToken(m[1].trim());
    toN = Number(m[2]);
  }
  if (toH === null) {
    m = t.match(new RegExp(`${hourDat}\\s*(\\d{1,2})\\s*${minWord}\\s*qal[ıi][bş]`));
    if (m) {
      toH = parseHourToken(m[1].trim());
      toN = Number(m[2]);
    }
  }
  if (toH === null) {
    m = t.match(new RegExp(`(\\d{1,2})\\s*${minWord}\\s*${hourDat}\\s*qal[ıi][bş]`));
    if (m) {
      toN = Number(m[1]);
      toH = parseHourToken(m[2].trim());
    }
  }
  if (toH !== null) {
    if (toH < 1 || toH > 12 || toN < 1 || toN > 59) return null;
    const [hh, mm] = applyDaypart(toH === 1 ? 0 : toH - 1, 60 - toN, t);
    return fmt(hh, mm);
  }
  // Past: "6-nı 15 dəqiqə keçib", "15 dəqiqə 6-nı keçib".
  const hourAcc = `${HOUR_RE}\\s*-?\\s*(?:n[ıi]|nin|nun|n[üu]n|ya|y[əe]|[aə])`;
  m = t.match(new RegExp(`${hourAcc}\\s*(\\d{1,2})\\s*${minWord}\\s*(?:ke[çc]ib|ke[çc]di|i[şs]l[əe]yib)`));
  if (!m) m = t.match(new RegExp(`(\\d{1,2})\\s*${minWord}\\s*${hourAcc}\\s*(?:ke[çc]ib|ke[çc]di|i[şs]l[əe]yib)`));
  if (m) {
    let h: number | null;
    let n: number;
    if (m[0].match(new RegExp(`^(\\d{1,2})\\s*${minWord}`))) {
      n = Number(m[1]);
      h = parseHourToken(m[2].trim());
    } else {
      h = parseHourToken(m[1].trim());
      n = Number(m[2]);
    }
    if (h === null || h < 1 || h > 12 || n < 1 || n > 59) return null;
    const [hh, mm] = applyDaypart(h, n, t);
    return fmt(hh, mm);
  }

  // 7. Relative: "15 dəqiqə sonra", "2 saat sonra", "in 30 minutes".
  m = t.match(/(\d{1,2})\s*d[əe]qiq[əe]\s*sonra/);
  if (!m) m = t.match(/in\s*(\d{1,3})\s*minutes?/);
  if (m) {
    const base = opts.nowMin ?? nowBakuMinutes();
    return fmt(Math.floor(((base + Number(m[1])) % 1440) / 60), (base + Number(m[1])) % 60);
  }
  m = t.match(/yar[ıi]m\s*saat\s*sonra|in\s*(?:a|an)\s*half\s*(?:an\s*)?hour/);
  if (m) {
    const base = opts.nowMin ?? nowBakuMinutes();
    return fmt(Math.floor(((base + 30) % 1440) / 60), (base + 30) % 60);
  }
  m = t.match(/(\d{1,2}|bir|one)\s*saat\s*sonra/);
  if (!m) m = t.match(/in\s*(\d{1,2}|a|an|one)\s*hours?/);
  if (m) {
    const n = /^(bir|one|a|an)$/.test(m[1]) ? 1 : Number(m[1]);
    const base = opts.nowMin ?? nowBakuMinutes();
    return fmt(Math.floor(((base + n * 60) % 1440) / 60), (base + n * 60) % 60);
  }

  // 8. Bare hour with context (strict): "saat 6", "6-da", "axşam 6".
  // A bare "-da" next to a month ("Martın 6-da") is a date, not a time.
  const normalizeHour = (tok: string): string | null => {
    const h = parseHourToken(tok.trim());
    if (h === null || h > 23) return null;
    const [hh, mm] = applyDaypart(h, 0, t);
    return fmt(hh, mm);
  };
  m = t.match(new RegExp(`saat\\s*(?:tam\\s+)?${HOUR_RE}(?!\\d)`));
  if (m) return normalizeHour(m[1]);
  if (!new RegExp(AZ_MONTHS_RE).test(t)) {
    m = t.match(new RegExp(`${HOUR_RE}\\s*-?\\s*(?:da|d[əe]|de)(?!\\w)`));
    if (m) return normalizeHour(m[1]);
  }
  m = t.match(new RegExp(`(?:${DAYPART_RE})\\s*${HOUR_RE}(?!\\d)`));
  if (m) return normalizeHour(m[1]);
  m = t.match(new RegExp(`${HOUR_RE}\\s*(?:${DAYPART_RE})\\b`));
  if (m) return normalizeHour(m[1]);
  m = t.match(new RegExp(`${HOUR_RE}\\s*o'clock\\b`, 'i'));
  if (m) return normalizeHour(m[1]);

  if (!loose) return null;

  // 9. Loose-only: lone hour digits/words, "6 30", "1830".
  m = t.match(/^(\d{1,2})$/);
  if (m && Number(m[1]) <= 23) {
    const [hh, mm] = applyDaypart(Number(m[1]), 0, t);
    return fmt(hh, mm);
  }
  m = t.match(new RegExp(`^(${AZ_WORD_RE}|${EN_WORD_RE})$`, 'i'));
  if (m) {
    const h = parseHourToken(m[1].trim());
    if (h !== null) {
      const [hh, mm] = applyDaypart(h, 0, t);
      return fmt(hh, mm);
    }
  }
  m = t.match(/^(\d{1,2})\s+(\d{2})$/);
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return fmt(Number(m[1]), Number(m[2]));
  m = t.match(/^(\d{3,4})$/);
  if (m) {
    const rawDigits = m[1];
    if (rawDigits.length === 4) {
      const year = Number(rawDigits);
      if (year >= 1900 && year <= 2100) return null;
      const h = Number(rawDigits.slice(0, 2));
      const min = Number(rawDigits.slice(2));
      if (h <= 23 && min <= 59) return fmt(h, min);
      return null;
    }
    const h = Number(rawDigits.slice(0, 1));
    const min = Number(rawDigits.slice(1));
    if (min <= 59) return fmt(h, min);
  }
  return null;
}

// Time-field normalizer: understood expressions become HH:MM,
// anything else passes through untouched (never corrupt user data).
export function resolveTimeField(raw: string): string {
  const text = raw.trim();
  if (!text) return text;
  return resolveTimeString(text, { loose: true }) ?? text;
}
