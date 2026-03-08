# BinManager Technical Improvement Plan

## Purpose

This document outlines a concrete plan for addressing the top five technical issues in **BinManager**:

1. Monolithic UI code in `src/app.js`
2. Slow-scaling tag lookup
3. Weak import validation and schema evolution
4. Limited testability
5. Photo storage strategy risk

The goal is to improve maintainability, performance, and long-term reliability while preserving the current architecture:

- static hosting
- client-only
- framework-free
- offline-first PWA

## Current Context

Recent work has significantly improved the product:

- hash-based routing and deep links
- clickable tag results
- sync status + stale import warning
- responsive layout improvements
- mobile touch-target fixes
- a new **Bins page** replacing the old Labels screen
- clickable QR label cards
- simplified **+ Add Bin** workflow
- automatic bin creation when adding an item with no bins

These improvements also increase the complexity of `src/app.js`, which now handles nearly all UI logic.

Refactoring now will significantly improve maintainability before the codebase grows further.

## Guiding Principles

- Maintain **static deployment** (no backend).
- Keep the app **framework-free** unless absolutely necessary.
- Prefer **incremental refactoring** over rewriting.
- Preserve compatibility with existing exported JSON.
- Extract **pure logic modules** to improve testability.
- Preserve existing **routes and URLs**.

## Priority Order

1. Break up `src/app.js`
2. Improve testability
3. Harden import validation
4. Improve tag lookup performance
5. Rework photo storage strategy

This order reduces risk and enables safer future changes.

## 1. Break Up `src/app.js`

### Problem

`src/app.js` currently manages:

- application state
- routing
- view transitions
- rendering
- event wiring
- forms
- image workflows
- import/export UI
- modal/toast behavior
- Bins page logic
- search logic
- tag results
- QR generation
- multi-crop workflow

This concentration increases the likelihood of regressions and slows development.

### Goal

Split UI logic into small modules with clear responsibilities while preserving existing behavior.

### Proposed Structure

```text
src/
  app.js
  state.js
  router.js
  db.js
  scanner.js

  ui/
    dom.js
    toast.js
    modal.js

  views/
    search.js
    bins.js
    bin-detail.js
    bin-form.js
    item-form.js
    tag-results.js
    data-management.js
    multi-crop.js
```

### Responsibilities

#### `app.js`
Bootstrap only.

Responsibilities:

- initialization
- dependency wiring
- module startup

#### `router.js`

Handles:

- hash parsing
- route synchronization
- hashchange events

#### `views/search.js`

Handles:

- search input
- search filters
- rendering search results
- navigation to bins
- search FAB behavior

#### `views/bins.js`

Handles:

- bins grid rendering
- QR generation
- clickable bin cards
- `+ Add Bin`
- `Print Labels`
- empty-state messaging

#### `views/bin-detail.js`

Handles:

- bin detail display
- item list rendering
- item sort
- item actions
- bin archive/edit/delete

#### `views/item-form.js`

Handles:

- add/edit item
- bin selection
- photo upload
- tag parsing
- item save logic
- empty-state auto-create bin logic

#### `views/tag-results.js`

Handles:

- tag result rendering
- navigation to bins
- tag chip behavior

#### `views/data-management.js`

Handles:

- export
- import
- sync status
- stale import warnings

#### `views/multi-crop.js`

Handles:

- multi-item crop UI
- crop selections
- crop saving

### Execution Plan

#### Phase 1 – Utility extraction

Create:

```text
src/ui/dom.js
src/ui/toast.js
src/ui/modal.js
```

Move:

- `$`
- `esc`
- `escAttr`
- toast logic
- modal logic

#### Phase 2 – Routing extraction

Move:

- `routeForCurrentView`
- `syncRouteToUrl`
- `parseRouteFromHash`
- `applyRouteFromHash`

Routes must remain unchanged.

#### Phase 3 – View extraction

Extract views one at a time:

1. bins
2. item form
3. search
4. bin detail
5. tag results
6. data management
7. multi-crop

#### Phase 4 – Bootstrap cleanup

Reduce `app.js` to:

```js
init()
wireModules()
startApp()
```

### Definition of Done

- `src/app.js` becomes a small bootstrap file
- Bins/search/item logic are isolated
- routing behavior remains unchanged
- UI behavior remains identical

## 2. Improve Testability

### Problem

Most logic is coupled to the DOM and module state, making automated testing difficult.

### Goal

Extract pure logic functions and add a lightweight test setup.

### Suggested Modules

```text
src/lib/
  routes.js
  tags.js
  sort.js
  import-validation.js
  sync-meta.js
  ids.js
```

### Suggested Test Setup

Use either:

- **Vitest**
- **Node built-in test runner**

Tests should focus on pure logic, not UI rendering.

### Initial Test Targets

#### Routing

- parse search route
- parse bins route
- parse tag route
- serialize routes

#### Tags

