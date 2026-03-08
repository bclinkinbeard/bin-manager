# BinManager Feature Roadmap

## 1. Cloud Sync (MVP Implemented)

Implemented:
- Sync Key connect/clear in Data view
- Cloud push/pull actions
- Per-key namespaced snapshot storage
- Per-key photo dedupe by SHA-256 hash

Current behavior:
- Push uploads missing photos, then snapshot JSON.
- Pull replaces local data with cloud snapshot.
- Sync is explicit/manual (no background auto-sync yet).

Next:
- Merge-mode pull option
- Better progress/retry UX for large photo sets
- Optional snapshot compression

## 2. Barcode Scanning

- Enable more barcode formats (EAN-13, UPC-A, Code 128)
- Optional `barcode` field on items
- Optional metadata enrichment from product APIs

## 3. Bulk Item Management

- Multi-select in bin/tag views
- Batch move/retag/delete
- Optional undo for destructive operations

## Notes

- Keep no-build frontend architecture
- Keep service worker assets/cache version updated when client files change
- Preserve import/export compatibility when schema changes
