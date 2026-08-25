// Establishing Shot — Manhattan film permits on the streets they closed.
//
// Permits are fetched live from NYC Open Data on every filter change. The street
// grid and its intersections are the one committed file, because the grid does
// not change daily and the all-pairs intersection math is not something to redo
// in a phone browser.

import { createStreetIndex } from './streets.js';
import {
  CATEGORIES,
  CATEGORY_IDS,
  DATASET_URL,
  buildPermitUrl,
  buildWhere,
  buildFeatures,
  defaultWindow,
  formatDateRange,
} from './permits.js';

const EMPTY = { type: 'FeatureCollection', features: [] };
const MANHATTAN = [
  [-74.03, 40.68],
  [-73.9, 40.88],
];

const OSM_FALLBACK = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const el = (id) => document.getElementById(id);
const state = {
  index: null,
  map: null,
  categories: new Set(CATEGORY_IDS),
  from: null,
  to: null,
  preset: '12',
  coverage: null,
  data: null,
  selected: null,
  requestId: 0,
};

function setStatus(text, kind) {
  const node = el('status');
  if (!text) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.textContent = text;
  node.classList.toggle('is-error', kind === 'error');
}

async function loadStyle() {
  try {
    const res = await fetch('https://tiles.openfreemap.org/styles/positron');
    if (!res.ok) throw new Error('openfreemap');
    return res.json();
  } catch {
    return OSM_FALLBACK;
  }
}

