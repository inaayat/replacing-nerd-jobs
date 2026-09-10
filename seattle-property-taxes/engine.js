/**
 * Seattle property-tax allocation. Browser-safe ESM — no node: imports.
 *
 * Tax for a year is taxableValue / 1000 * levyRate. Each destination's dollars
 * are that year's billed (or estimated) tax times (destinationRate / totalRate).
 * Cents on a dollar are 100 * rate / totalRate.
 */
export const SNAPSHOT_SCHEMA = 1;

export const COLORS = {
  'state-schools': '#1a49c4',
  county: '#5a8a9e',
  port: '#755ca7',
  city: '#cf4520',
  school: '#2f6f3e',
  ems: '#c45c1a',
  flood: '#3d7a8c',
  'sound-transit': '#8a5a12',
  parks: '#82a34d',
  other: '#6b6455',
};

const STREET_SWAPS = [
  [/\bSTREET\b/g, 'ST'],
  [/\bAVENUE\b/g, 'AVE'],
  [/\bBOULEVARD\b/g, 'BLVD'],
  [/\bDRIVE\b/g, 'DR'],
  [/\bPLACE\b/g, 'PL'],
  [/\bCOURT\b/g, 'CT'],
  [/\bLANE\b/g, 'LN'],
  [/\bROAD\b/g, 'RD'],
  [/\bTERRACE\b/g, 'TER'],
  [/\bWAY\b/g, 'WAY'],
  [/\bNORTH\b/g, 'N'],
  [/\bSOUTH\b/g, 'S'],
  [/\bEAST\b/g, 'E'],
  [/\bWEST\b/g, 'W'],
  [/\bNORTHEAST\b/g, 'NE'],
  [/\bNORTHWEST\b/g, 'NW'],
  [/\bSOUTHEAST\b/g, 'SE'],
  [/\bSOUTHWEST\b/g, 'SW'],
  [/\bSAINT\b/g, 'ST'],
];

export function moneyToCents(n) {
  return Math.round((Number(n) || 0) * 100);
}

export function roundMoney(n) {
  return moneyToCents(n) / 100;
}

export function roundRate(n) {
  return Math.round((Number(n) || 0) * 1e5) / 1e5;
}

export function padLevyCode(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(4, '0').slice(-4);
}

export function normalizePin(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12) return digits.slice(0, 10);
  if (digits.length === 9) return digits.padStart(10, '0');
  return digits;
}

export function accountFromPin(pin) {
  const p = normalizePin(pin);
  return p.length === 10 ? `${p}05` : p;
}

export function parsePackedDollars(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits);
}

export function parsePackedCents(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

export function isSeattleParcel(attrs = {}) {
  const juris = String(attrs.LEVY_JURIS || attrs.levy_juris || '').trim().toUpperCase();
  const city = String(attrs.CTYNAME || attrs.ctyname || attrs.city || '').trim().toUpperCase();
  if (juris === 'SEATTLE') return true;
  if (city === 'SEATTLE') return true;
  return false;
}

export function normalizeAddress(raw) {
  let s = String(raw ?? '')
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(SEATTLE|WA|WASHINGTON)\b/g, ' ')
    .replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, to] of STREET_SWAPS) s = s.replace(re, to);
  s = s.replace(/\s+/g, ' ').trim();
  const m = s.match(/^(\d+)\s+(.*)$/);
  return {
    raw: String(raw ?? '').trim(),
    query: s,
    house: m ? m[1] : '',
    street: m ? m[2] : s,
  };
}

export function availableYears(snapshot) {
  return Object.keys(snapshot?.years || {})
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
}

export function latestYear(snapshot) {
  const years = availableYears(snapshot);
  return years[years.length - 1] || null;
}

function resolveCode(yearEntry, levyCode) {
  if (!yearEntry?.codes) return null;
  const code = padLevyCode(levyCode);
  let row = yearEntry.codes[code];
  if (row?.aliasOf) row = yearEntry.codes[row.aliasOf];
  return row || null;
}

