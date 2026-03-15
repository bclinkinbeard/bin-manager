import test from 'node:test';
import assert from 'node:assert/strict';
import { getSelectableBins, shouldShowBinSelector } from '../../src/views/item-form.js';

test('getSelectableBins returns active bins for new items', () => {
  const bins = [
    { id: 'BIN-001', archived: false },
    { id: 'BIN-002', archived: true },
    { id: 'BIN-003', archived: false },
  ];

  assert.deepEqual(
    getSelectableBins(bins, null).map((bin) => bin.id),
    ['BIN-001', 'BIN-003']
  );
});

test('getSelectableBins keeps the currently selected archived bin available', () => {
  const bins = [
    { id: 'BIN-001', archived: false },
    { id: 'BIN-002', archived: true },
    { id: 'BIN-003', archived: false },
  ];

  assert.deepEqual(
    getSelectableBins(bins, 'BIN-002').map((bin) => bin.id),
    ['BIN-002', 'BIN-001', 'BIN-003']
  );
});

test('shouldShowBinSelector shows the picker while editing even with a selected bin', () => {
  assert.equal(shouldShowBinSelector('BIN-001', { isEditing: true }), true);
  assert.equal(shouldShowBinSelector('BIN-001', { isEditing: false }), false);
  assert.equal(shouldShowBinSelector('', { isEditing: false }), true);
});
