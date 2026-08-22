/**
 * Curated JSON sources for Takeout. Browser-safe ESM.
 *
 * Each source either hits a CORS-open public API, a same-origin snapshot on
 * this site, or an existing `/api/f500-*` route (deployed only). There is no
 * generic URL proxy — custom URLs are fetched from the browser, and hosts
 * that block CORS ask you to paste JSON instead.
 */
import { parseFetchUrl, tableFromJson } from './flatten.js';

export const MAX_JSON_BYTES = 6_000_000;

const WORLD_BANK_INDICATORS = [
  { value: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)' },
  { value: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)' },
  { value: 'SP.POP.TOTL', label: 'Population' },
  { value: 'FP.CPI.TOTL.ZG', label: 'Inflation (CPI %)' },
  { value: 'SL.UEM.TOTL.ZS', label: 'Unemployment (%)' },
  { value: 'NE.EXP.GNFS.ZS', label: 'Exports of goods & services (% GDP)' },
  { value: 'GB.XPD.RSDV.GD.ZS', label: 'R&D expenditure (% GDP)' },
  { value: 'EN.ATM.CO2E.PC', label: 'CO2 emissions (metric tons / person)' },
];

const WORLD_BANK_PLACES = [
  { value: 'USA', label: 'United States' },
  { value: 'CHN', label: 'China' },
  { value: 'IND', label: 'India' },
  { value: 'DEU', label: 'Germany' },
  { value: 'JPN', label: 'Japan' },
  { value: 'GBR', label: 'United Kingdom' },
  { value: 'FRA', label: 'France' },
  { value: 'BRA', label: 'Brazil' },
  { value: 'WLD', label: 'World' },
];

const USGS_FEEDS = [
  { value: 'significant_month', label: 'Significant, past month' },
  { value: '4.5_week', label: 'M4.5+, past week' },
  { value: '2.5_day', label: 'M2.5+, past day' },
  { value: 'all_hour', label: 'All, past hour' },
];

function q(value) {
  return encodeURIComponent(String(value ?? '').trim());
}

function pickSlimCountries(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((c) => ({
    name: c?.name?.common || c?.name?.official || '',
    official: c?.name?.official || '',
    cca2: c?.cca2 || '',
    region: c?.region || '',
    subregion: c?.subregion || '',
    capital: Array.isArray(c?.capital) ? c.capital.join(', ') : c?.capital || '',
    population: c?.population ?? '',
    area: c?.area ?? '',
    currencies: c?.currencies
      ? Object.values(c.currencies)
          .map((x) => x?.name || x?.symbol)
          .filter(Boolean)
          .join(', ')
      : '',
    languages: c?.languages ? Object.values(c.languages).join(', ') : '',
    unMember: c?.unMember ?? '',
  }));
}

function pickWorldBank(payload) {
  const rows = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : payload;
  if (!Array.isArray(rows)) return payload;
  return rows.map((r) => ({
    country: r?.country?.value || r?.countryiso3code || '',
    iso3: r?.countryiso3code || '',
    indicator: r?.indicator?.value || r?.indicator?.id || '',
    year: r?.date || '',
    value: r?.value ?? '',
  }));
}

function pickRates(payload) {
  const rates = payload?.rates;
  if (!rates || typeof rates !== 'object') return payload;
  return Object.entries(rates).map(([currency, rate]) => ({
    date: payload.date || '',
    base: payload.base || '',
    amount: payload.amount ?? 1,
    currency,
    rate,
  }));
}

function pickOpenMeteo(payload) {
  const daily = payload?.daily;
  if (!daily || typeof daily !== 'object') return payload;
  const keys = Object.keys(daily).filter((k) => Array.isArray(daily[k]));
  const n = daily.time?.length || 0;
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const row = {
      latitude: payload.latitude,
      longitude: payload.longitude,
      timezone: payload.timezone,
    };
    for (const key of keys) row[key] = daily[key][i];
    rows.push(row);
  }
  return rows;
}

