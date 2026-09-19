import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findUser } from './identify.js';
import { getUserStore } from './users.repository.js';

/**
 * Deterministic web-provisioned id for gmail-only signups (web/PWA users
 * who never touched the Telegram bot). Negative, so it can never collide
 * with real Telegram user ids (always positive). Same gmail always maps
 * to the same row, making web registration idempotent.
 */
export function webTelegramId(gmail: string): number {
  let hash = 0x811c9dc5;
  const s = gmail.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return -((hash >>> 0) % 2000000000) - 1;
}

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
        description:
          'Telegram clients pass telegramId. Web/PWA clients without one may register with gmail only and receive a web-provisioned (negative) telegramId.',
        body: {
          type: 'object',
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
          telegramId: z.number().optional(),
          gmail: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          lang: z.enum(['az', 'en']).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success || (parsed.data.telegramId === undefined && !parsed.data.gmail)) {
        return reply.code(400).send({ ok: false, error: 'Provide telegramId or gmail.' });
      }
      // Web/PWA signup: no Telegram id yet — derive the stable
      // web-provisioned one from gmail (always negative, idempotent).
      const telegramId = parsed.data.telegramId ?? webTelegramId(parsed.data.gmail as string);
      const store = getUserStore();
      const { user, isNew } = await store.getOrCreate(telegramId);
      let current = user;
      if (parsed.data.gmail && parsed.data.gmail !== current.gmail) {
        current = await store.setGmail(telegramId, parsed.data.gmail);
      }
      if (parsed.data.firstName !== undefined || parsed.data.lastName !== undefined) {
        const firstName = parsed.data.firstName ?? current.firstName ?? '';
        const lastName = parsed.data.lastName ?? current.lastName ?? '';
        if (firstName || lastName) current = await store.setNames(telegramId, firstName, lastName);
      }
      if (parsed.data.lang && parsed.data.lang !== current.lang) {
        current = await store.setLang(telegramId, parsed.data.lang);
      }
      return reply.send({ ok: true, user: current, created: isNew });
    },
  );
}
