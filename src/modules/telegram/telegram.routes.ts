import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { handleTelegramUpdate } from './telegram.service.js';
import { telegramUpdateSchema } from './telegram.schemas.js';

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/telegram/webhook', async (req, reply) => {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const got = req.headers['x-telegram-bot-api-secret-token'];
      if (got !== env.TELEGRAM_WEBHOOK_SECRET) {
        return reply.code(401).send({ ok: false });
      }
    }

    const parsed = telegramUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, 'Invalid Telegram update payload');
      return reply.code(400).send({ ok: false });
    }

    // Always 200 after handling so Telegram stops retrying; errors are logged.
    try {
      await handleTelegramUpdate(parsed.data);
    } catch (err) {
      req.log.error({ err }, 'Failed to handle Telegram update');
    }
    return reply.send({ ok: true });
  });
}
