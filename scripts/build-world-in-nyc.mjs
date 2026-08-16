#!/usr/bin/env node
/**
 * Pull NYC Department of City Planning political boundaries (the same
 * election-district grain as urbanresearchmaps.org/electioncompare2025, plus
 * the overlay districts listed in the NYPL political-districts guide) and
 * join Wikipedia ethnic enclaves onto each ED.
 *
 * Usage: node scripts/build-world-in-nyc.mjs
 *
 * Writes:
 *   world-in-nyc/data/ed.geojson
 *   world-in-nyc/data/overlays/*.geojson
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'world-in-nyc/data');
const HOST = 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services';

const LAYERS = {
  ed: {
    service: 'NYC_Election_Districts',
    fields: 'ElectDist',
    idField: 'ElectDist',
    pageSize: 1000,
    offset: 0.00008,
  },
  nta: {
    service: 'NYC_Neighborhood_Tabulation_Areas_2020',
    fields: 'NTA2020,NTAName,BoroName,NTAType,CDTA2020,CDTAName',
    idField: 'NTA2020',
    pageSize: 262,
    offset: 0.00015,
  },
  council: {
    service: 'NYC_City_Council_Districts',
    fields: 'CounDist',
    idField: 'CounDist',
    pageSize: 51,
    offset: 0.00025,
    overlay: true,
  },
  congress: {
    service: 'NYC_Congressional_Districts',
    fields: 'CongDist',
    idField: 'CongDist',
    pageSize: 13,
    offset: 0.00025,
    overlay: true,
  },
  cd: {
    service: 'NYC_Community_Districts',
    fields: 'BoroCD',
    idField: 'BoroCD',
    pageSize: 71,
    offset: 0.00025,
    overlay: true,
  },
  assembly: {
    service: 'NYC_State_Assembly_Districts',
    fields: 'AssemDist',
    idField: 'AssemDist',
    pageSize: 2000,
    offset: 0.00025,
    overlay: true,
  },
  senate: {
    service: 'NYC_State_Senate_Districts',
    fields: 'StSenDist',
    idField: 'StSenDist',
    pageSize: 28,
    offset: 0.00025,
    overlay: true,
  },
};

const STOP = new Set([
  'park', 'heights', 'village', 'hill', 'hills', 'beach', 'gardens', 'garden',
  'city', 'new', 'east', 'west', 'south', 'north', 'the', 'and', 'of',
]);

function roundCoord(n) {
  return Math.round(n * 1e5) / 1e5;
}

function roundGeom(geom) {
  if (!geom) return geom;
  const walk = (node) => {
    if (typeof node[0] === 'number') return [roundCoord(node[0]), roundCoord(node[1])];
    return node.map(walk);
  };
  return { type: geom.type, coordinates: walk(geom.coordinates) };
}

function geomBBox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (node) => {
    if (typeof node[0] === 'number') {
      if (node[0] < minX) minX = node[0];
      if (node[0] > maxX) maxX = node[0];
      if (node[1] < minY) minY = node[1];
      if (node[1] > maxY) maxY = node[1];
      return;
    }
    for (const child of node) walk(child);
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

function centroidOf(geom) {
  const rings = [];
  if (geom.type === 'Polygon') rings.push(geom.coordinates[0]);
  else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) rings.push(poly[0]);
  }
  let x = 0, y = 0, n = 0;
  for (const ring of rings) {
    for (const pt of ring) {
      x += pt[0];
      y += pt[1];
      n += 1;
    }
  }
  if (!n) return null;
  return [x / n, y / n];
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(pt, geom) {
  if (!pt || !geom) return false;
  const [x, y] = pt;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    if (!pointInRing(x, y, poly[0])) continue;
    let hole = false;
    for (let i = 1; i < poly.length; i++) {
      if (pointInRing(x, y, poly[i])) hole = true;
    }
    if (!hole) return true;
  }
  return false;
}

function inBBox(pt, bbox) {
  return pt[0] >= bbox[0] && pt[1] >= bbox[1] && pt[0] <= bbox[2] && pt[1] <= bbox[3];
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[()'']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ntaTokens(ntaName) {
  return normalize(ntaName)
    .replace(/\([^)]*\)/g, ' ')
    .split(/[/,-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function placeMatchesNta(place, ntaName) {
  const p = normalize(place);
  if (p.length < 4) return false;
  const n = normalize(ntaName);
  if (n.includes(p) || p.includes(n)) return true;
  for (const token of ntaTokens(ntaName)) {
    if (token === p) return true;
    if (token.length >= 5 && (token.includes(p) || p.includes(token))) {
      if (STOP.has(p) || STOP.has(token)) continue;
      return true;
    }
  }
  return false;
}

async function fetchPage(service, fields, offset, pageSize, maxOffset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: fields,
    outSR: '4326',
    f: 'geojson',
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    geometryPrecision: '5',
    maxAllowableOffset: String(maxOffset),
  });
  const url = `${HOST}/${service}/FeatureServer/0/query?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'world-in-nyc (inaayat.xyz)' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${service} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchLayer(key, spec) {
  const features = [];
  let offset = 0;
  for (;;) {
    process.stdout.write(`  ${key} offset ${offset}\r`);
    const page = await fetchPage(spec.service, spec.fields, offset, spec.pageSize, spec.offset);
    const batch = page.features || [];
    for (const f of batch) {
      if (!f.geometry) continue;
      f.geometry = roundGeom(f.geometry);
      features.push(f);
    }
    if (batch.length < spec.pageSize || page.exceededTransferLimit === false) break;
    if (batch.length === 0) break;
    offset += batch.length;
    if (batch.length < spec.pageSize) break;
  }
  console.log(`  ${key}: ${features.length} features          `);
  return { type: 'FeatureCollection', features };
}

function indexPolygons(fc, idField) {
  return fc.features.map((f) => ({
    id: f.properties[idField],
    props: f.properties,
    geom: f.geometry,
    bbox: geomBBox(f.geometry),
  }));
}

function findContaining(pt, indexed) {
  for (const rec of indexed) {
    if (!inBBox(pt, rec.bbox)) continue;
    if (pointInPolygon(pt, rec.geom)) return rec;
  }
  return null;
}

function compactOverlay(fc, idField) {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      type: 'Feature',
      properties: { id: f.properties[idField] },
      geometry: f.geometry,
    })),
  };
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj));
}

async function main() {
  mkdirSync(join(OUT, 'overlays'), { recursive: true });
  const catalog = JSON.parse(readFileSync(join(OUT, 'enclaves.json'), 'utf8'));
  const enclaves = catalog.enclaves;

  console.log('Downloading DCP political boundaries…');
  const edFc = await fetchLayer('ed', LAYERS.ed);
  const ntaFc = await fetchLayer('nta', LAYERS.nta);
  const overlays = {};
  for (const key of ['council', 'congress', 'cd', 'assembly', 'senate']) {
    overlays[key] = await fetchLayer(key, LAYERS[key]);
  }

  const ntaIdx = indexPolygons(ntaFc, 'NTA2020');
  const overlayIdx = {
    council: indexPolygons(overlays.council, 'CounDist'),
    congress: indexPolygons(overlays.congress, 'CongDist'),
    cd: indexPolygons(overlays.cd, 'BoroCD'),
    assembly: indexPolygons(overlays.assembly, 'AssemDist'),
    senate: indexPolygons(overlays.senate, 'StSenDist'),
  };

  const placeIndex = enclaves.map((e, i) => ({
    i,
    id: e.id,
    places: (e.places || []).map(normalize),
    bbox: e.bbox || null,
  }));

  const unmatched = new Set(enclaves.map((e) => e.id));
  const outFeatures = [];

  for (const f of edFc.features) {
    const elect = f.properties.ElectDist;
    if (elect == null) continue;
    const geom = f.geometry;
    const pt = centroidOf(geom);
    if (!pt) continue;
    const nta = findContaining(pt, ntaIdx);
    const ntaName = nta?.props.NTAName || '';
    const boro = nta?.props.BoroName || '';
    const eids = [];

    for (const enc of placeIndex) {
      let hit = false;
      if (enc.bbox) {
        hit = inBBox(pt, enc.bbox);
      } else if (ntaName) {
        for (const place of enclaves[enc.i].places || []) {
          if (placeMatchesNta(place, ntaName)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        eids.push(enc.i);
        unmatched.delete(enc.id);
      }
    }

    const council = findContaining(pt, overlayIdx.council);
    const congress = findContaining(pt, overlayIdx.congress);
    const cd = findContaining(pt, overlayIdx.cd);
    const assembly = findContaining(pt, overlayIdx.assembly);
    const senate = findContaining(pt, overlayIdx.senate);

    const ad = Math.floor(elect / 1000);
    const edn = elect % 1000;
    outFeatures.push({
      type: 'Feature',
      properties: {
        ed: elect,
        ad,
        n: edn,
        b: boro,
        nta: ntaName,
        nid: nta?.id || '',
        cd: cd?.id ?? null,
        cc: council?.id ?? null,
        cg: congress?.id ?? null,
        as: assembly?.id ?? null,
        se: senate?.id ?? null,
        e: eids,
        r: '',
        p: null,
      },
      geometry: geom,
    });
  }

  const counts = Array(enclaves.length).fill(0);
  for (const f of outFeatures) {
    for (const i of f.properties.e) counts[i] += 1;
  }
  for (const f of outFeatures) {
    const eids = f.properties.e;
    if (!eids.length) continue;
    eids.sort((a, b) => {
      const bboxA = enclaves[a].bbox ? 0 : 1;
      const bboxB = enclaves[b].bbox ? 0 : 1;
      if (bboxA !== bboxB) return bboxA - bboxB;
      return counts[a] - counts[b];
    });
    f.properties.p = eids[0];
    f.properties.r = enclaves[eids[0]].region;
    f.properties.rs = [...new Set(eids.map((i) => enclaves[i].region))];
  }

  writeJson(join(OUT, 'ed.geojson'), { type: 'FeatureCollection', features: outFeatures });
  for (const key of Object.keys(overlays)) {
    writeJson(join(OUT, 'overlays', `${key}.geojson`), compactOverlay(overlays[key], LAYERS[key].idField));
  }

  const stats = {
    eds: outFeatures.length,
    withEnclave: outFeatures.filter((f) => f.properties.e.length).length,
    unmatched: [...unmatched],
    generatedAt: new Date().toISOString(),
  };
  writeJson(join(OUT, 'build-stats.json'), stats);
  console.log(`Wrote ${outFeatures.length} EDs (${stats.withEnclave} with at least one enclave).`);
  if (unmatched.size) {
    console.log('Enclaves with no ED match:', [...unmatched].join(', '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
