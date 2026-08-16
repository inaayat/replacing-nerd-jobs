/**
 * World in NYC: enclave catalog + election-district join.
 *
 * Pure checks — no map renderer, no network. Rebuild geometries with
 * `node scripts/build-world-in-nyc.mjs` if the join files are missing.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const sampleProps = ed.features[0].properties;
assert.ok('cd' in sampleProps && 'cc' in sampleProps && 'cg' in sampleProps && 'as' in sampleProps && 'se' in sampleProps,
  'keep political-district ids on each ED for later overlays');

console.log(`ok — ${enclaves.length} enclaves on ${ed.features.length} election districts (${withEnclave} tagged)`);
