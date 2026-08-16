import { countryIndex, countryMatchExpr, countryMatches, countriesForGroup } from './countries.js';
import { isHistoric, enclavesForEra, tagCurrentEnclaves } from './era.js';
import {
  lookupEd,
  shareLine,
  sortStatsRows,
  statsRows,
  tagVoteWinners,
  voteBarHtml,
  winnerLabel,
  winnerMatchExpr,
} from './votes.js';

const BORO_FROM_CD = {
  1: 'Manhattan',
  2: 'Bronx',
  3: 'Brooklyn',
  4: 'Queens',
  5: 'Staten Island',
};

const MOBILE_MQ = '(max-width: 860px)';

/* Future: political overlays (City Council, Congress, community, Assembly,
   Senate) from https://libguides.nypl.org/nycboundaries/political
   GeoJSON is in data/overlays/. ensureOverlay() below is unused until the
   toggles return to the UI. */
const OVERLAY_COLORS = {
  council: '#1c1c1c',
  congress: '#cf4520',
  cd: '#3d6ea8',
  assembly: '#3a7d44',
  senate: '#7b3fa0',
};

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const $ = (id) => document.getElementById(id);

function isMobileUi() {
  try {
    return window.matchMedia(MOBILE_MQ).matches;
  } catch {
    return false;
  }
}

function formatCD(code) {
  if (code == null) return '—';
  const boro = BORO_FROM_CD[Math.floor(code / 100)] || '';
  return `${boro} ${code % 100}`.trim();
}

function regionColor(catalog, regionId) {
  return catalog.regions.find((r) => r.id === regionId)?.color || '#cfc6b8';
}

function colorMatch(catalog, prop = 'r') {
  const expr = ['match', ['get', prop]];
  for (const region of catalog.regions) expr.push(region.id, region.color);
  expr.push('#cfc6b8');
  return expr;
}

function parseQuery() {
  const params = new URLSearchParams(location.search);
  const ed = Number(params.get('ed') || '');
  const rawView = params.get('view');
  const view = rawView === 'world' || rawView === 'stats' ? rawView : 'nyc';
  const country = (params.get('country') || '').toUpperCase() || null;
  return {
    ed: Number.isFinite(ed) && ed > 0 ? ed : null,
    view,
    country: country && country.length === 3 ? country : null,
    historic: params.get('historic') === '1',
  };
}

function setQuery({ ed, view, country, historic }) {
  const url = new URL(location.href);
  if (view === 'world' || view === 'stats') url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  if (ed) url.searchParams.set('ed', String(ed));
  else url.searchParams.delete('ed');
  if (country) url.searchParams.set('country', country);
  else url.searchParams.delete('country');
  if (historic) url.searchParams.set('historic', '1');
  else url.searchParams.delete('historic');
  history.replaceState(null, '', url);
}

function enclaveMatches(enc, q) {
  if (!q) return true;
  const hay = `${enc.name} ${enc.group} ${enc.region} ${(enc.places || []).join(' ')} ${enc.note || ''}`.toLowerCase();
  return hay.includes(q);
}

async function loadStyle() {
  try {
    const res = await fetch('https://tiles.openfreemap.org/styles/positron');
    if (!res.ok) throw new Error('openfreemap');
    return res.json();
  } catch {
    return OSM_STYLE;
  }
}

function paintOverlays(map, name, color) {
  if (map.getLayer(`${name}-line`)) return;
  map.addLayer({
    id: `${name}-line`,
    type: 'line',
    source: name,
    paint: {
      'line-color': color,
      'line-width': 1.6,
      'line-opacity': 0.85,
    },
  });
}

async function ensureOverlay(map, name) {
  if (map.getSource(name)) {
    map.setLayoutProperty(`${name}-line`, 'visibility', 'visible');
    return;
  }
  const res = await fetch(`./data/overlays/${name}.geojson`);
  const geo = await res.json();
  map.addSource(name, { type: 'geojson', data: geo });
  paintOverlays(map, name, OVERLAY_COLORS[name]);
}

void ensureOverlay;
void formatCD;

function eraKeys(includeHistoric) {
  return includeHistoric
    ? { e: 'e', r: 'r', rs: 'rs' }
    : { e: 'ec', r: 'rc', rs: 'rsc' };
}

function applyFilter(map, catalog, filter, includeHistoric, votes) {
  const fill = map.getLayer('ed-fill');
  if (!fill) return;
  const keys = eraKeys(includeHistoric);
  if (filter?.kind === 'enclave' && votes) {
    map.setPaintProperty('ed-fill', 'fill-color', winnerMatchExpr(votes.candidates));
    map.setFilter('ed-fill', ['in', filter.index, ['get', keys.e]]);
    return;
  }
  map.setPaintProperty('ed-fill', 'fill-color', colorMatch(catalog, keys.r));
  if (!filter) {
    map.setFilter('ed-fill', ['!=', ['get', keys.r], '']);
    return;
  }
  if (filter.kind === 'region') {
    map.setFilter('ed-fill', ['in', filter.id, ['get', keys.rs]]);
    return;
  }
  if (filter.kind === 'enclave') {
    map.setFilter('ed-fill', ['in', filter.index, ['get', keys.e]]);
  }
}

function setListCount(n, noun) {
  const el = $('list-count');
  if (!el) return;
  const plural = { enclave: 'enclaves', country: 'countries', place: 'places' };
  el.textContent = `${n} ${n === 1 ? noun : plural[noun] || `${noun}s`}`;
}

