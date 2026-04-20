# Deployment Guide

## Recommended Topology

For the current state of this repository, the most practical first deployment is:

- `apps/web` on `Vercel`
- `apps/api` on a long-running Node host such as `Railway`
- database on a managed MySQL-compatible service such as `TiDB Cloud Serverless`

This split matches the current codebase constraints:

- `web` is a static Vite SPA and fits Vercel well
- `api` currently uses `Express`, local state files, and `setInterval(...)` polling for Telegram
- Vercel can run Express, but the current polling-based API shape is a poor fit for Hobby serverless deployment

## Why Not Put Everything on Vercel Right Now

`apps/api/src/server.ts` currently relies on:

- `app.listen(...)`
- periodic `setInterval(...)` jobs
- local JSON persistence in `apps/api/data`

That is not a stable production shape for a Vercel Hobby deployment. Vercel Functions are request-driven, and Hobby cron jobs are limited to once per day.

## Database Recommendation

The target architecture requires `MySQL`. For a low-cost first deployment, `TiDB Cloud Serverless` is the best fit right now because:

- it is MySQL-compatible
- it has a free tier
- it can later be used from serverless environments as well

Before using it, note that TiDB is highly MySQL-compatible, but not fully identical. Review compatibility notes before moving business logic into unsupported MySQL-specific features.

## Web Deployment on Vercel

Create a Vercel project for `apps/web` with these settings:

- Root Directory: `apps/web`
- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Required environment variables for the web project:

- `VITE_API_URL=https://your-api-domain.example.com`

The `apps/web/vercel.json` rewrite ensures direct navigation to SPA routes such as `/settings`, `/receive`, and `/employees` does not return `404`.

## API Deployment on Railway

Create a Railway project for `apps/api` or the repository root, then run the API with:

- Install command: `npm install`
- Build command: `npm run build:api`
- Start command: `node apps/api/dist/server.js`

Required environment variables at minimum:

- `APP_URL=https://your-web-domain.vercel.app`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHAT_ID=...`
- future database variables once API is migrated from in-memory storage:
  - `MYSQL_HOST`
  - `MYSQL_PORT`
  - `MYSQL_DATABASE`
  - `MYSQL_USER`
  - `MYSQL_PASSWORD`
  - `DATABASE_URL`

## Immediate Next Steps

1. Deploy `apps/web` to Vercel.
2. Create the managed database.
3. Deploy `apps/api` to a long-running Node host.
4. Replace in-memory API storage with real database access.
5. Move Telegram polling from local intervals to a production-safe mechanism.

## References

- Vercel Monorepos: https://vercel.com/docs/monorepos
- Vercel Express guide: https://vercel.com/guides/using-express-with-vercel
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- TiDB Cloud homepage: https://tidb.cloud/
- TiDB MySQL compatibility: https://docs.pingcap.com/tidbcloud/mysql-compatibility/
