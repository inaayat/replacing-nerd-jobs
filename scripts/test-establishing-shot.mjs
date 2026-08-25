/**
 * Establishing Shot: street-name normalization, ParkingHeld parsing, block-face
 * resolution, and the permit rollup.
 *
 * The fixtures here are real strings from both datasets, because every one of
 * them broke a naive matcher: irregular whitespace, cross streets in the wrong
 * order, abbreviations on one side and spelled-out words on the other, and the
 * renamed Harlem avenues.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeStreetName,
  streetCandidates,
  isNonStreet,
  slicePart,
  pathLength,
  createStreetIndex,
  STREETS_SCHEMA,
} from '../establishing-shot/streets.js';
import {
  buildWhere,
  buildPermitUrl,
  parseParkingHeld,
  explodePermits,
  buildFeatures,
  defaultWindow,
  formatDateRange,
  CATEGORIES,
  EVENT_TYPES,
} from '../establishing-shot/permits.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- street name normalization ---- */

// Permit prose and centerline abbreviations have to land on the same string.
assert.equal(normalizeStreetName('WEST   48 STREET'), 'W 48 ST');
assert.equal(normalizeStreetName('W  48 ST'), 'W 48 ST');
assert.equal(normalizeStreetName('EAST 11 STREET'), 'E 11 ST');
assert.equal(normalizeStreetName('E  11 ST'), 'E 11 ST');
assert.equal(normalizeStreetName('CENTRAL PARK WEST'), 'CENTRAL PARK W');
assert.equal(normalizeStreetName('CENTRAL PARK W'), 'CENTRAL PARK W');
assert.equal(normalizeStreetName('AVENUE OF THE AMERICAS'), 'AVE OF THE AMERICAS');
assert.equal(normalizeStreetName('AVE OF THE AMERICAS'), 'AVE OF THE AMERICAS');
assert.equal(normalizeStreetName('RIVERSIDE DRIVE'), 'RIVERSIDE DR');
assert.equal(normalizeStreetName('7 AVENUE SOUTH'), '7 AVE S');
assert.equal(normalizeStreetName('LITTLE   WEST ST'), 'LITTLE W ST');
assert.equal(normalizeStreetName('ADAM CLAYTON POWELL JUNIOR BOULEVARD'), 'ADAM CLAYTON POWELL JR BLVD');
// Ordinals appear both as digits with suffixes and as words.
assert.equal(normalizeStreetName('5TH AVENUE'), '5 AVE');
assert.equal(normalizeStreetName('FIFTH AVENUE'), '5 AVE');
assert.equal(normalizeStreetName('THIRD AVE'), '3 AVE');
assert.equal(normalizeStreetName('W. 42ND ST.'), 'W 42 ST');
assert.equal(normalizeStreetName(''), '');
assert.equal(normalizeStreetName(null), '');

// Sixth Avenue answers to two names, and the primary always comes first.
assert.deepEqual(streetCandidates('6 AVENUE'), ['6 AVE', 'AVE OF THE AMERICAS']);
assert.ok(streetCandidates('AVENUE OF THE AMERICAS').includes('6 AVE'));
assert.ok(streetCandidates('MALCOLM X BLVD').includes('LENOX AVE'));
assert.ok(streetCandidates('W 110 STREET').includes('CATHEDRAL PKWY'));
// Aliases are alternates, not replacements: W 59th exists in its own right.
assert.equal(streetCandidates('W 59 STREET')[0], 'W 59 ST');

assert.ok(isNonStreet('DEAD END'));
assert.ok(!isNonStreet('BROADWAY'));

/* ---- ParkingHeld parsing ---- */

const REAL_PARKING_HELD =
  'WEST   88 STREET between WEST END AVENUE and RIVERSIDE DRIVE,  WEST END AVENUE between WEST   89 STREET and WEST   86 STREET,  BROADWAY between WEST   91 STREET and WEST   89 STREET';
