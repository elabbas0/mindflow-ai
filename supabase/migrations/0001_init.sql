-- MindFlow backend tables (run in the Supabase SQL editor).
-- Sessions hold the in-progress capture flow per chat (PRD conversation loop).

create table if not exists users (
  telegram_id bigint primary key,
  gmail text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  chat_id bigint primary key,
  user_id bigint not null references users (telegram_id),
  status text not null default 'idle',
  draft jsonb not null default '{}',
  pending_field text,
  updated_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users (telegram_id),
  category text not null,
  fields jsonb not null default '{}',
  status text not null default 'complete',
  created_at timestamptz not null default now()
);
