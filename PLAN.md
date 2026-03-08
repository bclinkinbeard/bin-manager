# BinManager Technical Plan (Updated March 8, 2026)

## Snapshot

Current state:
- Local-first IndexedDB app remains fully offline-capable.
- Cloud sync MVP is implemented with Vercel API routes + Vercel Blob storage.
- Cloud access uses a shared Sync Key (no OAuth provider setup).
- Snapshot sync excludes inline image payloads; photos are deduped by hash.

## Completed

1. Modularization and testability
- Shared UI/helpers split into `src/ui/*`, `src/lib/*`, `src/views/*`
- Node unit tests for pure logic modules

2. Import normalization/migration scaffolding
- Robust import validation in `src/lib/import-validation.js`
- Migration entry in `src/lib/migrations.js`

3. Indexed tag lookup
- Multi-entry `tags` index on `items`

4. Blob-backed local photos
- New photo writes stored in IndexedDB `photos`
- Items reference `photoId`

5. Cloud sync MVP
- Sync API routes: `meta`, `push`, `pull`, `photos-missing`, `photo-upload`, `photo`
- Data view cloud controls: connect key, clear key, push, pull
- Storage model: per-key snapshot + per-key photo blobs + pointer metadata

## Open Work

A. Sync UX and resilience
- Merge-mode cloud pull
- Better transfer progress + retries

B. Sync efficiency
- Optional snapshot compression
- Incremental sync if full snapshots become limiting

C. Security and ops
- Rate limiting for sync endpoints
- Monitoring for sync failures
- Retention/cleanup for old snapshots

## Non-Goals (for now)

- Removing local-only workflows
- Replacing IndexedDB with cloud-first storage
- Frontend framework migration

## Success Criteria

- Local workflows remain stable
- Cloud sync stays optional and simple to set up
- Large photo libraries remain practical via hash dedupe
- JSON import/export portability remains intact