export function ratesFor(snapshot, levyCode, year) {
  const yearEntry = snapshot?.years?.[String(year)];
  if (!yearEntry) return null;
  const row = resolveCode(yearEntry, levyCode);
  if (!row) return null;
  const groups = Object.fromEntries((snapshot.groups || []).map((g) => [g.id, g]));
  if (!groups.other) {
    groups.other = {
      id: 'other',
      name: 'Other taxing districts',
      group: 'Other',
      blurb: 'State, county, port, EMS, flood, transit, and park district combined.',
    };
  }
  const shares = { ...row.shares };
  const destinations = Object.entries(shares)
    .filter(([, rate]) => rate > 0)
    .map(([id, rate]) => {
      const meta = groups[id] || { id, name: id, group: 'Other' };
      return {
        id,
        name: id === 'school' ? schoolLabel(row) : meta.name,
        group: meta.group,
        blurb: meta.blurb || '',
        rate: roundRate(rate),
        color: COLORS[id] || COLORS.other,
      };
    })
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
  const total = destinations.reduce((sum, d) => sum + d.rate, 0);
  return {
    year: Number(year),
    levyCode: padLevyCode(levyCode),
    schoolDistrict: row.schoolDistrict || '001',
    schoolName: schoolLabel(row),
    totalRegular: roundRate(row.totalRegular || total),
    totalSenior: roundRate(row.totalSenior || 0),
    coarse: Boolean(yearEntry.coarse),
    cityParts: yearEntry.cityParts || [],
    schoolParts: yearEntry.schoolParts?.[row.schoolDistrict] || [],
    destinations,
  };
}

function schoolLabel(row) {
  if (row.schoolDistrict === '401') return 'Highline Public Schools';
  return 'Seattle Public Schools';
}

export function taxFromTaxable(taxable, ratePerThousand) {
  return roundMoney((Number(taxable) || 0) / 1000 * (Number(ratePerThousand) || 0));
}

