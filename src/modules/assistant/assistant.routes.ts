import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotConfiguredError } from '../../shared/errors.js';
import { askAssistant } from './assistant.service.js';

const askSchema = z.object({
  telegramId: z.number().optional(),
  gmail: z.string().optional(),
  question: z.string().min(1),
});

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/assistant/ask', async (req, reply) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success || (parsed.data.telegramId === undefined && !parsed.data.gmail)) {
      return reply.code(400).send({ ok: false, error: 'Provide a question plus telegramId or gmail.' });
    }
    try {
      const answer = await askAssistant(parsed.data);
      return reply.send({ ok: true, answer });
    } catch (err) {
      if (err instanceof NotConfiguredError) {
        return reply.code(503).send({ ok: false, error: err.message });
      }
      req.log.error({ err }, 'Assistant query failed');
      return reply.code(500).send({ ok: false, error: 'Assistant query failed.' });
    }
  });
}
