# Railway Postgres Setup

## Files

- `database/railway/001_schema.sql`
- `database/railway/002_seed.sql`

## Purpose

These SQL files prepare the current project for Railway PostgreSQL instead of Supabase.

They include:

- core business tables
- workflow enums
- helper views for the current API
- global app settings tables for Telegram notification settings and bot polling state

## Run Order

1. Create a Railway PostgreSQL service in the same Railway project as the app service.
2. Open a SQL client against the Railway database.
3. Run `001_schema.sql`
4. Run `002_seed.sql` if you want demo data

## Important Notes

- this Railway variant does not use Supabase auth or RLS
- the API can connect using standard `DATABASE_URL`
- web and API stay in one Railway app service, while PostgreSQL is a separate Railway service in the same project
