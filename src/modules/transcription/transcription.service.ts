import { downloadVoiceFile } from '../../infra/telegram/client.js';
import { transcribeVoice } from '../../infra/openai/client.js';

/** Telegram voice file_id -> plain text via Whisper. */
export async function transcribeTelegramVoice(fileId: string): Promise<string> {
  const audio = await downloadVoiceFile(fileId);
  return transcribeVoice(audio);
}
