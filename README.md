# mindflow-ai

## Backend (Node.js + Fastify + TypeScript)

Modular monolith on the `backend` branch. Pipeline: Telegram webhook → Groq Whisper → Gemini Flash-Lite → Supabase.

```
src/
  server.ts / app.ts            # entry + Fastify wiring
  config/env.ts                 # zod-validated env (.env.example)
  modules/
    telegram/                   # webhook route, update schemas, dispatcher
    capture/                    # PRD conversation loop: gmail setup, category, missing fields
    transcription/              # voice file_id -> Groq Whisper text
    extraction/                 # text -> Gemini Flash-Lite fields (stub fallback, no key needed)
    events/                     # saved items store (memory | supabase)
    assistant/                  # POST /api/assistant/ask over saved items
    users/                      # telegram_id <-> gmail accounts
  infra/
    telegram/ supabase/         # external clients (one place each)
  shared/                       # AppError, NotConfiguredError
```

Providers are free-tier: Gemini Flash-Lite (`GEMINI_API_KEY`, ~1k req/day)
for extraction and Q&A, Groq Whisper (`GROQ_API_KEY`, 2k voices/day) for
speech-to-text. Without keys the bot still runs: extraction falls back to a
regex stub and voice replies that setup is pending.

Persistence: `STORE=memory` (local) or `STORE=supabase`. For Supabase, run
`supabase/migrations/0001_init.sql` once in the SQL editor, then set
`SUPABASE_URL` + key and `STORE=supabase`.

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

## Local testing (mock Telegram UI, no bot token needed)

```sh
$env:DEV_MODE='true'; $env:STORE='memory'; npm run dev
```

Then open `dev/mock-telegram.html` in a browser and chat: `/start`,
a free-form message, and tap a category button. Bot replies are captured
in-memory; inspect via `GET /dev/outbox?chat_id=12345`. These `/dev/*`
routes only exist when `DEV_MODE=true` and never run in production.

## Hosting (Railway)

The service deploys from the `backend` branch only (`railway.json` holds the
build/start commands and the `/health` healthcheck).

Test endpoints for the frontend (no keys needed):

- `GET https://<app>.up.railway.app/health` → `{"ok":true}`
- `GET https://<app>.up.railway.app/api/events/demo` → sample events JSON
- `GET https://<app>.up.railway.app/docs` → Swagger UI for the whole API

Frontend API (identify the user with `telegramId` or `gmail`):

- `GET /api/categories` → 5 categories, required fields, ask order
- `GET|POST /api/users` → look up or get-or-create an account
- `GET /api/items` → list (optional `category`, `limit`)
- `GET|PATCH|DELETE /api/items/:id` → read, edit, delete (owner only)
- `POST /api/items` → create (required fields per category enforced; health needs only `description`)
- `POST /api/items/:id/files` → attach a file ref to a health record (owner only, max 10)
- `DELETE /api/items/:id/files` → remove a file ref by `file_id` or `index` (owner only)
- `POST /api/assistant/ask` → Q&A over saved items