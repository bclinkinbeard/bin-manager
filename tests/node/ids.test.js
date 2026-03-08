import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBinId } from '../../src/lib/ids.js';

test('formatBinId applies BIN-### padding', () => {
  assert.equal(formatBinId(1), 'BIN-001');
  assert.equal(formatBinId(42), 'BIN-042');
  assert.equal(formatBinId(1000), 'BIN-1000');
});
