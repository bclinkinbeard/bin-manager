import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateImportData } from '../../src/lib/migrations.js';

test('migrateImportData defaults missing version to 1', () => {
  const result = migrateImportData({ bins: [], items: [] });
  assert.equal(result.ok, true);
  assert.equal(result.data.version, 1);
});

test('migrateImportData rejects unsupported versions', () => {
  const result = migrateImportData({ version: 99, bins: [], items: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Unsupported import version/);
});

test('migrateImportData accepts nested data payloads', () => {
  const result = migrateImportData({
    version: 1,
    data: {
      bins: [{ id: 'BIN-001' }],
      items: [{ id: 'i1', binId: 'BIN-001' }],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.bins.length, 1);
  assert.equal(result.data.items.length, 1);
});

test('migrateImportData converts object maps to arrays', () => {
  const result = migrateImportData({
    bins: {
      a: { id: 'BIN-001' },
      b: { id: 'BIN-002' },
    },
    items: {
      i1: { id: 'i1', binId: 'BIN-001' },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.bins.length, 2);
  assert.equal(result.data.items.length, 1);
});
