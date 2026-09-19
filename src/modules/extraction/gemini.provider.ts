import { z } from 'zod';
import { resolveDateField, resolveVisitDateField, todayBaku } from '../capture/dates.js';
import { resolveTimeField } from '../capture/times.js';
import type { ExtractedFields, ExtractionProvider } from './extraction.provider.js';

const extractedSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    // `notes` kept only for reading old model outputs / old stored items
    notes: z.string().optional(),
    location: z.string().optional(),
    deadline: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    doctor: z.string().optional(),
    specialty: z.string().optional(),
    diagnosis: z.string().optional(),
    visit_date: z.string().optional(),
  })
  .passthrough();

const KNOWN_KEYS = [
  'title',
  'description',
  'location',
  'deadline',
  'date',
  'time',
  'doctor',
  'specialty',
  'diagnosis',
  'visit_date',
] as const;

function systemPrompt(): string {
  return `You extract structured fields from a short user message (Azerbaijani or English) for a personal organizer app.
Today is ${todayBaku()} (Asia/Baku timezone).
Resolve relative dates (sabah, bugun, bu gun, next week, etc.) against today and output ISO YYYY-MM-DD for date, deadline and visit_date; times as 24h HH:MM.
Time expressions: "yarısı/half past" is :30 ("6-nın yarısı" -> 06:30); "qalmış/quarter to" counts back ("6-ya qalmış 15 dəqiqə" -> 05:45); "keçib/N minutes past" counts forward ("6-nı 15 dəqiqə keçib" -> 06:15); honor am/pm, noon (12:00), midnight (00:00), and dayparts (axşam/evening/pm add 12 to hours 1-11).
Reply with JSON only, containing only keys you are confident about from: title, description, location, deadline, date, time, doctor, specialty, diagnosis, visit_date.
title: short 3-8 word name of the task/meeting/project/note/health record, never the whole message.
description: what needs to be done and any extra context/notes. location: venue, platform, or city.
Health fields: doctor (name + surname of the doctor), specialty (e.g. kardioloq, terapevt, stomatoloq), diagnosis (ONLY when the user states it explicitly — never invent or guess a diagnosis; omit the key otherwise), visit_date (date of the doctor visit as ISO YYYY-MM-DD, same resolution rules as date).
Omit keys you cannot determine. No markdown, no commentary.`;
}

function safeParse(raw: string): ExtractedFields | null {
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    const parsed = extractedSchema.parse(JSON.parse(cleaned)) as unknown as Record<string, unknown>;
    const out: ExtractedFields = {};
    for (const key of KNOWN_KEYS) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    }
    const notesVal = parsed['notes'];
    if (typeof notesVal === 'string' && notesVal.trim() && !out['description']) {
      out['description'] = notesVal.trim();
    }
    if (out.date) out.date = resolveDateField(out.date);
    if (out.deadline) out.deadline = resolveDateField(out.deadline);
    if (out.visit_date) out.visit_date = resolveVisitDateField(out.visit_date);
    if (out.time) out.time = resolveTimeField(out.time);
    return out;
  } catch {
    return null;
  }
}

export interface GeminiTextOptions {
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export class GeminiExtractionProvider implements ExtractionProvider {
  constructor(
    private apiKey: string,
    private model = 'gemini-2.0-flash-lite',
  ) {}

  async extract(text: string): Promise<ExtractedFields> {
    const first = await generateText(this.apiKey, this.model, systemPrompt(), text, { json: true });
    const parsed = safeParse(first);
    if (parsed) return parsed;
    const second = await generateText(
      this.apiKey,
      this.model,
      systemPrompt(),
      `${text}\n\nPrevious reply was not valid JSON. Reply with valid JSON only.`,
      { json: true },
    );
    return safeParse(second) ?? {};
  }
}

export async function generateText(
  apiKey: string,
  model: string,
  system: string,
  userText: string,
  options: GeminiTextOptions = {},
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxOutputTokens ?? 512,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}
