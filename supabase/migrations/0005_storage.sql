-- Private bucket for health record attachments (Telegram docs/photos + web uploads).
-- Files stay private; downloads go through short-lived signed URLs (createSignedUrl).
insert into storage.buckets (id, name, public)
values ('health-files', 'health-files', false)
on conflict (id) do nothing;

-- Service-role bypasses RLS, so no storage policies are required for the backend.
-- If you later use authenticated end-user access, add policies on storage.objects
-- scoped to bucket_id = 'health-files'.
