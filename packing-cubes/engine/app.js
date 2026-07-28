// Unified packing app: catalog (left) + suitcase builder (right)
const STORAGE_KEY = 'packing-cubes:suitcases';

const root = document.getElementById('app-root');
const toastEl = document.getElementById('toast');
const params = new URLSearchParams(location.search);
const addCubeId = params.get('add');

let catalog = [];
let state = loadState();
let searchQuery = '';

const CUBE_COLORS = ['green', 'purple', 'pink', 'blue', 'gold', 'grey'];
const TAG_COLORS = {
  basics: 'purple',
  summer: 'gold',
  winter: 'blue',
  business: 'green',
  season: 'pink',
  work: 'green',
  clothing: 'pink',
  electronics: 'blue',
  hygiene: 'grey',
};

const BAG_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>`;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { activeSuitcaseId: null, suitcases: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isBasicCube(cube) {
  return (cube.tags || []).includes('basics');
}

function basicCubeIds() {
  return catalog.filter(isBasicCube).map((c) => c.id);
}

function ensureSuitcase() {
  if (!state.suitcases.length) {
    const id = crypto.randomUUID();
    const basics = basicCubeIds();
    state.suitcases.push({
      id,
      name: 'My trip',
      cubeIds: [...basics],
      customItems: [],
      packed: {},
    });
    state.activeSuitcaseId = id;
    saveState();
    return;
  }
  if (!state.activeSuitcaseId) state.activeSuitcaseId = state.suitcases[0].id;

  const suitcase = activeSuitcase();
  const basics = basicCubeIds();
  let changed = false;
  for (const id of basics) {
    if (!suitcase.cubeIds.includes(id)) {
      suitcase.cubeIds.push(id);
      changed = true;
    }
  }
  if (changed) saveState();
}

function activeSuitcase() {
  ensureSuitcase();
  return state.suitcases.find((s) => s.id === state.activeSuitcaseId) || state.suitcases[0];
}

function itemKey(cubeId, label) {
  return `${cubeId}:${label.toLowerCase().trim()}`;
}

async function fetchCube(id) {
  const res = await fetch(`./cubes/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`Could not load cube "${id}"`);
  return res.json();
}

async function mergeItems(suitcase) {
  const merged = new Map();
  for (const cubeId of suitcase.cubeIds) {
    let cube;
    try { cube = await fetchCube(cubeId); } catch { continue; }
    for (const item of cube.items || []) {
      const label = item.label.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!merged.has(key)) {
        merged.set(key, { label, sources: [cube.title], itemKey: itemKey(cubeId, label) });
      } else if (!merged.get(key).sources.includes(cube.title)) {
        merged.get(key).sources.push(cube.title);
      }
    }
  }
  for (const item of suitcase.customItems || []) {
    const label = item.label.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, { label, sources: ['Custom'], itemKey: itemKey('custom', label) });
    }
  }
  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function packedCount(suitcase, items) {
  return items.filter((i) => suitcase.packed[i.itemKey]).length;
}

function primaryTag(cube) {
  const tags = cube.tags || [];
  for (const t of ['basics', 'summer', 'winter', 'business']) {
    if (tags.includes(t)) return t;
  }
  return tags[0] || 'other';
}

function cubeColor(cube, index) {
  return TAG_COLORS[primaryTag(cube)] || CUBE_COLORS[index % CUBE_COLORS.length];
}

function matchesQuery(cube, query) {
  const haystack = [cube.title, cube.blurb, ...(cube.tags || [])].join(' ').toLowerCase();
  return haystack.includes(query);
}

function filteredCatalog() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter((c) => matchesQuery(c, q));
}

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function render() {
  root.innerHTML = `
    <div class="pc-blob pc-blob-1"></div>
    <div class="pc-blob pc-blob-2"></div>
    <div class="pc-app-inner">
      <header class="pc-app-header">
        <div>
          <h1 class="pc-app-title">Packing Cubes</h1>
          <p class="pc-app-subtitle">Mix cubes into your suitcase. Basics are included by default.</p>
        </div>
        <a href="./builder.html" class="pc-btn green sm">+ Create a cube</a>
      </header>

      <aside class="pc-cubes-panel">
        <div class="pc-panel-head">
          <h2>Available Cubes</h2>
          <input type="search" class="pc-search-input" id="cube-search"
            placeholder="Search cubes…" value="${escapeAttr(searchQuery)}" autocomplete="off">
        </div>
        <div class="pc-cube-list" id="cube-list"></div>
      </aside>

      <main class="pc-suitcase-panel" id="suitcase-panel">
        <div class="pc-suitcase-handle" aria-hidden="true"></div>
        <div class="pc-suitcase-stripes" aria-hidden="true"></div>
        <div id="suitcase-content"></div>
      </main>
    </div>
  `;

  document.getElementById('cube-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderCubeList();
  });

  renderCubeList();
  renderSuitcase();
}

