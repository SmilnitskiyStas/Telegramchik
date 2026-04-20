# 2026-04-19 Railway Postgres Migration

## Added

- `database/railway/001_schema.sql`
- `database/railway/002_seed.sql`
- `docs/railway-postgres.md`
- `apps/api/src/db.ts`
- `apps/api/src/postgres-store.ts`

## Changed

- API now supports PostgreSQL through `DATABASE_URL`
- current core endpoints can read from Railway Postgres when configured
- notification settings and Telegram polling state can persist in PostgreSQL
- `.env.example` now reflects PostgreSQL instead of MySQL

## Notes

- local in-memory/json fallback is still present when `DATABASE_URL` is missing
- Railway deployment path is now one app service plus one PostgreSQL service in the same project
