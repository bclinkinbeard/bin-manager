import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSyncKey, deriveNamespaceFromKey, requireSyncNamespace } from '../../server/sync-key.js';

test('normalizeSyncKey validates length bounds', () => {
  assert.equal(normalizeSyncKey(''), '');
  assert.equal(normalizeSyncKey('short'), '');
  assert.equal(normalizeSyncKey('demo'), 'demo');
  assert.equal(normalizeSyncKey('abcdefgh'), 'abcdefgh');
  assert.equal(normalizeSyncKey('x'.repeat(257)), '');
});

test('deriveNamespaceFromKey is deterministic', () => {
  const a = deriveNamespaceFromKey('abcdefgh');
  const b = deriveNamespaceFromKey('abcdefgh');
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test('requireSyncNamespace rejects missing key and accepts valid key', () => {
  const missing = requireSyncNamespace(new Request('http://localhost/api/sync/meta'));
  assert.equal(Boolean(missing.response), true);
  assert.equal(missing.namespace, null);

  const valid = requireSyncNamespace(new Request('http://localhost/api/sync/meta', {
    headers: { 'x-sync-key': 'abcdefgh' },
  }));
  assert.equal(valid.response, null);
  assert.equal(typeof valid.namespace, 'string');
  assert.equal(valid.namespace.length, 64);
  const demo = requireSyncNamespace(new Request('http://localhost/api/sync/meta', {
    headers: { 'x-sync-key': 'demo' },
  }));
  assert.equal(demo.response, null);
  assert.equal(typeof demo.namespace, 'string');
  assert.equal(demo.namespace.length, 64);
});
