import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findUser } from './identify.js';
import { getUserStore } from './users.repository.js';

const userJson = {
  type: 'object',
  properties: { telegramId: { type: 'number' }, gmail: { type: ['string', 'null'] } },
};

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/users',
    {
      schema: {
        tags: ['users'],
        summary: 'Look up an account by telegramId or gmail',
        querystring: {
          type: 'object',
          properties: { telegramId: { type: 'number' }, gmail: { type: 'string' } },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, user: userJson } },
          404: { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const query = req.query as { telegramId?: number; gmail?: string };
      const user = await findUser(query.telegramId, query.gmail);
      if (!user) return reply.code(404).send({ ok: false, error: 'User not found.' });
      return reply.send({ ok: true, user });
    },
  );

  app.post(
    '/api/users',
    {
      schema: {
        tags: ['users'],
        summary: 'Get or create an account, optionally attaching a gmail',
        body: {
          type: 'object',
          required: ['telegramId'],
          properties: { telegramId: { type: 'number' }, gmail: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              user: userJson,
              created: { type: 'boolean' },
            },
          },
          400: { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const parsed = z.object({ telegramId: z.number(), gmail: z.string().optional() }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'telegramId is required.' });
      const store = getUserStore();
      const { user, isNew } = await store.getOrCreate(parsed.data.telegramId);
      const updated =
        parsed.data.gmail && parsed.data.gmail !== user.gmail
          ? await store.setGmail(parsed.data.telegramId, parsed.data.gmail)
          : user;
      return reply.send({ ok: true, user: updated, created: isNew });
    },
  );
}
