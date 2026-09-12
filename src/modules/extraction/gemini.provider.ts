import { z } from 'zod';
import type { ExtractedFields, ExtractionProvider } from './extraction.provider.js';

const extractedSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    location: z.string().optional(),
    deadline: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
  })
  .passthrough();

const KNOWN_KEYS = ['title', 'description', 'notes', 'location', 'deadline', 'date', 'time'] as const;

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
Reply with JSON only, containing only keys you are confident about from: title, description, notes, location, deadline, date, time.
title: short 3-8 word name of the task/meeting/project/note, never the whole message.
description: what needs to be done. notes: extra context. location: venue, platform, or city.
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
    return out;
  } catch {
    return null;
  }
}

/** Production extractor: Gemini Flash-Lite (free tier), JSON mode, one retry. */
export class GeminiExtractionProvider implements ExtractionProvider {
  constructor(
    private apiKey: string,
    private model = 'gemini-2.0-flash-lite',
  ) {}

  async extract(text: string): Promise<ExtractedFields> {
    const first = await this.complete(text, false);
    const parsed = safeParse(first);
    if (parsed) return parsed;
    const second = await this.complete(text, true);
    return safeParse(second) ?? {};
  }

  private async complete(text: string, retry: boolean): Promise<string> {
    const userText = retry
      ? `${text}\n\nPrevious reply was not valid JSON. Reply with valid JSON only.`
      : text;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt() }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 512 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    );
  }
}
