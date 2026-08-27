// I'm Filmin Here — curated Upper West Side film & TV locations.
//
// The default page is a small, walkable map of named places. Live city
// permits live on /im-filmin-here/permits/. The camera fits the current
// catalog, so adding a farther pin is what zooms the map out.

import {
  FORMATS,
  FORMAT_IDS,
  PRECISION_LABEL,
  boundsOf,
  filterPlaces,
  formatColor,
  normalizeCatalog,
  paddedBounds,
  placeColor,
  placeProductions,
  statsOf,
  toFeatures,
} from './locations.js';

const EMPTY = { type: 'FeatureCollection', features: [] };
const SOURCE = 'location-dots';
const LAYERS = ['location-dots', 'location-selected'];
const FIT_PAD = { top: 36, bottom: 36, left: 36, right: 36 };

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
  places: [],
  formats: new Set(FORMAT_IDS),
  query: '',
  selected: null,
  map: null,
  cameraBounds: null,
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

function visiblePlaces() {
  return filterPlaces(state.places, { formats: state.formats, query: state.query });
}

function number(n) {
  return n.toLocaleString('en-US');
}

function renderFormatChecks() {
  const wrap = el('format-checks');
  wrap.textContent = '';
  for (const format of FORMATS) {
    const label = document.createElement('label');
    label.className = 'ifh-check';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.formats.has(format.id);
    input.addEventListener('change', () => {
      if (input.checked) state.formats.add(format.id);
      else state.formats.delete(format.id);
      if (!state.formats.size) {
        state.formats.add(format.id);
        input.checked = true;
        return;
      }
      refresh();
    });

    const swatch = document.createElement('i');
    swatch.className = 'ifh-swatch-dot';
    swatch.style.background = format.color;

    const text = document.createElement('span');
    text.textContent = format.label;

    const count = document.createElement('span');
    count.className = 'ifh-check-count';
    count.dataset.format = format.id;

    label.append(input, swatch, text, count);
    wrap.append(label);
  }
}

