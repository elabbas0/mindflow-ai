-- 0004 — remembered reply language per user (az/en), so the bot
-- answers in the user's language instead of guessing per message.

alter table users add column if not exists lang text;