function renderRegions(catalog, filter, onPick) {
  const root = $('regions');
  root.innerHTML = '';
  const all = document.createElement('button');
  all.type = 'button';
  all.className = `win-chip${!filter ? ' is-on' : ''}`;
  all.textContent = 'All groups';
  all.addEventListener('click', () => onPick(null));
  root.append(all);
  for (const region of catalog.regions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `win-chip${filter?.kind === 'region' && filter.id === region.id ? ' is-on' : ''}`;
    btn.style.setProperty('--swatch', region.color);
    btn.innerHTML = `<span class="swatch"></span>${region.label}`;
    btn.addEventListener('click', () => onPick({ kind: 'region', id: region.id }));
    root.append(btn);
  }
}

function syncFilterToggle(catalog, filter) {
  const btn = $('filter-toggle');
  if (!btn) return;
  const on = filter?.kind === 'region';
  btn.classList.toggle('is-on', on);
  if (on) {
    const region = catalog.regions.find((r) => r.id === filter.id);
    btn.style.setProperty('--swatch', region?.color || '#888');
    btn.innerHTML = `<span class="swatch"></span>${region?.label || 'Filters'}`;
  } else {
    btn.style.removeProperty('--swatch');
    btn.textContent = 'Filters';
  }
}

function renderList(catalog, filter, query, onPick, includeHistoric, votes) {
  const root = $('enclave-list');
  root.innerHTML = '';
  const q = query.trim().toLowerCase();
  const items = enclavesForEra(catalog.enclaves, includeHistoric).filter((enc) => {
    if (!enclaveMatches(enc, q)) return false;
    if (filter?.kind === 'region') return enc.region === filter.id;
    return true;
  });
  setListCount(items.length, 'enclave');
  for (const enc of items) {
    const i = catalog.enclaves.indexOf(enc);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `win-item${filter?.kind === 'enclave' && filter.index === i ? ' is-on' : ''}`;
    btn.innerHTML = `<span class="win-item-swatch" style="background:${regionColor(catalog, enc.region)}"></span><span class="win-item-text"><span class="win-item-name">${enc.name}</span><span class="win-item-meta">${enc.group}${isHistoric(enc) ? ' · historic' : ''}</span></span>`;
    btn.addEventListener('click', () => onPick({ kind: 'enclave', index: i, id: enc.id }));
    root.append(btn);
  }
  if (!items.length) {
    root.innerHTML = '<p class="win-item-meta">No enclaves match.</p>';
  }
}

function countryPassesFilter(row, filter) {
  if (!filter) return true;
  if (filter.kind === 'region') return row.regions.includes(filter.id);
  if (filter.kind === 'enclave') return row.enclaves.some((enc) => enc.id === filter.id);
  return true;
}

function renderCountryList(countries, filter, query, onPick, catalog) {
  const root = $('enclave-list');
  root.innerHTML = '';
  const q = query.trim().toLowerCase();
  const items = countries.filter((row) => {
    if (!countryMatches(row, q)) return false;
    return countryPassesFilter(row, filter);
  });
  setListCount(items.length, 'country');
  for (const row of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'win-item';
    const nhood = row.places.join(', ');
    const color = row.regions.length === 1 ? regionColor(catalog, row.regions[0]) : '#6b5f5e';
    btn.innerHTML = `<span class="win-item-swatch" style="background:${color}"></span><span class="win-item-text"><span class="win-item-name">${row.name}</span><span class="win-item-meta">${nhood}</span></span>`;
    btn.addEventListener('click', () => onPick(row.iso));
    root.append(btn);
  }
  if (!items.length) {
    root.innerHTML = '<p class="win-item-meta">No countries match.</p>';
  }
}

function renderEnclaveItems(items, catalog, onPick) {
  const root = $('enclave-list');
  root.innerHTML = '';
  setListCount(items.length, 'enclave');
  for (const enc of items) {
    const i = catalog.enclaves.indexOf(enc);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'win-item';
    const places = (enc.places || []).join(', ');
    btn.innerHTML = `<span class="win-item-swatch" style="background:${regionColor(catalog, enc.region)}"></span><span class="win-item-text"><span class="win-item-name">${enc.name}</span><span class="win-item-meta">${enc.group}${isHistoric(enc) ? ' · historic' : ''}${places ? ` · ${places}` : ''}</span></span>`;
    btn.addEventListener('click', () => onPick({ kind: 'enclave', index: i, id: enc.id }));
    root.append(btn);
  }
  if (!items.length) {
    root.innerHTML = '<p class="win-item-meta">No NYC enclaves listed.</p>';
  }
}

function renderCountryEnclaves(row, catalog, query, includeHistoric, onPick) {
  const q = query.trim().toLowerCase();
  const items = enclavesForEra(row.enclaves, includeHistoric).filter((enc) => enclaveMatches(enc, q));
  renderEnclaveItems(items, catalog, onPick);
}

function districtEnclaves(props, catalog, includeHistoric) {
  return (props.e || [])
    .map((i) => catalog.enclaves[i])
    .filter((enc) => enc && (includeHistoric || !isHistoric(enc)));
}

