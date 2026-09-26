import type { FastifyInstance } from 'fastify';
import { getSupabase } from '../../infra/supabase/client.js';
import { isStorageConfigured, storageBucket } from '../../infra/storage/files.storage.js';

/** Public diagnostics: reports whether Storage uploads can work, and why not. */
export async function storageRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/storage/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Check Supabase Storage wiring (bucket exists, key can list it)',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              configured: { type: 'boolean' },
              bucket: { type: 'string' },
              bucketExists: { type: 'boolean' },
              buckets: { type: 'array', items: { type: 'string' } },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      if (!isStorageConfigured()) {
        return { ok: false, configured: false, error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' };
      }
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase.storage.listBuckets();
        if (error) return { ok: false, configured: true, error: `listBuckets: ${error.message}` };
        const bucket = storageBucket();
        const names = (data ?? []).map((b) => b.name);
        if (!names.includes(bucket)) {
          return { ok: false, configured: true, bucket, bucketExists: false, buckets: names, error: `Bucket '${bucket}' not found.` };
        }
        const { error: listErr } = await supabase.storage.from(bucket).list(undefined, { limit: 1 });
        if (listErr) {
          return { ok: false, configured: true, bucket, bucketExists: true, error: `bucket list: ${listErr.message}` };
        }
        return { ok: true, configured: true, bucket, bucketExists: true };
      } catch (err) {
        return { ok: false, configured: true, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