function pickHeadlines(snapshot) {
  const companies = snapshot?.companies;
  if (!companies || typeof companies !== 'object') return snapshot;
  return Object.values(companies).map((c) => {
    const row = {
      cik: c?.cik ?? '',
      name: c?.entityName || '',
      year: c?.asOfYear ?? '',
    };
    for (const [key, metric] of Object.entries(c?.metrics || {})) {
      row[key] = metric && typeof metric === 'object' ? metric.val ?? '' : metric ?? '';
    }
    for (const [key, metric] of Object.entries(c?.ratios || {})) {
      row[`ratio_${key}`] =
        metric && typeof metric === 'object' && 'val' in metric ? metric.val : metric ?? '';
    }
    return row;
  });
}

function pickPrices(payload) {
  if (payload?.error) {
    const err = new Error(payload.error);
    err.status = 502;
    throw err;
  }
  const bars = Array.isArray(payload?.bars) ? payload.bars : [];
  return bars.map((bar) => ({
    symbol: payload.symbol || '',
    currency: payload.currency || 'USD',
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

function pickGithub(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : payload;
  if (!Array.isArray(items)) return payload;
  return items.map((r) => ({
    name: r?.full_name || r?.name || '',
    description: r?.description || '',
    language: r?.language || '',
    stars: r?.stargazers_count ?? '',
    forks: r?.forks_count ?? '',
    updated: r?.updated_at || '',
    url: r?.html_url || '',
    license: r?.license?.spdx_id || '',
  }));
}

function pickLibrary(payload) {
  const docs = Array.isArray(payload?.docs) ? payload.docs : payload;
  if (!Array.isArray(docs)) return payload;
  return docs.map((d) => ({
    title: d?.title || '',
    author: Array.isArray(d?.author_name) ? d.author_name.join(', ') : d?.author_name || '',
    year: d?.first_publish_year ?? '',
    editions: d?.edition_count ?? '',
    isbn: Array.isArray(d?.isbn) ? d.isbn[0] : d?.isbn || '',
    subject: Array.isArray(d?.subject) ? d.subject.slice(0, 4).join(', ') : '',
  }));
}

function pickCoins(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((c) => ({
    id: c?.id || '',
    symbol: c?.symbol || '',
    name: c?.name || '',
    price_usd: c?.current_price ?? '',
    market_cap: c?.market_cap ?? '',
    volume_24h: c?.total_volume ?? '',
    change_24h_pct: c?.price_change_percentage_24h ?? '',
    ath: c?.ath ?? '',
  }));
}

function pickEnclaves(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.enclaves)) return payload.enclaves;
  if (Array.isArray(payload?.features)) {
    return payload.features.map((f) => f?.properties || f);
  }
  return payload;
}

export const SOURCES = [
  {
    id: 'demo-posts',
    group: 'Start here',
    name: 'Demo posts',
    blurb: 'JSONPlaceholder sample rows — always CORS-open, good for a first export.',
    docs: 'https://jsonplaceholder.typicode.com/',
    kind: 'http',
    params: [],
    buildUrl: () => 'https://jsonplaceholder.typicode.com/posts',
  },
  {
    id: 'rest-countries',
    group: 'Places',
    name: 'Countries',
    blurb: 'Names, capitals, population, area, currencies — REST Countries.',
    docs: 'https://restcountries.com/',
    kind: 'http',
    params: [],
    buildUrl: () =>
      'https://restcountries.com/v3.1/all?fields=name,cca2,region,subregion,capital,population,area,currencies,languages,unMember',
    pick: pickSlimCountries,
  },
  {
    id: 'world-bank',
    group: 'Finance',
    name: 'World Bank indicator',
    blurb: 'One development indicator over time for a country (or the world).',
    docs: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392',
    kind: 'http',
    params: [
      {
        key: 'place',
        label: 'Place',
        type: 'select',
        options: WORLD_BANK_PLACES,
        default: 'USA',
      },
      {
        key: 'indicator',
        label: 'Indicator',
        type: 'select',
        options: WORLD_BANK_INDICATORS,
        default: 'NY.GDP.MKTP.CD',
      },
    ],
    buildUrl: (p) =>
      `https://api.worldbank.org/v2/country/${q(p.place || 'USA')}/indicator/${q(p.indicator || 'NY.GDP.MKTP.CD')}?format=json&per_page=80`,
    pick: pickWorldBank,
  },
  {
    id: 'frankfurter',
    group: 'Finance',
    name: 'FX rates (ECB)',
    blurb: 'Daily foreign-exchange rates against a base currency. No key.',
    docs: 'https://www.frankfurter.app/docs/',
    kind: 'http',
    params: [
      {
        key: 'base',
        label: 'Base',
        type: 'select',
        options: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].map((c) => ({
          value: c,
          label: c,
        })),
        default: 'USD',
      },
    ],
    buildUrl: (p) => `https://api.frankfurter.app/latest?from=${q(p.base || 'USD')}`,
    pick: pickRates,
  },
  {
    id: 'coingecko',
    group: 'Finance',
    name: 'Crypto markets',
    blurb: 'CoinGecko top coins by market cap in USD. Public, rate-limited.',
    docs: 'https://docs.coingecko.com/',
    kind: 'http',
    params: [],
    buildUrl: () =>
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1',
    pick: pickCoins,
  },
  {
    id: 'f500-headlines',
    group: 'Finance',
    name: 'Fortune 500 10-K headlines',
    blurb: 'Filed FY metrics from the EDGAR snapshot already on this site. No live SEC call.',
    docs: '/fortune-500/',
    kind: 'http',
    sameOrigin: true,
    params: [],
    buildUrl: () => '/fortune-500/data/headlines-snapshot.json',
    pick: pickHeadlines,
  },
  {
    id: 'f500-prices',
    group: 'Finance',
    name: 'Yahoo daily prices',
    blurb: 'OHLCV via this site’s /api/f500-prices proxy. Needs the deployed API, not a static server.',
    docs: '/fortune-500/',
    kind: 'http',
    sameOrigin: true,
    params: [
      { key: 'ticker', label: 'Ticker', type: 'text', default: 'AAPL', placeholder: 'AAPL' },
      {
        key: 'range',
        label: 'Range',
        type: 'select',
        options: [
          { value: '1y', label: '1 year' },
          { value: '5y', label: '5 years' },
          { value: 'max', label: 'Max' },
        ],
        default: '1y',
      },
    ],
    buildUrl: (p) => {
      const ticker = String(p.ticker || 'AAPL')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9.-]/g, '')
        .slice(0, 10);
      const range = ['1y', '5y', 'max'].includes(p.range) ? p.range : '1y';
      return `/api/f500-prices?ticker=${q(ticker || 'AAPL')}&range=${q(range)}`;
    },
    pick: pickPrices,
  },
  {
    id: 'open-meteo',
    group: 'Places',
    name: 'Weather forecast',
    blurb: 'Open-Meteo 7-day daily forecast. Defaults to New York City.',
    docs: 'https://open-meteo.com/en/docs',
    kind: 'http',
    params: [
      { key: 'latitude', label: 'Latitude', type: 'text', default: '40.71' },
      { key: 'longitude', label: 'Longitude', type: 'text', default: '-74.01' },
    ],
    buildUrl: (p) => {
      const lat = Number(p.latitude);
      const lon = Number(p.longitude);
      const latitude = Number.isFinite(lat) ? lat : 40.71;
      const longitude = Number.isFinite(lon) ? lon : -74.01;
      return `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`;
    },
    pick: pickOpenMeteo,
  },
  {
    id: 'usgs-quakes',
    group: 'Places',
    name: 'Earthquakes',
    blurb: 'USGS GeoJSON feed — magnitude, place, time, coordinates.',
    docs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    kind: 'http',
    params: [
      {
        key: 'feed',
        label: 'Feed',
        type: 'select',
        options: USGS_FEEDS,
        default: 'significant_month',
      },
    ],
    buildUrl: (p) =>
      `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${q(p.feed || 'significant_month')}.geojson`,
  },
  {
    id: 'census-states',
    group: 'Public data',
    name: 'US state population',
    blurb: 'Census ACS 1-year population by state. Header-row JSON.',
    docs: 'https://www.census.gov/data/developers/data-sets/acs-1year.html',
    kind: 'http',
    params: [],
    buildUrl: () => 'https://api.census.gov/data/2023/acs/acs1?get=NAME,B01003_001E&for=state:*',
  },
  {
    id: 'nyc-311',
    group: 'NYC',
    name: 'NYC 311 requests',
    blurb: 'Recent service requests from NYC Open Data (Socrata).',
    docs: 'https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9',
    kind: 'http',
    params: [
      { key: 'limit', label: 'Rows', type: 'select', default: '100', options: [
        { value: '50', label: '50' },
        { value: '100', label: '100' },
        { value: '250', label: '250' },
      ] },
    ],
    buildUrl: (p) => {
      const limit = ['50', '100', '250'].includes(String(p.limit)) ? p.limit : '100';
      return `https://data.cityofnewyork.us/resource/erm2-nwe9.json?$limit=${limit}&$order=created_date DESC&$select=unique_key,created_date,agency_name,complaint_type,descriptor,borough,incident_zip,status`;
    },
  },
  {
    id: 'nyc-restaurants',
    group: 'NYC',
    name: 'NYC restaurant inspections',
    blurb: 'DOHMH restaurant grades and inspection dates.',
    docs: 'https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j',
    kind: 'http',
    params: [
      { key: 'boro', label: 'Borough', type: 'select', default: 'Manhattan', options: [
        { value: 'Manhattan', label: 'Manhattan' },
        { value: 'Brooklyn', label: 'Brooklyn' },
        { value: 'Queens', label: 'Queens' },
        { value: 'Bronx', label: 'Bronx' },
        { value: 'Staten Island', label: 'Staten Island' },
      ] },
    ],
    buildUrl: (p) => {
      const boro = String(p.boro || 'Manhattan');
      return `https://data.cityofnewyork.us/resource/43nn-pn8j.json?$limit=150&boro=${q(boro)}&$select=dba,boro,cuisine_description,inspection_date,grade,score,violation_description,zipcode`;
    },
  },
  {
    id: 'nyc-collisions',
    group: 'NYC',
    name: 'NYC motor vehicle collisions',
    blurb: 'Recent NYPD crash records, one row per collision.',
    docs: 'https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95',
    kind: 'http',
    params: [],
    buildUrl: () =>
      'https://data.cityofnewyork.us/resource/h9gi-nx95.json?$limit=100&$order=crash_date DESC&$select=collision_id,crash_date,crash_time,borough,zip_code,latitude,longitude,number_of_persons_injured,number_of_persons_killed,contributing_factor_vehicle_1',
  },
  {
    id: 'nyc-enclaves',
    group: 'NYC',
    name: 'World in NYC enclaves',
    blurb: 'The committed enclave catalog from /world-in-nyc/ — same-origin JSON.',
    docs: '/world-in-nyc/',
    kind: 'http',
    sameOrigin: true,
    params: [],
    buildUrl: () => '/world-in-nyc/data/enclaves.json',
    pick: pickEnclaves,
  },
  {
    id: 'open-library',
    group: 'Public data',
    name: 'Open Library search',
    blurb: 'Book titles, authors, first publish year. No key.',
    docs: 'https://openlibrary.org/developers/api',
    kind: 'http',
    params: [{ key: 'q', label: 'Search', type: 'text', default: 'financial modeling', placeholder: 'title or author' }],
    buildUrl: (p) =>
      `https://openlibrary.org/search.json?q=${q(p.q || 'financial modeling')}&limit=40`,
    pick: pickLibrary,
  },
  {
    id: 'github-repos',
    group: 'Public data',
    name: 'GitHub repositories',
    blurb: 'Public repo search. Unauthenticated, so GitHub may rate-limit.',
    docs: 'https://docs.github.com/en/rest/search/search',
    kind: 'http',
    params: [{ key: 'q', label: 'Search', type: 'text', default: 'spreadsheet language:JavaScript', placeholder: 'search query' }],
    buildUrl: (p) =>
      `https://api.github.com/search/repositories?q=${q(p.q || 'spreadsheet')}&sort=stars&per_page=30`,
    pick: pickGithub,
  },
  {
    id: 'custom-url',
    group: 'Bring your own',
    name: 'Fetch a JSON URL',
    blurb: 'GET any https JSON endpoint the browser is allowed to read. No server proxy.',
    docs: '',
    kind: 'http',
    params: [
      {
        key: 'url',
        label: 'URL',
        type: 'text',
        default: '',
        placeholder: 'https://example.com/data.json',
      },
    ],
    buildUrl: (p) => {
      const parsed = parseFetchUrl(p.url);
      if (parsed.error) {
        const err = new Error(parsed.error);
        err.status = 400;
        throw err;
      }
      return parsed.url;
    },
  },
  {
    id: 'paste-json',
    group: 'Bring your own',
    name: 'Paste JSON',
    blurb: 'Skip the network. Paste an array or object and pick columns.',
    docs: '',
    kind: 'paste',
    params: [
      {
        key: 'json',
        label: 'JSON',
        type: 'textarea',
        default: '[\n  {"name": "Ada", "year": 1815, "field": "math"},\n  {"name": "Alan", "year": 1912, "field": "cs"}\n]\n',
      },
    ],
  },
];

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id) || null;
}

