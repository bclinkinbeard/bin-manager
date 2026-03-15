import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseSnapshotFromBody } from '../../api/sync/push.js';

function base64Gzip(jsonValue) {
  return gzipSync(Buffer.from(JSON.stringify(jsonValue), 'utf8')).toString('base64');
}

test('parseSnapshotFromBody returns plain snapshot when present', () => {
  const snapshot = { version: 1, bins: [], items: [] };
  assert.deepEqual(parseSnapshotFromBody({ snapshot }), snapshot);
});

test('parseSnapshotFromBody decodes gzip+base64 snapshot payload', () => {
  const snapshot = {
    version: 1,
    bins: [{ id: 'bin-1' }],
    items: [{ id: 'item-1', binId: 'bin-1', description: 'Thing', tags: [], addedAt: '2026-01-01T00:00:00.000Z' }],
  };

  const decoded = parseSnapshotFromBody({ snapshotGzipBase64: base64Gzip(snapshot) });
  assert.deepEqual(decoded, snapshot);
});

test('parseSnapshotFromBody throws for missing snapshot payload', () => {
  assert.throws(() => parseSnapshotFromBody({}), /must include a snapshot object/i);
});
