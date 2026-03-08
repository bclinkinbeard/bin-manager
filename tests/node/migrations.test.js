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
