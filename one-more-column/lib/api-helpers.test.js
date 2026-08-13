/**
 * Conflict-response tests. The 409 body is what the client reads to decide
 * between "keep mine" and "show theirs", so its shape is load-bearing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { conflictBody } from './api-helpers.js';

test('conflictBody names one row in the singular', () => {
  const body = conflictBody([{ id: 'p1', current: { id: 'p1', title: 'Theirs' } }]);
  assert.match(body.error, /this row/);
  assert.equal(body.conflicts.length, 1);
});

test('conflictBody counts multiple rows', () => {
  const body = conflictBody([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
  assert.match(body.error, /3 of these rows/);
});

test('conflictBody passes the server copy through so the client can compare', () => {
  const current = { id: 'p1', title: 'Their title', updated_at: '2026-01-05T00:00:00.000Z' };
  const body = conflictBody([{ id: 'p1', current }]);
  assert.deepEqual(body.conflicts[0].current, current);
});

test('conflictBody reports rows that did save alongside the ones that did not', () => {
  const body = conflictBody([{ id: 'p2' }], { plan_items: [{ id: 'p1', title: 'Saved fine' }] });
  assert.equal(body.plan_items.length, 1, 'a partial success must not be reported as a total loss');
  assert.equal(body.conflicts[0].id, 'p2');
});
