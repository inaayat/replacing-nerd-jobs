/**
 * Takeout JSON → table unwraps.
 */
import assert from 'node:assert/strict';
import {
  cellValue,
  flattenRecord,
  findRecords,
  tableFromJson,
  projectTable,
  recordsFromParallel,
  parseFetchUrl,
  MAX_ROWS,
  summarizeField,
  summarizeFields,
  filterTable,
  valueKey,
  displayValue,
} from '../takeout/flatten.js';

assert.equal(cellValue(null), '');
assert.equal(cellValue(12.5), 12.5);
assert.equal(cellValue(true), true);
assert.equal(cellValue('hi'), 'hi');
assert.ok(String(cellValue({ a: 1 })).includes('a'));

const nested = flattenRecord({ name: { common: 'France' }, tags: ['a', 'b'], skip: { deep: { enough: { too: 1 } } } });
assert.equal(nested['name.common'], 'France');
assert.equal(nested.tags, 'a, b');
assert.equal(nested['skip.deep.enough.too'], 1);

const parallel = recordsFromParallel({
  time: ['2026-01-01', '2026-01-02'],
  temp: [10, 12],
  rain: [0, 1],
});
assert.equal(parallel.length, 2);
assert.equal(parallel[1].temp, 12);
assert.equal(recordsFromParallel({ time: [1], temp: [1, 2] }), null);

assert.deepEqual(
  findRecords(['a', 'b']).map((r) => r.value),
  ['a', 'b']
);

const geo = findRecords({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { mag: 5.1, place: 'Alaska' },
      geometry: { type: 'Point', coordinates: [-150, 61] },
    },
  ],
});
assert.equal(geo[0].mag, 5.1);
assert.equal(geo[0].lon, -150);
assert.equal(geo[0].lat, 61);

const worldBank = findRecords([
  { page: 1, pages: 1, total: 2 },
  [
    { country: { value: 'USA' }, value: 1, date: '2020' },
    { country: { value: 'USA' }, value: 2, date: '2021' },
  ],
]);
assert.equal(worldBank.length, 2);
assert.equal(worldBank[0].date, '2020');

const census = tableFromJson([
  ['NAME', 'B01003_001E', 'state'],
  ['Alabama', '5024279', '01'],
  ['Alaska', '733391', '02'],
]);
assert.deepEqual(census.columns, ['NAME', 'B01003_001E', 'state']);
assert.equal(census.rows[1].NAME, 'Alaska');
assert.equal(census.rows[0].B01003_001E, '5024279');

const meteo = tableFromJson({
  latitude: 40.7,
  daily: { time: ['2026-08-22', '2026-08-23'], temperature_2m_max: [28, 27] },
});
assert.equal(meteo.rows.length, 2);
assert.equal(meteo.rows[0].temperature_2m_max, 28);

const fromDocs = tableFromJson({
  numFound: 2,
  docs: [
    { title: 'A', author_name: ['Ada'] },
    { title: 'B', nested: { year: 1912 } },
  ],
});
assert.deepEqual(fromDocs.columns, ['title', 'author_name', 'nested.year']);
assert.equal(fromDocs.rows[0].author_name, 'Ada');
assert.equal(fromDocs.rows[1]['nested.year'], 1912);

const projected = projectTable(fromDocs, ['title', 'nope']);
assert.deepEqual(projected.columns, ['title']);
assert.equal(projected.rows[1].title, 'B');
assert.equal('author_name' in projected.rows[0], false);

assert.equal(valueKey(''), '');
assert.equal(valueKey(true), 'true');
assert.equal(displayValue(''), '(blank)');
assert.equal(displayValue(false), 'FALSE');

const cats = tableFromJson([
  { region: 'Europe', name: 'France', pop: 67 },
  { region: 'Europe', name: 'Germany', pop: 83 },
  { region: 'Asia', name: 'Japan', pop: 125 },
  { region: '', name: 'Unknown', pop: 1 },
]);
const region = summarizeField(cats, 'region');
assert.equal(region.asOptions, true);
assert.equal(region.uniqueCount, 3);
assert.equal(region.blanks, 1);
assert.deepEqual(region.examples.slice(0, 2), ['Europe', 'Asia']);
assert.equal(region.options.find((o) => o.key === 'Europe').count, 2);

const pop = summarizeField(cats, 'pop');
assert.equal(pop.asOptions, true);
assert.equal(pop.min, 1);
assert.equal(pop.max, 125);

const measures = tableFromJson(
  Array.from({ length: 80 }, (_, i) => ({ name: `Co ${i}`, revenue: 1000 + i }))
);
const rev = summarizeField(measures, 'revenue');
assert.equal(rev.asOptions, false);
assert.equal(rev.mostlyNumeric, true);
assert.equal(rev.min, 1000);
assert.equal(rev.max, 1079);
const names = summarizeField(measures, 'name');
assert.equal(names.asOptions, true);
assert.equal(names.uniqueCount, 80);

const europeOnly = filterTable(cats, { region: new Set(['Europe']) });
assert.equal(europeOnly.rows.length, 2);
assert.ok(europeOnly.rows.every((r) => r.region === 'Europe'));
const noFilter = filterTable(cats, {});
assert.equal(noFilter.rows.length, 4);
const none = filterTable(cats, { region: new Set() });
assert.equal(none.rows.length, 0);
const blank = filterTable(cats, { region: new Set(['']) });
assert.equal(blank.rows.length, 1);

const allSum = summarizeFields(cats);
assert.ok(allSum.region && allSum.name && allSum.pop);

const one = tableFromJson({ hello: 'world', n: 3 });
assert.equal(one.rows.length, 1);
assert.equal(one.rows[0].hello, 'world');

const empty = tableFromJson([]);
assert.deepEqual(empty.columns, []);
assert.equal(empty.totalRows, 0);

const many = tableFromJson(Array.from({ length: MAX_ROWS + 10 }, (_, i) => ({ i })));
assert.equal(many.rows.length, MAX_ROWS);
assert.equal(many.truncatedRows, true);
assert.equal(many.totalRows, MAX_ROWS + 10);

const wide = tableFromJson([
  Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`c${i}`, i])),
]);
assert.equal(wide.columns.length, 80);
assert.equal(wide.truncatedCols, true);

assert.equal(parseFetchUrl('').error.includes('https'), true);
assert.equal(parseFetchUrl('not a url').error.includes('not a URL'), true);
assert.equal(parseFetchUrl('javascript:alert(1)').error.includes('http'), true);
assert.equal(parseFetchUrl('https://example.com/a.json').url, 'https://example.com/a.json');

console.log('takeout flatten tests passed');
