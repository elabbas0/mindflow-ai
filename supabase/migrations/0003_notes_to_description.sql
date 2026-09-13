-- 0003 — meetings `notes` -> `description` (user request to use description everywhere).
-- Moves existing meeting items that have `notes` but no `description` to the new key.

update items
set fields = jsonb_set(fields - 'notes', '{description}', to_jsonb(fields->>'notes'))
where category = 'meetings'
  and fields ? 'notes'
  and not fields ? 'description';
