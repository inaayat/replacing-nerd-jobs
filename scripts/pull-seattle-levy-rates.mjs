/**
 * Build seattle-property-taxes/data/levy-rates.json from King County Assessor
 * "Codes and Levies" PDFs. No npm deps — uses `pdftotext` when present, else
 * Python pypdf (already used to fetch these files in this environment).
 *
 * Dry-run by default. The committed snapshot is hand-curated; PDF text
 * extraction is too noisy to overwrite it. Pass --write only if you mean to.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'seattle-property-taxes/data/levy-rates.json');

export const SNAPSHOT_SCHEMA = 1;

const BOOKS = [
  {
    year: 2026,
    url: 'https://cdn.kingcounty.gov/-/media/king-county/depts/assessor/buildings-property/reports/levy-rate-info/taxing-districts-codes-and-levies/LatestRateBook.pdf',
  },
  {
    year: 2025,
    url: 'https://cdn.kingcounty.gov/-/media/king-county/depts/assessor/buildings-property/reports/levy-rate-info/taxing-districts-codes-and-levies/ratebook25.pdf',
  },
  {
    year: 2024,
    url: 'https://cdn.kingcounty.gov/-/media/king-county/depts/assessor/buildings-property/reports/levy-rate-info/taxing-districts-codes-and-levies/ratebook24.pdf',
  },
  {
    year: 2023,
    url: 'https://cdn.kingcounty.gov/-/media/king-county/depts/assessor/buildings-property/reports/levy-rate-info/taxing-districts-codes-and-levies/ratebook23.pdf',
  },
  {
    year: 2022,
    url: 'https://cdn.kingcounty.gov/-/media/king-county/depts/assessor/buildings-property/reports/levy-rate-info/taxing-districts-codes-and-levies/ratebook22.pdf',
  },
  {
    year: 2021,
    url: 'https://cdn.kingcounty.gov/-/media/king-county/depts/assessor/buildings-property/reports/levy-rate-info/taxing-districts-codes-and-levies/ratebook21.pdf',
  },
  {
    year: 2020,
    url: 'https://cdn.kingcounty.gov/-/media/king-county/depts/assessor/buildings-property/reports/levy-rate-info/taxing-districts-codes-and-levies/ratebook20.pdf',
  },
];

const GROUPS = [
  { id: 'state-schools', name: 'Washington state schools', group: 'State' },
  { id: 'county', name: 'King County', group: 'County' },
  { id: 'port', name: 'Port of Seattle', group: 'Regional' },
  { id: 'city', name: 'City of Seattle', group: 'City' },
  { id: 'school', name: 'Local school district', group: 'Schools' },
  { id: 'ems', name: 'Emergency medical services', group: 'County' },
  { id: 'flood', name: 'King County Flood Control', group: 'County' },
  { id: 'sound-transit', name: 'Sound Transit', group: 'Regional' },
  { id: 'parks', name: 'Seattle Park District', group: 'City' },
];

function numbersIn(text) {
  return (String(text).match(/\d+\.\d{2,5}/g) || []).map(Number);
}

function codeFrom(text) {
  const m = String(text).match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

function schoolFrom(header) {
  const m = String(header).match(/\b(001|401|210|412)\b/);
  return m ? m[1] : '001';
}

function parseCodeBlock(header, rLine, fLine) {
  const code = codeFrom(header);
  if (!code) return null;
  const r = numbersIn(rLine.replace(/-/g, ' '));
  const f = numbersIn((fLine || '').replace(/-/g, ' '));
  if (r.length < 4) return null;
  // TOTAL CONS CITY SCHOOL ... EMS FLOOD RST OTHER
  const total = r[0];
  const cons = r[1];
  const city = r[2];
  const school = r[3];
  const tail = r.slice(4);
  // Skip zero/placeholder water/fire/hosp/libr (often absent for Seattle).
  // EMS/flood/RST/parks are the last four non-zero-ish values on Seattle rows.
  const last4 = tail.slice(-4);
  const ems = last4[0] ?? 0;
  const flood = last4[1] ?? 0;
  const rst = last4[2] ?? 0;
  const parks = last4[3] ?? 0;
  return {
    code,
    schoolDistrict: schoolFrom(header),
    totalRegular: total,
    totalSenior: f[0] || 0,
    cons,
    city,
    school,
    ems,
    flood,
    rst,
    parks,
  };
}

function extractSeattleCodes(text) {
  const norm = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  const blocks = [];
  const re =
    /(?:CITY OF SEATTLE|SEATTLE)\s*(?:LIMITS 0\s*)?(\d{4}\s+[\w\s\-.,]*?)(?=\s)[^R]*?\bR\s+([\d.\s-]+?)\s+F\s+([\d.\s-]+?)(?=\s+(?:\d{4}|CITY|ALGONA|AUBURN|DISTRICT))/gi;
  let m;
  const sliced = text.replace(/\u00a0/g, ' ');
  const simple = sliced.matchAll(
    /(\d{4})\s+(001|401)[^\n]{0,80}\n\s*R\s+([0-9.\-\s]+)\n\s*F\s+([0-9.\-\s]+)/g
  );
  for (const hit of simple) {
    const parsed = parseCodeBlock(`${hit[1]} ${hit[2]}`, `R ${hit[3]}`, `F ${hit[4]}`);
    if (parsed) blocks.push(parsed);
  }
  // 2026 book keeps "SEATTLE 0010" on the same line as the districts list.
  const alt = sliced.matchAll(
    /SEATTLE\s+(\d{4})\s+(001|401)[^\n]*\n\s*SEATTLE\s+R\s+([0-9.\-\s]+)\n\s*SEATTLE\s+F\s+([0-9.\-\s]+)/g
  );
  for (const hit of alt) {
    const parsed = parseCodeBlock(`${hit[1]} ${hit[2]}`, `R ${hit[3]}`, `F ${hit[4]}`);
    if (parsed) blocks.push(parsed);
  }
  const byCode = new Map();
  for (const row of blocks) {
    if (!byCode.has(row.code) && row.totalRegular > 5 && row.totalRegular < 20) {
      byCode.set(row.code, row);
    }
  }
  void m;
  void re;
  void norm;
  return [...byCode.values()];
}

function extractConsSplit(text) {
  const t = text.replace(/\u00a0/g, ' ');
  const state =
    numberAfter(t, /TOTAL STATE SCHOOL FUND/i) ||
    numberNearLabel(t, /TOTAL STATE SCHOOL FUND/i);
  const county =
    numberAfter(t, /TOTAL COUNTY/i) || numberNearLabel(t, /TOTAL COUNTY/i);
  const port = numberAfter(t, /TOTAL PORT/i) || numberNearLabel(t, /TOTAL PORT/i);
  // Fallback: the pie-sized totals appear early as 2.xxxx, 1.xxxx, 0.0xxxx
  if (state && county && port) return { state, county, port };
  return null;
}

function numberAfter(text, label) {
  const m = text.match(new RegExp(label.source + '[^0-9]{0,40}(\\d+\\.\\d{3,5})', 'i'));
  return m ? Number(m[1]) : null;
}

function numberNearLabel(text, label) {
  const m = text.match(label);
  if (!m) return null;
  const window = text.slice(Math.max(0, m.index - 80), m.index + 80);
  const nums = numbersIn(window);
  return nums[0] || null;
}

function pdfText(url) {
  const py = `
import io, sys, urllib.request
from pypdf import PdfReader
url = sys.argv[1]
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 inaayat.xyz levy-rates"})
with urllib.request.urlopen(req, timeout=90) as r:
    data = r.read()
reader = PdfReader(io.BytesIO(data))
for p in reader.pages:
    t = p.extract_text() or ""
    sys.stdout.write(t)
    sys.stdout.write("\\n\\f\\n")
`;
  const run = spawnSync('python3', ['-c', py, url], {
    encoding: 'utf8',
    maxBuffer: 20_000_000,
  });
  if (run.status !== 0) {
    throw new Error(`pdf extract failed for ${url}: ${run.stderr}`);
  }
  return run.stdout;
}

function sharesFor(row, split) {
  const cons = row.cons;
  let state = split?.state || 0;
  let county = split?.county || 0;
  let port = split?.port || 0;
  const sum = state + county + port;
  if (cons && sum > 0) {
    const scale = cons / sum;
    state *= scale;
    county *= scale;
    port *= scale;
  } else if (cons) {
    state = cons;
  }
  return {
    'state-schools': round5(state),
    county: round5(county),
    port: round5(port),
    city: round5(row.city),
    school: round5(row.school),
    ems: round5(row.ems),
    flood: round5(row.flood),
    'sound-transit': round5(row.rst),
    parks: round5(row.parks),
  };
}

function round5(n) {
  return Math.round((Number(n) || 0) * 1e5) / 1e5;
}

function schoolName(id) {
  if (id === '401') return 'Highline Public Schools';
  if (id === '412') return 'Shoreline School District';
  return 'Seattle Public Schools';
}

export async function buildSnapshot(fetchText = pdfText) {
  const years = {};
  for (const book of BOOKS) {
    const text = fetchText(book.url);
    const codes = extractSeattleCodes(text);
    const split = extractConsSplit(text);
    if (!codes.length) {
      console.warn(`no Seattle levy codes parsed for ${book.year}`);
      continue;
    }
    const map = {};
    for (const row of codes) {
      map[row.code] = {
        schoolDistrict: row.schoolDistrict,
        schoolName: schoolName(row.schoolDistrict),
        totalRegular: round5(row.totalRegular),
        totalSenior: round5(row.totalSenior),
        shares: sharesFor(row, split),
      };
    }
    years[String(book.year)] = {
      source: book.url,
      consSplit: split
        ? {
            state: round5(split.state),
            county: round5(split.county),
            port: round5(split.port),
          }
        : null,
      codes: map,
    };
    console.warn(
      `${book.year}: ${Object.keys(map).length} Seattle codes, cons=${JSON.stringify(split)}`
    );
  }
  return {
    schema: SNAPSHOT_SCHEMA,
    pulledAt: new Date().toISOString().slice(0, 10),
    source: 'King County Assessor Codes and Levies PDFs',
    groups: GROUPS,
    years,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const snapshot = await buildSnapshot();
  const write = process.argv.includes('--write');
  if (!write) {
    console.warn(
      'Dry run. seattle-property-taxes/data/levy-rates.json is hand-curated from the rate books; this PDF scrape is too noisy to overwrite it. Pass --write only if you intend to replace the snapshot.'
    );
    console.warn(`parsed years: ${Object.keys(snapshot.years).join(', ')}`);
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.warn(`wrote ${OUT}`);
  }
}
void existsSync;
