# Supabase Schema Notes

## Goal

This schema moves the project from the current in-memory MVP toward the target data model using `PostgreSQL` on `Supabase`.

Files:

- `database/supabase/001_schema.sql`
- `database/supabase/002_rls_policies.sql`
- `database/supabase/003_seed.sql`
- `database/supabase/004_api_support.sql`

## Main Decisions

### 1. `users.auth_user_id`

The original project specification modeled `users` as an application table only. For Supabase, RLS needs a stable link to `auth.users`, so the schema adds:

- `auth_user_id uuid unique references auth.users(id)`

This does not replace the business user record. It only connects the application user to Supabase Auth.

### 2. Business Tables Kept Intact

The required core entities remain the same:

- `stores`
- `users`
- `products`
- `product_batches`
- `activity_log`
- `notification_log`
- optional `user_sessions`

### 3. Enum Fields

Postgres enums are used for:

- `user_role`
- `check_status`
- `action_taken`

This avoids free-text drift in critical workflow columns.

### 4. RLS Scope

The policies assume:

- each authenticated person maps to exactly one row in `public.users`
- a non-service user usually belongs to one store
- regular users can work only with their own store data
- managers and admins can manage the product catalog and administrative decisions

Service-role usage from backend code will bypass RLS, which is expected for trusted server processes.

## What the Policies Protect

- `stores`: read only for the current store
- `users`: read for users from the same store; self-update allowed
- `products`: all authenticated users can read; only `manager/admin` can insert or update
- `product_batches`: same-store read and write only
- `activity_log`: same-store read; current user can insert own actions
- `notification_log`: same-store read and insert
- `user_sessions`: only the owner can read/write/delete own session rows

## Important Constraints

- `products.barcode` is unique
- `users.user_chat_id` is unique
- `product_batches(product_id, store_id, expiry_date)` is unique
- `action_taken = 'other'` requires `action_note`
- `discussion_required = true` requires `discussion_note`

## Running in Supabase

Run the files in this order in the Supabase SQL editor:

1. `001_schema.sql`
2. `002_rls_policies.sql`
3. `003_seed.sql` if you want demo data
4. `004_api_support.sql` for current API-oriented support objects

## Current API Support Layer

`004_api_support.sql` adds support objects for the API shape that exists in the repository today:

- `api_stores_v`
- `api_employees_v`
- `api_products_v`
- `api_employee_by_chat_id(...)`
- `api_get_notification_settings(...)`
- `api_upsert_notification_settings(...)`
- `api_get_telegram_state()`
- `api_update_telegram_state(...)`
- `api_upsert_product_and_batch(...)`
- `api_update_product_batch_status(...)`

It also adds:

- `notification_settings`
- `telegram_bot_state`
- `product_batches.intake_note`

These objects are MVP compatibility helpers so the API can migrate incrementally instead of trying to jump from in-memory arrays straight into the final domain model in one pass.

## Known Mapping Gap

The current web MVP still uses custom Ukrainian status labels in the UI, while the target database model uses canonical workflow values:

- `new`
- `pending`
- `reviewed`
- `discussion_required`
- `completed`
- `overdue`

That means `/products/:id/status` should be normalized during API migration instead of being wired directly to the old UI labels.

## What This Does Not Solve Yet

The repository still needs the API layer to move from in-memory arrays to live Supabase/Postgres queries. The schema is ready first so the application code can safely migrate onto a stable database contract.