const parsed = parseParkingHeld(REAL_PARKING_HELD);
assert.equal(parsed.length, 3);
assert.deepEqual(parsed[0], {
  raw: 'WEST 88 STREET between WEST END AVENUE and RIVERSIDE DRIVE',
  street: 'WEST 88 STREET',
  from: 'WEST END AVENUE',
  to: 'RIVERSIDE DRIVE',
  parsed: true,
});
// Cross streets are not in geographic order; nothing may assume from < to.
assert.equal(parsed[1].from, 'WEST 89 STREET');
assert.equal(parsed[1].to, 'WEST 86 STREET');
assert.deepEqual(parseParkingHeld(''), []);
assert.deepEqual(parseParkingHeld(null), []);
const junk = parseParkingHeld('SOMEWHERE ELSE');
assert.equal(junk[0].parsed, false);

assert.equal(explodePermits([{ parkingheld: REAL_PARKING_HELD, eventid: '1' }]).length, 3);
assert.equal(explodePermits(null).length, 0);

/* ---- SoQL ---- */

const where = buildWhere({ from: '2025-01-01', to: '2025-12-31' });
assert.match(where, /borough='Manhattan'/);
assert.match(where, /category='Television'/);
assert.match(where, /eventtype='Shooting Permit'/);
assert.match(where, /eventtype='DCAS Prep\/Shoot\/Wrap Permit'/);
assert.match(where, /subcategoryname!='News'/);
// Theater load-ins and rigging must never be in the cut.
assert.ok(!where.includes('Theater'));
assert.ok(!where.includes('Rigging'));
// Overlap, not containment: a shoot that started earlier and ran into the
// window still happened during it.
assert.match(where, /enddatetime>='2025-01-01T00:00:00'/);
assert.match(where, /startdatetime<='2025-12-31T23:59:59'/);
assert.match(buildWhere({ categories: ['Film'] }), /\(category='Film'\)/);
assert.ok(!buildWhere({ categories: ['Film'] }).includes('Television'));
// An empty pick is treated as "all", never as a query for nothing.
assert.match(buildWhere({ categories: [] }), /category='Television'/);
assert.ok(!buildWhere({}).includes('startdatetime<='));
// Quotes in a value can't break out of the literal.
assert.match(buildWhere({ categories: ["Fil'm"] }), /category='Fil''m'/);

const url = buildPermitUrl({ from: '2025-01-01', to: '2025-06-30' });
assert.ok(url.startsWith('https://data.cityofnewyork.us/resource/tg4x-b46p.json?'));
assert.match(url, /%24limit=20000/);
assert.match(url, /parkingheld/);

assert.deepEqual(defaultWindow(new Date('2026-08-25T00:00:00Z'), 12), { from: '2025-08-25', to: '2026-08-25' });
assert.deepEqual(defaultWindow(new Date('2026-01-15T00:00:00Z'), 1), { from: '2025-12-15', to: '2026-01-15' });
assert.equal(formatDateRange('2025-06-02T08:00:00', '2025-06-02T20:00:00'), 'Jun 2, 2025');
assert.match(formatDateRange('2025-06-02T08:00:00', '2025-06-04T20:00:00'), /Jun 2, 2025 – Jun 4, 2025/);

assert.equal(CATEGORIES.length, 3);
assert.deepEqual(EVENT_TYPES, ['Shooting Permit', 'DCAS Prep/Shoot/Wrap Permit']);

/* ---- geometry helpers ---- */

// A block face starts and ends at the intersections, not at the nearest shape
// point, so the ends are interpolated.
const line = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
];
assert.deepEqual(slicePart(line, 0.5, 2.5), [
  [0, 0.5],
  [0, 1],
  [0, 2],
  [0, 2.5],
]);
// Order-independent: cross streets arrive in either order.
assert.deepEqual(slicePart(line, 2.5, 0.5), slicePart(line, 0.5, 2.5));
assert.deepEqual(slicePart(line, 1, 1), [[0, 1]]);
assert.ok(Math.abs(pathLength([[-73.98, 40.75], [-73.98, 40.751]]) - 111.32) < 1);

