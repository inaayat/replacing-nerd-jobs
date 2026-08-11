import assert from 'node:assert/strict';
import {
  theatersFromWatches,
  mergeTheaterLists,
  filterTheaters,
  rememberTheater,
} from '../amc-a-lister/engine/theater-suggestions.js';

const watches = [
  { location: 'AMC Empire 25', in_theaters: true },
  { location: 'AMC Lincoln Square 13', in_theaters: true },
  { location: 'AMC Empire 25', in_theaters: true },
  { location: 'Not in theaters', in_theaters: false },
];

assert.deepEqual(theatersFromWatches(watches), ['AMC Empire 25', 'AMC Lincoln Square 13']);

const merged = mergeTheaterLists(['AMC Empire 25']);
assert.ok(merged.includes('AMC Lincoln Square 13'));
assert.equal(merged.filter((t) => t === 'AMC Empire 25').length, 1);

assert.deepEqual(filterTheaters(merged, 'lincoln'), ['AMC Lincoln Square 13']);
assert.equal(rememberTheater(['A'], 'B')[0], 'B');

console.log('test-theater-suggestions.mjs: ok');