function renderEnclaveFocus(enc, catalog, countryByIso, onCountry) {
  const root = $('enclave-list');
  root.innerHTML = '';
  const places = enc.places || [];
  const origins = countriesForGroup(enc.group)
    .map((iso) => countryByIso.get(iso))
    .filter(Boolean);
  const color = regionColor(catalog, enc.region);
  setListCount(places.length, 'place');

  if (enc.note) {
    const note = document.createElement('p');
    note.className = 'win-focus-note';
    note.textContent = enc.note;
    root.append(note);
  }
  if (places.length) {
    const label = document.createElement('p');
    label.className = 'win-kicker win-focus-label';
    label.textContent = 'Neighborhoods';
    root.append(label);
    for (const place of places) {
      const row = document.createElement('div');
      row.className = 'win-item';
      row.innerHTML = `<span class="win-item-swatch" style="background:${color}"></span><span class="win-item-text"><span class="win-item-name">${place}</span></span>`;
      root.append(row);
    }
  }
  if (origins.length) {
    const label = document.createElement('p');
    label.className = 'win-kicker win-focus-label';
    label.textContent = 'Origin countries';
    root.append(label);
    for (const row of origins) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'win-item';
      btn.innerHTML = `<span class="win-item-text"><span class="win-item-name">${row.name}</span></span>`;
      btn.addEventListener('click', () => onCountry(row.iso));
      root.append(btn);
    }
  }
  if (!places.length && !origins.length && !enc.note) {
    root.innerHTML = '<p class="win-item-meta">No neighborhood notes for this enclave.</p>';
  }
}

function countryCardHtml(row, catalog, includeHistoric) {
  const n = enclavesForEra(row.enclaves, includeHistoric).length;
  return `
    <h3>${row.name}</h3>
    <p class="mono">${n} NYC ${n === 1 ? 'enclave' : 'enclaves'} — tap one to open it on the map.</p>
  `;
}

function renderLegend(catalog, filter, view = 'nyc', votes = null) {
  const root = $('legend');
  if (view === 'nyc' && filter?.kind === 'enclave' && votes) {
    const rows = votes.candidates.map((c) => `<div class="win-legend-row"><i style="background:${c.color}"></i>${c.label}</div>`).join('');
    root.innerHTML = `<h3>${catalog.enclaves[filter.index].name}</h3>${rows}<div class="win-legend-row"><i style="background:#cfc6b8;outline:1px solid #1c1c1c22"></i>No votes / tie</div>`;
    return;
  }
  const regions = filter?.kind === 'region'
    ? catalog.regions.filter((r) => r.id === filter.id)
    : catalog.regions;
  const rows = regions.map((r) => `<div class="win-legend-row"><i style="background:${r.color}"></i>${r.label}</div>`).join('');
  const title = filter?.kind === 'enclave' ? `<h3>${catalog.enclaves[filter.index].name}</h3>` : '';
  const extra = view === 'world'
    ? `<div class="win-legend-row"><i style="background:#6b5f5e"></i>Several regions</div><div class="win-legend-row"><i style="background:#e8e0d2;outline:1px solid #1c1c1c22"></i>None listed</div>`
    : `<div class="win-legend-row"><i style="background:#e8e0d2;outline:1px solid #1c1c1c22"></i>None listed</div>`;
  root.innerHTML = `${title}${rows}${extra}`;
}

function renderVoteSummary(filter, catalog, votes) {
  const root = $('vote-summary');
  if (!root) return;
  if (filter?.kind !== 'enclave' || !votes) {
    root.hidden = true;
    root.innerHTML = '';
    return;
  }
  const enc = catalog.enclaves[filter.index];
  if (isHistoric(enc)) {
    root.hidden = false;
    root.innerHTML = '<p class="mono">Historic — not this 2025 electorate.</p>';
    return;
  }
  const roll = votes.enclaves?.[enc.id];
  if (!roll?.primary?.n) {
    root.hidden = false;
    root.innerHTML = '<p class="mono">No 2025 mayor votes on primary districts.</p>';
    return;
  }
  const mixed = roll.all.n > roll.primary.n
    ? `<div class="mono">Including mixed districts (${roll.all.n}): ${shareLine(roll.all.v, votes.candidates)}</div>`
    : '';
  root.hidden = false;
  root.innerHTML = `${voteBarHtml(roll.primary.v, votes.candidates, `2025 mayor · ${roll.primary.n} primary EDs`)}${mixed}`;
}

function cardHtml(props, catalog, includeHistoric, votes) {
  const vec = votes ? lookupEd(votes, props.ed) : null;
  const bar = vec ? voteBarHtml(vec, votes.candidates) : '';
  return `
    <h3>AD ${props.ad} · ED ${String(props.n).padStart(3, '0')}</h3>
    ${bar}
    <dl class="win-kv">
      <dt>Borough</dt><dd>${props.b || '—'}</dd>
      <dt>Neighborhood</dt><dd>${props.nta || '—'}</dd>
    </dl>
  `;
}

function enclaveCardHtml(enc) {
  return `
    <h3>${enc.name}</h3>
    <p class="mono">${enc.group}${isHistoric(enc) ? ' · historic' : ''}</p>
  `;
}

function sheetSnap() {
  return $('rail')?.dataset.snap || 'peek';
}

function fitPadding() {
  if (!isMobileUi()) return 48;
  const snap = sheetSnap();
  const vh = window.innerHeight || 800;
  const bottom = snap === 'full'
    ? Math.round(vh * 0.88)
    : snap === 'half'
      ? Math.min(Math.round(vh * 0.45), 420)
      : 72;
  return { top: 56, left: 16, right: 16, bottom: bottom + 8 };
}

