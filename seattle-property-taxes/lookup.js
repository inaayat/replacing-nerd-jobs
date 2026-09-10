/**
 * Live King County lookups. Browser-safe ESM. GIS + Socrata are CORS-open;
 * eRealProperty tax-roll HTML is same-origin only via the Vercel rewrite.
 */
import {
  accountFromPin,
  isSeattleParcel,
  normalizeAddress,
  normalizePin,
  padLevyCode,
} from './engine.js';

const GIS_PARCELS =
  'https://gismaps.kingcounty.gov/arcgis/rest/services/Districts/DistrictsReport/MapServer/1/query';
const GIS_GEOCODE =
  'https://gismaps.kingcounty.gov/arcgis/rest/services/Address/KingCo_ParcelAddress_locator/GeocodeServer/findAddressCandidates';
const SOCRATA = 'https://data.kingcounty.gov/resource/dkna-i698.json';

const PARCEL_FIELDS = [
  'PIN',
  'ADDR_FULL',
  'UNIT_NUM',
  'CTYNAME',
  'ZIP5',
  'LEVYCODE',
  'LEVY_JURIS',
  'TAX_LNDVAL',
  'TAX_IMPR',
  'ACCNT_NUM',
  'PROPTYPE',
  'PROP_NAME',
  'KCTP_TAXYR',
  'PRIMARY_ADDR',
  'LAT',
  'LON',
].join(',');

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function getJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return res.json();
}

export function parcelSearchUrl(query, { limit = 8 } = {}) {
  const addr = normalizeAddress(query);
  if (!addr.query) return null;
  let where;
  if (addr.house && addr.street) {
    const street = addr.street.replace(/%/g, '');
    where = `UPPER(CTYNAME)='SEATTLE' AND ADDR_NUM=${Number(addr.house)} AND UPPER(ADDR_FULL) LIKE ${sqlString(`${addr.house} ${street}%`)}`;
  } else {
    where = `UPPER(CTYNAME)='SEATTLE' AND UPPER(ADDR_FULL) LIKE ${sqlString(`${addr.query}%`)}`;
  }
  const params = new URLSearchParams({
    where,
    outFields: PARCEL_FIELDS,
    returnGeometry: 'false',
    resultRecordCount: String(limit),
    orderByFields: 'PRIMARY_ADDR DESC, ADDR_FULL',
    f: 'json',
  });
  return `${GIS_PARCELS}?${params}`;
}

export function parcelByPinUrl(pin) {
  const p = normalizePin(pin);
  if (p.length !== 10) return null;
  const params = new URLSearchParams({
    where: `PIN=${sqlString(p)}`,
    outFields: PARCEL_FIELDS,
    returnGeometry: 'false',
    resultRecordCount: '5',
    f: 'json',
  });
  return `${GIS_PARCELS}?${params}`;
}

export function receivablesUrl(account) {
  const acct = String(account || '').replace(/\D/g, '');
  if (acct.length < 10) return null;
  const params = new URLSearchParams({
    account_number: acct,
    $order: 'bill_year',
    $limit: '50',
  });
  return `${SOCRATA}?${params}`;
}

export function slimParcel(attrs = {}) {
  const land = Number(attrs.TAX_LNDVAL) || 0;
  const imps = Number(attrs.TAX_IMPR) || 0;
  return {
    pin: normalizePin(attrs.PIN),
    account: String(attrs.ACCNT_NUM || accountFromPin(attrs.PIN)).replace(/\D/g, ''),
    address: attrs.ADDR_FULL || '',
    unit: attrs.UNIT_NUM || '',
    city: attrs.CTYNAME || '',
    zip: attrs.ZIP5 || '',
    levyCode: padLevyCode(attrs.LEVYCODE),
    levyJuris: attrs.LEVY_JURIS || '',
    taxable: land + imps,
    land,
    imps,
    taxYear: Number(attrs.KCTP_TAXYR) || null,
    propType: attrs.PROPTYPE || '',
    propName: attrs.PROP_NAME || '',
    lat: attrs.LAT ?? null,
    lon: attrs.LON ?? null,
    seattle: isSeattleParcel(attrs),
  };
}

