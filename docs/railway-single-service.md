# Railway Single-Service Deploy

## Goal

Run the current MVP as one Railway service:

- `apps/web` built into static assets
- `apps/api` serving both API routes and the built web app
- database kept in the same Railway project as a separate `PostgreSQL` service

## How It Works

The root `Dockerfile`:

- installs workspace dependencies
- builds `packages/shared`, `apps/api`, and `apps/web`
- starts `node apps/api/dist/server.js`

The API server now also serves `apps/web/dist`, so Railway only needs one public service.

## Railway Setup

Create one Railway service from the repository root.

Railway will detect the root `Dockerfile` automatically.

Recommended variables:

- `PORT`
  Railway provides this automatically.
- `APP_URL`
  Set this to the final public Railway URL, for example `https://telegramchick-production.up.railway.app`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `DATABASE_URL`
  Railway PostgreSQL provides this for the app service once you attach the database

## Notes

- Frontend API calls use same-origin in production by default.
- Local development still falls back to `http://localhost:3001`.
- When `DATABASE_URL` is present, the API reads products, stores, employees, notification settings, and Telegram polling state from PostgreSQL.
- Current JSON-backed files remain only as local fallback when `DATABASE_URL` is missing.
