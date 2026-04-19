# Current Data Model

## Purpose

This file documents the current in-memory transition model used in the repository before a final database choice is made.

## Current In-Memory Entities

### `stores`

Location: `apps/api/src/stores.ts`

Fields:

- `id`
- `code`
- `name`
- `isActive`

### `employees`

Location: `apps/api/src/employees.ts`

Fields:

- `id`
- `name`
- `surname`
- `fullName`
- `role`
- `storeId`
- `storeName`
- `telegramClientId`
- `status`
- `lastActivityAt`
- `lastAction`
- `activityLog`

### `productCatalog`

Location: `apps/api/src/data.ts`

Represents the product directory, not a physical batch.

Fields:

- `id`
- `name`
- `category`
- `barcode`

### `productBatches`

Location: `apps/api/src/data.ts`

Represents an actual batch in a store.

Fields:

- `id`
- `productId`
- `batch`
- `storeId`
- `quantity`
- `receivedAt`
- `expiresAt`
- `status`
- `notes`
- `receivedByUserId`

## API Shape

The current `web` UI still consumes `GET /products` as a joined view.

That endpoint now returns a merged DTO:

- catalog fields from `productCatalog`
- batch fields from `productBatches`

This is a compatibility layer for the current UI while the codebase moves toward the target `products + product_batches` model from the spec.

## Telegram Flow

- `/newproduct` and `/addproduct` still create a deep-link with `clientId`
- `web` resolves `clientId` to a user via `telegramClientId`
- the form auto-selects that employee
- the employee's `storeId` is also auto-selected

## Next Step

The next structural step should be to expose batches explicitly in the `web` layer instead of treating the joined DTO as the primary domain object.
