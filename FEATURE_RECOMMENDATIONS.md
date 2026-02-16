# Feature Recommendations for BinManager

Based on a thorough analysis of the current codebase, here are recommended features organized by priority and impact.

---

## High Priority — Core Functionality Gaps

### 1. Data Import / Restore from Backup

The app supports exporting all data as JSON via the Export button, but there is no corresponding import function. This means backups cannot be restored, and data cannot be migrated between devices.

**What to build:**
- Add an "Import" button (either in the nav or as a new view)
- Accept a JSON file matching the export format
- Validate the structure before writing to IndexedDB
- Offer merge vs. replace modes (merge adds missing bins/items; replace wipes and restores)
- Show a summary before committing (e.g., "This will import 12 bins and 47 items")

**Why it matters:** Without import, the export feature is incomplete. Users who clear their browser data or switch devices lose everything permanently.

---

### 2. Edit Existing Items

Items can be added and deleted, but never edited. If a user makes a typo in a description or wants to update a photo, they must delete the item and re-add it.

**What to build:**
- Add an "Edit" button/icon on each item card in the bin detail view
- Reuse the existing item form (`view-item-form`) with pre-filled values
- Add an `updateItem()` path in the save handler that calls `db.putItem()` with the existing item ID

**Why it matters:** Edit is a basic CRUD operation. Its absence forces destructive workarounds.

---

### 3. Edit Existing Bin Metadata

The bin form currently only supports creation. To change a bin's name, location, or description, there is no UI path.

**What to build:**
- Add an "Edit" button on the bin detail view (`view-bin`)
- Navigate to `view-bin-form` pre-populated with the bin's current data
- Make the ID field read-only during edits (it already is during creation)
- Save via the existing `db.putBin()` (which uses `put`, so it overwrites)

**Why it matters:** Bin metadata changes over time (bins get relocated, renamed, repurposed).

---

### 4. Photo Compression

Photos are stored as full-resolution base64 data URIs in IndexedDB with no compression. A handful of high-resolution photos can consume significant storage.

**What to build:**
- Before storing, draw the captured image onto an offscreen canvas at a reduced resolution (e.g., max 800px on the longest side)
- Export from canvas as JPEG with quality 0.7 (roughly 5-10x smaller than uncompressed)
- This requires no external library — the Canvas API handles it natively

**Why it matters:** IndexedDB has soft storage limits (varies by browser, often 50-100MB). Uncompressed photos will hit those limits quickly for active users.

---

## Medium Priority — User Experience Improvements

### 5. Item Sorting and Filtering

Items within a bin are displayed in IndexedDB's default order (insertion order). There is no way to sort or filter them.

**What to build:**
- Add a sort dropdown on the bin detail view: "Newest first", "Oldest first", "A-Z", "Z-A"
- Persist the preference in `localStorage` so it survives page reloads
- Optionally add a filter/search input scoped to the current bin's items

**Why it matters:** Bins with many items become difficult to navigate without sorting.

---

### 6. Item Tags or Categories

Items only have a `description` and `photo`. There is no way to categorize or label items beyond what's written in the description text.

**What to build:**
- Add an optional `tags` field (array of strings) to the item data model
- In the item form, add a tag input (comma-separated or chip-style)
- Display tags as colored chips on item cards
- Make tags searchable via Fuse.js (add `tags` to the Fuse keys array)
- Requires an IndexedDB schema migration (version bump)

