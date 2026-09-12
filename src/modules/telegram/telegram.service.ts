import { handleCapture } from '../capture/capture.service.js';
import type { TelegramUpdate } from './telegram.schemas.js';

/** Entry point for Telegram updates: delegates to the capture flow (PRD). */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  await handleCapture(update);
}
