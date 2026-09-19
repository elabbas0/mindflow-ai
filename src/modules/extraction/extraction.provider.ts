import { env } from '../../config/env.js';
import { resolveDateString, resolveVisitDateField } from '../capture/dates.js';
import { resolveTimeString } from '../capture/times.js';
import { GeminiExtractionProvider } from './gemini.provider.js';

export interface ExtractedFields {
  title?: string;
  description?: string;
  notes?: string;
  location?: string;
  deadline?: string;
  date?: string;
  time?: string;
  doctor?: string;
  specialty?: string;
  diagnosis?: string;
  visit_date?: string;
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

const SPECIALTY_KEYWORDS: { re: RegExp; value: string }[] = [
  { re: /endokrinoloq|endocrinologist/i, value: 'endokrinoloq' },
  { re: /kardioloq|cardiologist/i, value: 'kardioloq' },
  { re: /stomatoloq|dentist/i, value: 'stomatoloq' },
  { re: /terapevt|therapist/i, value: 'terapevt' },
  { re: /pediatr|pediatrician/i, value: 'pediatr' },
  { re: /c[əe]rrah|surgeon/i, value: 'cərrah' },
  { re: /nevroloq|neurologist/i, value: 'nevroloq' },
  { re: /oftalmoloq|ophthalmologist|oculist/i, value: 'oftalmoloq' },
  { re: /dermatoloq|dermatologist/i, value: 'dermatoloq' },
  { re: /ginekoloq|gynecologist/i, value: 'ginekoloq' },
  { re: /uroloq|urologist/i, value: 'uroloq' },
  { re: /ortoped|orthoped/i, value: 'ortoped' },
];

class StubExtractionProvider implements ExtractionProvider {
  async extract(text: string): Promise<ExtractedFields> {
    const t = text.trim();
    const out: ExtractedFields = {};

    const tm = resolveTimeString(t);
    if (tm) out.time = tm;

    const iso = resolveDateString(t);
    if (iso) {
      out.date = iso;
      out.deadline = iso;
      // Generic dates on health records map to the visit date as well.
      out.visit_date = iso;
    } else {
      const dm = t.match(new RegExp(`(\\d{1,2})\\s+(${AZ_MONTHS.join('|')})`, 'i'));
      if (dm) {
        const resolved = resolveDateString(dm[0]);
        if (resolved) {
          out.date = resolved;
          out.deadline = resolved;
          // Visit dates already happened: year-less "12 sentyabr" said after
          // that day this year means this year, not next year.
          out.visit_date = resolveVisitDateField(dm[0]);
        }
      }
    }

    // Doctor: "dr. Name Surname" (case-insensitive, az/en names).
    const drMatch = t.match(/dr\.?\s+([A-ZƏĞIÖÜŞÇa-zəğıöüçş][\wəğıöüşçƏĞIÖÜŞÇ .'\-]{1,40})/iu);
    if (drMatch) out.doctor = drMatch[1].trim().replace(/[.,;]+$/, '');

    // Specialty: keyword match only, never invented.
    for (const spec of SPECIALTY_KEYWORDS) {
      if (spec.re.test(t)) {
        out.specialty = spec.value;
        break;
      }
    }

    // Diagnosis: explicit "diagnosis:/diaqnoz:" prefix only — NEVER invent.
    const diagMatch = t.match(/(?:diagnosis|diaqnoz)[^:\n]*:\s*(.+)/i);
    if (diagMatch) {
      const value = diagMatch[1].split(/[\n;]/)[0].trim().slice(0, 200);
      if (value) out.diagnosis = value;
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
