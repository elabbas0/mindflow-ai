import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CATEGORIES, CATEGORY_IDS, FIELD_ORDER, FIELD_LABELS } from '../capture/category-fields.js';
import { resolveDateField } from '../capture/dates.js';
import { resolveTimeField } from '../capture/times.js';
import { findUser } from '../users/identify.js';
import { getItemStore } from './items.repository.js';

const itemJson = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    category: { type: 'string' },
    fields: { type: 'object', additionalProperties: { type: 'string' } },
  },
};

const notFoundSchema = { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } };

function toJson(item: { id: string; category: string; fields: Record<string, string> }): { id: string; category: string; fields: Record<string, string> } {
  return { id: item.id, category: item.category, fields: item.fields };
}

async function scopedUser(query: { telegramId?: number; gmail?: string }): Promise<{ telegramId: number } | null> {
  const user = await findUser(query.telegramId, query.gmail);
  return user ? { telegramId: user.telegramId } : null;
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/categories',
    {
      schema: {
        tags: ['items'],
        summary: 'The 4 categories with required fields and ask order',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              categories: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    order: { type: 'array', items: { type: 'string' } },
                    labels: { type: 'object', additionalProperties: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => ({
      ok: true,
      categories: CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        order: FIELD_ORDER[c.id],
        labels: FIELD_LABELS,
      })),
    }),
  );

  app.get(
    '/api/items',
    {
      schema: {
        tags: ['items'],
        summary: 'List a user saved items, optionally filtered by category',
        querystring: {
          type: 'object',
          properties: {
            telegramId: { type: 'number' },
            gmail: { type: 'string' },
            category: { type: 'string' },
            limit: { type: 'number' },
          },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, items: { type: 'array', items: itemJson } } },
          400: notFoundSchema,
          404: notFoundSchema,
        },
      },
    },
    async (req, reply) => {
      const query = req.query as { telegramId?: number; gmail?: string; category?: string; limit?: number };
      const scoped = await scopedUser(query);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      if (query.category !== undefined && !CATEGORY_IDS.has(query.category)) {
        return reply.code(400).send({ ok: false, error: `Unknown category: ${query.category}.` });
      }
      const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
      const items = await getItemStore().listByUser(scoped.telegramId);
      const filtered = query.category ? items.filter((item) => item.category === query.category) : items;
      return reply.send({ ok: true, items: filtered.slice(0, limit).map(toJson) });
    },
  );

  app.get(
    '/api/items/:id',
    {
      schema: {
        tags: ['items'],
        summary: 'Get one saved item (owner only)',
        querystring: {
          type: 'object',
          properties: { telegramId: { type: 'number' }, gmail: { type: 'string' } },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, item: itemJson } },
          404: notFoundSchema,
        },
      },
    },
    async (req, reply) => {
      const params = req.params as { id: string };
      const query = req.query as { telegramId?: number; gmail?: string };
      const scoped = await scopedUser(query);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      const item = await getItemStore().getById(params.id);
      if (!item || item.userId !== scoped.telegramId) {
        return reply.code(404).send({ ok: false, error: 'Item not found.' });
      }
      return reply.send({ ok: true, item: toJson(item) });
    },
  );

  app.post(
    '/api/items',
    {
      schema: {
        tags: ['items'],
        summary: 'Create a saved item (all required fields for the category needed)',
        body: {
          type: 'object',
          required: ['category', 'fields'],
          properties: {
            telegramId: { type: 'number' },
            gmail: { type: 'string' },
            category: { type: 'string' },
            fields: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
        response: {
          201: { type: 'object', properties: { ok: { type: 'boolean' }, item: itemJson } },
          400: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, error: { type: 'string' }, missing: { type: 'array', items: { type: 'string' } } },
          },
          404: notFoundSchema,
        },
      },
    },
    async (req, reply) => {
      const parsed = z
        .object({
          telegramId: z.number().optional(),
          gmail: z.string().optional(),
          category: z.string(),
          fields: z.record(z.string()),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'category and fields are required.' });
      const scoped = await scopedUser(parsed.data);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      if (!CATEGORY_IDS.has(parsed.data.category)) {
        return reply.code(400).send({ ok: false, error: `Unknown category: ${parsed.data.category}.` });
      }
      const order = FIELD_ORDER[parsed.data.category as keyof typeof FIELD_ORDER];
      const missing = order.filter((name) => !parsed.data.fields[name]?.trim());
      if (missing.length > 0) {
        return reply.code(400).send({ ok: false, error: 'Missing required fields.', missing });
      }
      const fields = { ...parsed.data.fields };
      if (fields.date) fields.date = resolveDateField(fields.date);
      if (fields.deadline) fields.deadline = resolveDateField(fields.deadline);
      if (fields.time) fields.time = resolveTimeField(fields.time);
      const item = await getItemStore().save({ userId: scoped.telegramId, category: parsed.data.category, fields });
      return reply.code(201).send({ ok: true, item: toJson(item) });
    },
  );

  app.patch(
    '/api/items/:id',
    {
      schema: {
        tags: ['items'],
        summary: 'Edit a saved item (owner only, partial fields). Confirm flow: GET the item first, show it, then PATCH.',
        body: {
          type: 'object',
          properties: {
            telegramId: { type: 'number' },
            gmail: { type: 'string' },
            category: { type: 'string' },
            fields: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, item: itemJson } },
          400: notFoundSchema,
          404: notFoundSchema,
        },
      },
    },
    async (req, reply) => {
      const params = req.params as { id: string };
      const parsed = z
        .object({
          telegramId: z.number().optional(),
          gmail: z.string().optional(),
          category: z.string().optional(),
          fields: z.record(z.string()).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Invalid body.' });
      if (parsed.data.category === undefined && parsed.data.fields === undefined) {
        return reply.code(400).send({ ok: false, error: 'Nothing to update.' });
      }
      const scoped = await scopedUser(parsed.data);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      if (parsed.data.category !== undefined && !CATEGORY_IDS.has(parsed.data.category)) {
        return reply.code(400).send({ ok: false, error: `Unknown category: ${parsed.data.category}.` });
      }
      const store = getItemStore();
      const existing = await store.getById(params.id);
      if (!existing || existing.userId !== scoped.telegramId) {
        return reply.code(404).send({ ok: false, error: 'Item not found.' });
      }
      const patch: { category?: string; fields?: Record<string, string> } = {};
      if (parsed.data.category !== undefined) patch.category = parsed.data.category;
      if (parsed.data.fields !== undefined) {
        const merged = { ...existing.fields, ...parsed.data.fields };
        if (merged.date) merged.date = resolveDateField(merged.date);
        if (merged.deadline) merged.deadline = resolveDateField(merged.deadline);
        if (merged.time) merged.time = resolveTimeField(merged.time);
        if (merged.description && merged.notes) delete merged.notes;
        patch.fields = merged;
      }
      const updated = await store.update(params.id, patch);
      if (!updated) return reply.code(404).send({ ok: false, error: 'Item not found.' });
      return reply.send({ ok: true, item: toJson(updated) });
    },
  );

  app.put(
    '/api/items/:id',
    {
      schema: {
        tags: ['items'],
        summary: 'Replace a saved item (owner only, full fields). Confirm flow: GET the item first, show it, then PUT.',
        body: {
          type: 'object',
          required: ['category', 'fields'],
          properties: {
            telegramId: { type: 'number' },
            gmail: { type: 'string' },
            category: { type: 'string' },
            fields: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, item: itemJson } },
          400: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, error: { type: 'string' }, missing: { type: 'array', items: { type: 'string' } } },
          },
          404: notFoundSchema,
        },
      },
    },
    async (req, reply) => {
      const params = req.params as { id: string };
      const parsed = z
        .object({
          telegramId: z.number().optional(),
          gmail: z.string().optional(),
          category: z.string(),
          fields: z.record(z.string()),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'category and fields are required.' });
      const scoped = await scopedUser(parsed.data);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      if (!CATEGORY_IDS.has(parsed.data.category)) {
        return reply.code(400).send({ ok: false, error: `Unknown category: ${parsed.data.category}.` });
      }
      const order = FIELD_ORDER[parsed.data.category as keyof typeof FIELD_ORDER];
      const missing = order.filter((name) => !parsed.data.fields[name]?.trim());
      if (missing.length > 0) {
        return reply.code(400).send({ ok: false, error: 'Missing required fields.', missing });
      }
      const store = getItemStore();
      const existing = await store.getById(params.id);
      if (!existing || existing.userId !== scoped.telegramId) {
        return reply.code(404).send({ ok: false, error: 'Item not found.' });
      }
      const fields = { ...parsed.data.fields };
      if (fields.date) fields.date = resolveDateField(fields.date);
      if (fields.deadline) fields.deadline = resolveDateField(fields.deadline);
      if (fields.time) fields.time = resolveTimeField(fields.time);
      const updated = await store.update(params.id, { category: parsed.data.category, fields });
      if (!updated) return reply.code(404).send({ ok: false, error: 'Item not found.' });
      return reply.send({ ok: true, item: toJson(updated) });
    },
  );

  app.delete(
    '/api/items/:id',
    {
      schema: {
        tags: ['items'],
        summary: 'Delete a saved item (owner only)',
        querystring: {
          type: 'object',
          properties: { telegramId: { type: 'number' }, gmail: { type: 'string' } },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' } } },
          404: notFoundSchema,
        },
      },
    },
    async (req, reply) => {
      const params = req.params as { id: string };
      const query = req.query as { telegramId?: number; gmail?: string };
      const scoped = await scopedUser(query);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      const store = getItemStore();
      const existing = await store.getById(params.id);
      if (!existing || existing.userId !== scoped.telegramId) {
        return reply.code(404).send({ ok: false, error: 'Item not found.' });
      }
      await store.delete(params.id);
      return reply.send({ ok: true });
    },
  );
}