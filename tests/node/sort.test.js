import test from 'node:test';
import assert from 'node:assert/strict';
import { sortItems } from '../../src/lib/sort.js';

const items = [
  { description: 'Beta', addedAt: '2025-01-02T00:00:00.000Z' },
  { description: 'alpha', addedAt: '2025-01-01T00:00:00.000Z' },
  { description: 'Gamma', addedAt: '2025-01-03T00:00:00.000Z' },
];

test('sortItems newest', () => {
  assert.deepEqual(sortItems(items, 'newest').map((i) => i.description), ['Gamma', 'Beta', 'alpha']);
});

test('sortItems oldest', () => {
  assert.deepEqual(sortItems(items, 'oldest').map((i) => i.description), ['alpha', 'Beta', 'Gamma']);
});

test('sortItems az', () => {
  assert.deepEqual(sortItems(items, 'az').map((i) => i.description), ['alpha', 'Beta', 'Gamma']);
});

test('sortItems za', () => {
  assert.deepEqual(sortItems(items, 'za').map((i) => i.description), ['Gamma', 'Beta', 'alpha']);
});
