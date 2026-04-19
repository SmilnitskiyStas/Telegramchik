# Store Layout MVP

## Goal

Create a separate page for store map construction that is not coupled to product receiving.

## Current Increment

Implemented in the current step:

- separate page: `/store-layout`
- local persistence in browser `localStorage`
- editable store draft metadata:
  - store name
  - store code
  - grid rows
  - grid columns
  - cell size
- object-based layout editing on top of a grid
- basic object types:
  - `shelf`
  - `fridge`
  - `cashier`
  - `passage`
- each object already stores:
  - `id`
  - `name`
  - `type`
  - `x`
  - `y`
  - `width`
  - `height`
  - `shelves`
- basic selection and object parameter editing
- drag-and-drop object movement with snapping to grid
- resize handle with width/height snapping to grid
- multiple saved drafts persisted in `IndexedDB`
- copy/paste flow for reusing existing layout objects
- object editor modal for internal structure editing
- first shelf-focused editor with:
  - shelf add/remove
  - shelf names
  - shelf status
  - visual product slots per shelf
  - product card preview with image, category, and barcode
  - slot binding to real products from current API data

## Why This Step Is Still Small

This is intentionally a lightweight prototype to validate:

- page structure
- local data model
- editing flow
- save/load behavior
- object JSON shape

before adding:

- Konva/Fabric canvas engine
- richer shelves editing
- JSON export/import
- linking layout objects with expiring products

## Current Storage Shape

The browser now stores an array of drafts in `IndexedDB` with this structure:

```json
{
  "id": "layout-123",
  "name": "Новий магазин",
  "code": "M-1001",
  "rows": 10,
  "cols": 14,
  "cellSize": 36,
  "objects": [
    {
      "id": "obj-1",
      "name": "Новий стелаж",
      "type": "shelf",
      "x": 1,
      "y": 1,
      "width": 2,
      "height": 2,
      "shelves": [
        { "level": 1, "status": "ok" }
      ]
    }
  ],
  "updatedAt": "2026-04-19T10:00:00.000Z"
}
```

## Next Planned Increment

- add JSON export/import
- add touch support for drag/resize
- prepare links from `layoutObjectId` to inventory zones and shelf-level expiry markers
- expand modal editors for fridge, cashier, and passage object types
- replace demo slot binding with stricter inventory-to-shelf allocation rules
