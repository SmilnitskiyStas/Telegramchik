# 2026-04-19 Product Split And Store Link

## Summary

The local MVP model was moved closer to the target specification without introducing a final database yet.

## Done

- separated in-memory product data into:
  - `productCatalog`
  - `productBatches`
- kept `GET /products` as a joined compatibility view for the existing `web` UI
- added separate in-memory `stores`
- linked employees to `storeId`
- linked product batches to `storeId`
- kept Telegram `/newproduct` deep-link flow
- auto-selected both employee and store in the receive form when opened from Telegram
- documented the current transition model in `docs/current-data-model.md`

## Why

This reduces coupling between:

- product directory data
- physical batch data
- employee data
- store data

and makes the codebase structurally closer to the target `products + product_batches + users + stores` model from the specification.

## Risks / Limitations

- the `web` layer still works with a joined DTO instead of explicit batch entities
- no persistent DB is used yet
- no dedicated activity log entity exists yet in the runtime model
- no explicit catalog management UI exists yet

## Next Step

Move the `web` flow from a generic `products` list to explicit batch-oriented screens and then add separate catalog management.
