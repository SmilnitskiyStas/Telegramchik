# 2026-04-19 Supabase API Support

## Added

- `database/supabase/004_api_support.sql`

## Covered

- API-oriented read models for stores, employees and products
- notification settings table and helper functions
- telegram bot state table and helper functions
- incremental upsert helper for product + batch creation
- target-status helper for batch status updates

## UI

Added a Supabase/API rollout section to the settings page so the current database preparation state is visible directly in the web app.
