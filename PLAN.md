# BinManager Technical Plan (Updated March 8, 2026)

## Snapshot

Current status:
- Local-first IndexedDB app remains fully functional offline.
- Cloud sync MVP is implemented with Vercel API routes + private Vercel Blob storage.
- Authentication uses Google ID token verification and signed session cookies.
- Snapshot sync excludes inline image payloads; photos are deduplicated by hash.

## Completed Work

### 1. Modularization and Testability

Completed:
- Shared UI helpers extracted to `src/ui/*`.
- Pure logic helpers extracted to `src/lib/*`.
- Node unit tests for pure logic modules in `tests/node/*`.

### 2. Import Validation and Migration Scaffolding

Completed:
- Schema normalization and validation in `src/lib/import-validation.js`.
- Migration entrypoint in `src/lib/migrations.js`.
- Placeholder bin creation for orphaned item references.

### 3. Indexed Tag Lookup

Completed:
- `tags` multi-entry index on `items`.
- Indexed lookup path for `getItemsByTag`.

### 4. Blob-backed Local Photos

Completed:
- New photo writes stored as blobs in IndexedDB `photos` store.
- Items reference local photos by `photoId`.
- Export remains portable JSON.

### 5. Cloud Sync MVP

Completed:
- API routes:
  - Auth: `config`, `google`, `me`, `logout`
  - Sync: `meta`, `push`, `pull`, `photos-missing`, `photo-upload`, `photo`
- Cloud UI in Data view:
  - sign-in/out
  - push/pull controls
  - cloud status metadata
- Storage model:
  - private per-user snapshot JSON object
  - private per-user photo objects by SHA-256 hash
  - private per-user pointer metadata object

## Open Work

## A. Sync UX and Resilience

- Add richer push/pull progress for large photo sets.
- Add per-photo retry controls.
- Add optional merge-mode pull (current pull is replace).

## B. Sync Efficiency

- Add optional snapshot compression.
- Add incremental data sync if full snapshots become a bottleneck.

## C. Security and Operations

- Add rate limiting and abuse controls on sync endpoints.
- Add basic telemetry/monitoring for sync failures.
- Add snapshot retention and cleanup policy.

## Suggested Next PR Sequence

1. Add merge-mode cloud pull and conflict prompts.
2. Add resumable/retry-aware photo transfer.
3. Add snapshot compression and size diagnostics.
4. Add endpoint hardening (rate limits + quotas).

## Non-Goals (for now)

- Removing local-only capability.
- Replacing IndexedDB with cloud-first storage.
- Frontend framework migration.

## Success Criteria

- Local/offline workflows remain stable.
- Cloud sync is reliable and optional.
- Large photo libraries remain practical due to hash deduplication.
- Data portability via JSON import/export remains intact.
