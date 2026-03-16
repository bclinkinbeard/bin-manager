import test from 'node:test';
import assert from 'node:assert/strict';
import { getBinLastModifiedMs, isBinLabelOutdated } from '../../src/lib/label-status.js';

test('getBinLastModifiedMs falls back to createdAt', () => {
  const ms = getBinLastModifiedMs({ createdAt: '2026-03-16T00:00:00.000Z' });
  assert.equal(ms, Date.parse('2026-03-16T00:00:00.000Z'));
});

test('isBinLabelOutdated is true when never printed', () => {
  assert.equal(
    isBinLabelOutdated({ createdAt: '2026-03-16T00:00:00.000Z', lastModifiedAt: '2026-03-16T01:00:00.000Z' }),
    true
  );
});

test('isBinLabelOutdated compares print timestamp vs bin changes', () => {
  assert.equal(
    isBinLabelOutdated({
      createdAt: '2026-03-16T00:00:00.000Z',
      lastModifiedAt: '2026-03-16T02:00:00.000Z',
      labelPrintedAt: '2026-03-16T01:00:00.000Z',
    }),
    true
  );

  assert.equal(
    isBinLabelOutdated({
      createdAt: '2026-03-16T00:00:00.000Z',
      lastModifiedAt: '2026-03-16T01:00:00.000Z',
      labelPrintedAt: '2026-03-16T02:00:00.000Z',
    }),
    false
  );
});
