import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTags } from '../../src/lib/tags.js';

test('parseTags trims and lowercases tags', () => {
  assert.deepEqual(parseTags('  Electronics, Spares  '), ['electronics', 'spares']);
});

test('parseTags removes duplicate and empty tags', () => {
  assert.deepEqual(parseTags('a, A, , b, a'), ['a', 'b']);
});
