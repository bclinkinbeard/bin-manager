import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImportData, prepareImportData } from '../../src/lib/import-validation.js';

test('validateImportData accepts valid structure', () => {
  assert.equal(validateImportData({ bins: [{ id: 'BIN-001' }], items: [{ id: 'i1', binId: 'BIN-001' }] }), true);
});

test('validateImportData rejects malformed root object', () => {
  assert.equal(validateImportData(null), false);
  assert.equal(validateImportData({}), false);
});

test('validateImportData rejects invalid bins array', () => {
  assert.equal(validateImportData({ bins: {} }), false);
  assert.equal(validateImportData({ bins: [{ nope: 1 }] }), false);
});

test('validateImportData rejects invalid items array', () => {
  assert.equal(validateImportData({ items: {} }), false);
  assert.equal(validateImportData({ items: [{ id: 'i1' }] }), false);
  assert.equal(validateImportData({ items: [{ binId: 'BIN-1' }] }), false);
});

test('prepareImportData rejects duplicate IDs', () => {
  const result = prepareImportData({
    bins: [{ id: 'BIN-001' }, { id: 'BIN-001' }],
    items: [{ id: 'i1', binId: 'BIN-001' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Duplicate bin id/);
});

test('prepareImportData rejects orphaned items', () => {
  const result = prepareImportData({
    bins: [{ id: 'BIN-001' }],
    items: [{ id: 'i1', binId: 'BIN-999' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /orphaned item/i);
});

test('prepareImportData migrates missing version payloads', () => {
  const result = prepareImportData({
    bins: [{ id: ' BIN-001 ' }],
    items: [{ id: 'i1', binId: 'BIN-001', tags: [' A ', 'a', ''] }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.version, 1);
  assert.deepEqual(result.data.items[0].tags, ['a']);
  assert.ok(result.warnings.length > 0);
});
