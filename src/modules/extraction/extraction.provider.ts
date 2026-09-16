import { env } from '../../config/env.js';
import { resolveDateString } from '../capture/dates.js';
import { GeminiExtractionProvider } from './gemini.provider.js';

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

    const iso = resolveDateString(t);
    if (iso) {
      out.date = iso;
      out.deadline = iso;
    } else {
      const dm = t.match(new RegExp(`(\\d{1,2})\\s+(${AZ_MONTHS.join('|')})`, 'i'));
      if (dm) {
        const resolved = resolveDateString(dm[0]);
        if (resolved) {
          out.date = resolved;
          out.deadline = resolved;
        }
      }
    }

    const first = t.split(/[.!?\n]/)[0].trim();
    if (first) out.title = first.slice(0, 80);
    return out;
  }
}

let provider: ExtractionProvider | null = null;

export function getExtractionProvider(): ExtractionProvider {
  if (!provider) {
    provider =
      env.LLM_PROVIDER === 'gemini' && env.GEMINI_API_KEY
        ? new GeminiExtractionProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL)
        : new StubExtractionProvider();
  }
  return provider;
}
