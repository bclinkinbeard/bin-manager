import test from 'node:test';
import assert from 'node:assert/strict';
import { isTweetUrl, normalizeUrl, parseLinks } from '../../src/lib/links.js';

test('normalizeUrl accepts http(s) and strips hash', () => {
  assert.equal(normalizeUrl('https://example.com/a#section'), 'https://example.com/a');
  assert.equal(normalizeUrl('ftp://example.com/file'), null);
});

test('parseLinks keeps unique valid URLs', () => {
  const parsed = parseLinks([
    'https://example.com',
    'https://example.com',
    'x',
    'http://example.org/path',
  ].join('\n'));
  assert.deepEqual(parsed, ['https://example.com/', 'http://example.org/path']);
});

test('isTweetUrl detects x.com and twitter.com status links', () => {
  assert.equal(isTweetUrl('https://x.com/openai/status/12345'), true);
  assert.equal(isTweetUrl('https://twitter.com/openai/status/12345'), true);
  assert.equal(isTweetUrl('https://x.com/openai'), false);
});
