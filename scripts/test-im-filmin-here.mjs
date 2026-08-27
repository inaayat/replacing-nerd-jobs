/**
 * I'm Filmin Here: street-name normalization, ParkingHeld parsing, block-face
 * resolution, the permit rollup, and the curated 59th–145th location catalog.
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
  pathMidpoint,
  createStreetIndex,
  STREETS_SCHEMA,
} from '../im-filmin-here/streets.js';
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
} from '../im-filmin-here/permits.js';
import {
  PERMIT_LAYERS,
  INTERACTIVE_LAYERS,
  SELECTION_LAYERS,
  LINE_SOURCE,
  DOT_SOURCE,
  NO_SELECTION,
  selectionFilter,
} from '../im-filmin-here/layers.js';
import {
  LOCATIONS_SCHEMA,
  MAP_BOX,
  boundsOf,
  filterPlaces,
  formatColor,
  mapInteractionOptions,
  inMapBox,
  normalizeCatalog,
  paddedBounds,
  placeColor,
  statsOf,
  toFeatures,
} from '../im-filmin-here/locations.js';

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
assert.match(where, /subcategoryname!='Short'/);
assert.match(where, /subcategoryname!='Student Film'/);
// Theater load-ins and rigging must never be in the cut.
assert.ok(!where.includes('Theater'));
assert.ok(!where.includes('Rigging'));
// Overlap, not containment: a shoot that started earlier and ran into the
// window still happened during it.
assert.match(where, /enddatetime>='2025-01-01T00:00:00'/);
assert.match(where, /startdatetime<='2025-12-31T23:59:59'/);
// Rows carrying only one of the two timestamps are judged on the one they have,
// rather than dropped from every window in silence.
assert.match(where, /enddatetime IS NULL AND startdatetime>='2025-01-01T00:00:00'/);
assert.match(where, /startdatetime IS NULL AND enddatetime<='2025-12-31T23:59:59'/);
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
// The anchor is the newest date in the data, which arrives as an ISO string.
assert.deepEqual(defaultWindow('2026-05-25', 3), { from: '2026-02-25', to: '2026-05-25' });
assert.deepEqual(defaultWindow('2026-05-25', 12), { from: '2025-05-25', to: '2026-05-25' });
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
assert.ok(built.lines.features.every((f) => f.geometry.type === 'LineString'));
assert.ok(built.lines.features.every((f) => f.properties.color));
assert.ok(built.lines.features.every((f) => f.properties.label.includes('between')));

// Every placed stretch also gets a dot, so presence is visible at any zoom
// instead of only where a line is thick enough to see.
assert.equal(built.dots.features.length, built.stats.stretches);
assert.equal(built.dots.features.length, 2);
assert.ok(built.dots.features.every((f) => f.geometry.type === 'Point'));
// A dot sits on its own stretch, not at an averaged corner.
const dotFor = built.dots.features.find((f) => f.properties.key === shared.properties.key);
assert.ok(dotFor, 'each line should have a dot with the same key');
const [dx, dy] = dotFor.geometry.coordinates;
const xs = shared.geometry.coordinates.map((c) => c[0]);
const ys = shared.geometry.coordinates.map((c) => c[1]);
assert.ok(dx >= Math.min(...xs) && dx <= Math.max(...xs));
assert.ok(dy >= Math.min(...ys) && dy <= Math.max(...ys));

// An intersection-only placement has a dot and no line, because there is no
// stretch to draw.
const oneEnded = buildFeatures(
  [{ eventid: '7', category: 'Film', subcategoryname: 'Feature', startdatetime: '2025-01-01T08:00:00.000', enddatetime: '2025-01-01T18:00:00.000', parkingheld: 'W 48 STREET between 6 AVENUE and DEAD END' }],
  index,
);
assert.equal(oneEnded.dots.features.length, 1);
assert.equal(oneEnded.lines.features.length, 0);
assert.equal(oneEnded.stats.tiers.point, 1);

// Midpoint is by distance along the path, not by vertex count.
assert.deepEqual(pathMidpoint([[0, 0], [0, 1], [0, 9]]), [0, 4.5]);
assert.deepEqual(pathMidpoint([[2, 3]]), [2, 3]);
assert.equal(pathMidpoint([]), null);

// A permit is never given a title, because the dataset has none.
const asText = JSON.stringify(built.lines);
assert.ok(!/title/i.test(asText));

assert.deepEqual(buildFeatures([], index).stats.tiers, { block: 0, span: 0, point: 0 });

/* ---- map layers ---- */

