import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImportData } from '../../src/lib/import-validation.js';

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
