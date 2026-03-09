# BinManager

A Progressive Web App for QR-based bin and inventory management.

## Modes

- Local-only: everything in browser IndexedDB.
- Optional cloud sync: Vercel API + Vercel Blob, authenticated by a user-provided Sync Key.

If cloud env vars are missing, local-only mode still works.

## Features

- Fuzzy search across bins/items
- QR scanning to open/create bins
- Bin create/edit/archive/delete
- Item tracking with tags and photos
- Bins view + label printing
- Data management:
  - JSON export/import + recovery tools
  - Cloud sync key connect/clear
  - Cloud push/pull
- Offline support via service worker

## Storage Model

### Local (IndexedDB)

- `bins`, `items`, `photos` stores
- photos are blob-backed; items reference by `photoId`

### Cloud (Vercel Blob)

- per-key namespaced snapshot JSON
- per-key namespaced photos deduplicated by SHA-256 hash
- per-key namespaced pointer metadata (`latest.json`)

Snapshots exclude inline photo data.

## Tech Stack

- Vanilla JS (ES modules), HTML, CSS
- IndexedDB + Service Worker
- Vercel API routes (`/api/sync/*`)
- Vercel Blob (`@vercel/blob`)
- CDN: html5-qrcode, Fuse.js, qrcode

## Run Locally

### Static local-only

```bash
python3 -m http.server 8000
# or
npx serve .
```

### With API routes

```bash
npm install
vercel dev
```

## Environment Variables (Cloud Sync)

- `BLOB_READ_WRITE_TOKEN` (required)
- `SYNC_KEY_PEPPER` (optional, recommended)
- `BLOB_ACCESS` (optional: `private` or `public`; defaults to `private`)

## Tests

```bash
npm test
```

## Project Structure

```text
├── api/
│   └── sync/
├── server/
├── src/
├── tests/
├── index.html
├── style.css
├── manifest.json
└── service-worker.js
```
