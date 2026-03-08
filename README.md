# BinManager

A Progressive Web App for QR-based bin and inventory management. Organize items into labeled bins, generate printable QR code labels, and scan them to quickly look up or add items.

All data stays in your browser — there is no backend or account required.

## Features

- **Search** — Fuzzy search across all bins and items from the home screen
- **QR Scanning** — Scan a bin's QR label with your phone camera to jump straight to its contents. Scanning an unknown code offers to create a new bin for it
- **Bin Management** — Create, edit, archive, and delete bins. Each bin has a name, location, description, and auto-generated ID (`BIN-001`, `BIN-002`, etc.)
- **Item Tracking** — Add items to bins with descriptions, tags, and optional photos taken from your device camera
- **Label Printing** — Generate bins in bulk and print sheets of QR code labels
- **Data Export/Import** — Export all data as JSON for backup or transfer between devices. Import with merge or replace modes
- **Offline Support** — Works without an internet connection after first load via service worker caching
- **Installable** — Can be installed as a standalone app on mobile and desktop through the browser's "Add to Home Screen" option

## How It Works

BinManager is a client-side only single-page application. All data (bins, items, and photos) is stored in your browser's IndexedDB. Photos are saved as base64 data URIs.

The app is built with vanilla JavaScript (ES modules), HTML, and CSS — no frameworks, no build step, no bundler. Three small libraries are loaded from CDNs:

| Library | Purpose |
|---------|---------|
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | QR code scanning via device camera |
| [Fuse.js](https://www.fusejs.io/) | Fuzzy text search |
| [qrcode](https://github.com/soldair/node-qrcode) | QR code image generation |

## Running Locally

No install or build step needed. Serve the files with any static server:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then open http://localhost:8000.

## Project Structure

```
├── index.html          # Single-page HTML with all views
├── style.css           # Dark-themed mobile-first styles
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline caching
└── src/
    ├── app.js          # Application logic, navigation, rendering
    ├── db.js           # IndexedDB storage layer
    └── scanner.js      # QR scanner wrapper
```

## Deployment

The app deploys to Vercel as a static site. Push to the main branch to trigger automatic deployment.