/* ---- resolution against a synthetic grid ---- */

// Two avenues crossing three streets, with a second disjoint run of one street
// so the "same run" preference has something to get wrong.
const fixture = {
  schema: STREETS_SCHEMA,
  streets: [
    { name: 'W 48 ST', parts: [[[0, 0], [1, 0], [2, 0]]] },
    { name: 'AVE OF THE AMERICAS', parts: [[[1, -1], [1, 0], [1, 1]]] },
    { name: '7 AVE', parts: [[[0, -1], [0, 0], [0, 1]]] },
    { name: 'BROADWAY', parts: [[[2, -1], [2, 0], [2, 1]]] },
  ],
  xings: [
    [0, 0, 1, 1, 0, 1],
    [0, 0, 0, 2, 0, 1],
    [0, 0, 2, 3, 0, 1],
  ],
};
const index = createStreetIndex(fixture);
assert.equal(index.streetCount, 4);
assert.ok(index.hasStreet('WEST 48 STREET'));
assert.ok(index.hasStreet('6 AVENUE')); // via the Avenue of the Americas alias
assert.ok(!index.hasStreet('ATLANTIC AVE'));

// The permit's own spelling, resolved to a real block face.
const block = index.resolve({ street: 'WEST   48 STREET', from: '6 AVENUE', to: '7 AVENUE' });
assert.equal(block.tier, 'block');
assert.equal(block.street, 'W 48 ST');
assert.equal(block.from, 'AVE OF THE AMERICAS');
// Geometry always comes out in the street's own direction, whichever order the
// permit named the corners in.
assert.deepEqual(block.coords, [[0, 0], [1, 0]]);

// Reversed cross streets describe the same block.
const reversed = index.resolve({ street: 'W 48 ST', from: '7 AVENUE', to: '6 AVENUE' });
assert.deepEqual(reversed.coords, block.coords);

// A multi-block stretch is drawn as the whole stretch, because that is what the
// permit closed.
const wide = index.resolve({ street: 'W 48 ST', from: '7 AVENUE', to: 'BROADWAY' });
assert.equal(wide.tier, 'block');
assert.deepEqual(wide.coords, [[0, 0], [1, 0], [2, 0]]);

// One end unknown: the intersection is still worth showing, at a lower tier.
const point = index.resolve({ street: 'W 48 ST', from: '6 AVENUE', to: 'DEAD END' });
assert.equal(point.tier, 'point');
assert.deepEqual(point.coords, [[1, 0]]);

// Nothing known: null, so the caller has to count it as unplaced.
assert.equal(index.resolve({ street: 'W 48 ST', from: 'KENT AVE', to: 'CALYER ST' }), null);
assert.equal(index.resolve({ street: 'CALYER ST', from: 'A', to: 'B' }), null);
assert.equal(index.resolve(null), null);

/* ---- rollup ---- */

const rows = [
  {
    eventid: '900001',
    eventtype: 'Shooting Permit',
    category: 'Television',
    subcategoryname: 'Episodic series',
    startdatetime: '2025-06-02T08:00:00.000',
    enddatetime: '2025-06-03T20:00:00.000',
    parkingheld: 'WEST   48 STREET between 6 AVENUE and 7 AVENUE,  WEST   48 STREET between 7 AVENUE and BROADWAY',
  },
  {
    eventid: '900002',
    eventtype: 'Shooting Permit',
    category: 'Film',
    subcategoryname: 'Feature',
    startdatetime: '2025-06-10T07:00:00.000',
    enddatetime: '2025-06-10T22:00:00.000',
    parkingheld: 'WEST 48 STREET between 7 AVENUE and 6 AVENUE,  CALYER STREET between MANHATTAN AVENUE and JEWEL STREET',
  },
];

const built = buildFeatures(rows, index);
assert.equal(built.stats.permits, 2);
assert.equal(built.stats.mentions, 4);
assert.equal(built.stats.placedMentions, 3);
assert.equal(built.stats.unplacedMentions, 1);
// Nothing vanishes: the Brooklyn segment on a Manhattan permit is reported.
assert.deepEqual(built.stats.unplaced, [{ street: 'CALYER ST', mentions: 1, permits: 1 }]);

