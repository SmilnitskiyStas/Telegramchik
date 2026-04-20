# 2026-04-19 Supabase Schema Prep

## Added

- `database/supabase/001_schema.sql`
- `database/supabase/002_rls_policies.sql`
- `database/supabase/003_seed.sql`
- `docs/supabase-schema.md`

## Purpose

Prepared the target operational schema for Supabase/Postgres with:

- normalized core business tables
- constraints and enum-backed workflow fields
- helper functions for current user / store lookup
- row level security policies for store-scoped access
- optional demo seed data

## Notes

Added `users.auth_user_id` as a Supabase integration field so `public.users` can participate in RLS without replacing the business user table.
