# Store Layout Object Editor Modal

Date: 2026-04-19

## What Changed

- added `Редагувати` action for a single selected layout object
- introduced object editor modal on `/store-layout`
- expanded shelf structure to store:
  - shelf name
  - shelf status
  - simple product list
- implemented first internal editor flow for `shelf` objects:
  - add shelf
  - remove shelf
  - rename shelf
  - change shelf status
  - edit products on each shelf

## Why This Matters

This is the first step from "move blocks on a map" toward "model the real inside of a store object".

The store layout editor can now represent:

- the outer placement of a shelf in the store
- the internal shelf structure of that object
- the product list that belongs to each shelf level

## Next Step

- add dedicated internal editors for fridge, cashier, and passage
- move from free-text shelf products to linked inventory entities later
- prepare product-to-shelf and expiry visualization bindings