// The same block described in either direction is one stretch with two permits.
const shared = built.lines.features.find((f) => f.properties.permitCount === 2);
assert.ok(shared, 'the block both permits name should be one feature');
assert.equal(shared.properties.tier, 'block');
assert.equal(shared.properties.permits.length, 2);
// Two days of shooting on the first permit, one on the second: a block that is
// closed repeatedly should read as heavier than one closed once.
assert.equal(shared.properties.shootDays, 3);
assert.equal(built.lines.features.length, 2);
assert.equal(built.points.features.length, 0);
assert.ok(built.lines.features.every((f) => f.geometry.type === 'LineString'));
assert.ok(built.lines.features.every((f) => f.properties.color));
assert.ok(built.lines.features.every((f) => f.properties.label.includes('between')));

// A permit is never given a title, because the dataset has none.
const asText = JSON.stringify(built.lines);
assert.ok(!/title/i.test(asText));

assert.deepEqual(buildFeatures([], index).stats.tiers, { block: 0, span: 0, point: 0 });

/* ---- the committed street index ---- */

const streetsPath = resolve(ROOT, 'establishing-shot/data/streets.json');
assert.ok(existsSync(streetsPath), 'run: node scripts/pull-establishing-shot-streets.mjs');
const payload = JSON.parse(readFileSync(streetsPath, 'utf8'));
assert.equal(payload.schema, STREETS_SCHEMA);
assert.equal(payload.source.dataset, 'inkn-q76z');
assert.ok(payload.streets.length > 700, 'Manhattan has ~900 named street lines');
assert.ok(payload.xings.length > 4000);

const real = createStreetIndex(payload);
// Spot-check landmarks against the real grid, including the renamed avenues and
// the streets that answer to two names.
const cases = [
  { street: 'WEST   48 STREET', from: '6 AVENUE', to: '7 AVENUE' },
  { street: 'WEST   78 STREET', from: 'COLUMBUS AVENUE', to: 'AMSTERDAM AVENUE' },
  { street: 'EAST   11 STREET', from: '3 AVENUE', to: '4 AVENUE' },
  { street: 'CENTRAL PARK WEST', from: 'WEST   81 STREET', to: 'WEST   85 STREET' },
  { street: 'BROADWAY', from: 'WEST   42 STREET', to: 'WEST   47 STREET' },
  { street: 'WEST   125 STREET', from: 'ADAM CLAYTON POWELL BOULEVARD', to: 'MALCOLM X BOULEVARD' },
  { street: 'WALL STREET', from: 'BROADWAY', to: 'WILLIAM STREET' },
  { street: 'RIVERSIDE DRIVE', from: 'WEST   88 STREET', to: 'WEST   89 STREET' },
];
for (const segment of cases) {
  const hit = real.resolve(segment);
  assert.ok(hit, `should place: ${segment.street} between ${segment.from} and ${segment.to}`);
  assert.ok(['block', 'span'].includes(hit.tier), `${segment.street} resolved only to ${hit?.tier}`);
  assert.ok(hit.coords.length >= 2);
  // Manhattan, not a stray coordinate somewhere in the Atlantic.
  for (const [lng, lat] of hit.coords) {
    assert.ok(lng > -74.05 && lng < -73.9, `lng out of Manhattan: ${lng}`);
    assert.ok(lat > 40.68 && lat < 40.89, `lat out of Manhattan: ${lat}`);
  }
}

// A single crosstown block is a block, not a mile: the chained runs are sane.
const oneBlock = real.resolve({ street: 'WEST   78 STREET', from: 'COLUMBUS AVENUE', to: 'AMSTERDAM AVENUE' });
const metres = pathLength(oneBlock.coords);
assert.ok(metres > 100 && metres < 400, `crosstown block measured ${Math.round(metres)}m`);

console.log('establishing shot tests passed');
