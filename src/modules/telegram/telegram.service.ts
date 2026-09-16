import { handleCapture } from '../capture/capture.service.js';
import type { TelegramUpdate } from './telegram.schemas.js';

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  await handleCapture(update);
}
