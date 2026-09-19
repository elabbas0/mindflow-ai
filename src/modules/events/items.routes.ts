import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CATEGORIES, CATEGORY_IDS, CATEGORY_REQUIRED, FIELD_LABELS, FIELD_ORDER } from '../capture/category-fields.js';
import { resolveDateField, resolveVisitDateField } from '../capture/dates.js';
import { resolveTimeField } from '../capture/times.js';
import { findUser } from '../users/identify.js';
import { getItemStore } from './items.repository.js';

export interface ItemFileRef {
  file_id: string;
  file_name?: string;
  mime_type?: string;
}

export function parseFiles(raw: string | undefined): ItemFileRef[] {
  if (!raw) return [];
  const t = raw.trim();
  if (!t) return [];
  try {
    const parsed: unknown = JSON.parse(t);
    if (Array.isArray(parsed)) {
      const out: ItemFileRef[] = [];
      for (const entry of parsed) {
        if (typeof entry === 'string' && entry.trim()) {
          out.push({ file_id: entry.trim() });
        } else if (entry && typeof entry === 'object') {
          const rec = entry as Record<string, unknown>;
          if (typeof rec['file_id'] === 'string' && (rec['file_id'] as string).trim()) {
            out.push({
              file_id: (rec['file_id'] as string).trim(),
              ...(typeof rec['file_name'] === 'string' ? { file_name: rec['file_name'] } : {}),
              ...(typeof rec['mime_type'] === 'string' ? { mime_type: rec['mime_type'] } : {}),
            });
          }
        }
      }
      return out;
    }
  } catch {
    // Fall through to legacy comma-separated handling.
  }
  return t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((file_id) => ({ file_id }));
}

export function serializeFiles(files: ItemFileRef[]): string {
  return JSON.stringify(files);
}

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
        summary: 'The 5 categories with required fields and ask order',
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
                    required: { type: 'array', items: { type: 'string' } },
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
        required: CATEGORY_REQUIRED[c.id],
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
      const order = CATEGORY_REQUIRED[parsed.data.category as keyof typeof CATEGORY_REQUIRED];
      const missing = order.filter((name) => !parsed.data.fields[name]?.trim());
      if (missing.length > 0) {
        return reply.code(400).send({ ok: false, error: 'Missing required fields.', missing });
      }
      const fields = { ...parsed.data.fields };
      if (fields.date) fields.date = resolveDateField(fields.date);
      if (fields.deadline) fields.deadline = resolveDateField(fields.deadline);
      if (fields.visit_date) fields.visit_date = resolveVisitDateField(fields.visit_date);
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
        if (merged.visit_date) merged.visit_date = resolveVisitDateField(merged.visit_date);
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
      const order = CATEGORY_REQUIRED[parsed.data.category as keyof typeof CATEGORY_REQUIRED];
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
      if (fields.visit_date) fields.visit_date = resolveVisitDateField(fields.visit_date);
      if (fields.time) fields.time = resolveTimeField(fields.time);
      const updated = await store.update(params.id, { category: parsed.data.category, fields });
      if (!updated) return reply.code(404).send({ ok: false, error: 'Item not found.' });
      return reply.send({ ok: true, item: toJson(updated) });
    },
  );

  app.post(
    '/api/items/:id/files',
    {
      schema: {
        tags: ['items'],
        summary: 'Attach a file ref to a health record (owner only, max 10)',
        body: {
          type: 'object',
          required: ['file_id'],
          properties: {
            telegramId: { type: 'number' },
            gmail: { type: 'string' },
            file_id: { type: 'string' },
            file_name: { type: 'string' },
            mime_type: { type: 'string' },
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
          file_id: z.string().min(1),
          file_name: z.string().optional(),
          mime_type: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'file_id is required.' });
      const scoped = await scopedUser(parsed.data);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      const store = getItemStore();
      const existing = await store.getById(params.id);
      if (!existing || existing.userId !== scoped.telegramId) {
        return reply.code(404).send({ ok: false, error: 'Item not found.' });
      }
      const files = parseFiles(existing.fields['files']);
      if (files.length >= 10) {
        return reply.code(400).send({ ok: false, error: 'File limit reached (max 10).' });
      }
      files.push({
        file_id: parsed.data.file_id,
        ...(parsed.data.file_name ? { file_name: parsed.data.file_name } : {}),
        ...(parsed.data.mime_type ? { mime_type: parsed.data.mime_type } : {}),
      });
      const updated = await store.update(params.id, { fields: { files: serializeFiles(files) } });
      if (!updated) return reply.code(404).send({ ok: false, error: 'Item not found.' });
      return reply.send({ ok: true, item: toJson(updated) });
    },
  );

  app.delete(
    '/api/items/:id/files',
    {
      schema: {
        tags: ['items'],
        summary: 'Remove a file ref from a health record (owner only, by file_id or index)',
        body: {
          type: 'object',
          properties: {
            telegramId: { type: 'number' },
            gmail: { type: 'string' },
            file_id: { type: 'string' },
            index: { type: 'number' },
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
          file_id: z.string().optional(),
          index: z.number().int().min(0).optional(),
        })
        .safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Invalid body.' });
      if (parsed.data.file_id === undefined && parsed.data.index === undefined) {
        return reply.code(400).send({ ok: false, error: 'Provide file_id or index.' });
      }
      const scoped = await scopedUser(parsed.data);
      if (!scoped) return reply.code(404).send({ ok: false, error: 'User not found.' });
      const store = getItemStore();
      const existing = await store.getById(params.id);
      if (!existing || existing.userId !== scoped.telegramId) {
        return reply.code(404).send({ ok: false, error: 'Item not found.' });
      }
      const files = parseFiles(existing.fields['files']);
      let next: ItemFileRef[];
      if (parsed.data.file_id !== undefined) {
        next = files.filter((f) => f.file_id !== parsed.data.file_id);
        if (next.length === files.length) {
          return reply.code(404).send({ ok: false, error: 'File not found.' });
        }
      } else {
        const idx = parsed.data.index as number;
        if (idx < 0 || idx >= files.length) {
          return reply.code(404).send({ ok: false, error: 'File not found.' });
        }
        next = files.filter((_, i) => i !== idx);
      }
      const updated = await store.update(params.id, {
        fields: { files: next.length > 0 ? serializeFiles(next) : '' },
      });
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