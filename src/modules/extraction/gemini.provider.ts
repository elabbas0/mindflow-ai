import { z } from 'zod';
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
  })
  .passthrough();

const KNOWN_KEYS = ['title', 'description', 'location', 'deadline', 'date', 'time'] as const;

function todayBaku(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function systemPrompt(): string {
  return `You extract structured fields from a short user message (Azerbaijani or English) for a personal organizer app.
Today is ${todayBaku()} (Asia/Baku timezone).
Resolve relative dates (sabah, bugun, bu gun, next week, etc.) against today and output ISO YYYY-MM-DD for date and deadline; times as 24h HH:MM.
Reply with JSON only, containing only keys you are confident about from: title, description, location, deadline, date, time.
title: short 3-8 word name of the task/meeting/project/note, never the whole message.
description: what needs to be done and any extra context/notes. location: venue, platform, or city.
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
    // backward compat: old outputs used `notes` for meetings
    const notesVal = parsed['notes'];
    if (typeof notesVal === 'string' && notesVal.trim() && !out['description']) {
      out['description'] = notesVal.trim();
    }
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

/** Production extractor: Gemini Flash-Lite (free tier), JSON mode, one retry. */
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

/** Minimal Gemini generateContent call (free tier), shared by extraction and assistant. */
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
