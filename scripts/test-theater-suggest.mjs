import {
  theatersFromWatches,
  rememberTheater,
  filterTheaterSuggestions,
} from '../amc-a-lister/engine/theater-suggest.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const amcTheaters = JSON.parse(readFileSync(join(__dirname, '../amc-a-lister/data/amc-theaters.json'), 'utf8'));

const watches = [
  { location: 'AMC Lincoln Square 13', in_theaters: true },
  { location: 'AMC Lincoln Square 13', in_theaters: true },
  { location: 'AMC Empire 25', in_theaters: true },
  { location: 'AMC 34th Street 14', in_theaters: true },
  { location: 'AMC Kips Bay 15', in_theaters: true },
  { location: 'AMC 84th Street 6', in_theaters: true },
  { location: 'AMC Village 7', in_theaters: true },
  { location: 'Not in theaters', in_theaters: false },
  { location: 'Home', in_theaters: false },
  { location: '  ', in_theaters: true },
];

const theaters = theatersFromWatches(watches);
assert(theaters[0] === 'AMC Lincoln Square 13', `expected Lincoln first, got ${theaters[0]}`);
assert(theaters.includes('AMC 34th Street 14'), 'missing 34th Street');
assert(theaters.includes('AMC Village 7'), 'missing Village');
assert(!theaters.includes('Not in theaters'), 'should skip Not in theaters');
assert(!theaters.includes('Home'), 'should skip off-theater Home');
assert(theaters.length === 6, `expected 6 theaters, got ${theaters.length}`);

let list = theaters;
list = rememberTheater(list, 'AMC New Theater');
assert(list[0] === 'AMC New Theater', 'new theater should be first');
list = rememberTheater(list, 'amc new theater');
assert(list.filter((t) => t.toLowerCase() === 'amc new theater').length === 1, 'dedupe case-insensitive');
list = rememberTheater(list, 'Not in theaters');
assert(!list.includes('Not in theaters'), 'should not remember Not in theaters');

const filtered = theaters.filter((t) => t.toLowerCase().includes('34th'));
assert(filtered.length === 1 && filtered[0] === 'AMC 34th Street 14', '34th filter failed');

assert(amcTheaters.length === 524, `expected 524 AMC theaters, got ${amcTheaters.length}`);
assert(amcTheaters.includes('AMC Summit 16'), 'missing AMC Summit 16');

const emptyQuery = filterTheaterSuggestions(theaters, amcTheaters, '');
assert(emptyQuery.length === theaters.length, 'empty query should show only user theaters');
assert(emptyQuery[0] === 'AMC Lincoln Square 13', 'user theaters stay first on empty query');

const lincolnMatches = filterTheaterSuggestions(theaters, amcTheaters, 'lincoln');
assert(lincolnMatches[0] === 'AMC Lincoln Square 13', 'user theater should rank first');
assert(lincolnMatches.some((t) => t === 'AMC Lincoln Square 13'), 'should include user Lincoln match');
assert(lincolnMatches.every((t) => t.toLowerCase().includes('lincoln')), 'all matches should contain needle');

const summitMatches = filterTheaterSuggestions([], amcTheaters, 'summit');
assert(summitMatches.length === 1 && summitMatches[0] === 'AMC Summit 16', 'AMC catalog should match without user history');

const deduped = filterTheaterSuggestions(['AMC Summit 16'], amcTheaters, 'summit');
assert(deduped.length === 1, 'should dedupe user and catalog matches');

console.log('ok: theater suggest helpers');