/** What the city's rolling window actually covers right now. */
async function loadCoverage() {
  const params = new URLSearchParams();
  params.set('$select', 'min(startdatetime) as first,max(startdatetime) as last,count(1) as rows');
  params.set('$where', buildWhere({ categories: CATEGORY_IDS }));
  try {
    const res = await fetch(`${DATASET_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(String(res.status));
    const [row] = await res.json();
    if (!row?.first) return null;
    return { first: row.first.slice(0, 10), last: row.last.slice(0, 10), rows: Number(row.rows) };
  } catch {
    return null;
  }
}

function renderCategoryChecks() {
  const wrap = el('category-checks');
  wrap.textContent = '';
  for (const cat of CATEGORIES) {
    const label = document.createElement('label');
    label.className = 'es-check';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.categories.has(cat.id);
    input.addEventListener('change', () => {
      if (input.checked) state.categories.add(cat.id);
      else state.categories.delete(cat.id);
      if (!state.categories.size) {
        state.categories.add(cat.id);
        input.checked = true;
        return;
      }
      void refresh();
    });

    const swatch = document.createElement('i');
    swatch.style.background = cat.color;

    const text = document.createElement('span');
    text.textContent = cat.label;

    const count = document.createElement('span');
    count.className = 'es-check-count';
    count.dataset.category = cat.id;

    label.append(input, swatch, text, count);
    wrap.append(label);
  }
}

function applyPreset(preset) {
  state.preset = preset;
  for (const chip of document.querySelectorAll('[data-preset]')) {
    chip.classList.toggle('is-on', chip.dataset.preset === preset);
  }
  if (preset === 'all') {
    state.from = state.coverage?.first || '2023-01-01';
    state.to = state.coverage?.last || new Date().toISOString().slice(0, 10);
  } else {
    const win = defaultWindow(new Date(), Number(preset));
    state.from = win.from;
    state.to = win.to;
  }
  el('date-from').value = state.from;
  el('date-to').value = state.to;
}

function number(n) {
  return n.toLocaleString('en-US');
}

function renderStats(stats) {
  const dl = el('stats');
  dl.textContent = '';
  const rows = [
    ['Permits', number(stats.permits)],
    ['Street stretches', number(stats.blockFaces + stats.intersections)],
    ['Shoot days', number(stats.shootDays)],
    ['Segments placed', `${number(stats.placedMentions)} of ${number(stats.mentions)}`],
  ];
  for (const [term, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }

  for (const node of document.querySelectorAll('.es-check-count')) {
    const n = stats.byCategory[node.dataset.category] || 0;
    node.textContent = n ? number(n) : '';
  }

  const summary = el('unplaced-summary');
  const pct = stats.mentions ? Math.round((stats.unplacedMentions / stats.mentions) * 100) : 0;
  summary.textContent = `${number(stats.unplacedMentions)} segments unplaced (${pct}%)`;
  el('unplaced-details').hidden = stats.unplacedMentions === 0;

  const list = el('unplaced-list');
  list.textContent = '';
  for (const row of stats.unplaced.slice(0, 60)) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = row.street || '(no street named)';
    const count = document.createElement('span');
    count.textContent = number(row.mentions);
    li.append(name, count);
    list.append(li);
  }
}

const TIER_LABEL = {
  block: 'block face',
  span: 'approximate span',
  point: 'intersection only',
};

function renderDetail(props) {
  const block = el('detail-block');
  const host = el('detail');
  host.textContent = '';
  if (!props) {
    block.hidden = true;
    return;
  }
  block.hidden = false;

  const head = document.createElement('p');
  head.className = 'es-detail-head';
  head.textContent = props.label;
  host.append(head);

  const meta = document.createElement('p');
  meta.className = 'es-detail-meta';
  const tier = document.createElement('span');
  tier.className = 'es-tier';
  tier.textContent = TIER_LABEL[props.tier] || props.tier;
  meta.append(
    document.createTextNode(
      `${props.permitCount} permit${props.permitCount === 1 ? '' : 's'} · ${props.shootDays} shoot day${props.shootDays === 1 ? '' : 's'} · `,
    ),
    tier,
  );
  host.append(meta);

  const list = document.createElement('ul');
  list.className = 'es-permits';
  const permits = typeof props.permits === 'string' ? JSON.parse(props.permits) : props.permits;
  for (const permit of permits) {
    const li = document.createElement('li');
    li.className = 'es-permit';
    li.style.borderLeftColor = CATEGORIES.find((c) => c.id === permit.category)?.color || '#6b5f5e';

    const top = document.createElement('div');
    top.className = 'es-permit-top';
    const cat = document.createElement('span');
    cat.className = 'es-permit-cat';
    cat.textContent = permit.subcategory && permit.subcategory !== 'Not Applicable' ? permit.subcategory : permit.category;
    const id = document.createElement('span');
    id.className = 'es-permit-id';
    id.textContent = `#${permit.eventid}`;
    top.append(cat, id);

    const when = document.createElement('div');
    when.className = 'es-permit-when';
    when.textContent = formatDateRange(permit.start, permit.end);

    li.append(top, when);
    list.append(li);
  }
  host.append(list);

  const note = document.createElement('p');
  note.className = 'es-note';
  note.textContent = 'The city does not release production titles, so these are shoots without names.';
  host.append(note);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'es-clear';
  clear.textContent = 'Clear selection';
  clear.addEventListener('click', () => select(null));
  host.append(clear);
}

function select(props) {
  state.selected = props;
  renderDetail(props);
  const filter = props ? ['==', ['get', 'key'], props.key] : ['==', ['get', 'key'], '__none__'];
  if (state.map.getLayer('permits-selected')) state.map.setFilter('permits-selected', filter);
  if (state.map.getLayer('permits-selected-point')) state.map.setFilter('permits-selected-point', filter);
  if (props && window.matchMedia('(max-width: 900px)').matches) openRail(true);
}

function openRail(open) {
  el('rail').classList.toggle('is-open', open);
  el('panel-toggle').setAttribute('aria-expanded', String(open));
}

function addLayers(map) {
  map.addSource('permit-lines', { type: 'geojson', data: EMPTY });
  map.addSource('permit-points', { type: 'geojson', data: EMPTY });

  // Width carries volume: one permit is a hairline, a repeatedly-closed block is
  // heavy. Anything above ~25 permits stops growing so Midtown does not become
  // a single blob.
  const width = [
    'interpolate',
    ['linear'],
    ['get', 'permitCount'],
    1,
    ['interpolate', ['linear'], ['zoom'], 11, 1.2, 14, 2.4, 16, 3.4],
    25,
    ['interpolate', ['linear'], ['zoom'], 11, 5, 14, 9, 16, 13],
  ];

  map.addLayer({
    id: 'permits-hit',
    type: 'line',
    source: 'permit-lines',
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 },
  });

  map.addLayer({
    id: 'permits',
    type: 'line',
    source: 'permit-lines',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': width,
      'line-opacity': 0.82,
    },
  });

  map.addLayer({
    id: 'permits-selected',
    type: 'line',
    source: 'permit-lines',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    filter: ['==', ['get', 'key'], '__none__'],
    paint: { 'line-color': '#1c1c1c', 'line-width': ['+', width, 3], 'line-opacity': 0.95 },
  });

  map.addLayer({
    id: 'permit-points',
    type: 'circle',
    source: 'permit-points',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['get', 'permitCount'], 1, 3, 25, 8],
      'circle-opacity': 0.75,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(28,28,28,0.35)',
    },
  });

  map.addLayer({
    id: 'permits-selected-point',
    type: 'circle',
    source: 'permit-points',
    filter: ['==', ['get', 'key'], '__none__'],
    paint: {
      'circle-color': '#1c1c1c',
      'circle-radius': ['interpolate', ['linear'], ['get', 'permitCount'], 1, 5, 25, 10],
      'circle-opacity': 0.95,
    },
  });

  for (const layer of ['permits-hit', 'permit-points']) {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', layer, (event) => {
      const feature = event.features?.[0];
      if (feature) select(feature.properties);
    });
  }

  map.on('click', (event) => {
    const hits = map.queryRenderedFeatures(event.point, { layers: ['permits-hit', 'permit-points'] });
    if (!hits.length) select(null);
  });
}