function renderStats(places) {
  const stats = statsOf(places);
  const dl = el('stats');
  dl.textContent = '';
  for (const [term, value] of [
    ['Places', number(stats.places)],
    ['Productions', number(stats.productions)],
    ['Listed scenes', number(stats.shoots)],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  for (const node of document.querySelectorAll('.ifh-check-count')) {
    const n = node.dataset.format === 'Film' ? stats.films : stats.tv;
    node.textContent = n ? number(n) : '';
  }
}

function renderList(places) {
  const list = el('place-list');
  list.textContent = '';
  if (!places.length) {
    const empty = document.createElement('li');
    empty.className = 'ifh-place-empty';
    empty.textContent = state.query ? 'Nothing on the list matches that.' : 'No places in this cut.';
    list.append(empty);
    return;
  }
  for (const place of places) {
    const item = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ifh-place';
    btn.dataset.id = place.id;
    btn.setAttribute('aria-current', place.id === state.selected?.id ? 'true' : 'false');

    const swatch = document.createElement('i');
    swatch.className = 'ifh-swatch-dot';
    swatch.style.background = placeColor(place);

    const body = document.createElement('span');
    body.className = 'ifh-place-body';

    const name = document.createElement('span');
    name.className = 'ifh-place-name';
    name.textContent = place.name;

    const meta = document.createElement('span');
    meta.className = 'ifh-place-meta';
    const titles = placeProductions(place);
    meta.textContent = titles.length > 2 ? `${titles[0]} + ${titles.length - 1}` : titles.join(' · ');

    body.append(name, meta);
    const count = document.createElement('span');
    count.className = 'ifh-place-count';
    count.textContent = String(place.shoots.length);
    btn.append(swatch, body, count);
    btn.addEventListener('click', () => select(place, { fly: true }));
    item.append(btn);
    list.append(item);
  }
}

function renderDetail(place) {
  const block = el('detail-block');
  const host = el('detail');
  host.textContent = '';
  if (!place) {
    block.hidden = true;
    return;
  }
  block.hidden = false;

  const body = document.createElement('div');
  body.className = 'ifh-detail-body';

  const head = document.createElement('p');
  head.className = 'ifh-detail-head';
  head.textContent = place.name;
  body.append(head);

  const addr = document.createElement('p');
  addr.className = 'ifh-detail-meta';
  addr.textContent = place.address;
  body.append(addr);

  const meta = document.createElement('p');
  meta.className = 'ifh-detail-meta';
  const tier = document.createElement('span');
  tier.className = 'ifh-tier';
  tier.textContent = PRECISION_LABEL[place.precision] || place.precision;
  meta.append(document.createTextNode(place.band ? `${place.band} · placed as a ` : 'placed as a '), tier);
  body.append(meta);

  const listHead = document.createElement('p');
  listHead.className = 'ifh-permits-head';
  listHead.textContent = place.shoots.length === 1 ? 'The scene' : 'Scenes here';
  body.append(listHead);

  const list = document.createElement('ul');
  list.className = 'ifh-permits';
  for (const shoot of place.shoots) {
    const li = document.createElement('li');
    li.className = 'ifh-permit';
    li.style.borderLeftColor = formatColor(shoot.format);

    const top = document.createElement('div');
    top.className = 'ifh-permit-top';
    const title = document.createElement('span');
    title.className = 'ifh-permit-cat';
    title.textContent = shoot.production;
    const format = document.createElement('span');
    format.className = 'ifh-permit-id';
    format.textContent = shoot.format;
    top.append(title, format);

    li.append(top);
    if (shoot.scene) {
      const scene = document.createElement('div');
      scene.className = 'ifh-permit-when';
      scene.textContent = shoot.scene;
      li.append(scene);
    }
    if (shoot.source) {
      const link = document.createElement('a');
      link.className = 'ifh-permit-source';
      link.href = shoot.source;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Source';
      li.append(link);
    }
    list.append(li);
  }
  body.append(list);
  host.append(body);
}

function select(place, { fly = false } = {}) {
  state.selected = place;
  renderDetail(place);
  renderList(visiblePlaces());
  if (state.map?.getLayer('location-selected')) {
    state.map.setFilter('location-selected', ['==', ['get', 'id'], place?.id || '__none__']);
  }
  if (place) {
    el('rail-scroll').scrollTo({ top: 0, behavior: 'smooth' });
    if (window.matchMedia('(max-width: 900px)').matches) openRail(true);
    if (fly && state.map) {
      state.map.easeTo({
        center: place.lngLat,
        zoom: Math.max(state.map.getZoom(), 15.2),
        duration: 450,
      });
    }
  }
}

function openRail(open) {
  el('rail').classList.toggle('is-open', open);
  el('panel-toggle').setAttribute('aria-expanded', String(open));
}

function addLayers(map) {
  map.addSource(SOURCE, { type: 'geojson', data: EMPTY });
  map.on('error', (event) => {
    if (event?.error) setStatus(`Map error: ${event.error.message}`, 'error');
  });

  const radius = [
    'interpolate',
    ['linear'],
    ['zoom'],
    12,
    ['interpolate', ['linear'], ['get', 'shootCount'], 1, 6, 5, 10],
    15,
    ['interpolate', ['linear'], ['get', 'shootCount'], 1, 8, 5, 14],
  ];
  const selectedRadius = [
    'interpolate',
    ['linear'],
    ['zoom'],
    12,
    ['interpolate', ['linear'], ['get', 'shootCount'], 1, 9, 5, 13],
    15,
    ['interpolate', ['linear'], ['get', 'shootCount'], 1, 11, 5, 17],
  ];

  map.addLayer({
    id: 'location-dots',
    type: 'circle',
    source: SOURCE,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': radius,
      'circle-opacity': ['case', ['==', ['get', 'approximate'], 1], 0.55, 0.92],
      'circle-stroke-width': ['case', ['==', ['get', 'approximate'], 1], 2, 1.4],
      'circle-stroke-color': [
        'case',
        ['==', ['get', 'approximate'], 1],
        ['get', 'color'],
        'rgba(250,243,227,0.95)',
      ],
    },
  });
  map.addLayer({
    id: 'location-selected',
    type: 'circle',
    source: SOURCE,
    filter: ['==', ['get', 'id'], '__none__'],
    paint: {
      'circle-color': '#1c1c1c',
      'circle-radius': selectedRadius,
      'circle-opacity': 0.95,
    },
  });

  for (const id of LAYERS) {
    map.on('mouseenter', id, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', id, () => {
      map.getCanvas().style.cursor = '';
    });
  }
  map.on('click', 'location-dots', (event) => {
    const id = event.features?.[0]?.properties?.id;
    const place = state.places.find((row) => row.id === id);
    if (place) select(place);
  });
  map.on('click', (event) => {
    const hits = map.getLayer('location-dots')
      ? map.queryRenderedFeatures(event.point, { layers: ['location-dots'] })
      : [];
    if (!hits.length) select(null);
  });
}

function refresh() {
  const places = visiblePlaces();
  renderStats(places);
  renderList(places);
  if (state.selected && !places.some((place) => place.id === state.selected.id)) select(null);
  if (state.map?.getSource(SOURCE)) state.map.getSource(SOURCE).setData(toFeatures(places));
}

function wireControls() {
  el('panel-toggle').addEventListener('click', () => {
    openRail(!el('rail').classList.contains('is-open'));
  });
  el('detail-close').addEventListener('click', () => select(null));
  el('place-search').addEventListener('input', (event) => {
    state.query = event.target.value;
    refresh();
  });
}

async function main() {
  renderFormatChecks();
  wireControls();

  const [style, payload] = await Promise.all([
    loadStyle(),
    fetch('./data/locations.json')
      .then((res) => {
        if (!res.ok) throw new Error(`locations.json ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        setStatus(`Could not load the location list (${err.message}).`, 'error');
        return null;
      }),
  ]);
  if (!payload) return;

  const catalog = normalizeCatalog(payload);
  state.places = catalog.places;
  const camera = paddedBounds(boundsOf(state.places));
  state.cameraBounds = camera;
  if (!camera) {
    setStatus('The location list has no mappable pins.', 'error');
    return;
  }

  const map = new maplibregl.Map({
    container: 'map',
    style,
    bounds: camera,
    fitBoundsOptions: { padding: FIT_PAD },
    maxBounds: paddedBounds(camera, 0.018),
    minZoom: 12,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'top-right');
  state.map = map;

  map.on('load', () => {
    addLayers(map);
    refresh();
    const stats = statsOf(state.places);
    setStatus(`${number(stats.places)} Upper West Side places · in beta`);
    window.setTimeout(() => setStatus(''), 2800);
  });
}

void main();
