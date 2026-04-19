# Store Layout Visual Product Slots

Date: 2026-04-19

## What Changed

- replaced free-text shelf product editing with visual product slots
- connected shelf slots to real product entities from the current API product list
- added product slot cards with:
  - image preview when `imageUrl` exists
  - fallback placeholder when image is missing
  - product name
  - category
  - barcode
- added optional `imageUrl` to product catalog items

## Why This Matters

This step moves the shelf editor from plain notes toward a real store-facing visualization model.

Now the user can see:

- what product is assigned to a shelf slot
- the product’s key metadata without leaving the layout editor
- how future shelf-level expiry mapping can be rendered visually

## Next Step

- attach slots to exact inventory batches instead of generic product items
- show expiry state directly on slot cards
- add drag-and-drop reordering inside one shelf
