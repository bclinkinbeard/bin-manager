# BinManager Feature Roadmap

## 1. Cloud Sync (MVP Implemented)

Implemented:
- Google sign-in/out in the Data view
- Cloud Push/Pull actions
- Per-user private cloud snapshot storage
- Photo deduplication by SHA-256 hash in cloud object storage

Current behavior:
- Push uploads missing photos first, then uploads snapshot JSON.
- Pull replaces local data with cloud snapshot and restores photos.
- Sync is explicit/manual (no background auto-sync yet).

Next improvements:
- Optional merge-based pull mode
- Better progress and retry UX for large photo sets
- Optional snapshot compression

## 2. Barcode Scanning

Enable additional barcode formats in `html5-qrcode` (EAN-13, UPC-A, Code 128, etc.) so users can catalog items with existing product barcodes.

- Configure `formatsToSupport` in scanner setup.
- Add optional `barcode` field on items for exact lookup.
- Optionally enrich metadata from external product APIs.

## 3. Bulk Item Management

Add tools for moving, tagging, and deleting many items at once.

- Multi-select mode in bin detail and tag results.
- Batch actions: move, retag, delete.
- Optional undo for destructive operations.

## Notes

- Keep no-build frontend architecture.
- Keep service worker `ASSETS` + cache version updated when client files change.
- Continue using `esc()`/`escAttr()` for user-supplied content.
- Preserve import/export compatibility when schema changes.
