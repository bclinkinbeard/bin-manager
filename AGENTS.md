# AGENTS.md

## Project Overview

BinManager is a Progressive Web App (PWA) for QR-based bin and inventory management.

The app is local-first and offline-capable, with optional cloud sync.

- Local data lives in IndexedDB.
- Cloud sync uses Vercel API routes, Google sign-in, and Vercel Blob.
- If cloud config is missing, local-only mode still works.

## Key Characteristics

- Vanilla JavaScript (ES modules), no frontend bundler
- Service worker cache-first offline behavior
- Mobile-first UI with a max content width around 480px
- Static assets + serverless API deployment on Vercel
- Node built-in unit tests for pure logic modules

## File Structure

```text
bin-manager/
├── index.html
├── style.css
├── manifest.json
├── service-worker.js
├── api/
│   ├── auth/
│   │   ├── config.js
│   │   ├── google.js
│   │   ├── logout.js
│   │   └── me.js
│   └── sync/
│       ├── meta.js
│       ├── pull.js
│       ├── push.js
│       ├── photo.js
│       ├── photo-upload.js
│       └── photos-missing.js
├── server/
│   ├── auth.js
│   ├── json.js
│   ├── session.js
│   └── storage.js
├── src/
│   ├── app.js
│   ├── db.js
│   ├── scanner.js
│   ├── views/
│   ├── ui/
│   └── lib/
│       ├── cloud-sync.js
│       ├── routes.js
│       ├── tags.js
│       ├── sort.js
│       ├── import-validation.js
│       ├── migrations.js
│       ├── ids.js
│       └── sync-meta.js
├── tests/node/
└── package.json
```

## Architecture

- **UI orchestration**: `src/app.js`
- **Local storage layer**: `src/db.js` (IndexedDB CRUD + import/export)
- **Cloud client logic**: `src/lib/cloud-sync.js`
- **API layer**: `api/*` routes for auth + sync
- **Server helpers**: `server/*` for auth/session/blob utilities

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

Photo store record (local IndexedDB): {
  id: string,
  blob: Blob,
  mimeType: string,
  createdAt: ISO string
}
```

Notes:
- Local writes are blob-backed in IndexedDB.
- Cloud snapshots exclude inline image data.
- Cloud photos are deduplicated by `photoHash`.

## Views

Views are `<div class="view">` blocks toggled with `.active`.

- `view-search`
- `view-scan`
- `view-bin`
- `view-tag`
- `view-bin-form`
- `view-item-form`
- `view-multi-crop`
- `view-bins`
- `view-data` (includes manual sync and cloud sync controls)

## Development

### Local-only static serve

```bash
python3 -m http.server 8000
# or
npx serve .
```

### With API routes

```bash
vercel dev
```

### Tests

```bash
npm test
```

### Service Worker Cache Busting

When changing any cached client asset:
1. Bump `CACHE_NAME` in `service-worker.js`.
2. Ensure the asset is included in `ASSETS`.

## Cloud Sync Environment Variables

Required for cloud sync routes:

- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `BLOB_READ_WRITE_TOKEN`

## Code Conventions

### JavaScript

- ES modules (`import` / `export`)
- camelCase names; constants in UPPER_SNAKE_CASE
- Use shared DOM helpers from `src/ui/dom.js` (`$`, `esc`, `escAttr`)
- Prefer `async`/`await`
- Escape all user-provided content before HTML insertion

### CSS/HTML

- Keep existing design tokens and dark theme style language
- Keep IDs/classes in kebab-case
- Preserve mobile-first behavior and touch-friendly targets

## Important Notes

- Preserve import/export compatibility across schema changes.
- Do not regress offline/local-only operation.
- Keep cloud sync additive; local IndexedDB remains the source of truth while offline.
- Do not change pinned CDN versions without testing.
