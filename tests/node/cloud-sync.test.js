import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshotPayload, estimateDataUrlBytes, normalizeLegacyPhotosForCloud } from '../../src/lib/cloud-sync.js';

const SAMPLE_PHOTO = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

test('buildSnapshotPayload strips inline photo arrays from snapshot items', async () => {
  const payload = await buildSnapshotPayload({
    bins: [{ id: 'BIN-001' }],
    items: [{
      id: 'item-1',
      binId: 'BIN-001',
      description: 'Widget',
      tags: ['parts'],
      addedAt: '2026-03-14T00:00:00.000Z',
      photo: SAMPLE_PHOTO,
      photos: [SAMPLE_PHOTO, SAMPLE_PHOTO],
    }],
  });

  assert.equal(payload.snapshot.items.length, 1);
  assert.equal(payload.snapshot.items[0].photo, undefined);
  assert.equal(payload.snapshot.items[0].photos, undefined);
  assert.match(payload.snapshot.items[0].photoHash, /^[a-f0-9]{64}$/);
  assert.equal(payload.snapshot.items[0].photoMimeType, 'image/gif');
  assert.equal(payload.photos.length, 1);
  assert.equal(payload.photos[0].dataUrl, SAMPLE_PHOTO);
  assert.equal(payload.photos[0].mimeType, 'image/gif');
});

test('estimateDataUrlBytes returns decoded byte size', () => {
  assert.equal(estimateDataUrlBytes(SAMPLE_PHOTO), 23);
});

test('normalizeLegacyPhotosForCloud rewrites oversized cached photos', async () => {
  const savedItems = [];
  const db = {
    async getAllItemsWithPhotos() {
      return [{
        id: 'item-1',
        binId: 'BIN-001',
        description: 'Widget',
        tags: [],
        addedAt: '2026-03-14T00:00:00.000Z',
        photo: 'data:image/jpeg;base64,' + 'A'.repeat(40),
        photos: ['data:image/jpeg;base64,' + 'A'.repeat(40)],
        photoId: 'photo-old',
      }];
    },
    async putItem(item) {
      savedItems.push(item);
    },
  };

  const normalizedCount = await normalizeLegacyPhotosForCloud(db, async () => SAMPLE_PHOTO, {
    maxBytes: 8,
  });

  assert.equal(normalizedCount, 1);
  assert.equal(savedItems.length, 1);
  assert.equal(savedItems[0].photo, SAMPLE_PHOTO);
  assert.deepEqual(savedItems[0].photos, [SAMPLE_PHOTO]);
  assert.equal(savedItems[0].photoId, undefined);
  assert.equal(savedItems[0].photoIds, undefined);
});
