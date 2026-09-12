import Fastify, { type FastifyInstance } from 'fastify';
import { telegramRoutes } from './modules/telegram/telegram.routes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ ok: true }));
  void app.register(telegramRoutes);

  return app;
}
