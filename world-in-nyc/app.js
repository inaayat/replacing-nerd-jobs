import { countryIndex, countryMatchExpr, countryMatches } from './countries.js';
import { isHistoric, enclavesForEra, tagCurrentEnclaves } from './era.js';

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
  const view = params.get('view') === 'world' ? 'world' : 'nyc';
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
  if (view === 'world') url.searchParams.set('view', 'world');
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

function applyFilter(map, catalog, filter, includeHistoric) {
  const fill = map.getLayer('ed-fill');
  if (!fill) return;
  const keys = eraKeys(includeHistoric);
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

function renderList(catalog, filter, query, onPick, includeHistoric) {
  const root = $('enclave-list');
  root.innerHTML = '';
  const q = query.trim().toLowerCase();
  const items = enclavesForEra(catalog.enclaves, includeHistoric).filter((enc) => {
    if (!enclaveMatches(enc, q)) return false;
    if (filter?.kind === 'region') return enc.region === filter.id;
    return true;
  });
  for (const enc of items) {
    const i = catalog.enclaves.indexOf(enc);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `win-item${filter?.kind === 'enclave' && filter.index === i ? ' is-on' : ''}`;
    btn.innerHTML = `<span class="win-item-name">${enc.name}</span><span class="win-item-meta">${enc.group}${isHistoric(enc) ? ' · historic' : ''}</span>`;
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

function renderCountryList(countries, filter, query, selectedIso, onPick) {
  const root = $('enclave-list');
  root.innerHTML = '';
  const q = query.trim().toLowerCase();
  const items = countries.filter((row) => {
    if (!countryMatches(row, q)) return false;
    return countryPassesFilter(row, filter);
  });
  for (const row of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `win-item${selectedIso === row.iso ? ' is-on' : ''}`;
    const nhood = row.places.slice(0, 3).join(', ');
    btn.innerHTML = `<span class="win-item-name">${row.name}</span><span class="win-item-meta">${nhood}${row.places.length > 3 ? '…' : ''}</span>`;
    btn.addEventListener('click', () => onPick(row.iso));
    root.append(btn);
  }
  if (!items.length) {
    root.innerHTML = '<p class="win-item-meta">No countries match.</p>';
  }
}

function countryCardHtml(row, catalog, includeHistoric) {
  const visible = enclavesForEra(row.enclaves, includeHistoric);
  const pills = visible.map((enc) => {
    const color = regionColor(catalog, enc.region);
    const historic = isHistoric(enc) ? ' · historic' : '';
    return `<button type="button" class="win-enclave-pill" data-enclave="${enc.id}"><strong style="color:${color}">${enc.name}</strong><div class="mono">${enc.group}${historic}</div></button>`;
  }).join('');
  return `
    <h3>${row.name}</h3>
    ${pills || '<p class="mono">No current enclave listed.</p>'}
  `;
}

function renderLegend(catalog, filter, view = 'nyc') {
  const root = $('legend');
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

function cardHtml(props, catalog, includeHistoric) {
  const enclaves = (props.e || [])
    .map((i) => catalog.enclaves[i])
    .filter((enc) => enc && (includeHistoric || !isHistoric(enc)));
  const pills = enclaves.map((enc) => {
    const color = regionColor(catalog, enc.region);
    const historic = isHistoric(enc) ? ' · historic' : '';
    return `<button type="button" class="win-enclave-pill" data-enclave="${enc.id}"><strong style="color:${color}">${enc.name}</strong><div class="mono">${enc.group}${historic}</div>${enc.note ? `<div class="mono">${enc.note}</div>` : ''}</button>`;
  }).join('') || '<p class="mono">Wikipedia does not list a named enclave on this district.</p>';
  return `
    <h3>AD ${props.ad} · ED ${String(props.n).padStart(3, '0')}</h3>
    <dl class="win-kv">
      <dt>Borough</dt><dd>${props.b || '—'}</dd>
      <dt>Neighborhood</dt><dd>${props.nta || '—'}</dd>
    </dl>
    ${pills}
  `;
}

function fitPadding() {
  if (!isMobileUi()) return 48;
  return { top: 56, left: 16, right: 16, bottom: 120 };
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

function setSheetOpen(open) {
  const rail = $('rail');
  const toggle = $('browse-toggle');
  rail.classList.toggle('is-open', open);
  document.body.classList.toggle('win-sheet-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.textContent = open ? 'Map' : 'Browse';
}

function wireSheetDrag(onResize) {
  const handle = $('sheet-handle');
  const rail = $('rail');
  if (!handle) return;
  let startY = 0;
  let dragging = false;

  const onMove = (ev) => {
    if (!dragging) return;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    const dy = y - startY;
    if (dy > 56) setSheetOpen(false);
    else if (dy < -56) setSheetOpen(true);
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
    setSheetOpen(!rail.classList.contains('is-open'));
    onResize();
  });
}

async function main() {
  const status = $('status');
  const start = parseQuery();
  const [catalog, ed, world, style] = await Promise.all([
    fetch('./data/enclaves.json').then((r) => r.json()),
    fetch('./data/ed.geojson').then((r) => r.json()),
    fetch('./data/world.geojson').then((r) => r.json()),
    loadStyle(),
  ]);

  const regionColors = Object.fromEntries(catalog.regions.map((r) => [r.id, r.color]));
  regionColors.mixed = '#6b5f5e';
  tagCurrentEnclaves(ed.features, catalog.enclaves);
  let includeHistoric = start.historic;
  let countries = countryIndex(enclavesForEra(catalog.enclaves, includeHistoric), world.features);
  let countryByIso = new Map(countries.map((row) => [row.iso, row]));
  const worldByIso = new Map(world.features.map((f) => [f.properties.iso, f]));
  const worldStyle = typeof structuredClone === 'function' ? structuredClone(style) : JSON.parse(JSON.stringify(style));

  if (start.view === 'world') {
    $('map').hidden = true;
    $('world-map').hidden = false;
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

  const worldMap = new maplibregl.Map({
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

  let filter = null;
  let hoverId = null;
  let worldHover = null;
  let selectedId = start.ed;
  let selectedCountry = start.country && countryByIso.has(start.country) ? start.country : null;
  let currentView = start.view;
  let nycReady = false;
  let worldReady = false;
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

  function rebuildCountries() {
    countries = countryIndex(enclavesForEra(catalog.enclaves, includeHistoric), world.features);
    countryByIso = new Map(countries.map((row) => [row.iso, row]));
    if (worldMap.getLayer('world-fill')) {
      worldMap.setPaintProperty('world-fill', 'fill-color', countryMatchExpr(countries, regionColors));
    }
  }

  function resizeMap() {
    requestAnimationFrame(() => {
      map.resize();
      worldMap.resize();
    });
  }

  function matchingCountryIsos() {
    return countries.filter((row) => countryPassesFilter(row, filter)).map((row) => row.iso);
  }

  function applyWorldPaint() {
    if (!worldMap.getLayer('world-fill')) return;
    const isos = matchingCountryIsos();
    worldMap.setPaintProperty('world-fill', 'fill-opacity', [
      'case',
      ['!', ['in', ['get', 'iso'], ['literal', isos]]], 0.16,
      ['boolean', ['feature-state', 'selected'], false], 0.9,
      ['boolean', ['feature-state', 'hover'], false], 0.82,
      0.7,
    ]);
  }

  function refreshList() {
    if (currentView === 'world') {
      renderCountryList(countries, filter, $('search').value, selectedCountry, showCountryCard);
    } else {
      renderList(catalog, filter, $('search').value, setFilter, includeHistoric);
    }
  }

  function showCard(edId) {
    const feat = edIndex.get(edId);
    const card = $('card');
    if (!feat) {
      card.hidden = true;
      return;
    }
    $('card-body').innerHTML = cardHtml(feat.properties, catalog, includeHistoric);
    card.hidden = false;
    selectedId = edId;
    syncQuery();
    if (isMobileUi()) setSheetOpen(false);
    if (map.getSource('ed')) {
      map.removeFeatureState({ source: 'ed' });
      map.setFeatureState({ source: 'ed', id: edId }, { selected: true });
    }
    for (const btn of $('card-body').querySelectorAll('[data-enclave]')) {
      btn.addEventListener('click', () => {
        const index = catalog.enclaves.findIndex((e) => e.id === btn.dataset.enclave);
        setFilter({ kind: 'enclave', index, id: btn.dataset.enclave });
      });
    }
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
    if (isMobileUi()) setSheetOpen(false);
    if (worldMap.getSource('world')) {
      worldMap.removeFeatureState({ source: 'world' });
      worldMap.setFeatureState({ source: 'world', id: iso }, { selected: true });
    }
    applyWorldPaint();
    refreshList();
    syncQuery();
    const feat = worldByIso.get(iso);
    if (feat) fitCountry(worldMap, feat);
    for (const btn of $('card-body').querySelectorAll('[data-enclave]')) {
      btn.addEventListener('click', () => {
        const index = catalog.enclaves.findIndex((e) => e.id === btn.dataset.enclave);
        applyView('nyc');
        setFilter({ kind: 'enclave', index, id: btn.dataset.enclave });
      });
    }
    resizeMap();
  }

  function applyView(view) {
    currentView = view === 'world' ? 'world' : 'nyc';
    $('view-nyc').classList.toggle('is-on', currentView === 'nyc');
    $('view-world').classList.toggle('is-on', currentView === 'world');
    $('view-nyc').setAttribute('aria-selected', currentView === 'nyc' ? 'true' : 'false');
    $('view-world').setAttribute('aria-selected', currentView === 'world' ? 'true' : 'false');
    $('map').hidden = currentView !== 'nyc';
    $('world-map').hidden = currentView !== 'world';
    $('nyc-lede').hidden = currentView !== 'nyc';
    $('rail-kicker').textContent = currentView === 'world' ? 'Origin countries' : 'Election districts';
    $('list-heading').textContent = currentView === 'world' ? 'Countries' : 'Enclaves';
    $('search-label').textContent = currentView === 'world'
      ? 'Find a country or neighborhood'
      : 'Find a group or neighborhood';
    $('search').placeholder = currentView === 'world'
      ? 'Italy, Little Italy, Astoria…'
      : 'Chinatown, Little Guyana, Astoria…';

    if (currentView === 'world') {
      if (map.getSource('ed')) map.removeFeatureState({ source: 'ed' });
      if (selectedCountry) showCountryCard(selectedCountry);
      else $('card').hidden = true;
    } else if (selectedId) {
      showCard(selectedId);
    } else {
      $('card').hidden = true;
    }

    renderRegions(catalog, filter, setFilter);
    renderLegend(catalog, filter, currentView);
    refreshList();
    syncQuery();
    resizeMap();
  }

  function setFilter(next) {
    filter = next;
    applyFilter(map, catalog, filter, includeHistoric);
    applyWorldPaint();
    renderRegions(catalog, filter, setFilter);
    renderLegend(catalog, filter, currentView);
    $('clear-filter').hidden = !filter;
    refreshList();
    if (filter?.kind === 'enclave' && currentView === 'nyc') {
      if (isMobileUi()) setSheetOpen(false);
      fitEnclave(map, ed, filter.index);
    }
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
      if (worldMap.getSource('world')) worldMap.removeFeatureState({ source: 'world' });
    }
    applyFilter(map, catalog, filter, includeHistoric);
    applyWorldPaint();
    renderRegions(catalog, filter, setFilter);
    renderLegend(catalog, filter, currentView);
    refreshList();
    if (currentView === 'nyc' && selectedId) showCard(selectedId);
    else if (currentView === 'world' && selectedCountry) showCountryCard(selectedCountry);
    syncQuery();
    resizeMap();
  }

  function finishLoad() {
    if (!nycReady || !worldReady) return;
    status.hidden = true;
    if (isMobileUi()) $('legend').hidden = true;
    else $('legend').hidden = false;
    syncHistoricBtn();
    applyFilter(map, catalog, filter, includeHistoric);
    applyView(currentView);
    if (currentView === 'nyc' && selectedId) showCard(selectedId);
    if (currentView === 'world' && selectedCountry) showCountryCard(selectedCountry);
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
    worldReady = true;
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

  worldMap.on('mousemove', 'world-fill', (e) => {
    const iso = e.features[0]?.properties?.iso;
    worldMap.getCanvas().style.cursor = countryByIso.has(iso) ? 'pointer' : '';
    if (worldHover && worldHover !== iso) {
      worldMap.setFeatureState({ source: 'world', id: worldHover }, { hover: false });
    }
    worldHover = iso;
    if (iso) worldMap.setFeatureState({ source: 'world', id: iso }, { hover: true });
  });
  worldMap.on('mouseleave', 'world-fill', () => {
    worldMap.getCanvas().style.cursor = '';
    if (worldHover) worldMap.setFeatureState({ source: 'world', id: worldHover }, { hover: false });
    worldHover = null;
  });
  worldMap.on('click', 'world-fill', (e) => {
    const iso = e.features[0]?.properties?.iso;
    if (iso && countryByIso.has(iso)) showCountryCard(iso);
  });

  $('card-close').addEventListener('click', () => {
    $('card').hidden = true;
    if (currentView === 'world') {
      selectedCountry = null;
      if (worldMap.getSource('world')) worldMap.removeFeatureState({ source: 'world' });
      applyWorldPaint();
      refreshList();
    } else {
      selectedId = null;
      if (map.getSource('ed')) map.removeFeatureState({ source: 'ed' });
    }
    syncQuery();
    resizeMap();
  });
  $('clear-filter').addEventListener('click', () => setFilter(null));
  $('search').addEventListener('input', () => refreshList());
  $('search').addEventListener('focus', () => {
    if (isMobileUi()) {
      setSheetOpen(true);
      resizeMap();
    }
  });

  $('browse-toggle').addEventListener('click', () => {
    const open = !$('rail').classList.contains('is-open');
    setSheetOpen(open);
    if (open) $('card').hidden = true;
    resizeMap();
  });
  $('sheet-close').addEventListener('click', () => {
    setSheetOpen(false);
    resizeMap();
  });
  $('legend-toggle').addEventListener('click', () => {
    const legend = $('legend');
    const next = legend.hidden;
    legend.hidden = !next;
    $('legend-toggle').setAttribute('aria-expanded', next ? 'true' : 'false');
  });
  $('view-nyc').addEventListener('click', () => applyView('nyc'));
  $('view-world').addEventListener('click', () => applyView('world'));
  $('historic-toggle').addEventListener('click', () => setHistoric(!includeHistoric));
  wireSheetDrag(resizeMap);

  window.addEventListener('resize', () => {
    if (!isMobileUi()) {
      $('legend').hidden = false;
      setSheetOpen(false);
    }
    resizeMap();
  });
}

main().catch((err) => {
  console.error(err);
  $('status').textContent = 'Could not load the maps.';
});
