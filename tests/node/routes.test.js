import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteFromState, parseRouteFromHash } from '../../src/lib/routes.js';

test('parseRouteFromHash parses search route params', () => {
  assert.deepEqual(parseRouteFromHash('#search?q=bolts&archived=1'), {
    view: 'search',
    q: 'bolts',
    archived: true,
  });
});

test('parseRouteFromHash parses bins route', () => {
  assert.deepEqual(parseRouteFromHash('#bins'), { view: 'bins' });
});

test('parseRouteFromHash parses tag route with origin', () => {
  assert.deepEqual(parseRouteFromHash('#tag/electronics?origin=BIN-001'), {
    view: 'tag',
    tag: 'electronics',
    originBinId: 'BIN-001',
  });
});

test('buildRouteFromState serializes item edit route', () => {
  const route = buildRouteFromState({ activeViewName: 'itemForm', currentEditItemId: 'item-1' });
  assert.equal(route, 'item-form/edit/item-1');
});

test('buildRouteFromState serializes search route with params', () => {
  const route = buildRouteFromState({ activeViewName: 'search', searchQuery: 'screws', showArchived: true });
  assert.equal(route, 'search?q=screws&archived=1');
});