export async function searchAddress(query, fetchImpl = fetch) {
  const pinGuess = normalizePin(query);
  if (pinGuess.length === 10 && /^\d+$/.test(String(query).replace(/[-\s]/g, ''))) {
    return searchPin(pinGuess, fetchImpl);
  }
  const url = parcelSearchUrl(query);
  if (!url) return { matches: [], error: 'Enter a Seattle street address.' };
  const data = await getJson(url, fetchImpl);
  if (data.error) throw new Error(data.error.message || 'King County GIS error');
  const matches = (data.features || [])
    .map((f) => slimParcel(f.attributes || {}))
    .filter((p) => p.pin);
  const unique = [];
  const seen = new Set();
  for (const row of matches) {
    const key = `${row.pin}:${row.unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  if (!unique.length) {
    return geocodeThenParcel(query, fetchImpl);
  }
  return { matches: unique, error: null };
}

async function searchPin(pin, fetchImpl) {
  const url = parcelByPinUrl(pin);
  const data = await getJson(url, fetchImpl);
  const matches = (data.features || []).map((f) => slimParcel(f.attributes || {}));
  const seattle = matches.filter((p) => p.seattle);
  if (matches.length && !seattle.length) {
    return { matches: [], error: 'That parcel is outside Seattle city limits.' };
  }
  return { matches: seattle.length ? seattle : matches, error: seattle.length ? null : null };
}

async function geocodeThenParcel(query, fetchImpl) {
  const params = new URLSearchParams({
    SingleLine: `${query}, Seattle, WA`,
    maxLocations: '6',
    outSR: '4326',
    f: 'json',
  });
  let geo;
  try {
    geo = await getJson(`${GIS_GEOCODE}?${params}`, fetchImpl);
  } catch {
    return { matches: [], error: 'No Seattle parcel matched that address.' };
  }
  const candidates = (geo.candidates || []).filter((c) => (c.score || 0) >= 80);
  const matches = [];
  for (const c of candidates.slice(0, 4)) {
    const loc = c.location || {};
    if (loc.x == null || loc.y == null) continue;
    const spatial = new URLSearchParams({
      geometry: `${loc.x},${loc.y}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: PARCEL_FIELDS,
      returnGeometry: 'false',
      resultRecordCount: '3',
      f: 'json',
    });
    try {
      const data = await getJson(`${GIS_PARCELS}?${spatial}`, fetchImpl);
      for (const f of data.features || []) {
        const row = slimParcel(f.attributes || {});
        if (row.seattle && row.pin) matches.push(row);
      }
    } catch {
      /* try the next candidate */
    }
  }
  const unique = [];
  const seen = new Set();
  for (const row of matches) {
    if (seen.has(row.pin)) continue;
    seen.add(row.pin);
    unique.push(row);
  }
  if (!unique.length) {
    return { matches: [], error: 'No Seattle parcel matched that address.' };
  }
  return { matches: unique, error: null };
}

export async function fetchReceivables(account, fetchImpl = fetch) {
  const url = receivablesUrl(account);
  if (!url) return [];
  try {
    const rows = await getJson(url, fetchImpl);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function fetchTaxRoll(pin, fetchImpl = fetch) {
  const p = normalizePin(pin);
  if (p.length !== 10) return { html: '', url: '' };
  const urls = [
    `/api/kc-dashboard?ParcelNbr=${encodeURIComponent(p)}`,
    `https://blue.kingcounty.com/Assessor/eRealProperty/Dashboard.aspx?ParcelNbr=${encodeURIComponent(p)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.includes('GridViewDBTaxRoll')) return { html, url };
    } catch {
      /* next */
    }
  }
  return { html: '', url: '' };
}

export function assessorLinks(pin) {
  const p = normalizePin(pin);
  return {
    dashboard: `https://blue.kingcounty.com/Assessor/eRealProperty/Dashboard.aspx?ParcelNbr=${p}`,
    levyYear: `https://blue.kingcounty.com/Assessor/eRealProperty/LevyDistrByYear.aspx?ParcelNbr=${p}`,
    taxBill: `https://payment.kingcounty.gov/Home/Index?app=PropertyTaxes&Search=${p}`,
    imap: `https://gismaps.kingcounty.gov/parcelviewer2/?pin=${p}`,
  };
}
