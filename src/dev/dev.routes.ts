import type { FastifyInstance } from 'fastify';
import { clearOutbox, readOutbox } from '../infra/telegram/outbox.js';

/** Local-only test helpers (registered only when DEV_MODE=true, never in production). */
export async function devRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dev/outbox', async (req) => {
    const query = req.query as { chat_id?: string };
    const chatId = query.chat_id === undefined ? undefined : Number(query.chat_id);
    return { ok: true, messages: readOutbox(chatId) };
  });

  app.post('/dev/reset', async () => {
    clearOutbox();
    return { ok: true };
  });
}
