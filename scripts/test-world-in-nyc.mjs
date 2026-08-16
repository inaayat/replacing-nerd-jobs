/**
 * World in NYC: enclave catalog, election-district join, origin-country map.
 *
 * Pure checks — no map renderer, no network. Rebuild ED geometries with
 * `node scripts/build-world-in-nyc.mjs` if the join files are missing.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUP_COUNTRIES, countryIndex, countriesForGroup } from '../world-in-nyc/countries.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'world-in-nyc/data');

const catalog = JSON.parse(readFileSync(join(DATA, 'enclaves.json'), 'utf8'));
const { regions, enclaves } = catalog;

assert.ok(regions.length >= 8, 'expected region legend');
assert.ok(enclaves.length >= 80, `expected a full Wikipedia parse, got ${enclaves.length}`);

const ids = new Set();
for (const enc of enclaves) {
  assert.ok(enc.id && enc.name && enc.group && enc.region, `${enc.id || '?'} missing fields`);
  assert.ok(regions.some((r) => r.id === enc.region), `${enc.id} has unknown region ${enc.region}`);
  assert.ok((enc.places && enc.places.length) || enc.bbox, `${enc.id} needs places or a bbox`);
  assert.ok(!ids.has(enc.id), `duplicate enclave id ${enc.id}`);
  ids.add(enc.id);
}

const edPath = join(DATA, 'ed.geojson');
assert.ok(existsSync(edPath), 'ed.geojson missing — run node scripts/build-world-in-nyc.mjs');
const ed = JSON.parse(readFileSync(edPath, 'utf8'));
assert.equal(ed.type, 'FeatureCollection');
assert.ok(ed.features.length > 4000, `too few EDs: ${ed.features.length}`);

const seen = new Set();
let withEnclave = 0;
for (const f of ed.features) {
  const p = f.properties;
  assert.equal(typeof p.ed, 'number');
  assert.equal(p.ad, Math.floor(p.ed / 1000));
  assert.ok(Array.isArray(p.e), `ED ${p.ed} missing enclave index array`);
  if (p.e.length) {
    withEnclave += 1;
    assert.ok(p.r, `ED ${p.ed} has enclaves but no primary region`);
    for (const i of p.e) {
      assert.ok(enclaves[i], `ED ${p.ed} points at missing enclave ${i}`);
      seen.add(i);
    }
  }
  assert.ok(f.geometry, `ED ${p.ed} missing geometry`);
}

assert.ok(withEnclave > 2000, `too few EDs joined to enclaves: ${withEnclave}`);
const missing = enclaves.map((e, i) => (seen.has(i) ? null : e.id)).filter(Boolean);
assert.deepEqual(missing, [], `enclaves with no ED: ${missing.join(', ')}`);

for (const name of ['council', 'congress', 'cd', 'assembly', 'senate']) {
  const overlay = JSON.parse(readFileSync(join(DATA, 'overlays', `${name}.geojson`), 'utf8'));
  assert.ok(overlay.features.length > 5, `${name} overlay too small`);
}

const html = readFileSync(join(ROOT, 'world-in-nyc/index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'world-in-nyc/app.css'), 'utf8');
const js = readFileSync(join(ROOT, 'world-in-nyc/app.js'), 'utf8');
assert.match(html, /maplibre-gl/);
assert.match(html, /urbanresearchmaps.org\/electioncompare2025/);
assert.match(html, /browse-toggle/);
assert.match(css, /max-width: 860px/);
assert.match(css, /win-sheet-peek/);
assert.doesNotMatch(html, /data-overlay=/);
assert.match(js, /ensureOverlay/);
assert.match(js, /libguides.nypl.org\/nycboundaries\/political/);
assert.doesNotMatch(js, /<dt>Council<\/dt>/);
assert.match(html, /id="view-world"/);
assert.match(html, /id="world-map"/);
assert.match(html, /id="rail-kicker"/);
assert.doesNotMatch(html, /class="win-title"/);
assert.doesNotMatch(html, /id="world-lede"/);
assert.doesNotMatch(html, /href="#list"/);
assert.match(js, /countryIndex/);
assert.match(js, /applyView\('world'\)/);
const sampleProps = ed.features[0].properties;
assert.ok('cd' in sampleProps && 'cc' in sampleProps && 'cg' in sampleProps && 'as' in sampleProps && 'se' in sampleProps,
  'keep political-district ids on each ED for later overlays');

const worldPath = join(DATA, 'world.geojson');
assert.ok(existsSync(worldPath), 'world.geojson missing');
const world = JSON.parse(readFileSync(worldPath, 'utf8'));
assert.equal(world.type, 'FeatureCollection');
assert.ok(world.features.length > 150, `too few countries: ${world.features.length}`);
const worldIsos = new Set(world.features.map((f) => f.properties.iso));
assert.ok(worldIsos.has('ITA') && worldIsos.has('MLT') && worldIsos.has('PSE') && worldIsos.has('PRI'),
  'world map needs Italy, Malta, Palestine, Puerto Rico');

const UNMAPPED_GROUPS = new Set([
  'African American',
  'Jewish',
  'Jewish (Hasidic)',
  'Jewish (Orthodox)',
  'Romani',
]);
const groups = [...new Set(enclaves.map((e) => e.group))];
for (const group of groups) {
  if (UNMAPPED_GROUPS.has(group)) {
    assert.equal(countriesForGroup(group).length, 0, `${group} should stay unmapped`);
    continue;
  }
  const isos = countriesForGroup(group);
  assert.ok(isos.length, `${group} has no origin-country mapping`);
  for (const iso of isos) {
    assert.ok(worldIsos.has(iso), `${group} maps to ${iso} which is missing from world.geojson`);
  }
}
for (const group of Object.keys(GROUP_COUNTRIES)) {
  assert.ok(groups.includes(group), `GROUP_COUNTRIES has leftover group ${group}`);
}

const countries = countryIndex(enclaves, world.features);
assert.ok(countries.length >= 40, `expected a full origin-country index, got ${countries.length}`);
const italy = countries.find((c) => c.iso === 'ITA');
assert.ok(italy, 'Italy should be shaded');
assert.ok(italy.places.includes('Little Italy') && italy.places.includes('Bensonhurst'),
  `Italy should list NYC neighborhoods, got ${italy.places.join(', ')}`);
assert.equal(countries.find((c) => c.iso === 'USA'), undefined,
  'USA itself is not an origin country in the Wikipedia list');

console.log(`ok — ${enclaves.length} enclaves on ${ed.features.length} election districts (${withEnclave} tagged); ${countries.length} origin countries`);