export function defaultParams(source) {
  const out = {};
  for (const param of source?.params || []) {
    if (param.default != null) out[param.key] = param.default;
  }
  return out;
}

export function groupsOf(sources = SOURCES) {
  const groups = [];
  const seen = new Map();
  for (const source of sources) {
    const name = source.group || 'Other';
    if (!seen.has(name)) {
      const g = { name, sources: [] };
      seen.set(name, g);
      groups.push(g);
    }
    seen.get(name).sources.push(source);
  }
  return groups;
}

export function parsePastedJson(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { error: 'Paste some JSON first.' };
  try {
    return { data: JSON.parse(text) };
  } catch (err) {
    return { error: `Could not parse JSON (${err.message || 'syntax'}).` };
  }
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (text.length > MAX_JSON_BYTES) {
    throw new Error(`Response is larger than ${MAX_JSON_BYTES / 1_000_000} MB.`);
  }
  if (!text.trim()) throw new Error('Empty response.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Response was not JSON.');
  }
}

function corsHint(err, url) {
  const msg = String(err?.message || err || '');
  if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
    return `The browser could not read ${url} (often CORS). Paste the JSON instead, or pick a catalog source.`;
  }
  return msg;
}

/**
 * Fetch a source (or parse pasted JSON) and return a table plus fetch metadata.
 */
export async function loadSource(source, params = {}, fetchImpl = fetch) {
  if (!source) throw new Error('Pick a source.');
  if (source.kind === 'paste') {
    const parsed = parsePastedJson(params.json);
    if (parsed.error) throw new Error(parsed.error);
    const data = source.pick ? source.pick(parsed.data) : parsed.data;
    return {
      table: tableFromJson(data),
      url: '',
      fetchedAt: new Date().toISOString(),
      sourceId: source.id,
      name: source.name,
    };
  }

  const url = source.buildUrl(params);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    throw new Error(corsHint(err, url));
  }
  if (!res.ok) {
    const extra =
      source.id === 'f500-prices'
        ? ' Yahoo prices need the deployed /api/f500-prices route (vercel dev or inaayat.xyz).'
        : '';
    throw new Error(`HTTP ${res.status} from ${url}.${extra}`);
  }
  const json = await readJsonResponse(res);
  const data = source.pick ? source.pick(json) : json;
  return {
    table: tableFromJson(data),
    url,
    fetchedAt: new Date().toISOString(),
    sourceId: source.id,
    name: source.name,
  };
}
