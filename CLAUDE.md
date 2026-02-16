# CLAUDE.md

## Project Overview

BinManager is a Progressive Web App (PWA) for QR-based bin and inventory management. It is a **client-side only** application with no backend — all data is persisted in IndexedDB. Users organize items into labeled bins, generate QR code labels for physical bins, and scan those labels to quickly look up or add items.

**Key characteristics:**
- Zero-build, zero-dependency vanilla JavaScript (ES modules)
- Offline-capable via service worker with cache-first strategy
- Mobile-first dark-themed UI (max-width 480px)
- Deployed to Vercel as a static site

## File Structure

```
bin-manager/
├── index.html            # Single-page HTML entry point with all views
├── style.css             # Complete styling (CSS custom properties, dark theme)
├── manifest.json         # PWA manifest (standalone display mode)
├── service-worker.js     # Offline caching (cache-first, versioned)
└── src/
    ├── app.js            # Main application logic, navigation, UI rendering
    ├── db.js             # IndexedDB abstraction layer (CRUD for bins/items)
    └── scanner.js        # QR code scanner wrapper (html5-qrcode)
```

## Architecture

### Layered Design

- **UI layer** (`src/app.js`) — DOM manipulation, view navigation, event handlers, rendering
- **Storage layer** (`src/db.js`) — IndexedDB wrapper exposing async CRUD operations
- **External integrations** (`src/scanner.js`) — Camera/QR scanning via html5-qrcode library

### Data Model

```
Bin:  { id: string, name: string, location: string, description: string, createdAt: ISO string }
Item: { id: string (UUID), binId: string, description: string, photo: base64|null, addedAt: ISO string }
```

- Bins use a human-readable ID format: `BIN-001`, `BIN-002`, etc.
- Items reference bins via `binId` (indexed in IndexedDB for efficient queries)
- Photos are stored as base64 data URIs directly in IndexedDB

### Views

The app uses a single-page architecture with 6 views toggled via CSS class `active`:

1. **Search** (`view-search`) — Default view, fuzzy search across bins and items
2. **Scan** (`view-scan`) — QR code scanning via device camera
3. **Bin detail** (`view-bin`) — Shows bin metadata and item list
4. **Bin form** (`view-bin-form`) — Create/edit bin
5. **Item form** (`view-item-form`) — Add item to current bin (with photo capture)
6. **Labels** (`view-labels`) — Generate bins in bulk and print QR label sheets

### External Libraries (loaded via CDN)

| Library | Version | CDN | Purpose |
|---------|---------|-----|---------|
| html5-qrcode | 2.3.8 | unpkg | QR code scanning from camera |
| fuse.js | 7.0.0 | jsDelivr | Fuzzy search across bins and items |
| qrcode | 1.5.1 | jsDelivr | QR code generation to canvas |

## Development

### No Build Process

This project has **no package.json, no bundler, no transpiler**. Files are served directly as-is. To develop locally, use any static file server:

```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .
```

Then open `http://localhost:8000` in a browser.

### No Test Framework

There are no automated tests. All testing is manual in-browser.

### Service Worker Cache Busting

When making changes, bump the cache version in `service-worker.js`:

```js
const CACHE_NAME = 'binmanager-v3';  // increment version number
```

The `ASSETS` array in `service-worker.js` must include all files that should be available offline. Add any new files to this list.

## Code Conventions

### JavaScript

- **Module system**: ES6 modules (`import`/`export`). Entry point loaded via `<script type="module">`.
- **Naming**: camelCase for functions and variables, UPPER_SNAKE_CASE for constants (`DB_NAME`, `CACHE_NAME`)
- **DOM access**: `$()` shorthand for `document.getElementById()` defined in `app.js`
- **Async patterns**: Promise-based with `async/await`
- **HTML escaping**: Always use the `esc()` function when inserting user data into HTML to prevent XSS
- **IDs**: UUIDs generated via `crypto.randomUUID()` for items; formatted strings (`BIN-###`) for bins

### CSS

- **Design system**: CSS custom properties defined in `:root` (see `style.css` lines 2-14)
- **Colors**: `--bg` (#121212), `--surface` (#1e1e1e), `--accent` (#ff9800 orange), `--danger` (#e53935), `--text` (#e0e0e0)
- **Fonts**: JetBrains Mono (body), Space Mono (headings, IDs)
- **Class naming**: kebab-case (`.result-card`, `.item-photo`, `.bottom-nav`)
- **Layout**: Flexbox-based, mobile-first (max-width 480px)
- **Transitions**: Short durations (0.15s-0.2s) for interactive states

### HTML

- **IDs**: kebab-case with semantic prefixes (`view-search`, `bin-detail-id`, `item-form-desc`)
- **Views**: Each view is a `<div class="view">` inside `.main`; toggled by adding/removing `active` class
- **Inline styles**: Used sparingly for one-off overrides (padding, font-size on specific elements)

## Key Patterns

### View Navigation

```js
showView('search')   // hides all views, shows the named one, updates nav button state
```

Navigation automatically stops the QR scanner when leaving the scan view.

### Database Operations

All `db.*` functions are async and call `open()` internally to ensure the database is initialized:

```js
await db.putBin({ id, name, location, description, createdAt })
await db.putItem({ id, binId, description, photo, addedAt })
const bins = await db.getAllBins()
const items = await db.getItemsByBin(binId)
```

### Rendering

HTML is generated via template literals and inserted via `innerHTML`. Event listeners are attached after rendering by querying the newly inserted elements. This is the established pattern — do not introduce a framework or virtual DOM.

### QR Scan Flow

1. User taps Scan in bottom nav
2. Camera starts via `scanner.start()`
3. On successful scan, `onQrScanned(text)` fires
4. If the scanned ID matches an existing bin, opens bin detail
5. If no match, opens bin creation form pre-filled with the scanned ID

## Deployment

The app deploys to **Vercel** as a static site. Pushing to the main branch triggers automatic deployment. No build step is configured — Vercel serves the files directly.

## Important Notes

- **No backend**: All data lives in the browser's IndexedDB. There are no API calls.
- **Photo storage**: Photos are base64-encoded and stored in IndexedDB. Large photo collections will increase storage usage significantly.
- **Browser APIs required**: IndexedDB, Service Workers, Web Crypto (`randomUUID`), Camera access (for scanning and photo capture)
- **Cache versioning**: Always bump `CACHE_NAME` in `service-worker.js` when changing any cached asset, or users with the PWA installed will not see updates.
- **CDN pinning**: External libraries are pinned to specific versions. Do not change versions without testing — version 1.5.4 of qrcode does not exist (previously caused a bug).
