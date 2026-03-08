# BinManager

A Progressive Web App for QR-based bin and inventory management. Organize items into labeled bins, generate printable QR code labels, and scan them to quickly look up or add items.

## Modes

BinManager now supports two modes:

- Local-only (default fallback): all data in browser IndexedDB.
- Cloud sync (optional): Google sign-in + Vercel API + Vercel Blob storage.

If cloud env vars are not configured, the app still runs in local-only mode.

## Features

- **Search**: Fuzzy search across bins and items
- **QR Scanning**: Scan a bin label to open it; unknown codes can start new bin creation
- **Bin Management**: Create, edit, archive, and delete bins (`BIN-001`, `BIN-002`, ...)
- **Item Tracking**: Add/edit items with tags and optional photos
- **Bins View + Label Printing**: Browse bins and print QR labels
- **Data Management**:
  - JSON export/import and recovery tools
  - Cloud sign-in/out
  - Cloud Push/Pull snapshot sync
- **Offline Support**: Service worker cache-first behavior for installed PWA use

## Storage Model

### Local (IndexedDB)

- `bins` and `items` object stores for inventory data
- `photos` object store for image blobs
- items reference photos via `photoId`

### Cloud (Vercel Blob)

- per-user snapshot JSON stored as private blob objects
- per-user photo objects deduplicated by SHA-256 hash
- pointer metadata (`latest snapshot`) stored as a private blob JSON file

Snapshot payloads intentionally exclude inline image data.

## Tech Stack

- Vanilla JavaScript (ES modules)
- HTML/CSS
- IndexedDB
- Service Worker
- Vercel API functions (`/api/*`)
- Vercel Blob (`@vercel/blob`)
- Google ID token verification (`google-auth-library`)
- CDN libraries:
  - [html5-qrcode](https://github.com/mebjas/html5-qrcode)
  - [Fuse.js](https://www.fusejs.io/)
  - [qrcode](https://github.com/soldair/node-qrcode)

## Running Locally

### Local-only static mode

```bash
python3 -m http.server 8000
# or
npx serve .
```

Open [http://localhost:8000](http://localhost:8000).

### Full mode with API routes

Use Vercel local runtime so `/api/*` works:

```bash
npm install
vercel dev
```

## Environment Variables (Cloud Sync)

Set these in Vercel project settings (and local `.env` for `vercel dev`):

- `SESSION_SECRET`: random long secret used to sign session cookies
- `GOOGLE_CLIENT_ID`: OAuth client ID for Google Identity Services
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token

## Tests

Node unit tests cover pure logic modules:

```bash
npm test
```

## Project Structure

```text
├── index.html
├── style.css
├── manifest.json
├── service-worker.js
├── api/
│   ├── auth/
│   └── sync/
├── server/
├── src/
│   ├── app.js
│   ├── db.js
│   ├── scanner.js
│   ├── views/
│   ├── ui/
│   └── lib/
└── tests/
    └── node/
```
