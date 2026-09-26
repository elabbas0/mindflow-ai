import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { getSupabase } from '../supabase/client.js';

export function isStorageConfigured(): boolean {
  return !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY;
}

export function storageBucket(): string {
  return env.SUPABASE_STORAGE_BUCKET || 'health-files';
}

function sanitizeFileName(name: string): string {
  const base = name.split('/').pop()?.split('\\').pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return cleaned || 'file';
}

/** userId/date/uuid-name — keeps one user's files grouped and names unique. */
export function buildStoragePath(userId: number, fileName: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}/${day}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

export async function uploadBuffer(
  buffer: Buffer,
  opts: { userId: number; fileName: string; contentType?: string },
): Promise<string> {
  if (buffer.length > env.MAX_FILE_BYTES) {
    throw new Error(`File too large (max ${env.MAX_FILE_BYTES} bytes).`);
  }
  const supabase = getSupabase();
  const path = buildStoragePath(opts.userId, opts.fileName);
  const { error } = await supabase.storage
    .from(storageBucket())
    .upload(path, buffer, {
      contentType: opts.contentType || 'application/octet-stream',
      upsert: false,
    });
  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
  return path;
}

/** Short-lived download link for a private object. Nothing is made public. */
export async function createTempDownloadUrl(storagePath: string, expiresIn?: number): Promise<string> {
  const supabase = getSupabase();
  const ttl = Math.min(Math.max(expiresIn ?? env.FILE_LINK_TTL_SECONDS, 60), 604800);
  const { data, error } = await supabase.storage.from(storageBucket()).createSignedUrl(storagePath, ttl);
  if (error || !data?.signedUrl) {
    throw new Error(`Supabase signed URL failed: ${error?.message ?? 'no url'}`);
  }
  return data.signedUrl;
}

export async function removeStorageFile(storagePath: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(storageBucket()).remove([storagePath]);
  if (error) throw new Error(`Supabase storage remove failed: ${error.message}`);
}