**Why it matters:** Tags enable cross-bin organization (e.g., find all "electronics" items regardless of which bin they're in).

---

### 7. Custom Confirmation Dialogs

The app uses the browser's native `confirm()` for destructive actions (delete bin, delete item). These are functional but jarring and unstyled.

**What to build:**
- Create a reusable modal component matching the app's dark theme
- Replace all `confirm()` calls with the custom modal
- Include clear action labels ("Delete Bin" / "Cancel") instead of generic "OK" / "Cancel"
- Add brief context ("This bin contains 5 items. Deleting it will also delete all items.")

**Why it matters:** Native dialogs break the visual consistency of the app and provide poor UX on mobile.

---

### 8. Bin Archive / Soft Delete

Bins can only be hard-deleted. There is no way to hide inactive bins without losing the data.

**What to build:**
- Add an `archived` boolean to the bin data model (default `false`)
- Add an "Archive" action on the bin detail view (alongside the existing Delete)
- Filter archived bins out of the default search results and label view
- Add a toggle in search: "Show archived" to reveal them when needed
- Archived bins remain scannable via QR — scanning one shows it with an "Archived" badge

**Why it matters:** Physical bins get retired but their history may still be useful. Hard delete is permanent and irreversible.

---

### 9. Pagination or Virtualization for Large Inventories

`db.getAllBins()` and `db.getAllItems()` load all records into memory at once. The search view rebuilds the Fuse.js index from scratch on every view switch.

**What to build:**
- Cache the Fuse index and only rebuild when data changes (track a `lastModified` counter in memory)
- For the bin detail view, paginate items (e.g., 20 at a time with "Load more")
- For the search view, limit displayed results (already partially done with array slicing — but the index build is the bottleneck)

**Why it matters:** Performance will degrade noticeably beyond a few hundred items, especially on lower-end mobile devices.

---

## Lower Priority — Nice to Have

### 10. Multi-Device Sync

Currently all data lives exclusively in the browser's IndexedDB. There is no way to access the same inventory from another device.

**What to build (lightweight approach):**
- Add QR-based data sharing: generate a QR code that encodes a URL pointing to a temporary data payload (e.g., via a short-lived paste service)
- Alternatively, support export/import via clipboard or share sheet (`navigator.share`)

**What to build (full approach):**
- Integrate CouchDB/PouchDB for real-time sync (PouchDB is designed for this exact use case — offline-first with sync)
- This would require a backend, which breaks the current client-only architecture, so it should be opt-in

**Why it matters:** Inventory management is inherently multi-user. Households and small teams need shared access.

---

### 11. Barcode Scanning Support

The scanner currently only recognizes QR codes. Many physical items already have UPC/EAN barcodes.

**What to build:**
- html5-qrcode already supports barcode formats — enable them in the scanner config by adding `formatsToSupport` (EAN-13, UPC-A, Code 128, etc.)
- When a barcode is scanned, search for it in item descriptions or a new `barcode` field
- Optionally look up product info via a free API (Open Food Facts, UPC Database)

**Why it matters:** Scanning existing barcodes to catalog items is a natural extension of the QR scanning workflow.

---

### 12. Statistics Dashboard

The header shows total bin and item counts, but there is no deeper view into the data.

**What to build:**
- A new "Stats" view showing:
  - Items per bin (bar chart or simple list, sorted by count)
  - Recently added items (last 7 days)
  - Bins with no items (empty bins)
  - Storage usage estimate (sum base64 photo sizes)
- Use a lightweight canvas-based chart (or just styled HTML bars — no library needed)

**Why it matters:** Helps users understand their inventory at a glance and identify bins that need attention.

---

### 13. Bulk Item Management

There is no way to move items between bins, or to add/delete multiple items at once.

**What to build:**
- Multi-select mode on the bin detail view (checkboxes on each item)
- Batch actions: "Delete selected", "Move to bin..." (show bin picker)
- A "Move to" action on individual items as well

**Why it matters:** Physical reorganization (moving items between bins) is common but currently requires delete-and-re-add.

---

### 14. Keyboard Shortcuts and Accessibility

The app has no keyboard shortcuts and limited ARIA attributes.

**What to build:**
- Add `aria-label` attributes to icon-only buttons
- Add `role` attributes to view containers
- Add keyboard shortcuts: `/` to focus search, `Escape` to go back, `n` to create new bin
- Ensure all interactive elements are focusable and have visible focus states

**Why it matters:** Accessibility is both an ethical obligation and improves usability for all users (especially on desktop/tablet).

---

### 15. Print-Optimized Bin Contents

The label print feature only prints QR codes. There is no way to print a bin's contents list.

**What to build:**
- Add a "Print contents" button on the bin detail view
- Generate a print-optimized layout: bin name/ID at top, item list with descriptions, QR code in corner
- Use `@media print` CSS rules for clean output

**Why it matters:** Physical inventory sheets posted near bins complement the digital system.

---

## Implementation Notes

- All features should maintain the zero-dependency, no-build-step philosophy
- IndexedDB schema changes require incrementing the database version in `db.js` and adding upgrade logic in `onupgradeneeded`
- Any new files must be added to the `ASSETS` array in `service-worker.js` and the cache version must be bumped
- All user-generated content inserted into HTML must use the existing `esc()` function to prevent XSS
