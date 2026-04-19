# Store Layout Resize Step

Date: 2026-04-19

## What Changed

- added resize handle for each layout object on `/store-layout`
- implemented mouse-based resize with snapping to grid
- clamped resized objects to the current store layout bounds
- kept the object-based draft format unchanged, so saved data remains compatible

## Why This Matters

This step moves the editor closer to the target grid-system workflow:

- objects can now be positioned and sized directly on the canvas
- the draft model already supports future shelf-zone mapping
- the next iteration can focus on persistence and product-to-zone linking instead of reworking the shape model

## Next Step

- move saved drafts from `localStorage` to `IndexedDB`
- add export/import for layout JSON
- prepare `layoutObjectId` linkage for future expiry visualization by zone or shelf
