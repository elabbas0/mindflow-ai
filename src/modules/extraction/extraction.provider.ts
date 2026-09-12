export interface ExtractedFields {
  title?: string;
  description?: string;
  notes?: string;
  location?: string;
  deadline?: string;
  date?: string;
  time?: string;
}

export interface ExtractionProvider {
  extract(text: string): Promise<ExtractedFields>;
}

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

/** Placeholder until the Gemini provider lands: Azerbaijani date/time regexes. */
class StubExtractionProvider implements ExtractionProvider {
  async extract(text: string): Promise<ExtractedFields> {
    const t = text.trim();
    const out: ExtractedFields = {};

    const hm = t.match(/(\d{1,2})[:.](\d{2})/);
    if (hm) {
      out.time = `${hm[1].padStart(2, '0')}:${hm[2]}`;
    } else {
      const h = t.match(/saat\s+(\d{1,2})/i);
      if (h) out.time = `${h[1].padStart(2, '0')}:00`;
    }

    const dm = t.match(new RegExp(`(\\d{1,2})\\s+(${AZ_MONTHS.join('|')})`, 'i'));
    if (dm) {
      out.date = `${dm[1]} ${dm[2].toLowerCase()}`;
    } else if (/\bsabah\b/i.test(t)) {
      out.date = 'sabah';
    } else if (/\bbu\s*gün\b|\bbugün\b/i.test(t)) {
      out.date = 'bugün';
    }

    const first = t.split(/[.!?\n]/)[0].trim();
    if (first) out.title = first.slice(0, 80);
    // description/notes/location/deadline need a real model (lands with Gemini).
    return out;
  }
}

let provider: ExtractionProvider | null = null;

export function getExtractionProvider(): ExtractionProvider {
  if (!provider) provider = new StubExtractionProvider();
  return provider;
}