function renderCubeList() {
  const mount = document.getElementById('cube-list');
  if (!mount) return;

  const suitcase = activeSuitcase();
  const cubes = filteredCatalog();

  if (!cubes.length) {
    mount.innerHTML = `<p class="pc-no-results">No cubes match "${escapeHtml(searchQuery)}".</p>`;
    return;
  }

  mount.innerHTML = cubes.map((c, i) => {
    const inSuitcase = suitcase.cubeIds.includes(c.id);
    const basic = isBasicCube(c);
    const color = cubeColor(c, i);
    const locked = basic && inSuitcase;
    return `
      <div class="pc-cube-card ${inSuitcase ? 'in-suitcase' : ''} ${basic ? 'is-basic' : ''} ${locked ? 'is-locked' : ''}"
           data-color="${color}" data-cube-id="${c.id}" role="button" tabindex="0"
           aria-pressed="${inSuitcase}" ${locked ? 'aria-disabled="true"' : ''}>
        <div class="pc-cube-icon">${BAG_SVG}</div>
        <div class="pc-cube-info">
          <div class="title">
            ${escapeHtml(c.title)}
            ${basic ? '<span class="pc-cube-badge">Basic</span>' : ''}
          </div>
          <div class="blurb">${escapeHtml(c.blurb || '')}</div>
        </div>
        <span class="pc-cube-toggle" aria-hidden="true" title="${locked ? 'Always included' : ''}">${locked ? '🔒' : inSuitcase ? '✓' : '+'}</span>
      </div>`;
  }).join('');

  mount.querySelectorAll('.pc-cube-card').forEach((card) => {
    const toggle = () => {
      if (card.classList.contains('is-locked')) return;
      toggleCube(card.dataset.cubeId);
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

function toggleCube(cubeId) {
  const cube = catalog.find((c) => c.id === cubeId);
  const suitcase = activeSuitcase();
  if (suitcase.cubeIds.includes(cubeId)) {
    if (isBasicCube(cube)) return;
    suitcase.cubeIds = suitcase.cubeIds.filter((x) => x !== cubeId);
  } else {
    suitcase.cubeIds.push(cubeId);
  }
  saveState();
  renderCubeList();
  renderPackList();
}

function renderSuitcase() {
  const suitcase = activeSuitcase();
  const content = document.getElementById('suitcase-content');
  if (!content) return;

  content.innerHTML = `
    <div class="pc-suitcase-head">
      <h2>Your Suitcase</h2>
      <div class="pc-suitcase-controls">
        <input type="text" id="trip-name" class="b-mini-input" style="border-radius:var(--radius-sm);width:auto;min-width:140px"
          value="${escapeAttr(suitcase.name)}" placeholder="Trip name" aria-label="Trip name">
        <button type="button" class="pc-btn primary sm" id="save-btn">Save suitcase</button>
        <button type="button" class="pc-btn sm" id="new-suitcase-btn">+ New</button>
      </div>
    </div>
    <div class="pc-suitcase-body">
      <div class="pc-saved-row">
        <label for="suitcase-select">Saved suitcases</label>
        <select id="suitcase-select" aria-label="Load a saved suitcase">
          ${state.suitcases.map((s) => `<option value="${s.id}" ${s.id === suitcase.id ? 'selected' : ''}>${escapeHtml(s.name || 'Untitled')}</option>`).join('')}
        </select>
        <button type="button" class="pc-btn sm" id="delete-suitcase-btn" ${state.suitcases.length <= 1 ? 'disabled' : ''}>Delete</button>
      </div>

      <div class="pc-hud" id="pack-hud">
        <div class="pc-stat"><b id="packed-num">0</b><span>packed</span></div>
        <div class="pc-stat"><b id="total-num">0</b><span>total</span></div>
        <div class="pc-spacer"></div>
        <span style="font-size:0.75rem;font-weight:800;color:var(--brown)">${suitcase.cubeIds.length} cube${suitcase.cubeIds.length === 1 ? '' : 's'}</span>
      </div>
      <div class="pc-progress-bar"><i id="progress-bar"></i></div>

      <div class="pc-section-label">Packing checklist</div>
      <div class="pc-checklist-wrap">
        <ul class="pc-checklist" id="pack-list"></ul>
      </div>

      <div class="pc-section-label">Custom items</div>
      <div id="custom-items"></div>
      <button type="button" class="b-add-row-btn" id="add-custom-btn" style="margin-top:6px">+ Add custom item</button>
    </div>
    <p class="pc-footer-note">Suitcases are saved in this browser only — they won't sync to other devices.</p>
  `;

  document.getElementById('suitcase-select').addEventListener('change', (e) => {
    state.activeSuitcaseId = e.target.value;
    saveState();
    renderCubeList();
    renderSuitcase();
  });

  document.getElementById('trip-name').addEventListener('input', (e) => {
    suitcase.name = e.target.value;
    saveState();
    const opt = document.querySelector(`#suitcase-select option[value="${suitcase.id}"]`);
    if (opt) opt.textContent = suitcase.name || 'Untitled';
  });

  document.getElementById('save-btn').addEventListener('click', () => {
    saveState();
    showToast(`Saved "${suitcase.name || 'My trip'}"`);
  });

  document.getElementById('new-suitcase-btn').addEventListener('click', () => {
    const id = crypto.randomUUID();
    state.suitcases.push({
      id,
      name: 'New trip',
      cubeIds: [...basicCubeIds()],
      customItems: [],
      packed: {},
    });
    state.activeSuitcaseId = id;
    saveState();
    renderCubeList();
    renderSuitcase();
    showToast('New suitcase created');
  });

  document.getElementById('delete-suitcase-btn').addEventListener('click', () => {
    if (state.suitcases.length <= 1) return;
    state.suitcases = state.suitcases.filter((s) => s.id !== suitcase.id);
    state.activeSuitcaseId = state.suitcases[0].id;
    saveState();
    renderCubeList();
    renderSuitcase();
    showToast('Suitcase deleted');
  });

  document.getElementById('add-custom-btn').addEventListener('click', () => {
    suitcase.customItems.push({ label: '' });
    saveState();
    renderCustomItems();
    renderPackList();
  });

  renderCustomItems();
  renderPackList();
}

function renderCustomItems() {
  const suitcase = activeSuitcase();
  const mount = document.getElementById('custom-items');
  if (!mount) return;

  mount.innerHTML = (suitcase.customItems || []).map((item, i) => `
    <div class="b-item-row" data-idx="${i}">
      <input type="text" class="b-mini-input custom-label" style="border-radius:var(--radius-sm)"
        value="${escapeAttr(item.label)}" placeholder="One-off item">
      <button type="button" class="b-remove-btn custom-remove" title="Remove">&times;</button>
    </div>
  `).join('');

  mount.querySelectorAll('.custom-label').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(e.target.closest('.b-item-row').dataset.idx);
      suitcase.customItems[idx].label = e.target.value;
      saveState();
      renderPackList();
    });
  });

  mount.querySelectorAll('.custom-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.target.closest('.b-item-row').dataset.idx);
      suitcase.customItems.splice(idx, 1);
      saveState();
      renderCustomItems();
      renderPackList();
    });
  });
}

