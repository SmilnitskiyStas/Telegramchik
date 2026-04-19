# Store Layout Persistence And Copy Step

Date: 2026-04-19

## What Changed

- switched draft persistence from browser `localStorage` to `IndexedDB`
- added migration fallback so older local drafts are loaded and re-saved into the new storage
- added object copy/paste flow for repeating similar layout zones faster
- pasted objects are cloned with a new id and a small position offset, then clamped to the grid bounds

## Why This Matters

This step makes the editor more practical for real store setup work:

- larger draft data can now be stored in a more appropriate browser database
- repeated shelves, fridges, or cashier zones no longer need to be rebuilt manually
- the object model stays stable for later links to shelf-level expiry visualization

## Next Step

- add JSON export/import for draft portability
- add touch drag/resize support
- start linking layout objects to future zone and expiry data
