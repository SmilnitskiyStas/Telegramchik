# 2026-04-19 Store Layout First Increment

## Summary

Started a separate store-layout module based on `docs/grid-system.md`.

## Done

- created a dedicated web page at `/store-layout`
- added local draft persistence in browser storage
- added editable grid settings:
  - store name
  - store code
  - rows
  - columns
  - cell size
- added first simple editing mode by painting cell types
- added saved draft switching
- documented the MVP scope in `docs/store-layout-mvp.md`

## Why

This validates the overall feature direction with minimal implementation cost before introducing a heavier map engine such as Konva.js.

## Limitations

- this is not yet an object-based editor
- no drag-and-drop or resizing yet
- no IndexedDB yet
- no link to product expiry by location yet
- no JSON import/export yet

## Next Step

Move from painted cells to actual layout objects with:

- object ID
- object type
- x/y position
- width/height
- optional shelves metadata
