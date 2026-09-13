-- 0002 — name/surname onboarding (requested after the initial PRD gmail setup).

alter table users add column if not exists first_name text;
alter table users add column if not exists last_name text;
