import { env } from '../../config/env.js';
import { NotConfiguredError } from '../../shared/errors.js';

const API = 'https://api.telegram.org';

function requireToken(): string {
  if (!env.TELEGRAM_BOT_TOKEN) throw new NotConfiguredError('Telegram');
  return env.TELEGRAM_BOT_TOKEN;
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = requireToken();
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`);
}

export async function downloadVoiceFile(fileId: string): Promise<Buffer> {
  const token = requireToken();
  const fileRes = await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!fileRes.ok) throw new Error(`Telegram getFile failed: ${fileRes.status}`);
  const fileJson = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = fileJson.result?.file_path;
  if (!filePath) throw new Error('Telegram getFile returned no file_path');

  const dlRes = await fetch(`${API}/file/bot${token}/${filePath}`);
  if (!dlRes.ok) throw new Error(`Telegram file download failed: ${dlRes.status}`);
  return Buffer.from(await dlRes.arrayBuffer());
}
