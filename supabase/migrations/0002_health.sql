-- MindFlow Health category support (run AFTER 0001_init.sql in the Supabase SQL editor).
--
-- No new tables or columns are needed:
--   health records live in `items` with category = 'health' and everything
--   (title, description, doctor, specialty, diagnosis, visit_date, files)
--   inside the `fields` jsonb column.
--   files is a JSON-encoded array string, e.g.
--     fields -> 'files' = '[{"file_id":"...","file_name":"Prescription.pdf","mime_type":"..."}]'
--   Only Telegram file_id refs are stored (storage-only per PRD); no binaries.
--
-- This migration only:
--   1) keeps the category values consistent at the DB level,
--   2) speeds up per-user + per-category listing (GET /api/items?telegramId=&category=).

-- 1) Category allow-list (includes the 4 existing categories + health).
alter table if exists items drop constraint if exists items_category_check;
alter table if exists items
  add constraint items_category_check
  check (category in ('todo', 'projects', 'meetings', 'notes', 'health'));

-- 2) Index for the items list queries.
create index if not exists items_user_category_idx on items (user_id, category);
