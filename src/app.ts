import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { devRoutes } from './dev/dev.routes.js';
import { eventsRoutes } from './modules/events/events.routes.js';
import { telegramRoutes } from './modules/telegram/telegram.routes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // Open for testing so the frontend can call the API from any origin.
  // TODO: restrict `origin` to the frontend URL before production.
  void app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));
  void app.register(telegramRoutes);
  void app.register(eventsRoutes);

  if (env.DEV_MODE) {
    void app.register(devRoutes);
  }

  return app;
}
