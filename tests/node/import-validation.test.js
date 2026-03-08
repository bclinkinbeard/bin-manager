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
  assert.equal(validateImportData({ bins: { a: { id: 'BIN-001' } }, items: [] }), true);
  assert.equal(validateImportData({ bins: [{ nope: 1 }] }), false);
});

test('validateImportData rejects invalid items array', () => {
  assert.equal(validateImportData({ bins: [{ id: 'BIN-1' }], items: { i1: { id: 'i1', binId: 'BIN-1' } } }), true);
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

test('prepareImportData auto-creates bins for orphaned items', () => {
  const result = prepareImportData({
    bins: [{ id: 'BIN-001' }],
    items: [{ id: 'i1', binId: 'BIN-999' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.bins.some((bin) => bin.id === 'BIN-999'), true);
  assert.match(result.warnings.join(' '), /placeholder bin/i);
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

test('prepareImportData preserves false-like archived string values', () => {
  const result = prepareImportData({
    version: 1,
    bins: [{ id: 'BIN-001', archived: 'false' }],
    items: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.bins[0].archived, false);
});
