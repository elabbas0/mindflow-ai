import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findUser } from './identify.js';
import { getUserStore } from './users.repository.js';

const userJson = {
  type: 'object',
  properties: {
    telegramId: { type: 'number' },
    gmail: { type: ['string', 'null'] },
    firstName: { type: ['string', 'null'] },
    lastName: { type: ['string', 'null'] },
    lang: { type: ['string', 'null'] },
  },
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
        summary: 'Get or create an account, optionally attaching gmail/name',
        body: {
          type: 'object',
          required: ['telegramId'],
          properties: {
            telegramId: { type: 'number' },
            gmail: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            lang: { type: 'string', enum: ['az', 'en'] },
          },
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
      const parsed = z
        .object({
          telegramId: z.number(),
          gmail: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          lang: z.enum(['az', 'en']).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'telegramId is required.' });
      const store = getUserStore();
      const { user, isNew } = await store.getOrCreate(parsed.data.telegramId);
      let current = user;
      if (parsed.data.gmail && parsed.data.gmail !== current.gmail) {
        current = await store.setGmail(parsed.data.telegramId, parsed.data.gmail);
      }
      if (parsed.data.firstName !== undefined || parsed.data.lastName !== undefined) {
        const firstName = parsed.data.firstName ?? current.firstName ?? '';
        const lastName = parsed.data.lastName ?? current.lastName ?? '';
        if (firstName || lastName) current = await store.setNames(parsed.data.telegramId, firstName, lastName);
      }
      if (parsed.data.lang && parsed.data.lang !== current.lang) {
        current = await store.setLang(parsed.data.telegramId, parsed.data.lang);
      }
      return reply.send({ ok: true, user: current, created: isNew });
    },
  );
}
