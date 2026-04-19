# 2026-04-19 Store Layout Object Step

## Summary

Moved the store-layout prototype from painted grid cells to real layout objects.

## Done

- replaced cell-state editing with object-based layout storage
- each layout object now has:
  - `id`
  - `name`
  - `type`
  - `x`
  - `y`
  - `width`
  - `height`
  - `shelves`
- added active object selection
- added object parameter editing in the sidebar
- added object creation and deletion
- updated `docs/store-layout-mvp.md`

## Why

This makes the feature structurally closer to `docs/grid-system.md` and creates the correct base for:

- drag-and-drop
- resize
- shelf-level status
- later links to inventory placement

## Limitations

- object movement is still numeric-input based
- no drag-and-drop yet
- no resize handles yet
- no IndexedDB yet
- no JSON export/import yet

## Next Step

Add drag-and-drop movement with snapping to grid and then introduce resize behavior.
