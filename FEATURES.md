# BinManager Feature Recommendations

## 1. Barcode Scanning

Enable barcode formats in `html5-qrcode` (EAN-13, UPC-A, Code 128, etc.) so users can catalog items with existing product barcodes.

- Add `formatsToSupport` in scanner config
- Match scans against item descriptions or a new `barcode` field
- Optional: pull product data from a public API

## 2. Bulk Item Management

Add tools for moving and deleting multiple items at once.

- Add multi-select checkboxes in bin detail view
- Add batch actions: delete selected, move selected
- Add single-item "Move to bin" action

## 3. Multi-Device Sync

Provide a way to share inventory across devices.

- Lightweight option: export/import via QR, clipboard, or share sheet
- Full option: optional backend sync (for example, PouchDB + CouchDB)

## Notes

- Keep the no-build, minimal-dependency approach
- Update IndexedDB version and migration logic for schema changes
- Update service worker `ASSETS` and bump cache version when files change
- Keep escaping user content with `esc()`
