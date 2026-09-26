import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { devRoutes } from './dev/dev.routes.js';
import { assistantRoutes } from './modules/assistant/assistant.routes.js';
import { googleAuthRoutes } from './modules/auth/google.routes.js';
import { itemRoutes } from './modules/events/items.routes.js';
import { eventsRoutes } from './modules/events/events.routes.js';
import { storageRoutes } from './modules/storage/storage.routes.js';
import { telegramRoutes } from './modules/telegram/telegram.routes.js';
import { userRoutes } from './modules/users/users.routes.js';

async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness check (also the Railway healthcheck)',
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
      },
    },
    async () => ({ ok: true }),
  );
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // Open for testing so the frontend can call the API from any origin.
  // TODO: restrict `origin` to the frontend URL before production.
  void app.register(cors, { origin: true });

  void app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'MindFlow backend API',
        description: 'Telegram capture bot, saved items, and assistant Q&A for the MindFlow web app.',
        version: '0.1.0',
      },
      tags: [
        { name: 'system', description: 'Health and API docs' },
        { name: 'auth', description: 'Google OAuth code exchange for the iOS PWA login' },
        { name: 'telegram', description: 'Telegram Bot API webhook (called by Telegram)' },
        { name: 'users', description: 'Accounts linking telegramId and gmail' },
        { name: 'items', description: 'Saved items CRUD + categories (used by the web app)' },
        { name: 'events', description: 'Sample data for frontend development' },
        { name: 'assistant', description: 'Q&A over saved items (used by the web app)' },
      ],
    },
  });
  void app.register(swaggerUi, { routePrefix: '/docs' });

  void app.register(healthRoutes);
  void app.register(storageRoutes);
  void app.register(googleAuthRoutes);
  void app.register(telegramRoutes);
  void app.register(eventsRoutes);
  void app.register(itemRoutes);
  void app.register(userRoutes);
  void app.register(assistantRoutes);

  if (env.DEV_MODE) {
    void app.register(devRoutes);
  }

  return app;
}
