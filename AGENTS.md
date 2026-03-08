# AGENTS.md

## Project Overview

BinManager is a PWA for QR-based bin and inventory management.

Architecture is local-first with optional cloud sync:
- Local data: IndexedDB
- Optional cloud sync: Vercel API routes + Vercel Blob
- Cloud auth model: shared Sync Key (8+ chars), no OAuth required

## Key Characteristics

- Vanilla JavaScript (ES modules), no frontend bundler
- Service worker cache-first behavior
- Mobile-first UI (max width ~480px)
- Deployed on Vercel (static assets + serverless API)
- Node unit tests for pure logic modules

## File Structure

```text
bin-manager/
├── api/
│   └── sync/
│       ├── meta.js
│       ├── pull.js
│       ├── push.js
│       ├── photo.js
│       ├── photo-upload.js
│       └── photos-missing.js
├── server/
│   ├── json.js
│   ├── storage.js
│   └── sync-key.js
├── src/
│   ├── app.js
│   ├── db.js
│   ├── scanner.js
│   ├── lib/
│   │   ├── cloud-sync.js
│   │   ├── import-validation.js
│   │   ├── ids.js
│   │   ├── migrations.js
│   │   ├── routes.js
│   │   ├── sort.js
│   │   ├── sync-meta.js
│   │   └── tags.js
│   ├── ui/
│   └── views/
├── tests/node/
├── index.html
├── style.css
├── service-worker.js
└── package.json
```

## Data Model

```text
Bin: {
  id: string,
  name: string,
  location: string,
  description: string,
  createdAt: ISO string,
  archived: boolean
}

Item: {
  id: string,
  binId: string,
  description: string,
  tags: string[],
  addedAt: ISO string,
  photo?: data-url | null,
  photoId?: string,
  photoHash?: string,
  photoMimeType?: string
}
```

Notes:
- Local photo writes are blob-backed (`photos` store + `photoId`).
- Cloud snapshots exclude inline photos.
- Cloud photos are keyed by `photoHash`.

## Development

### Local-only static mode

```bash
python3 -m http.server 8000
# or
npx serve .
```

### Full mode with API routes

```bash
npm install
vercel dev
```

### Tests

```bash
npm test
```

## Cloud Env Vars

- `BLOB_READ_WRITE_TOKEN` (required)
- `SYNC_KEY_PEPPER` (optional)

## Service Worker Cache Rules

When editing cached client assets:
1. Bump `CACHE_NAME` in `service-worker.js`.
2. Ensure new client files are listed in `ASSETS`.

## Important Notes

- Keep import/export compatibility across schema changes.
- Do not regress offline/local-only behavior.
- Keep cloud sync additive and optional.