function fitEnclave(map, ed, index) {
  const matching = ed.features.filter((f) => (f.properties.e || []).includes(index));
  if (!matching.length) return;
  const b = new maplibregl.LngLatBounds();
  for (const f of matching) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      for (const pt of poly[0]) b.extend(pt);
    }
  }
  if (!b.isEmpty()) map.fitBounds(b, { padding: fitPadding(), maxZoom: 13, duration: 600 });
}

function fitCountry(worldMap, feature) {
  if (!feature?.geometry) return;
  const b = new maplibregl.LngLatBounds();
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const pt of ring) b.extend(pt);
    }
  }
  if (!b.isEmpty()) worldMap.fitBounds(b, { padding: 48, maxZoom: 5, duration: 600 });
}

function setSheetSnap(snap) {
  const rail = $('rail');
  const toggle = $('browse-toggle');
  const next = snap === 'full' || snap === 'half' ? snap : 'peek';
  rail.dataset.snap = next;
  const open = next !== 'peek';
  rail.classList.toggle('is-open', next === 'full');
  document.body.classList.toggle('win-sheet-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  const closeLabel = document.body.classList.contains('win-stats-view') ? 'Table' : 'Map';
  toggle.textContent = open ? closeLabel : 'Browse';
  const sheetClose = $('sheet-close');
  if (sheetClose) sheetClose.textContent = closeLabel;
}

function setSheetOpen(open) {
  if (!open) {
    setSheetSnap('peek');
    return;
  }
  setSheetSnap(sheetSnap() === 'full' ? 'full' : 'half');
}

function wireSheetDrag(onResize) {
  const handle = $('sheet-handle');
  const rail = $('rail');
  if (!handle) return;
  let startY = 0;
  let dragging = false;

  const snaps = ['peek', 'half', 'full'];
  const onMove = (ev) => {
    if (!dragging) return;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    const dy = y - startY;
    const i = snaps.indexOf(sheetSnap());
    if (dy > 56 && i > 0) {
      setSheetSnap(snaps[i - 1]);
      startY = y;
    } else if (dy < -56 && i < snaps.length - 1) {
      setSheetSnap(snaps[i + 1]);
      startY = y;
    }
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    onResize();
  };
  const onDown = (ev) => {
    dragging = true;
    startY = ev.touches ? ev.touches[0].clientY : ev.clientY;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };
  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('click', () => {
    const i = snaps.indexOf(sheetSnap());
    setSheetSnap(i >= 2 ? 'peek' : snaps[i + 1]);
    onResize();
  });
  void rail;
}

async function main() {
  const status = $('status');
  const start = parseQuery();
  const [catalog, ed, world, style, votes] = await Promise.all([
    fetch('./data/enclaves.json').then((r) => r.json()),
    fetch('./data/ed.geojson').then((r) => r.json()),
    fetch('./data/world.geojson').then((r) => r.json()),
    loadStyle(),
    fetch('./data/mayor-2025.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const regionColors = Object.fromEntries(catalog.regions.map((r) => [r.id, r.color]));
  regionColors.mixed = '#6b5f5e';
  tagCurrentEnclaves(ed.features, catalog.enclaves);
  if (votes) tagVoteWinners(ed.features, votes);
  let includeHistoric = start.historic;
  let countries = countryIndex(enclavesForEra(catalog.enclaves, includeHistoric), world.features);
  let countryByIso = new Map(countries.map((row) => [row.iso, row]));
  const worldByIso = new Map(world.features.map((f) => [f.properties.iso, f]));
  const worldStyle = typeof structuredClone === 'function' ? structuredClone(style) : JSON.parse(JSON.stringify(style));

  if (start.view === 'world') {
    $('map').hidden = true;
    $('world-map').hidden = false;
  } else if (start.view === 'stats') {
    $('map').hidden = true;
    $('world-map').hidden = true;
    $('stats-pane').hidden = false;
    document.body.classList.add('win-stats-view');
  }

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: [-73.9769, 40.72103],
    zoom: isMobileUi() ? 10.1 : 10.5,
    maxZoom: 16,
    minZoom: 9,
    attributionControl: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  let worldMap = null;
  let filter = null;
  let hoverId = null;
  let worldHover = null;
  let selectedId = start.ed;
  let selectedCountry = start.country && countryByIso.has(start.country) ? start.country : null;
  let currentView = start.view;
  let nycReady = false;
  let statsSort = { key: 'm', dir: 'desc' };
  const edIndex = new Map(ed.features.map((f) => [f.properties.ed, f]));

  function syncQuery() {
    setQuery({
      view: currentView,
      ed: currentView === 'nyc' ? selectedId : null,
      country: currentView === 'world' ? selectedCountry : null,
      historic: includeHistoric,
    });
  }

  function syncHistoricBtn() {
    const btn = $('historic-toggle');
    btn.classList.toggle('is-on', includeHistoric);
    btn.setAttribute('aria-pressed', includeHistoric ? 'true' : 'false');
  }
  syncHistoricBtn();

  function updateHero() {
    const n = enclavesForEra(catalog.enclaves, includeHistoric).length;
    const c = countries.length;
    const el = $('hero-count');
    if (el) el.textContent = `${n} communities · ${c} origin countries`;
  }

  function rebuildCountries() {
    countries = countryIndex(enclavesForEra(catalog.enclaves, includeHistoric), world.features);
    countryByIso = new Map(countries.map((row) => [row.iso, row]));
    if (worldMap?.getLayer('world-fill')) {
      worldMap.setPaintProperty('world-fill', 'fill-color', countryMatchExpr(countries, regionColors));
    }
    updateHero();
  }

  function resizeMap() {
    requestAnimationFrame(() => {
      map.resize();
      worldMap?.resize();
    });
  }

  function matchingCountryIsos() {
    return countries.filter((row) => countryPassesFilter(row, filter)).map((row) => row.iso);
  }

  function applyWorldPaint() {
    if (!worldMap?.getLayer('world-fill')) return;
    const isos = matchingCountryIsos();
    worldMap.setPaintProperty('world-fill', 'fill-opacity', [
      'case',
      ['!', ['in', ['get', 'iso'], ['literal', isos]]], 0.16,
      ['boolean', ['feature-state', 'selected'], false], 0.9,
      ['boolean', ['feature-state', 'hover'], false], 0.82,
      0.7,
    ]);
  }

  function formatPct(n) {
    return n == null ? '—' : `${Math.round(n)}%`;
  }

  function renderStatsTable() {
    const table = $('stats-table');
    if (!table) return;
    const kicker = $('stats-pane').querySelector('.win-kicker');
    const q = $('search').value.trim().toLowerCase();
    const encById = new Map(catalog.enclaves.map((enc) => [enc.id, enc]));
    const all = votes ? statsRows(catalog.enclaves, votes.enclaves) : [];
    const filtered = all.filter((row) => {
      const enc = encById.get(row.id);
      if (!enclaveMatches(enc, q)) return false;
      if (filter?.kind === 'region') return row.region === filter.id;
      return true;
    });
    const rows = sortStatsRows(filtered, statsSort.key, statsSort.dir);
    setListCount(rows.length, 'enclave');
    if (kicker) {
      kicker.textContent = votes
        ? `2025 mayor · ${rows.length} ${rows.length === 1 ? 'enclave' : 'enclaves'}`
        : '2025 mayor';
    }

    const cols = [
      { key: 'name', label: 'Enclave', cls: '' },
      { key: 'group', label: 'Group', cls: 'win-stats-group' },
      { key: 'winner', label: 'Winner', cls: 'win-stats-winner' },
      { key: 'm', label: 'Mamdani', short: 'M', cls: 'win-stats-num' },
      { key: 'c', label: 'Cuomo', short: 'C', cls: 'win-stats-num' },
      { key: 's', label: 'Sliwa', short: 'S', cls: 'win-stats-num' },
      { key: 'n', label: 'EDs', cls: 'win-stats-num win-stats-eds' },
    ];
    const thead = table.tHead || table.createTHead();
    thead.innerHTML = `<tr>${cols.map((col) => {
      const on = statsSort.key === col.key;
      const aria = on ? (statsSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      const label = col.short
        ? `<span class="win-stats-full">${col.label}</span><span class="win-stats-short">${col.short}</span>`
        : col.label;
      return `<th scope="col" class="${col.cls}" data-key="${col.key}" aria-sort="${aria}"><button type="button">${label}</button></th>`;
    }).join('')}</tr>`;

    const tbody = table.tBodies[0] || table.createTBody();
    if (!votes) {
      tbody.innerHTML = '<tr><td colspan="7">2025 mayor results are not loaded.</td></tr>';
      return;
    }
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">No enclaves match.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => {
      const on = filter?.kind === 'enclave' && filter.id === row.id ? ' is-on' : '';
      const color = votes.candidates.find((c) => c.id === row.winner)?.color;
      const swatch = color ? `<i class="win-stats-swatch" style="background:${color}"></i>` : '';
      const nameSwatch = color ? `<i class="win-stats-swatch win-stats-name-swatch" style="background:${color}"></i>` : '';
      return `<tr class="${on.trim()}" data-enclave="${row.id}" tabindex="0">
        <td>${nameSwatch}${row.name}</td>
        <td class="win-stats-group">${row.group}</td>
        <td class="win-stats-winner">${swatch}${winnerLabel(row.winner, votes.candidates)}</td>
        <td class="win-stats-num">${formatPct(row.m)}</td>
        <td class="win-stats-num">${formatPct(row.c)}</td>
        <td class="win-stats-num">${formatPct(row.s)}</td>
        <td class="win-stats-num win-stats-eds">${row.n || '—'}</td>
      </tr>`;
    }).join('');

    const openEnclave = (id) => {
      const index = catalog.enclaves.findIndex((enc) => enc.id === id);
      if (index < 0) return;
      selectedId = null;
      applyView('nyc');
      setFilter({ kind: 'enclave', index, id });
    };
    for (const tr of tbody.querySelectorAll('[data-enclave]')) {
      tr.addEventListener('click', () => openEnclave(tr.dataset.enclave));
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openEnclave(tr.dataset.enclave);
        }
      });
    }
    for (const th of thead.querySelectorAll('th[data-key]')) {
      th.querySelector('button').addEventListener('click', (ev) => {
        ev.stopPropagation();
        const key = th.dataset.key;
        if (statsSort.key === key) statsSort.dir = statsSort.dir === 'asc' ? 'desc' : 'asc';
        else statsSort = { key, dir: key === 'name' || key === 'group' || key === 'winner' ? 'asc' : 'desc' };
        renderStatsTable();
      });
    }
  }

  function refreshList() {
    if (currentView === 'stats') {
      renderStatsTable();
      return;
    }
    if (currentView === 'world') {
      const row = selectedCountry ? countryByIso.get(selectedCountry) : null;
      if (row) {
        renderCountryEnclaves(row, catalog, $('search').value, includeHistoric, (next) => {
          applyView('nyc');
          setFilter(next);
        });
      } else {
        renderCountryList(countries, filter, $('search').value, showCountryCard, catalog);
      }
    } else if (selectedId) {
      const feat = edIndex.get(selectedId);
      $('nyc-lede').hidden = true;
      if (feat) {
        $('rail-kicker').textContent = `AD ${feat.properties.ad} · ED ${String(feat.properties.n).padStart(3, '0')}`;
        $('list-heading').textContent = 'Enclaves';
        const q = $('search').value.trim().toLowerCase();
        const items = districtEnclaves(feat.properties, catalog, includeHistoric)
          .filter((enc) => enclaveMatches(enc, q));
        renderEnclaveItems(items, catalog, setFilter);
      }
    } else if (filter?.kind === 'enclave') {
      const enc = catalog.enclaves[filter.index];
      $('nyc-lede').hidden = true;
      $('rail-kicker').textContent = enc.name;
      $('list-heading').textContent = enc.name;
      renderEnclaveFocus(enc, catalog, countryByIso, (iso) => {
        applyView('world');
        showCountryCard(iso);
      });
    } else {
      $('nyc-lede').hidden = currentView !== 'nyc';
      $('rail-kicker').textContent = 'Election districts';
      $('list-heading').textContent = 'Enclaves';
      renderList(catalog, filter, $('search').value, setFilter, includeHistoric, votes);
    }
  }

  function showCard(edId) {
    const feat = edIndex.get(edId);
    const card = $('card');
    if (!feat) {
      card.hidden = true;
      return;
    }
    $('card-body').innerHTML = cardHtml(feat.properties, catalog, includeHistoric, votes);
    card.hidden = false;
    selectedId = edId;
    syncQuery();
    if (isMobileUi() && sheetSnap() === 'peek') setSheetSnap('half');
    if (map.getSource('ed')) {
      map.removeFeatureState({ source: 'ed' });
      map.setFeatureState({ source: 'ed', id: edId }, { selected: true });
    }
    refreshList();
    resizeMap();
  }

  function showCountryCard(iso) {
    const row = countryByIso.get(iso);
    const card = $('card');
    if (!row) {
      card.hidden = true;
      return;
    }
    $('card-body').innerHTML = countryCardHtml(row, catalog, includeHistoric);
    card.hidden = false;
    selectedCountry = iso;
    $('rail-kicker').textContent = row.name;
    $('list-heading').textContent = `Enclaves in ${row.name}`;
    if (isMobileUi() && sheetSnap() === 'peek') setSheetSnap('half');
    if (worldMap?.getSource('world')) {
      worldMap.removeFeatureState({ source: 'world' });
      worldMap.setFeatureState({ source: 'world', id: iso }, { selected: true });
    }
    applyWorldPaint();
    refreshList();
    syncQuery();
    const feat = worldByIso.get(iso);
    if (feat && worldMap) fitCountry(worldMap, feat);
    resizeMap();
  }

  function applyView(view) {
    currentView = view === 'world' || view === 'stats' ? view : 'nyc';
    document.body.classList.toggle('win-stats-view', currentView === 'stats');
    for (const btn of document.querySelectorAll('.win-view-btn')) {
      const on = btn.dataset.view === currentView;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    $('map').hidden = currentView !== 'nyc';
    $('world-map').hidden = currentView !== 'world';
    $('stats-pane').hidden = currentView !== 'stats';
    $('nyc-lede').hidden = currentView !== 'nyc';
    $('enclave-list').hidden = currentView === 'stats';
    $('legend-toggle').hidden = currentView === 'stats';
    $('legend').hidden = currentView === 'stats' || isMobileUi();
    $('rail-kicker').textContent = currentView === 'world'
      ? 'Origin countries'
      : currentView === 'stats'
        ? '2025 mayor'
        : 'Election districts';
    $('list-heading').textContent = currentView === 'world' ? 'Countries' : 'Enclaves';
    $('search-label').textContent = currentView === 'world'
      ? 'Find a country or neighborhood'
      : 'Find a group or neighborhood';
    $('search').placeholder = currentView === 'world'
      ? 'Italy, Little Italy, Astoria…'
      : 'Chinatown, Little Guyana, Astoria…';
    if ($('rail').classList.contains('is-open') || sheetSnap() !== 'peek') {
      setSheetSnap(sheetSnap() === 'peek' ? 'half' : sheetSnap());
    }

    if (currentView === 'world') ensureWorldMap();

    if (currentView === 'stats') {
      $('card').hidden = true;
    } else if (currentView === 'world') {
      if (map.getSource('ed')) map.removeFeatureState({ source: 'ed' });
      if (selectedCountry) showCountryCard(selectedCountry);
      else $('card').hidden = true;
    } else if (selectedId) {
      showCard(selectedId);
    } else if (filter?.kind === 'enclave') {
      const enc = catalog.enclaves[filter.index];
      $('card-body').innerHTML = enclaveCardHtml(enc);
      $('card').hidden = false;
    } else {
      $('card').hidden = true;
    }

    renderRegions(catalog, filter, setFilter);
    syncFilterToggle(catalog, filter);
    renderLegend(catalog, filter, currentView, votes);
    renderVoteSummary(currentView === 'nyc' ? filter : null, catalog, votes);
    refreshList();
    syncQuery();
    resizeMap();
  }

  function setFilter(next) {
    filter = next;
    applyFilter(map, catalog, filter, includeHistoric, votes);
    applyWorldPaint();
    renderRegions(catalog, filter, setFilter);
    syncFilterToggle(catalog, filter);
    renderLegend(catalog, filter, currentView, votes);
    renderVoteSummary(currentView === 'nyc' ? filter : null, catalog, votes);
    $('clear-filter').hidden = !filter;
    if (filter?.kind === 'region') $('regions').hidden = true;
    $('filter-toggle').setAttribute('aria-expanded', $('regions').hidden ? 'false' : 'true');
    if (filter?.kind === 'enclave' && currentView === 'nyc') {
      selectedId = null;
      const enc = catalog.enclaves[filter.index];
      $('card-body').innerHTML = enclaveCardHtml(enc);
      $('card').hidden = false;
      if (map.getSource('ed')) map.removeFeatureState({ source: 'ed' });
      if (isMobileUi() && sheetSnap() === 'peek') setSheetSnap('half');
      fitEnclave(map, ed, filter.index);
    } else if (currentView === 'nyc' && !selectedId) {
      $('card').hidden = true;
    }
    refreshList();
    resizeMap();
  }

  function setHistoric(on) {
    includeHistoric = !!on;
    syncHistoricBtn();
    if (!includeHistoric && filter?.kind === 'enclave' && isHistoric(catalog.enclaves[filter.index])) {
      filter = null;
      $('clear-filter').hidden = true;
    }
    rebuildCountries();
    if (selectedCountry && !countryByIso.has(selectedCountry)) {
      selectedCountry = null;
      $('card').hidden = true;
      if (worldMap?.getSource('world')) worldMap.removeFeatureState({ source: 'world' });
    }
    applyFilter(map, catalog, filter, includeHistoric, votes);
    applyWorldPaint();
    renderRegions(catalog, filter, setFilter);
    syncFilterToggle(catalog, filter);
    renderLegend(catalog, filter, currentView, votes);
    renderVoteSummary(currentView === 'nyc' ? filter : null, catalog, votes);
    refreshList();
    if (currentView === 'nyc' && selectedId) showCard(selectedId);
    else if (currentView === 'world' && selectedCountry) showCountryCard(selectedCountry);
    syncQuery();
    resizeMap();
  }

  function surpriseMe() {
    const pool = enclavesForEra(catalog.enclaves, includeHistoric);
    if (!pool.length) return;
    const enc = pool[Math.floor(Math.random() * pool.length)];
    const index = catalog.enclaves.indexOf(enc);
    applyView('nyc');
    setFilter({ kind: 'enclave', index, id: enc.id });
  }

  function setRailCollapsed(collapsed) {
    document.body.classList.toggle('win-rail-collapsed', collapsed);
    const btn = $('rail-toggle');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.textContent = collapsed ? 'Show list' : 'Hide list';
    resizeMap();
  }

  function finishLoad() {
    if (!nycReady) return;
    status.hidden = true;
    if (isMobileUi() || currentView === 'stats') $('legend').hidden = true;
    else $('legend').hidden = false;
    syncHistoricBtn();
    updateHero();
    applyFilter(map, catalog, filter, includeHistoric, votes);
    applyView(currentView);
    if (currentView === 'nyc' && selectedId) showCard(selectedId);
    if (currentView === 'world' && selectedCountry) showCountryCard(selectedCountry);
  }

  function wireWorldEvents(nextMap) {
    nextMap.on('mousemove', 'world-fill', (e) => {
      const iso = e.features[0]?.properties?.iso;
      nextMap.getCanvas().style.cursor = countryByIso.has(iso) ? 'pointer' : '';
      if (worldHover && worldHover !== iso) {
        nextMap.setFeatureState({ source: 'world', id: worldHover }, { hover: false });
      }
      worldHover = iso;
      if (iso) nextMap.setFeatureState({ source: 'world', id: iso }, { hover: true });
    });
    nextMap.on('mouseleave', 'world-fill', () => {
      nextMap.getCanvas().style.cursor = '';
      if (worldHover) nextMap.setFeatureState({ source: 'world', id: worldHover }, { hover: false });
      worldHover = null;
    });
    nextMap.on('click', 'world-fill', (e) => {
      const iso = e.features[0]?.properties?.iso;
      if (iso && countryByIso.has(iso)) showCountryCard(iso);
    });
  }

  function ensureWorldMap() {
    if (worldMap) return worldMap;
    worldMap = new maplibregl.Map({
      container: 'world-map',
      style: worldStyle,
      center: [20, 18],
      zoom: isMobileUi() ? 1.15 : 1.45,
      maxZoom: 8,
      minZoom: 0.8,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    worldMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    worldMap.on('load', () => {
      worldMap.addSource('world', {
        type: 'geojson',
        data: world,
        promoteId: 'iso',
      });
      worldMap.addLayer({
        id: 'world-fill',
        type: 'fill',
        source: 'world',
        paint: {
          'fill-color': countryMatchExpr(countries, regionColors),
          'fill-opacity': 0.7,
        },
      });
      worldMap.addLayer({
        id: 'world-line',
        type: 'line',
        source: 'world',
        paint: {
          'line-color': '#1c1c1c',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            1, 0.25,
            4, 0.7,
          ],
          'line-opacity': 0.35,
        },
      });
      worldMap.addLayer({
        id: 'world-selected',
        type: 'line',
        source: 'world',
        paint: {
          'line-color': '#1c1c1c',
          'line-width': 1.8,
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 1,
            0,
          ],
        },
      });
      applyWorldPaint();
      if (currentView === 'world' && selectedCountry) showCountryCard(selectedCountry);
      resizeMap();
    });
    wireWorldEvents(worldMap);
    return worldMap;
  }

  map.on('load', () => {
    map.addSource('ed', {
      type: 'geojson',
      data: ed,
      promoteId: 'ed',
    });
    map.addLayer({
      id: 'ed-dim',
      type: 'fill',
      source: 'ed',
      paint: {
        'fill-color': '#e8e0d2',
        'fill-opacity': 0.35,
      },
    });
    map.addLayer({
      id: 'ed-fill',
      type: 'fill',
      source: 'ed',
      filter: ['!=', ['get', 'rc'], ''],
      paint: {
        'fill-color': colorMatch(catalog, 'rc'),
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.82,
          ['boolean', ['feature-state', 'hover'], false], 0.78,
          0.55,
        ],
      },
    });
    map.addLayer({
      id: 'ed-line',
      type: 'line',
      source: 'ed',
      paint: {
        'line-color': '#1c1c1c',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, 0.15,
          13, 0.6,
          15, 1.1,
        ],
        'line-opacity': 0.35,
      },
    });
    map.addLayer({
      id: 'ed-selected',
      type: 'line',
      source: 'ed',
      paint: {
        'line-color': '#1c1c1c',
        'line-width': 2.2,
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 1,
          0,
        ],
      },
    });
    nycReady = true;
    finishLoad();
  });

  map.on('mousemove', 'ed-fill', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const id = e.features[0]?.id;
    if (hoverId != null && hoverId !== id) {
      map.setFeatureState({ source: 'ed', id: hoverId }, { hover: false });
    }
    hoverId = id;
    if (id != null) map.setFeatureState({ source: 'ed', id }, { hover: true });
  });
  map.on('mouseleave', 'ed-fill', () => {
    map.getCanvas().style.cursor = '';
    if (hoverId != null) map.setFeatureState({ source: 'ed', id: hoverId }, { hover: false });
    hoverId = null;
  });
  map.on('click', 'ed-fill', (e) => {
    const id = e.features[0]?.properties?.ed;
    if (id) showCard(id);
  });
  map.on('click', 'ed-dim', (e) => {
    if (e.features?.[0]?.properties?.ed) showCard(e.features[0].properties.ed);
  });

  $('card-close').addEventListener('click', () => {
    $('card').hidden = true;
    if (currentView === 'world') {
      selectedCountry = null;
      $('rail-kicker').textContent = 'Origin countries';
      $('list-heading').textContent = 'Countries';
      if (worldMap?.getSource('world')) worldMap.removeFeatureState({ source: 'world' });
      applyWorldPaint();
      refreshList();
    } else {
      selectedId = null;
      if (map.getSource('ed')) map.removeFeatureState({ source: 'ed' });
      if (filter?.kind === 'enclave') setFilter(null);
      else refreshList();
    }
    syncQuery();
    resizeMap();
  });
  $('clear-filter').addEventListener('click', () => setFilter(null));
  $('search').addEventListener('input', () => refreshList());
  $('search').addEventListener('focus', () => {
    if (isMobileUi()) {
      setSheetSnap('full');
      resizeMap();
    }
  });

  $('browse-toggle').addEventListener('click', () => {
    const open = sheetSnap() === 'peek';
    setSheetSnap(open ? 'half' : 'peek');
    resizeMap();
  });
  $('sheet-close').addEventListener('click', () => {
    setSheetSnap('peek');
    resizeMap();
  });
  $('legend-toggle').addEventListener('click', () => {
    const legend = $('legend');
    const next = legend.hidden;
    legend.hidden = !next;
    $('legend-toggle').setAttribute('aria-expanded', next ? 'true' : 'false');
  });
  $('filter-toggle').addEventListener('click', () => {
    const box = $('regions');
    box.hidden = !box.hidden;
    $('filter-toggle').setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
  });
  $('surprise').addEventListener('click', surpriseMe);
  $('rail-toggle').addEventListener('click', () => {
    setRailCollapsed(!document.body.classList.contains('win-rail-collapsed'));
  });
  $('view-nyc').addEventListener('click', () => applyView('nyc'));
  $('view-world').addEventListener('click', () => applyView('world'));
  $('view-stats').addEventListener('click', () => applyView('stats'));
  $('historic-toggle').addEventListener('click', () => setHistoric(!includeHistoric));
  wireSheetDrag(resizeMap);

  window.addEventListener('resize', () => {
    if (!isMobileUi()) {
      $('legend').hidden = currentView === 'stats';
      setSheetSnap('peek');
    }
    resizeMap();
  });

  if (currentView === 'world') ensureWorldMap();
  updateHero();
}

main().catch((err) => {
  console.error(err);
  $('status').textContent = 'Could not load the maps.';
});
