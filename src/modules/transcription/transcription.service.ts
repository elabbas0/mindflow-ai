import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { downloadVoiceFile } from '../../infra/telegram/client.js';
import { NotConfiguredError } from '../../shared/errors.js';

export function isVoiceConfigured(): boolean {
  return !!env.GROQ_API_KEY;
}

/** Telegram voice file_id -> plain text via Groq Whisper (free tier). */
export async function transcribeTelegramVoice(fileId: string): Promise<string> {
  if (!env.GROQ_API_KEY) throw new NotConfiguredError('Groq');
  const audio = await downloadVoiceFile(fileId);
  const groq = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
  const file = await OpenAI.toFile(audio, 'voice.ogg');
  const res = await groq.audio.transcriptions.create({ file, model: 'whisper-large-v3-turbo' });
  return res.text;
}