// This section exists because a bad paint expression is silent: MapLibre
// validates the layer, fires an error event, and does not add it. The page loads,
// the sidebar fills in from the same data, and the map is simply blank. That
// shipped once — `["zoom"]` nested inside a property interpolation, and again
// inside `["*", ...]`. Both are invalid, both looked fine in the code.
assert.ok(PERMIT_LAYERS.length >= 4);
assert.deepEqual(
  PERMIT_LAYERS.map((l) => l.id),
  ['permits-hit', 'permits', 'permits-selected', 'permit-dots', 'permits-selected-dot'],
);
// Every layer points at a source that app.js actually creates.
assert.ok(PERMIT_LAYERS.every((l) => [LINE_SOURCE, DOT_SOURCE].includes(l.source)));
// Interactive and selection-driven layers must exist, or clicks land on nothing.
assert.ok(INTERACTIVE_LAYERS.every((id) => PERMIT_LAYERS.some((l) => l.id === id)));
assert.ok(SELECTION_LAYERS.every((id) => PERMIT_LAYERS.some((l) => l.id === id)));
// A hit target under the hairlines, or a one-permit block face is unclickable.
assert.equal(PERMIT_LAYERS[0].paint['line-opacity'], 0);
assert.ok(PERMIT_LAYERS[0].paint['line-width'] >= 10);
assert.deepEqual(selectionFilter('abc'), ['==', ['get', 'key'], 'abc']);
assert.deepEqual(selectionFilter(null), ['==', ['get', 'key'], '__none__']);
for (const id of SELECTION_LAYERS) {
  assert.deepEqual(PERMIT_LAYERS.find((l) => l.id === id).filter, NO_SELECTION);
}

/**
 * `["zoom"]` may only be the input to the outermost step/interpolate of a
 * property value. Walk every expression and fail on a nested one.
 */
function zoomDepths(expr, depth = 0, out = []) {
  if (!Array.isArray(expr)) return out;
  const [op] = expr;
  if (op === 'zoom') out.push(depth);
  const isInterpolation = op === 'interpolate' || op === 'step' || op === 'interpolate-hcl' || op === 'interpolate-lab';
  for (let i = 1; i < expr.length; i += 1) {
    // An interpolation's own input sits at the same depth; its outputs are nested.
    const childDepth = isInterpolation && i <= 2 ? depth : depth + 1;
    zoomDepths(expr[i], childDepth, out);
  }
  return out;
}

// The exact shapes that broke, as a check on the checker.
assert.deepEqual(zoomDepths(['interpolate', ['linear'], ['zoom'], 11, 2, 16, 4]), [0]);
assert.deepEqual(
  zoomDepths(['interpolate', ['linear'], ['get', 'n'], 1, ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 4]]),
  [1],
);
assert.deepEqual(zoomDepths(['*', ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 4], 2]), [1]);

let zoomProps = 0;
for (const layer of PERMIT_LAYERS) {
  for (const [property, value] of Object.entries({ ...(layer.paint || {}), ...(layer.layout || {}) })) {
    const depths = zoomDepths(value);
    if (depths.length) zoomProps += 1;
    for (const depth of depths) {
      assert.equal(
        depth,
        0,
        `${layer.id}.${property}: "zoom" is nested ${depth} level(s) deep. MapLibre allows it only as the outermost step/interpolate input, and rejects the whole layer otherwise.`,
      );
    }
    // At most one zoom curve per property, which is the other half of the rule.
    assert.ok(depths.length <= 1, `${layer.id}.${property}: more than one zoom expression`);
  }
}
// If nothing scales with zoom, this check has quietly stopped checking anything.
assert.ok(zoomProps >= 3, 'expected several zoom-scaled paint properties');

// Property-driven sizing still has to be there: a busy block should read heavier.
const dots = PERMIT_LAYERS.find((l) => l.id === 'permit-dots');
assert.ok(JSON.stringify(dots.paint['circle-radius']).includes('permitCount'));
const lines = PERMIT_LAYERS.find((l) => l.id === 'permits');
assert.ok(JSON.stringify(lines.paint['line-width']).includes('permitCount'));
assert.deepEqual(lines.paint['line-color'], ['get', 'color']);

/* ---- the committed street index ---- */

const streetsPath = resolve(ROOT, 'im-filmin-here/data/streets.json');
assert.ok(existsSync(streetsPath), 'run: node scripts/pull-im-filmin-here-streets.mjs');
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

/* ---- curated 59th–145th location catalog ---- */

