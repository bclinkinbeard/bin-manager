import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTags, normalizeTagList, parseTags, removeTags } from '../../src/lib/tags.js';

test('parseTags trims and lowercases tags', () => {
  assert.deepEqual(parseTags('  Electronics, Spares  '), ['electronics', 'spares']);
});

test('parseTags removes duplicate and empty tags', () => {
  assert.deepEqual(parseTags('a, A, , b, a'), ['a', 'b']);
});

test('normalizeTagList trims, lowercases, and deduplicates tag arrays', () => {
  assert.deepEqual(normalizeTagList(['  Tools ', 'tools', '', null, 'Hardware']), ['tools', 'hardware']);
});

test('mergeTags appends only missing normalized tags', () => {
  assert.deepEqual(mergeTags(['fragile', 'sale'], [' Sale ', 'Clearance']), ['fragile', 'sale', 'clearance']);
});

test('removeTags strips normalized matches from the existing tag list', () => {
  assert.deepEqual(removeTags(['fragile', 'sale', 'clearance'], [' Sale ', 'missing']), ['fragile', 'clearance']);
});