- trimming
- lowercasing
- duplicate removal

#### Sorting

- newest
- oldest
- A-Z
- Z-A

#### Bin ID generation

- next BIN-### formatting
- correct padding
- collision safety

#### Import validation

- reject malformed structures
- reject items missing IDs
- reject items missing `binId`

### Definition of Done

- test runner installed
- 10–20 tests covering pure logic
- route parsing and tag parsing tested

## 3. Harden Import Validation

### Problem

Current import validation only checks basic structure.

It does not protect against:

- duplicate IDs
- orphaned items
- corrupted objects
- schema changes

### Goal

Create a robust import pipeline with schema awareness.

### Expected Schema

```json
{
  "version": 1,
  "bins": [],
  "items": [],
  "exportedAt": "..."
}
```

### Import Pipeline

```text
import payload
  → validate shape
  → detect version
  → migrate if needed
  → normalize data
  → integrity checks
  → preview summary
  → write to DB
```

### Validation Rules

Check:

- bin IDs exist
- item IDs exist
- item.binId exists
- IDs are unique
- referenced bins exist
- arrays are valid

### Suggested Modules

```text
src/lib/
  import-validation.js
  migrations.js
```

### Recommended Improvements

- normalize strings
- normalize tags
- ensure arrays are arrays
- default missing optional fields
- reject or report orphaned items
- detect duplicate IDs before write
- preserve compatibility with current exports
- show a richer preview before import

### Definition of Done

- import validation is schema-aware
- invalid data is reported clearly
- a migration path exists for future versions
- import preview is more informative

## 4. Improve Tag Lookup Performance

### Problem

Tag lookup currently scans all items in memory.

This works for small datasets but will degrade as inventories grow.

### Goal

Add indexed tag lookup without increasing architecture complexity.

### Option A – MultiEntry Index

Add IndexedDB `multiEntry` index on `tags`.

Pros:

- simple
- minimal duplication

Cons:

- limited flexibility

### Option B – Tag Mapping Store

Create a dedicated `itemTags` store.

```text
itemTags
  tag
  itemId
  binId
```

Pros:

- scalable
- flexible

Cons:

- more write logic

### Recommendation

Start with **multiEntry index** for simplicity.

### Required Changes

- bump IndexedDB version
- add migration logic
- update item create/edit/delete flows
- replace full-scan `getItemsByTag()` with indexed lookup

### Validation

Benchmark with larger sample data:

- 100 bins
- 5,000+ items
- realistic tag distributions

Track:

- tag-results open time
- import time
- search responsiveness

### Definition of Done

- tag lookup no longer scans all items
- results remain correct after edits/imports
- migration works for existing data

## 5. Rework Photo Storage Strategy

### Problem

Photos are stored as base64 strings.

Issues:

- inflated storage size
- large export files
- slower imports
- browser quota pressure

### Goal

Move photos to blob storage.

### Proposed Model

Current:

```js
item.photo = base64 string
```

New:

```js
item.photoId
```

Photos store:

```text
photos
  id
  blob
  mimeType
  createdAt
```

### Migration Strategy

#### Phase 1

- support both formats

#### Phase 2

- convert legacy photos

#### Phase 3

- remove inline base64 for new writes

### Export Strategy

Option A:

- convert blobs back to base64 during export
- preserves single-file export

Option B:

- offer compact export and full export
- more flexible, but more UI complexity

### Recommendation

Start with **Option A**.

### Definition of Done

- new photos are stored as blobs
- old data still works
- export/import still works
- storage usage improves

## Milestones

### Milestone 1

Structure refactor:

- UI helpers
- router extraction
- logic tests

### Milestone 2

View decomposition:

- bins view
- search view
- item form view

### Milestone 3

Data integrity:

- improved import validation
- schema versioning

### Milestone 4

Performance:

- indexed tag lookup

### Milestone 5

Storage improvements:

- blob-based photo store

## Suggested PR Breakdown

1. Extract `dom.js`
2. Extract `toast.js`
3. Extract `modal.js`
4. Extract route helpers
5. Add tests for routes/tags/sort/IDs
6. Extract `views/bins.js`
7. Extract `views/item-form.js`
8. Extract `views/search.js`
9. Harden import validation
10. Add schema migration scaffolding
11. Add indexed tag lookup
12. Add blob-backed photo storage

## Success Metrics

Success means:

- `app.js` becomes small and maintainable
- routing and tag logic are testable
- imports become safer
- tag queries scale better
- photo storage becomes efficient
- app remains deployable as static PWA

## Non-Goals

This plan intentionally avoids:

- adding a backend
- user accounts
- migrating to React/Vue/etc
- introducing a complex build system

## Recommended Next Step

First PR:

1. Extract `dom.js`
2. Extract `toast.js`
3. Extract `modal.js`
4. Extract route helpers
5. Add first tests

This provides the best foundation for all further improvements.
