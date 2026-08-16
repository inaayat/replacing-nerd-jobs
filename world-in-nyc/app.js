const BORO_FROM_CD = {
  1: 'Manhattan',
  2: 'Bronx',
  3: 'Brooklyn',
  4: 'Queens',
  5: 'Staten Island',
};

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

function formatCD(code) {
  if (code == null) return '—';
  const boro = BORO_FROM_CD[Math.floor(code / 100)] || '';
  return `${boro} ${code % 100}`.trim();
}

function regionColor(catalog, regionId) {
  return catalog.regions.find((r) => r.id === regionId)?.color || '#cfc6b8';
}

function colorMatch(catalog) {
  const expr = ['match', ['get', 'r']];
  for (const region of catalog.regions) expr.push(region.id, region.color);
  expr.push('#cfc6b8');
  return expr;
}

function parseQuery() {
  const params = new URLSearchParams(location.search);
  const ed = Number(params.get('ed') || '');
  return { ed: Number.isFinite(ed) && ed > 0 ? ed : null };
}

function setQuery(ed) {
  const url = new URL(location.href);
  if (ed) url.searchParams.set('ed', String(ed));
  else url.searchParams.delete('ed');
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

function applyFilter(map, catalog, filter) {
  const fill = map.getLayer('ed-fill');
  if (!fill) return;
  if (!filter) {
    map.setFilter('ed-fill', ['!=', ['get', 'r'], '']);
    return;
  }
  if (filter.kind === 'region') {
    map.setFilter('ed-fill', ['in', filter.id, ['get', 'rs']]);
    return;
  }
  if (filter.kind === 'enclave') {
    map.setFilter('ed-fill', ['in', filter.index, ['get', 'e']]);
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

function renderList(catalog, filter, query, onPick) {
  const root = $('enclave-list');
  root.innerHTML = '';
  const q = query.trim().toLowerCase();
  const items = catalog.enclaves.filter((enc) => {
    if (!enclaveMatches(enc, q)) return false;
    if (filter?.kind === 'region') return enc.region === filter.id;
    return true;
  });
  for (const enc of items) {
    const i = catalog.enclaves.indexOf(enc);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `win-item${filter?.kind === 'enclave' && filter.index === i ? ' is-on' : ''}`;
    btn.innerHTML = `<span class="win-item-name">${enc.name}</span><span class="win-item-meta">${enc.group}${enc.status === 'historic' ? ' · historic' : ''}</span>`;
    btn.addEventListener('click', () => onPick({ kind: 'enclave', index: i, id: enc.id }));
    root.append(btn);
  }
  if (!items.length) {
    root.innerHTML = '<p class="win-item-meta">No enclaves match.</p>';
  }
}

function renderLegend(catalog, filter) {
  const root = $('legend');
  const regions = filter?.kind === 'region'
    ? catalog.regions.filter((r) => r.id === filter.id)
    : catalog.regions;
  const rows = regions.map((r) => `<div class="win-legend-row"><i style="background:${r.color}"></i>${r.label}</div>`).join('');
  root.innerHTML = `<h3>${filter?.kind === 'enclave' ? catalog.enclaves[filter.index].name : 'By region'}</h3>${rows}<div class="win-legend-row"><i style="background:#e8e0d2;outline:1px solid #1c1c1c22"></i>No listed enclave</div>`;
}

function cardHtml(props, catalog) {
  const enclaves = (props.e || []).map((i) => catalog.enclaves[i]).filter(Boolean);
  const pills = enclaves.map((enc) => {
    const color = regionColor(catalog, enc.region);
    const historic = enc.status === 'historic' ? ' · historic' : '';
    return `<button type="button" class="win-enclave-pill" data-enclave="${enc.id}"><strong style="color:${color}">${enc.name}</strong><div class="mono">${enc.group}${historic}</div>${enc.note ? `<div class="mono">${enc.note}</div>` : ''}</button>`;
  }).join('') || '<p class="mono">Wikipedia does not list a named enclave on this district. The outlines are still here for later layers.</p>';
  return `
    <h3>AD ${props.ad} · ED ${String(props.n).padStart(3, '0')}</h3>
    <div class="mono">Election district ${props.ed}</div>
    <dl class="win-kv">
      <dt>Borough</dt><dd>${props.b || '—'}</dd>
      <dt>Neighborhood</dt><dd>${props.nta || '—'}</dd>
      <dt>Community</dt><dd>${formatCD(props.cd)}</dd>
      <dt>Council</dt><dd>${props.cc ?? '—'}</dd>
      <dt>Congress</dt><dd>${props.cg ?? '—'}</dd>
      <dt>Assembly</dt><dd>${props.as ?? '—'}</dd>
      <dt>Senate</dt><dd>${props.se ?? '—'}</dd>
    </dl>
    <h4 class="mono">Enclaves</h4>
    ${pills}
  `;
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
  if (!b.isEmpty()) map.fitBounds(b, { padding: 48, maxZoom: 13, duration: 600 });
}

async function main() {
  const status = $('status');
  const [catalog, ed, style] = await Promise.all([
    fetch('./data/enclaves.json').then((r) => r.json()),
    fetch('./data/ed.geojson').then((r) => r.json()),
    loadStyle(),
  ]);

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: [-73.9769, 40.72103],
    zoom: 10.5,
    maxZoom: 16,
    minZoom: 9,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  let filter = null;
  let hoverId = null;
  let selectedId = parseQuery().ed;
  const edIndex = new Map(ed.features.map((f) => [f.properties.ed, f]));

  function showCard(edId) {
    const feat = edIndex.get(edId);
    const card = $('card');
    if (!feat) {
      card.hidden = true;
      return;
    }
    $('card-body').innerHTML = cardHtml(feat.properties, catalog);
    card.hidden = false;
    selectedId = edId;
    setQuery(edId);
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
  }

  function setFilter(next) {
    filter = next;
    applyFilter(map, catalog, filter);
    renderRegions(catalog, filter, setFilter);
    renderList(catalog, filter, $('search').value, setFilter);
    renderLegend(catalog, filter);
    $('clear-filter').hidden = !filter;
    if (filter?.kind === 'enclave') fitEnclave(map, ed, filter.index);
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
      filter: ['!=', ['get', 'r'], ''],
      paint: {
        'fill-color': colorMatch(catalog),
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

    status.hidden = true;
    renderRegions(catalog, filter, setFilter);
    renderList(catalog, filter, '', setFilter);
    renderLegend(catalog, filter);
    if (selectedId) showCard(selectedId);
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
    selectedId = null;
    setQuery(null);
    if (map.getSource('ed')) map.removeFeatureState({ source: 'ed' });
  });
  $('clear-filter').addEventListener('click', () => setFilter(null));
  $('search').addEventListener('input', () => {
    renderList(catalog, filter, $('search').value, setFilter);
  });

  document.querySelectorAll('[data-layer]').forEach((input) => {
    input.addEventListener('change', () => {
      const vis = input.checked ? 'visible' : 'none';
      map.setLayoutProperty(input.dataset.layer, 'visibility', vis);
    });
  });
  document.querySelectorAll('[data-overlay]').forEach((input) => {
    input.addEventListener('change', async () => {
      const name = input.dataset.overlay;
      if (input.checked) {
        status.hidden = false;
        status.textContent = `Loading ${name} districts…`;
        try {
          await ensureOverlay(map, name);
        } finally {
          status.hidden = true;
        }
      } else if (map.getLayer(`${name}-line`)) {
        map.setLayoutProperty(`${name}-line`, 'visibility', 'none');
      }
    });
  });
}

main().catch((err) => {
  console.error(err);
  $('status').textContent = 'Could not load the district map.';
});