async function refresh() {
  if (!state.index || !state.map) return;
  const requestId = ++state.requestId;
  setStatus('Fetching permits…');

  const url = buildPermitUrl({
    from: state.from,
    to: state.to,
    categories: [...state.categories],
  });

  let rows;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    rows = await res.json();
  } catch (err) {
    if (requestId !== state.requestId) return;
    setStatus(`Could not reach NYC Open Data (${err.message}). Try again.`, 'error');
    return;
  }
  if (requestId !== state.requestId) return;

  const built = buildFeatures(rows, state.index);
  const byCategory = {};
  let shootDays = 0;
  for (const row of rows) {
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  }
  for (const feature of built.lines.features.concat(built.points.features)) {
    shootDays += feature.properties.shootDays;
  }

  state.data = built;
  state.map.getSource('permit-lines').setData(built.lines);
  state.map.getSource('permit-points').setData(built.points);
  renderStats({ ...built.stats, byCategory, shootDays });

  if (state.selected) {
    const still = built.lines.features
      .concat(built.points.features)
      .find((f) => f.properties.key === state.selected.key);
    select(still ? still.properties : null);
  }

  setStatus(
    rows.length
      ? `${number(rows.length)} permits · ${formatDateRange(state.from, state.to)}`
      : `No permits match ${formatDateRange(state.from, state.to)}`,
  );
  if (rows.length) window.setTimeout(() => setStatus(''), 2600);
}

function wireControls() {
  for (const chip of document.querySelectorAll('[data-preset]')) {
    chip.addEventListener('click', () => {
      applyPreset(chip.dataset.preset);
      void refresh();
    });
  }

  const onDate = () => {
    const from = el('date-from').value;
    const to = el('date-to').value;
    if (!from || !to) return;
    if (from > to) {
      setStatus('That date range runs backwards.', 'error');
      return;
    }
    state.from = from;
    state.to = to;
    state.preset = 'custom';
    for (const chip of document.querySelectorAll('[data-preset]')) chip.classList.remove('is-on');
    void refresh();
  };
  el('date-from').addEventListener('change', onDate);
  el('date-to').addEventListener('change', onDate);

  el('panel-toggle').addEventListener('click', () => {
    openRail(!el('rail').classList.contains('is-open'));
  });
}

async function main() {
  renderCategoryChecks();
  wireControls();
  applyPreset('12');

  const [style, payload, coverage] = await Promise.all([
    loadStyle(),
    fetch('./data/streets.json')
      .then((res) => {
        if (!res.ok) throw new Error(`streets.json ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        setStatus(`Could not load the street grid (${err.message}).`, 'error');
        return null;
      }),
    loadCoverage(),
  ]);

  if (!payload) return;
  state.index = createStreetIndex(payload);
  state.coverage = coverage;

  el('coverage-note').textContent = coverage
    ? `The city's table currently holds ${number(coverage.rows)} Manhattan shooting permits, from ${formatDateRange(coverage.first, coverage.last)}. Older shoots age out of it.`
    : 'Dataset coverage is unavailable right now.';
  if (coverage) {
    for (const id of ['date-from', 'date-to']) {
      el(id).min = coverage.first;
      el(id).max = coverage.last;
    }
  }

  const map = new maplibregl.Map({
    container: 'map',
    style,
    bounds: MANHATTAN,
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'top-right');
  state.map = map;

  map.on('load', () => {
    addLayers(map);
    void refresh();
  });
}

void main();
