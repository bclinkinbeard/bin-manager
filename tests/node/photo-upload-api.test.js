import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoUploadRequest } from '../../api/sync/photo-upload.js';

const SAMPLE_HASH = 'a'.repeat(64);
const SAMPLE_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

test('parsePhotoUploadRequest accepts legacy json photo uploads', async () => {
  const request = new Request('https://example.com/api/sync/photo-upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      hash: SAMPLE_HASH,
      dataUrl: SAMPLE_DATA_URL,
      mimeType: 'image/gif',
    }),
  });

  const parsed = await parsePhotoUploadRequest(request);
  assert.equal(parsed.hash, SAMPLE_HASH);
  assert.equal(parsed.mimeType, 'image/gif');
  assert.equal(parsed.buffer.length > 0, true);
});

test('parsePhotoUploadRequest accepts binary photo uploads', async () => {
  const request = new Request(`https://example.com/api/sync/photo-upload?hash=${SAMPLE_HASH}`, {
    method: 'POST',
    headers: {
      'content-type': 'image/jpeg',
    },
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });

  const parsed = await parsePhotoUploadRequest(request);
  assert.equal(parsed.hash, SAMPLE_HASH);
  assert.equal(parsed.mimeType, 'image/jpeg');
  assert.deepEqual([...parsed.buffer], [0xff, 0xd8, 0xff, 0xd9]);
});

test('parsePhotoUploadRequest rejects non-image binary uploads', async () => {
  const request = new Request(`https://example.com/api/sync/photo-upload?hash=${SAMPLE_HASH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
    },
    body: Buffer.from([1, 2, 3]),
  });

  await assert.rejects(
    () => parsePhotoUploadRequest(request),
    /image/i
  );
});
