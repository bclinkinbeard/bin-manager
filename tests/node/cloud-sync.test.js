import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshotPayload } from '../../src/lib/cloud-sync.js';

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
