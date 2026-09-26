import { env } from '../../config/env.js';
import { NotConfiguredError } from '../../shared/errors.js';
import { pushOutbox, type OutboxButton } from './outbox.js';

export interface InlineButton {
  text: string;
  callback_data: string;
}

const API = 'https://api.telegram.org';

function requireToken(): string {
  if (!env.TELEGRAM_BOT_TOKEN) throw new NotConfiguredError('Telegram');
  return env.TELEGRAM_BOT_TOKEN;
}

export async function sendMessage(chatId: number, text: string, buttons: InlineButton[][] = []): Promise<void> {
  if (env.DEV_MODE) {
    pushOutbox(chatId, text, buttons as OutboxButton[][]);
    return;
  }
  const token = requireToken();
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`);
}

export async function answerCallbackQuery(callbackId: string): Promise<void> {
  if (env.DEV_MODE) return;
  const token = requireToken();
  await fetch(`${API}/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

export async function downloadVoiceFile(fileId: string): Promise<Buffer> {
  const { buffer } = await downloadTelegramFile(fileId);
  return buffer;
}

/** Generic Telegram file_id -> bytes. Works for documents, photos, voice, etc. */
export async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
  const token = requireToken();
  const fileRes = await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!fileRes.ok) throw new Error(`Telegram getFile failed: ${fileRes.status}`);
  const fileJson = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = fileJson.result?.file_path;
  if (!filePath) throw new Error('Telegram getFile returned no file_path');

  const dlRes = await fetch(`${API}/file/bot${token}/${filePath}`);
  if (!dlRes.ok) throw new Error(`Telegram file download failed: ${dlRes.status}`);
  return { buffer: Buffer.from(await dlRes.arrayBuffer()), filePath };
}
