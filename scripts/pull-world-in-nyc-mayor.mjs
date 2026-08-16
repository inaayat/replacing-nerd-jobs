/**
 * Pull certified 2025 NYC mayor general results (BOE ED-level CSV) and
 * write a slim JSON join for World in NYC.
 *
 * Usage: node scripts/pull-world-in-nyc-mayor.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATES, emptyVec, bucketUnit, rollupEnclaves } from '../world-in-nyc/votes.js';
import { tagCurrentEnclaves } from '../world-in-nyc/era.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'world-in-nyc/data');
const SOURCE_PATH = '/sites/default/files/pdf/election_results/2025/20251104General Election/00000100000Citywide Mayor Citywide EDLevel.csv';
const SOURCE = `https://www.vote.nyc${SOURCE_PATH}`;

function num(x) {
  return Number(String(x || '0').replace(/,/g, '')) || 0;
}

async function fetchCsv() {
  const res = await fetch(SOURCE.replace(/ /g, '%20'), {
    headers: { 'User-Agent': 'inaayat.xyz/world-in-nyc (https://inaayat.xyz/world-in-nyc/)' },
  });
  if (!res.ok) throw new Error(`${res.status} ${SOURCE}`);
  return res.text();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
    } else if ((ch === ',' && !inQ) || ((ch === '\r' || ch === '\n') && !inQ)) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || line.endsWith(',')) out.push(cur);
  return out;
}

function parseRows(text) {
  const byEd = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const r = parseCsvLine(line);
    if (r.length < 22) continue;
    const status = r[14];
    if (!String(status).startsWith('IN-PLAY')) continue;
    const ad = num(r[11]);
    const ed = num(r[12]);
    if (!ad || !ed) continue;
    const bucket = bucketUnit(r[20]);
    if (bucket < 0) continue;
    const key = ad * 1000 + ed;
    let vec = byEd.get(key);
    if (!vec) {
      vec = emptyVec();
      byEd.set(key, vec);
    }
    vec[bucket] += num(r[21]);
  }
  return byEd;
}

async function main() {
  const text = await fetchCsv();
  const byEdMap = parseRows(text);
  const catalog = JSON.parse(readFileSync(join(DATA, 'enclaves.json'), 'utf8'));
  const ed = JSON.parse(readFileSync(join(DATA, 'ed.geojson'), 'utf8'));
  tagCurrentEnclaves(ed.features, catalog.enclaves);

  const byEd = {};
  const city = emptyVec();
  for (const [key, vec] of byEdMap) {
    byEd[String(key)] = vec;
    city[0] += vec[0];
    city[1] += vec[1];
    city[2] += vec[2];
    city[3] += vec[3];
  }

  const enclaves = rollupEnclaves(ed.features, catalog.enclaves, byEd);
  const matched = ed.features.filter((f) => byEd[String(f.properties.ed)]).length;

  const payload = {
    source: SOURCE,
    contest: 'Mayor · General Election 2025-11-04',
    note: 'Certified NYC BOE ED-level CSV. Combined EDs omitted (votes sit on the receiving IN-PLAY ED). Other is Adams, minor lines, and scattered. Enclave rollups are EDs Wikipedia tags, not voter ethnicity.',
    candidates: CANDIDATES,
    city,
    matched,
    eds: ed.features.length,
    byEd,
    enclaves,
  };

  const out = join(DATA, 'mayor-2025.json');
  writeFileSync(out, `${JSON.stringify(payload)}\n`);
  console.log(`wrote ${out} — ${Object.keys(byEd).length} EDs with votes, ${matched}/${ed.features.length} matched, city ${city.join('/')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
