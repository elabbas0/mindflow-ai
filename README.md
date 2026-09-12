# mindflow-ai

## Backend (Node.js + Fastify + TypeScript)

Modular monolith on the `backend` branch. Pipeline: Telegram webhook → Whisper → GPT-4o → Supabase.

```
src/
  server.ts / app.ts            # entry + Fastify wiring (/health, /api/telegram/webhook)
  config/env.ts                 # zod-validated env (.env.example)
  modules/
    telegram/                   # webhook route, update schemas, dispatcher
    transcription/              # voice file_id -> Whisper text
    extraction/                 # text -> GPT-4o event draft (JSON)
    events/                     # draft -> Supabase `events` table
  infra/
    telegram/ openai/ supabase/ # external clients (one place each)
  shared/                       # AppError, NotConfiguredError
```

Quickstart:

```sh
cp .env.example .env   # fill in keys
npm install
npm run dev            # tsx watch src/server.ts
npm run typecheck      # tsc --noEmit
npm run build && npm start
```

Set the Telegram webhook to `POST https://<host>/api/telegram/webhook`
with header `x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>`.