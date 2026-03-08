# Feature Recommendations for BinManager

Based on a thorough analysis of the current codebase, here are recommended features organized by priority and impact.

---

## Medium Priority — User Experience Improvements

### 1. Barcode Scanning Support

The scanner currently only recognizes QR codes. Many physical items already have UPC/EAN barcodes.

**What to build:**
- html5-qrcode already supports barcode formats — enable them in the scanner config by adding `formatsToSupport` (EAN-13, UPC-A, Code 128, etc.)
- When a barcode is scanned, search for it in item descriptions or a new `barcode` field
- Optionally look up product info via a free API (Open Food Facts, UPC Database)

**Why it matters:** Scanning existing barcodes to catalog items is a natural extension of the QR scanning workflow.

---

### 2. Statistics Dashboard

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

### 3. Bulk Item Management

There is no way to move items between bins, or to add/delete multiple items at once.

**What to build:**
- Multi-select mode on the bin detail view (checkboxes on each item)
- Batch actions: "Delete selected", "Move to bin..." (show bin picker)
- A "Move to" action on individual items as well

**Why it matters:** Physical reorganization (moving items between bins) is common but currently requires delete-and-re-add.

---

### 4. Keyboard Shortcuts and Accessibility

The app has limited keyboard shortcuts and partial ARIA attributes.

**What to build:**
- Add `aria-label` attributes to icon-only buttons
- Add `role` attributes to view containers
- Add keyboard shortcuts: `/` to focus search, `Escape` to go back, `n` to create new bin
- Ensure all interactive elements are focusable and have visible focus states

**Why it matters:** Accessibility is both an ethical obligation and improves usability for all users (especially on desktop/tablet).

---

## Lower Priority — Nice to Have

### 5. Multi-Device Sync

Currently all data lives exclusively in the browser's IndexedDB. There is no way to access the same inventory from another device.

**What to build (lightweight approach):**
- Add QR-based data sharing: generate a QR code that encodes a URL pointing to a temporary data payload (e.g., via a short-lived paste service)
- Alternatively, support export/import via clipboard or share sheet (`navigator.share`)

**What to build (full approach):**
- Integrate CouchDB/PouchDB for real-time sync (PouchDB is designed for this exact use case — offline-first with sync)
- This would require a backend, which breaks the current client-only architecture, so it should be opt-in

**Why it matters:** Inventory management is inherently multi-user. Households and small teams need shared access.

---

## Implementation Notes

- All features should maintain the zero-dependency, no-build-step philosophy
- IndexedDB schema changes require incrementing the database version in `db.js` and adding upgrade logic in `onupgradeneeded`
- Any new files must be added to the `ASSETS` array in `service-worker.js` and the cache version must be bumped
- All user-generated content inserted into HTML must use the existing `esc()` function to prevent XSS