async function renderPackList() {
  const suitcase = activeSuitcase();
  const packedEl = document.getElementById('packed-num');
  const totalEl = document.getElementById('total-num');
  const barEl = document.getElementById('progress-bar');
  const list = document.getElementById('pack-list');
  if (!list) return;

  const items = await mergeItems(suitcase);
  const packed = packedCount(suitcase, items);

  if (packedEl) packedEl.textContent = packed;
  if (totalEl) totalEl.textContent = items.length;
  if (barEl) barEl.style.width = items.length ? `${(packed / items.length) * 100}%` : '0%';

  if (!items.length) {
    list.innerHTML = '<li class="pc-checklist-empty">Add cubes from the left to build your packing list.</li>';
    return;
  }

  list.innerHTML = items.map((item) => {
    const isPacked = !!suitcase.packed[item.itemKey];
    return `
      <li class="${isPacked ? 'packed' : ''}">
        <input type="checkbox" data-key="${escapeAttr(item.itemKey)}" ${isPacked ? 'checked' : ''}
          aria-label="Mark ${escapeAttr(item.label)} as packed">
        <span>${escapeHtml(item.label)}</span>
        <span class="pc-source">${escapeHtml(item.sources.join(', '))}</span>
      </li>`;
  }).join('');

  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      suitcase.packed[e.target.dataset.key] = e.target.checked;
      saveState();
      renderPackList();
    });
  });
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

fetch('./cubes/index.json')
  .then((r) => r.json())
  .then((cubes) => {
    catalog = cubes;
    ensureSuitcase();
    if (addCubeId) {
      const suitcase = activeSuitcase();
      if (!suitcase.cubeIds.includes(addCubeId)) {
        suitcase.cubeIds.push(addCubeId);
        saveState();
      }
      history.replaceState(null, '', './');
    }
    render();
  })
  .catch(() => {
    root.innerHTML = '<p style="padding:40px;text-align:center;font-weight:700;color:var(--brown)">Could not load the cube catalog.</p>';
  });
