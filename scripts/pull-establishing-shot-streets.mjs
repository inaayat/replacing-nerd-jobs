#!/usr/bin/env node
// Build establishing-shot/data/streets.json — the Manhattan street geometry and
// intersection index the browser uses to place film permits.
//
// Source: NYC Street Centerline (CSCL), Socrata dataset inkn-q76z.
//
// Why this is committed while the permits are live: permits are the data you
// came to see and they change daily, but the street grid does not, and the
// intersection math (all-pairs geometry over ~10k segments) is not something to
// redo in a phone browser on every page load. Refresh with:
//
//   node scripts/pull-establishing-shot-streets.mjs
//
// CSCL has no cross-street columns, so intersections are computed here from the
// geometry: real segment crossings, plus endpoints that land on another street
// (T-junctions, where the geometry stops short instead of crossing).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeStreetName, STREETS_SCHEMA } from '../establishing-shot/streets.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolvePath(HERE, '../establishing-shot/data/streets.json');

const DATASET = 'inkn-q76z';
const DATASET_URL = `https://data.cityofnewyork.us/resource/${DATASET}.json`;
// 1 = street, 2 = highway. Everything else is ramps, paths, tunnels, and
// non-physical connectors that a film permit never names.
const RW_TYPES = ['1', '2'];
const BOROUGH_CODE = '1';

// Coordinates keep 6 decimals (~0.1m) while snapping and are written at 6, which
// is far finer than the permits' own precision but keeps the grid visually clean.
const PRECISION = 6;
// A street endpoint within ~12m of another street's line counts as meeting it.
// Below that, T-junctions where CSCL stops the stub short of the through street
// go missing, and cross streets like those are how permits describe corners.
const JOIN_TOLERANCE_M = 12;

const round = (n) => Number(n.toFixed(PRECISION));
const M_PER_DEG_LAT = 111320;
const mPerDegLng = (lat) => Math.cos((lat * Math.PI) / 180) * 111320;

