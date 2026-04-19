# 2026-04-19 Store Layout Drag And Snap

## Summary

Added drag-and-drop movement for store layout objects with snapping to the grid.

## Done

- object drag with mouse events in the store layout page
- snapping to grid while moving
- clamping objects to layout bounds
- updated documentation in `docs/store-layout-mvp.md`

## Why

This is the smallest meaningful step that makes the constructor feel like a real layout editor instead of a static form.

## Limitations

- no resize handles yet
- no multi-select yet
- no canvas engine yet
- no touch drag yet

## Next Step

Add resize controls with the same grid snapping rules.