const locationsPath = resolve(ROOT, 'im-filmin-here/data/locations.json');
assert.ok(existsSync(locationsPath), 'commit im-filmin-here/data/locations.json');
const locationPayload = JSON.parse(readFileSync(locationsPath, 'utf8'));
assert.equal(locationPayload.schema, LOCATIONS_SCHEMA);
const catalog = normalizeCatalog(locationPayload);
assert.ok(catalog.places.length >= 50, 'list should cover 59th–145th, not a handful of pins');
assert.equal(catalog.places.length, new Set(catalog.places.map((p) => p.id)).size);

const shootCount = catalog.places.reduce((n, place) => n + place.shoots.length, 0);
assert.equal(shootCount, 108, 'spreadsheet had 108 production–location rows');
assert.ok(catalog.places.every((place) => inMapBox(place.lngLat)), 'every pin must stay in the 59th–145th box');

for (const place of catalog.places) {
  assert.ok(place.name);
  assert.ok(place.address);
  assert.ok(place.lngLat[0] >= MAP_BOX.west && place.lngLat[0] <= MAP_BOX.east);
  assert.ok(place.lngLat[1] >= MAP_BOX.south && place.lngLat[1] <= MAP_BOX.north);
  for (const shoot of place.shoots) {
    assert.ok(['Film', 'TV'].includes(shoot.format), shoot.production);
    assert.ok(shoot.production);
    assert.ok(/^https?:\/\//.test(shoot.source), `${shoot.production} needs a source URL`);
  }
}

const lincoln = catalog.places.find((p) => p.id === 'lincoln-center');
assert.ok(lincoln);
assert.equal(lincoln.shoots.length, 5);
assert.equal(placeColor(lincoln), formatColor('Film'));
assert.ok(lincoln.shoots.some((s) => s.production === 'Ghostbusters'));
assert.ok(catalog.places.find((p) => p.id === 'tenenbaum-house'));
assert.ok(catalog.places.find((p) => p.id === 'columbia-university'));
assert.ok(catalog.places.find((p) => p.id === 'grants-tomb'));
assert.ok(catalog.places.find((p) => p.id === 'the-plaza-hotel'));

const filmsOnly = filterPlaces(catalog.places, { formats: new Set(['Film']) });
assert.ok(filmsOnly.every((p) => p.shoots.some((s) => s.format === 'Film')));
assert.ok(filterPlaces(catalog.places, { query: "zabar" }).some((p) => p.id === 'zabars'));
assert.equal(filterPlaces(catalog.places, { query: 'no-such-place' }).length, 0);

const stats = statsOf(catalog.places);
assert.equal(stats.places, catalog.places.length);
assert.equal(stats.shoots, 108);
assert.ok(stats.films > stats.tv);

const features = toFeatures(catalog.places);
assert.equal(features.features.length, catalog.places.length);
assert.equal(features.features[0].geometry.type, 'Point');
assert.ok(features.features.every((f) => f.properties.id && f.properties.color));

const tight = boundsOf(catalog.places);
assert.ok(tight);
const [[west, south], [east, north]] = tight;
assert.ok(west < east && south < north);
// Fit the listed pins, not all of Manhattan — that is the whole point of the default page.
assert.ok(east - west < 0.06, `lng span ${east - west} is wider than the 59th–145th list`);
assert.ok(north - south < 0.08, `lat span ${north - south} is wider than the 59th–145th list`);
assert.ok(north > 40.82, 'camera must open north to the 144th Street pin');
assert.ok(south < 40.766, 'camera must open south to the Plaza');
const corridor = catalog.places.find((p) => p.id === 'riverside-park');
assert.equal(corridor.precision, 'corridor');
const withoutFar = boundsOf(catalog.places);
const withFar = boundsOf([
  ...catalog.places,
  {
    id: 'inwood-future',
    name: 'Future pin',
    address: 'W 200th St',
    band: 'W 200th',
    precision: 'address',
    approximate: false,
    lngLat: [-73.93, 40.86],
    shoots: [{ id: 'x', production: 'X', format: 'Film', scene: '', source: '' }],
  },
]);
assert.ok(withFar[1][1] > withoutFar[1][1], 'a farther pin must open the camera');

const padded = paddedBounds(tight, 0.002);
assert.ok(padded[0][0] < tight[0][0] && padded[1][1] > tight[1][1]);

const interaction = mapInteractionOptions();
assert.equal(interaction.scrollZoom, true);
assert.ok(interaction.minZoom <= 10);
assert.ok(interaction.maxZoom >= 16);
assert.equal(interaction.dragRotate, false);
assert.equal('maxBounds' in interaction, false, 'a pin-tight maxBounds blocks trackpad zoom-out');

console.log('im filmin here tests passed');