async function fetchCenterline() {
  const params = new URLSearchParams();
  params.set('$select', 'physicalid,full_street_name,rw_type,the_geom');
  params.set('$where', `boroughcode='${BOROUGH_CODE}' AND (${RW_TYPES.map((t) => `rw_type='${t}'`).join(' OR ')})`);
  params.set('$limit', '50000');
  const url = `${DATASET_URL}?${params.toString()}`;
  process.stdout.write(`fetching centerline… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`centerline fetch failed: ${res.status} ${res.statusText}`);
  const rows = await res.json();
  process.stdout.write(`${rows.length} segments\n`);
  return rows;
}

/** Raw centerline rows -> one edge per LineString, grouped by normalized name. */
function edgesByStreet(rows) {
  const streets = new Map();
  let skipped = 0;
  for (const row of rows) {
    const name = normalizeStreetName(row.full_street_name);
    const geom = row.the_geom;
    if (!name || !geom || geom.type !== 'MultiLineString') {
      skipped += 1;
      continue;
    }
    for (const line of geom.coordinates) {
      const coords = line.map(([lng, lat]) => [round(lng), round(lat)]).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
      if (coords.length < 2) continue;
      if (!streets.has(name)) streets.set(name, []);
      streets.get(name).push(coords);
    }
  }
  return { streets, skipped };
}

const nodeKey = (pt) => `${pt[0]},${pt[1]}`;

/**
 * Chain a street's block-length edges into as few continuous runs as possible.
 *
 * This matters for slicing: a block face is the piece of a street between two
 * intersections, which only works if the intersections sit on the same run. A
 * street with a gap (or two unrelated stretches sharing a name) legitimately
 * ends up as several runs.
 */
function chainEdges(edges) {
  const seen = new Set();
  const byEndpoint = new Map();
  const push = (key, idx) => {
    const hit = byEndpoint.get(key);
    if (hit) hit.push(idx);
    else byEndpoint.set(key, [idx]);
  };
  edges.forEach((coords, idx) => {
    push(nodeKey(coords[0]), idx);
    push(nodeKey(coords[coords.length - 1]), idx);
  });

  const degree = (key) => (byEndpoint.get(key) || []).length;
  const order = edges
    .map((coords, idx) => ({ idx, deg: Math.min(degree(nodeKey(coords[0])), degree(nodeKey(coords[coords.length - 1]))) }))
    .sort((a, b) => a.deg - b.deg)
    .map((e) => e.idx);

  const parts = [];
  for (const start of order) {
    if (seen.has(start)) continue;
    seen.add(start);
    let run = edges[start].slice();

    // Extend from both ends while an unused edge continues the run.
    for (const forward of [true, false]) {
      for (;;) {
        const tip = forward ? run[run.length - 1] : run[0];
        const next = (byEndpoint.get(nodeKey(tip)) || []).find((idx) => !seen.has(idx));
        if (next === undefined) break;
        seen.add(next);
        const coords = edges[next];
        const head = nodeKey(coords[0]) === nodeKey(tip) ? coords : [...coords].reverse();
        run = forward ? run.concat(head.slice(1)) : head.slice(0, -1).reverse().concat(run);
      }
    }
    parts.push(run);
  }
  return parts;
}

function bbox(coords) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

const CELL = 0.004; // ~350m cells; a block is ~80x270m

function cellsFor(box, pad = 0) {
  const cells = [];
  const x0 = Math.floor((box[0] - pad) / CELL);
  const y0 = Math.floor((box[1] - pad) / CELL);
  const x1 = Math.floor((box[2] + pad) / CELL);
  const y1 = Math.floor((box[3] + pad) / CELL);
  for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) cells.push(`${x}:${y}`);
  return cells;
}

/** Segment-segment intersection, returning the parameter on each. */
function segmentCross(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0];
  const d1y = p2[1] - p1[1];
  const d2x = p4[0] - p3[0];
  const d2y = p4[1] - p3[1];
  const den = d1x * d2y - d1y * d2x;
  if (den === 0) return null;
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / den;
  const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Closest point on a polyline to `pt`, as a fractional vertex position. */
function nearestOn(coords, pt) {
  const scaleX = mPerDegLng(pt[1]);
  let best = null;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const dx = (x2 - x1) * scaleX;
    const dy = (y2 - y1) * M_PER_DEG_LAT;
    const len2 = dx * dx + dy * dy;
    const px = (pt[0] - x1) * scaleX;
    const py = (pt[1] - y1) * M_PER_DEG_LAT;
    const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
    const ex = px - dx * t;
    const ey = py - dy * t;
    const dist = Math.hypot(ex, ey);
    if (!best || dist < best.dist) best = { dist, at: i + t };
  }
  return best;
}

/**
 * All crossings between runs of different streets.
 *
 * Two passes, because CSCL geometry is not topologically clean: real crossings
 * where the lines actually cross, then endpoints that stop just short of another
 * street. The second pass is what makes T-junctions (and Broadway at Times
 * Square, where the roadbed is broken up) resolvable.
 */
function findXings(streets) {
  const grid = new Map();
  const runs = [];
  streets.forEach((street, streetIdx) => {
    street.parts.forEach((coords, partIdx) => {
      const runIdx = runs.length;
      runs.push({ streetIdx, partIdx, coords, box: bbox(coords) });
      for (const cell of cellsFor(bbox(coords))) {
        if (!grid.has(cell)) grid.set(cell, []);
        grid.get(cell).push(runIdx);
      }
    });
  });

  const found = new Map(); // `${a}|${ap}|${b}|${bp}` -> [aAt, bAt]
  const record = (aRun, bRun, aAt, bAt) => {
    const a = runs[aRun];
    const b = runs[bRun];
    const key = `${a.streetIdx}|${a.partIdx}|${b.streetIdx}|${b.partIdx}`;
    if (!found.has(key)) found.set(key, [a.streetIdx, a.partIdx, aAt, b.streetIdx, b.partIdx, bAt]);
  };

  const pairsChecked = new Set();
  for (const bucket of grid.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const aRun = bucket[i];
        const bRun = bucket[j];
        if (runs[aRun].streetIdx === runs[bRun].streetIdx) continue;
        const pairKey = aRun < bRun ? `${aRun}|${bRun}` : `${bRun}|${aRun}`;
        if (pairsChecked.has(pairKey)) continue;
        pairsChecked.add(pairKey);

        const a = runs[aRun];
        const b = runs[bRun];
        if (a.box[0] > b.box[2] || b.box[0] > a.box[2] || a.box[1] > b.box[3] || b.box[1] > a.box[3]) continue;

        let hit = null;
        for (let ai = 0; ai < a.coords.length - 1 && !hit; ai += 1) {
          for (let bi = 0; bi < b.coords.length - 1; bi += 1) {
            const cross = segmentCross(a.coords[ai], a.coords[ai + 1], b.coords[bi], b.coords[bi + 1]);
            if (cross) {
              hit = { aAt: ai + cross.t, bAt: bi + cross.u };
              break;
            }
          }
        }
        if (hit) {
          record(aRun, bRun, hit.aAt, hit.bAt);
          record(bRun, aRun, hit.bAt, hit.aAt);
          continue;
        }

        // No crossing: does either run end on the other?
        for (const [fromRun, toRun] of [
          [aRun, bRun],
          [bRun, aRun],
        ]) {
          const from = runs[fromRun];
          const to = runs[toRun];
          for (const [tipIdx, tip] of [
            [0, from.coords[0]],
            [from.coords.length - 1, from.coords[from.coords.length - 1]],
          ]) {
            const near = nearestOn(to.coords, tip);
            if (near && near.dist <= JOIN_TOLERANCE_M) {
              record(fromRun, toRun, tipIdx, near.at);
              record(toRun, fromRun, near.at, tipIdx);
            }
          }
        }
      }
    }
  }

  // Keep one crossing per (street pair, run pair); dedupe to the flat payload.
  const out = [];
  const seen = new Set();
  for (const row of found.values()) {
    const [a, ap, aAt, b, bp, bAt] = row;
    if (a > b) continue; // the reverse direction is rebuilt at runtime
    const key = `${a}|${ap}|${b}|${bp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, ap, Number(aAt.toFixed(3)), b, bp, Number(bAt.toFixed(3))]);
  }
  return out;
}

async function main() {
  const rows = await fetchCenterline();
  const { streets: edges, skipped } = edgesByStreet(rows);

  const streets = [...edges.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, list]) => ({ name, parts: chainEdges(list) }));

  process.stdout.write(`chained ${streets.length} street names into ${streets.reduce((n, s) => n + s.parts.length, 0)} runs\n`);

  const xings = findXings(streets);
  process.stdout.write(`computed ${xings.length} intersections\n`);

  const payload = {
    schema: STREETS_SCHEMA,
    generatedAt: new Date().toISOString(),
    source: {
      name: 'NYC Street Centerline (CSCL)',
      dataset: DATASET,
      page: `https://data.cityofnewyork.us/City-Government/NYC-Street-Centerline-CSCL-/${DATASET}`,
      borough: 'Manhattan',
      rwTypes: RW_TYPES,
      segments: rows.length,
      skipped,
      joinToleranceM: JOIN_TOLERANCE_M,
    },
    streets,
    xings,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload)}\n`);
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  process.stdout.write(`wrote ${OUT} (${(bytes / 1024 / 1024).toFixed(2)} MB)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