function largestRemainder(exact, total) {
  const floors = exact.map((x) => Math.floor(x));
  let left = total - floors.reduce((sum, n) => sum + n, 0);
  const order = floors
    .map((_, i) => i)
    .sort((a, b) => exact[b] - floors[b] - (exact[a] - floors[a]));
  const out = floors.slice();
  for (const i of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

export function allocate(totalTax, destinations) {
  const taxCents = moneyToCents(totalTax);
  const rateSum = destinations.reduce((sum, d) => sum + d.rate, 0);
  if (!rateSum || !destinations.length) {
    return destinations.map((d) => ({ ...d, dollars: 0, cents: 0, share: 0 }));
  }
  const shares = destinations.map((d) => d.rate / rateSum);
  const dollarParts = largestRemainder(shares.map((s) => s * taxCents), taxCents);
  const centTenths = largestRemainder(shares.map((s) => s * 1000), 1000);
  return destinations.map((d, i) => ({
    ...d,
    share: shares[i],
    dollars: dollarParts[i] / 100,
    cents: centTenths[i] / 10,
  }));
}

export function centsGrid(destinations, cells = 100) {
  const rows = allocate(1, destinations);
  const parts = rows.map((r) => ({ ...r, exact: r.share * cells, n: 0 }));
  for (const part of parts) part.n = Math.floor(part.exact);
  let left = cells - parts.reduce((sum, p) => sum + p.n, 0);
  const order = [...parts].sort((a, b) => (b.exact - b.n) - (a.exact - a.n));
  for (const part of order) {
    if (left <= 0) break;
    part.n += 1;
    left -= 1;
  }
  const tiles = [];
  for (const part of parts) {
    for (let i = 0; i < part.n; i += 1) {
      tiles.push({ id: part.id, color: part.color, name: part.name });
    }
  }
  return tiles;
}

export function yearSlice({ rates, taxable, billed, source }) {
  const tax = billed != null && billed > 0
    ? roundMoney(billed)
    : taxFromTaxable(taxable, rates.totalRegular);
  const rows = allocate(tax, rates.destinations);
  return {
    year: rates.year,
    levyCode: rates.levyCode,
    schoolName: rates.schoolName,
    coarse: rates.coarse,
    taxable: Number(taxable) || 0,
    billed: billed == null ? null : roundMoney(billed),
    tax,
    estimated: !(billed > 0),
    source: source || (billed > 0 ? 'billed' : 'taxable × rate'),
    destinations: rows,
    cityParts: allocate(
      tax * ((rates.destinations.find((d) => d.id === 'city')?.rate || 0) / (rates.totalRegular || 1)),
      (rates.cityParts || []).map((p) => ({
        ...p,
        color: COLORS.city,
        group: 'City',
      }))
    ),
    schoolParts: allocate(
      tax * ((rates.destinations.find((d) => d.id === 'school')?.rate || 0) / (rates.totalRegular || 1)),
      (rates.schoolParts || []).map((p) => ({
        ...p,
        color: COLORS.school,
        group: 'Schools',
      }))
    ),
  };
}

export function aggregateSlices(slices) {
  const list = (slices || []).filter(Boolean);
  const byId = new Map();
  let tax = 0;
  for (const slice of list) {
    tax += slice.tax;
    for (const row of slice.destinations) {
      const cur = byId.get(row.id) || {
        id: row.id,
        name: row.name,
        group: row.group,
        blurb: row.blurb,
        color: row.color,
        dollars: 0,
        rate: 0,
      };
      cur.dollars = roundMoney(cur.dollars + row.dollars);
      byId.set(row.id, cur);
    }
  }
  const destinations = [...byId.values()].sort((a, b) => b.dollars - a.dollars);
  return {
    years: list.map((s) => s.year),
    from: list[0]?.year || null,
    to: list[list.length - 1]?.year || null,
    tax: roundMoney(tax),
    estimated: list.some((s) => s.estimated),
    destinations: allocate(
      roundMoney(tax),
      destinations.map((d) => ({ ...d, rate: d.dollars }))
    ),
    slices: list,
  };
}

export function clampRange(years, from, to) {
  const all = [...years].sort((a, b) => a - b);
  if (!all.length) return [];
  let lo = Number(from);
  let hi = Number(to);
  if (!Number.isFinite(lo)) lo = all[0];
  if (!Number.isFinite(hi)) hi = all[all.length - 1];
  if (lo > hi) [lo, hi] = [hi, lo];
  return all.filter((y) => y >= lo && y <= hi);
}

export function parseTaxRollHtml(html) {
  const table = String(html || '').match(
    /id="cphContent_GridViewDBTaxRoll"[\s\S]*?<\/table>/i
  );
  if (!table) return [];
  const rows = [];
  const trRe = /<tr class="GridView(?:Alternating)?RowStyle">([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(table[0]))) {
    const cells = [...m[1].matchAll(/<font[^>]*>([\s\S]*?)<\/font>/gi)].map((c) =>
      c[1].replace(/,/g, '').replace(/<[^>]+>/g, '').trim()
    );
    if (cells.length < 9) continue;
    const valuedYear = Number(cells[0]);
    const taxYear = Number(cells[1]);
    const taxable = Number(cells[8]);
    if (!taxYear || !Number.isFinite(taxable)) continue;
    rows.push({
      valuedYear,
      taxYear,
      appraised: Number(cells[4]) || 0,
      taxable,
    });
  }
  return rows.sort((a, b) => a.taxYear - b.taxYear);
}

export function parseLevyPiesHtml(html) {
  const pies = [];
  const re = /addRows\((\[\[.*?\]\])\)/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    let rows;
    try {
      rows = JSON.parse(m[1].replace(/'/g, '"'));
    } catch {
      continue;
    }
    const destinations = [];
    for (const pair of rows) {
      const label = String(pair[0] || '');
      const rate = Number(pair[1]);
      const name = label.split(',')[0].trim();
      const id = pieId(name);
      destinations.push({ id, name, rate, color: COLORS[id] || COLORS.other });
    }
    if (destinations.length) pies.push({ destinations });
  }
  return pies;
}

function pieId(name) {
  const n = name.toLowerCase();
  if (n.includes('state')) return 'state-schools';
  if (n === 'county') return 'county';
  if (n === 'port') return 'port';
  if (n === 'city') return 'city';
  if (n === 'school') return 'school';
  if (n === 'ems') return 'ems';
  if (n === 'flood') return 'flood';
  if (n === 'rst') return 'sound-transit';
  if (n === 'smpd') return 'parks';
  return 'other';
}

export function pickReceivable(rows, year) {
  const list = Array.isArray(rows) ? rows : [];
  const y = String(year);
  const real = list.filter(
    (r) => String(r.bill_year) === y && String(r.receivable_type || 'R').toUpperCase() === 'R'
  );
  const pool = real.length ? real : list.filter((r) => String(r.bill_year) === y);
  if (!pool.length) return null;
  let billed = 0;
  let paid = 0;
  let land = 0;
  let imps = 0;
  let levyCode = '';
  for (const row of pool) {
    billed += parsePackedCents(row.billed_amount);
    paid += parsePackedCents(row.paid_amount);
    land += parsePackedDollars(row.land_value);
    imps += parsePackedDollars(row.imps_value);
    levyCode = padLevyCode(row.levy_code) || levyCode;
  }
  return {
    year: Number(year),
    levyCode,
    billed: roundMoney(billed),
    paid: roundMoney(paid),
    taxable: land + imps,
  };
}

export function formatMoney(n, digits = 0) {
  const x = Number(n) || 0;
  return x.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatPin(pin) {
  const p = normalizePin(pin);
  if (p.length !== 10) return p;
  return `${p.slice(0, 6)}-${p.slice(6)}`;
}

export function displayAddress(attrs = {}) {
  const unit = attrs.UNIT_NUM ? ` ${attrs.UNIT_NUM}` : '';
  const street = attrs.ADDR_FULL || attrs.FULLNAME || '';
  const city = attrs.CTYNAME || 'Seattle';
  const zip = attrs.ZIP5 || '';
  return [street + unit, city, zip].filter(Boolean).join(', ');
}
