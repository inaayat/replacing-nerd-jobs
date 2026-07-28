// Unified packing app: catalog (left) + suitcase builder (right)
import { catalogUrl, cubeJsonUrl } from './paths.js';
import { initBuilder } from './builder.js';

const STORAGE_KEY = 'packing-cubes:suitcases';
const DENSE_CHECKLIST_THRESHOLD = 7;

const root = document.getElementById('app-root');
const toastEl = document.getElementById('toast');
const params = new URLSearchParams(location.search);
const addCubeId = params.get('add');

let catalog = [];
let state = loadState();
let searchQuery = '';
let checklistFilter = '';
let hidePacked = false;
let showHiddenItems = false;
let isOwner = false;
const collapsedGroups = new Set();

// Preview-modal-local staging state (reset each time a preview opens)
let stagedItems = [];

const cubeCache = new Map();
const cubeFetches = new Map();

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

const BAG_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>`;
const EDIT_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHEVRON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

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

function newSuitcase(name) {
  return {
    id: crypto.randomUUID(),
    name,
    cubeIds: [...basicCubeIds()],
    customItems: [],
    packed: {},
    excludedItems: [],
  };
}

function ensureSuitcase() {
  if (!state.suitcases.length) {
    const suitcase = newSuitcase('My trip');
    state.suitcases.push(suitcase);
    state.activeSuitcaseId = suitcase.id;
    saveState();
    return;
  }
  if (!state.activeSuitcaseId) state.activeSuitcaseId = state.suitcases[0].id;
  const suitcase = state.suitcases.find((s) => s.id === state.activeSuitcaseId) || state.suitcases[0];
  if (!suitcase.excludedItems) suitcase.excludedItems = [];
}

function activeSuitcase() {
  ensureSuitcase();
  return state.suitcases.find((s) => s.id === state.activeSuitcaseId) || state.suitcases[0];
}

function itemKey(label) {
  return label.toLowerCase().trim();
}

async function fetchCube(id) {
  if (cubeCache.has(id)) return cubeCache.get(id);
  if (cubeFetches.has(id)) return cubeFetches.get(id);
  const promise = fetch(cubeJsonUrl(id))
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load cube "${id}"`);
      return res.json();
    })
    .then((cube) => {
      cubeCache.set(id, cube);
      cubeFetches.delete(id);
      return cube;
    })
    .catch((err) => {
      cubeFetches.delete(id);
      throw err;
    });
  cubeFetches.set(id, promise);
  return promise;
}

// Groups the suitcase's merged items by the cube they came from, so the
// checklist doesn't repeat the same cube name on every row. Shared items
// (present in more than one selected cube) are placed under the first
// cube (in suitcase order) that contains them; their other sources are
// still recorded for a small "also in ..." note.
async function mergeItemsGrouped(suitcase) {
  const merged = new Map();
  const cubeTitles = new Map();

  for (const cubeId of suitcase.cubeIds) {
    let cube;
    try { cube = await fetchCube(cubeId); } catch { continue; }
    cubeTitles.set(cubeId, cube.title);
    for (const item of cube.items || []) {
      const label = item.label.trim();
      if (!label) continue;
      const key = itemKey(label);
      if (!merged.has(key)) {
        merged.set(key, { label, sources: [cube.title], itemKey: key, cubeId });
      } else {
        const existing = merged.get(key);
        if (!existing.sources.includes(cube.title)) existing.sources.push(cube.title);
      }
    }
  }

  for (const item of suitcase.customItems || []) {
    const label = item.label.trim();
    if (!label) continue;
    const key = itemKey(label);
    if (!merged.has(key)) {
      merged.set(key, { label, sources: ['Custom'], itemKey: key, cubeId: item.cubeId || null });
    }
  }

  const groupByKey = new Map();
  const groups = [];
  function ensureGroup(key, title) {
    if (!groupByKey.has(key)) {
      const g = { key, title, items: [] };
      groupByKey.set(key, g);
      groups.push(g);
    }
    return groupByKey.get(key);
  }

  for (const item of merged.values()) {
    const key = item.cubeId && cubeTitles.has(item.cubeId) ? item.cubeId : '__custom__';
    const title = key === '__custom__' ? 'Custom items' : cubeTitles.get(key);
    ensureGroup(key, title).items.push(item);
  }

  for (const g of groups) g.items.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
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
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function render() {
  root.innerHTML = `
    <div class="pc-app-inner">
      <header class="pc-app-header">
        <div>
          <h1 class="pc-app-title">Packing Cubes</h1>
          <p class="pc-app-subtitle">Mix cubes into your suitcase. Basics start included — remove any you don't need.</p>
        </div>
      </header>

      <aside class="pc-cubes-panel">
        <div class="pc-panel-head">
          <div class="pc-panel-head-row">
            <h2>Available Cubes</h2>
            <a href="/packing-cubes/builder.html" class="pc-btn primary sm">+ Create a cube</a>
          </div>
          <label class="pc-sr-only" for="cube-search">Search cubes</label>
          <input type="search" class="pc-search-input" id="cube-search"
            placeholder="Search cubes…" value="${escapeAttr(searchQuery)}" autocomplete="off">
        </div>
        <div class="pc-cube-list" id="cube-list"></div>
      </aside>

      <main class="pc-suitcase-panel" id="suitcase-panel">
        <div id="suitcase-content"></div>
      </main>
    </div>

    <div class="pc-preview-overlay hidden" id="preview-overlay">
      <div class="pc-preview-modal" id="preview-modal" role="dialog" aria-modal="true"></div>
    </div>

    <div class="pc-preview-overlay hidden" id="builder-overlay">
      <div class="pc-preview-modal pc-builder-modal" id="builder-modal-root" role="dialog" aria-modal="true"></div>
    </div>
  `;

  document.getElementById('cube-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderCubeList();
  });

  document.getElementById('preview-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'preview-overlay') closePreview();
  });
  document.getElementById('builder-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'builder-overlay') closeBuilderModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closePreview();
    closeBuilderModal();
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
    return `
      <div class="pc-cube-card ${inSuitcase ? 'in-suitcase' : ''} ${basic ? 'is-basic' : ''}"
           data-color="${color}" data-cube-id="${c.id}" role="button" tabindex="0"
           aria-haspopup="dialog" aria-label="View ${escapeAttr(c.title)}">
        <div class="pc-cube-icon">${BAG_SVG}</div>
        <div class="pc-cube-info">
          <div class="title">
            ${escapeHtml(c.title)}
            ${basic ? '<span class="pc-cube-badge">Basic</span>' : ''}
          </div>
          <div class="blurb">${escapeHtml(c.blurb || '')}</div>
        </div>
        ${isOwner ? `<button type="button" class="pc-cube-edit" data-edit-id="${c.id}" title="Edit cube" aria-label="Edit ${escapeAttr(c.title)}">${EDIT_SVG}</button>` : ''}
        ${inSuitcase ? `<span class="pc-cube-status" title="In your suitcase" aria-label="In your suitcase">${CHECK_SVG}</span>` : ''}
      </div>`;
  }).join('');

  mount.querySelectorAll('.pc-cube-card').forEach((card) => {
    const open = () => openPreview(card.dataset.cubeId);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });

  mount.querySelectorAll('.pc-cube-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBuilderModal(btn.dataset.editId);
    });
  });
}

function addCubeToSuitcase(cubeId) {
  const suitcase = activeSuitcase();
  if (!suitcase.cubeIds.includes(cubeId)) suitcase.cubeIds.push(cubeId);
  saveState();
}

function removeCubeFromSuitcase(cubeId) {
  const suitcase = activeSuitcase();
  suitcase.cubeIds = suitcase.cubeIds.filter((x) => x !== cubeId);
  saveState();
}

async function openPreview(cubeId) {
  const overlay = document.getElementById('preview-overlay');
  const modal = document.getElementById('preview-modal');
  if (!overlay || !modal) return;

  stagedItems = [];
  const catalogEntry = catalog.find((c) => c.id === cubeId);
  modal.innerHTML = `<p class="pc-preview-loading">Loading…</p>`;
  overlay.classList.remove('hidden');

  let cube;
  try {
    cube = await fetchCube(cubeId);
  } catch {
    modal.innerHTML = `<p class="pc-preview-loading">Could not load that cube.</p>
      <button type="button" class="pc-btn sm" id="preview-close">Close</button>`;
    document.getElementById('preview-close').addEventListener('click', closePreview);
    return;
  }

  const tags = (catalogEntry?.tags || cube.tags || []).map((t) => `<span class="pc-tag">${escapeHtml(t)}</span>`).join('');

  modal.innerHTML = `
    <button type="button" class="pc-preview-close" id="preview-close" aria-label="Close preview">&times;</button>
    <h2 class="pc-preview-title">${escapeHtml(cube.title)}</h2>
    <p class="pc-preview-blurb">${escapeHtml(cube.blurb || '')}</p>
    <div class="pc-tags">${tags}</div>
    <ul class="pc-preview-items">
      ${(cube.items || []).map((item) => `<li>${escapeHtml(item.label)}</li>`).join('')}
    </ul>
    <div class="pc-stage-section">
      <div class="pc-stage-label">Add an item</div>
      <div class="pc-stage-row">
        <input type="text" id="stage-input" class="b-mini-input" placeholder="e.g. Travel pillow">
        <button type="button" class="pc-btn sm" id="stage-add-btn">+ Add</button>
      </div>
      <ul class="pc-stage-list" id="stage-list"></ul>
      <label class="pc-toggle-chip" id="stage-permanent-row">
        <input type="checkbox" id="stage-permanent" disabled>
        ${isOwner ? 'Also publish this to the cube for everyone' : 'Also suggest this as a permanent addition (opens a PR)'}
      </label>
    </div>
    <button type="button" class="pc-btn primary" id="preview-commit" style="width:100%;margin-top:12px"></button>
    ${isOwner ? `<button type="button" class="pc-delete-cube-btn" id="delete-cube-btn">Delete this cube</button>` : ''}
  `;

  document.getElementById('preview-close').addEventListener('click', closePreview);
  document.getElementById('stage-add-btn').addEventListener('click', () => addStagedItem(cubeId));
  document.getElementById('stage-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addStagedItem(cubeId); }
  });
  document.getElementById('preview-commit').addEventListener('click', () => commitPreview(cubeId));
  const deleteBtn = document.getElementById('delete-cube-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', () => deleteCubeEverywhere(cubeId, cube.title));

  renderStagedList(cubeId);
}

function addStagedItem(cubeId) {
  const input = document.getElementById('stage-input');
  const label = input.value.trim();
  if (!label) return;
  stagedItems.push(label);
  input.value = '';
  input.focus();
  renderStagedList(cubeId);
}

function renderStagedList(cubeId) {
  const list = document.getElementById('stage-list');
  const permanentCheckbox = document.getElementById('stage-permanent');
  const commitBtn = document.getElementById('preview-commit');
  if (!list || !commitBtn) return;

  list.innerHTML = stagedItems.map((label, i) => `
    <li class="pc-stage-item" data-idx="${i}">
      <span>${escapeHtml(label)}</span>
      <button type="button" class="pc-item-hide" title="Remove">&times;</button>
    </li>`).join('');

  list.querySelectorAll('.pc-item-hide').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.closest('.pc-stage-item').dataset.idx);
      stagedItems.splice(idx, 1);
      renderStagedList(cubeId);
    });
  });

  permanentCheckbox.disabled = stagedItems.length === 0;
  if (stagedItems.length === 0) permanentCheckbox.checked = false;

  const suitcase = activeSuitcase();
  const inSuitcase = suitcase.cubeIds.includes(cubeId);
  if (!inSuitcase) {
    commitBtn.textContent = 'Add to suitcase';
  } else if (stagedItems.length) {
    commitBtn.textContent = `Add item${stagedItems.length > 1 ? 's' : ''} to suitcase`;
  } else {
    commitBtn.textContent = 'Remove from suitcase';
  }
}

async function publishItemsToCube(cubeId, newLabels) {
  const cube = await fetchCube(cubeId);
  const updatedCube = {
    id: cubeId,
    title: cube.title,
    blurb: cube.blurb || '',
    tags: cube.tags || [],
    items: [...(cube.items || []), ...newLabels.map((label) => ({ label }))],
  };
  const res = await fetch('/api/save-cube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube: updatedCube, mode: isOwner ? 'publish' : 'submit' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  if (isOwner) cubeCache.set(cubeId, updatedCube);
  return data;
}

async function commitPreview(cubeId) {
  const suitcase = activeSuitcase();
  const wasInSuitcase = suitcase.cubeIds.includes(cubeId);
  const permanentCheckbox = document.getElementById('stage-permanent');
  const makePermanent = !!permanentCheckbox && permanentCheckbox.checked && stagedItems.length > 0;
  const itemsToStage = [...stagedItems];

  if (!wasInSuitcase) {
    addCubeToSuitcase(cubeId);
    for (const label of itemsToStage) suitcase.customItems.push({ label, cubeId });
  } else if (itemsToStage.length) {
    for (const label of itemsToStage) suitcase.customItems.push({ label, cubeId });
  } else {
    removeCubeFromSuitcase(cubeId);
  }
  saveState();

  closePreview();
  renderCubeList();
  renderPackList();

  if (makePermanent) {
    try {
      const data = await publishItemsToCube(cubeId, itemsToStage);
      showToast(isOwner ? 'Added to the cube for everyone' : 'Suggested as a permanent addition — check the PR');
      if (!isOwner && data.prUrl) console.info('Edit PR:', data.prUrl);
    } catch (err) {
      showToast(`Couldn't make it permanent: ${err.message}`);
    }
  }
}

function closePreview() {
  const overlay = document.getElementById('preview-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function openBuilderModal(editId) {
  const overlay = document.getElementById('builder-overlay');
  const builderRoot = document.getElementById('builder-modal-root');
  if (!overlay || !builderRoot) return;
  builderRoot.innerHTML = '';
  overlay.classList.remove('hidden');
  initBuilder({
    root: builderRoot,
    editId: editId || null,
    onClose: closeBuilderModal,
    onPublished: refreshCatalog,
  });
}

function closeBuilderModal() {
  const overlay = document.getElementById('builder-overlay');
  if (overlay) overlay.classList.add('hidden');
}

async function refreshCatalog() {
  try {
    const res = await fetch(catalogUrl, { cache: 'no-store' });
    if (!res.ok) return;
    catalog = await res.json();
    cubeCache.clear();
    renderCubeList();
    renderSuitcase();
  } catch { /* ignore */ }
}

async function labelsCoveredByCubes(cubeIds) {
  const labels = new Set();
  for (const id of cubeIds) {
    let cube;
    try { cube = await fetchCube(id); } catch { continue; }
    for (const item of cube.items || []) {
      const label = (item.label || '').trim();
      if (label) labels.add(label.toLowerCase());
    }
  }
  return labels;
}

async function deleteCubeEverywhere(cubeId, title) {
  if (!confirm(`Delete "${title}"? It's removed from the catalog for everyone and can't be undone. Its items already in your saved suitcases will be kept as custom items.`)) return;

  let cubeItems = [];
  try {
    const cube = await fetchCube(cubeId);
    cubeItems = cube.items || [];
  } catch { /* nothing to preserve if we can't read it */ }

  try {
    const res = await fetch('/api/save-cube', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cubeId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

    for (const s of state.suitcases) {
      if (!s.cubeIds.includes(cubeId)) continue;
      const remainingCubeIds = s.cubeIds.filter((id) => id !== cubeId);
      const covered = await labelsCoveredByCubes(remainingCubeIds);
      const existingCustomLabels = new Set((s.customItems || []).map((i) => i.label.trim().toLowerCase()));
      for (const item of cubeItems) {
        const label = (item.label || '').trim();
        if (!label) continue;
        const lower = label.toLowerCase();
        if (covered.has(lower) || existingCustomLabels.has(lower)) continue;
        s.customItems.push({ label });
        existingCustomLabels.add(lower);
      }
      s.cubeIds = remainingCubeIds;
    }
    saveState();
    cubeCache.delete(cubeId);
    closePreview();
    await refreshCatalog();
    showToast(`Deleted "${title}" — its items were kept as custom items`);
  } catch (err) {
    showToast(`Couldn't delete: ${err.message}`);
  }
}

function renderSuitcase() {
  const suitcase = activeSuitcase();
  const content = document.getElementById('suitcase-content');
  if (!content) return;

  content.innerHTML = `
    <div class="pc-suitcase-head">
      <h2>Your Suitcase</h2>
      <div class="pc-suitcase-controls">
        <input type="text" id="trip-name" class="b-mini-input" style="width:auto;min-width:130px"
          value="${escapeAttr(suitcase.name)}" placeholder="Trip name" aria-label="Trip name">
        <select id="suitcase-select" aria-label="Load a saved suitcase">
          ${state.suitcases.map((s) => `<option value="${s.id}" ${s.id === suitcase.id ? 'selected' : ''}>${escapeHtml(s.name || 'Untitled')}</option>`).join('')}
        </select>
        <button type="button" class="pc-btn sm" id="new-suitcase-btn">+ New</button>
        <button type="button" class="pc-btn sm" id="delete-suitcase-btn" ${state.suitcases.length <= 1 ? 'disabled' : ''}>Delete</button>
      </div>
    </div>
    <div class="pc-suitcase-body">
      <div class="pc-hud" id="pack-hud">
        <div class="pc-stat"><b id="packed-num">0</b><span>packed</span></div>
        <div class="pc-stat"><b id="total-num">0</b><span>total</span></div>
        <div class="pc-spacer"></div>
        <span style="font-size:0.75rem;font-weight:700;color:var(--brown)">${suitcase.cubeIds.length} cube${suitcase.cubeIds.length === 1 ? '' : 's'}</span>
      </div>
      <div class="pc-progress-bar"><i id="progress-bar"></i></div>

      <div class="pc-checklist-toolbar">
        <input type="search" id="checklist-filter" class="pc-search-input sm" placeholder="Filter items…" aria-label="Filter packing checklist" value="${escapeAttr(checklistFilter)}">
        <label class="pc-toggle-chip"><input type="checkbox" id="hide-packed-toggle" ${hidePacked ? 'checked' : ''}> Hide packed</label>
      </div>
      <div id="pack-list-groups"></div>
      <button type="button" class="pc-hidden-toggle hidden" id="hidden-items-toggle"></button>
      <div id="hidden-items-wrap"></div>
    </div>
    <div class="pc-suitcase-footer">
      <p class="pc-footer-note">Saved automatically in this browser — won't sync to other devices.</p>
      <button type="button" class="pc-btn sm" id="submit-suitcase-btn">Submit via PR</button>
    </div>
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

  document.getElementById('new-suitcase-btn').addEventListener('click', () => {
    const suitcase = newSuitcase('New trip');
    state.suitcases.push(suitcase);
    state.activeSuitcaseId = suitcase.id;
    saveState();
    renderCubeList();
    renderSuitcase();
    showToast('New suitcase created');
  });

  document.getElementById('delete-suitcase-btn').addEventListener('click', () => {
    if (state.suitcases.length <= 1) return;
    if (!confirm(`Delete "${suitcase.name || 'Untitled'}"? This can't be undone.`)) return;
    state.suitcases = state.suitcases.filter((s) => s.id !== suitcase.id);
    state.activeSuitcaseId = state.suitcases[0].id;
    saveState();
    renderCubeList();
    renderSuitcase();
    showToast('Suitcase deleted');
  });

  document.getElementById('checklist-filter').addEventListener('input', (e) => {
    checklistFilter = e.target.value;
    renderPackList();
  });

  document.getElementById('hide-packed-toggle').addEventListener('change', (e) => {
    hidePacked = e.target.checked;
    renderPackList();
  });

  document.getElementById('submit-suitcase-btn').addEventListener('click', () => submitSuitcasePR(suitcase));

  renderPackList();
}

async function submitSuitcasePR(suitcase) {
  const submitter = (prompt('Optional: how should we credit you? (leave blank to submit anonymously)') || '').trim();
  const btn = document.getElementById('submit-suitcase-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  try {
    const res = await fetch('/api/save-suitcase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suitcase, submitter }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    showToast('Submitted! Your suitcase is waiting for review.');
    if (data.prUrl) console.info('Suitcase PR:', data.prUrl);
  } catch (err) {
    showToast(`Couldn't submit: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit via PR'; }
  }
}

function updateHud(suitcase, items) {
  const packed = packedCount(suitcase, items);
  const packedEl = document.getElementById('packed-num');
  const totalEl = document.getElementById('total-num');
  const barEl = document.getElementById('progress-bar');
  if (packedEl) packedEl.textContent = packed;
  if (totalEl) totalEl.textContent = items.length;
  if (barEl) barEl.style.width = items.length ? `${(packed / items.length) * 100}%` : '0%';
  if (items.length && packed === items.length) {
    showToast('All packed! 🧳');
  }
}

function itemRowHtml(item, groupTitle, isPacked) {
  const otherSources = item.sources.filter((s) => s !== groupTitle);
  return `
    <li class="${isPacked ? 'packed' : ''}" data-key="${escapeAttr(item.itemKey)}">
      <input type="checkbox" data-key="${escapeAttr(item.itemKey)}" ${isPacked ? 'checked' : ''}
        aria-label="Mark ${escapeAttr(item.label)} as packed">
      <span>${escapeHtml(item.label)}</span>
      ${otherSources.length ? `<span class="pc-source">also in ${escapeHtml(otherSources.join(', '))}</span>` : ''}
      <button type="button" class="pc-item-hide" title="Hide item" aria-label="Hide ${escapeAttr(item.label)}">&times;</button>
    </li>`;
}

function bindItemRow(li, suitcase) {
  const cb = li.querySelector('input[type="checkbox"]');
  cb.addEventListener('change', (e) => {
    suitcase.packed[e.target.dataset.key] = e.target.checked;
    saveState();
    if (hidePacked) {
      renderPackList();
    } else {
      li.classList.toggle('packed', e.target.checked);
      renderPackList(true);
    }
  });
  li.querySelector('.pc-item-hide').addEventListener('click', () => {
    const key = li.dataset.key;
    if (!suitcase.excludedItems.includes(key)) suitcase.excludedItems.push(key);
    saveState();
    renderPackList();
  });
}

async function renderPackList(hudOnly) {
  const suitcase = activeSuitcase();
  const groupsMount = document.getElementById('pack-list-groups');
  if (!groupsMount) return;

  const groups = await mergeItemsGrouped(suitcase);
  const allItems = groups.flatMap((g) => g.items);
  const visibleItems = allItems.filter((i) => !suitcase.excludedItems.includes(i.itemKey));

  if (hudOnly) {
    updateHud(suitcase, visibleItems);
    return;
  }

  updateHud(suitcase, visibleItems);

  const hiddenCount = allItems.length - visibleItems.length;
  const hiddenToggle = document.getElementById('hidden-items-toggle');
  const hiddenWrap = document.getElementById('hidden-items-wrap');
  if (hiddenToggle) {
    if (hiddenCount > 0) {
      hiddenToggle.classList.remove('hidden');
      hiddenToggle.textContent = showHiddenItems ? 'Hide hidden items' : `Show ${hiddenCount} hidden item${hiddenCount === 1 ? '' : 's'}`;
      hiddenToggle.onclick = () => { showHiddenItems = !showHiddenItems; renderPackList(); };
    } else {
      hiddenToggle.classList.add('hidden');
      showHiddenItems = false;
    }
  }

  const q = checklistFilter.trim().toLowerCase();

  if (!allItems.length) {
    groupsMount.innerHTML = '<p class="pc-checklist-empty">Add cubes from the left to build your packing list.</p>';
    if (hiddenWrap) hiddenWrap.innerHTML = '';
    return;
  }

  let anyVisible = false;
  groupsMount.innerHTML = groups.map((group) => {
    let items = group.items.filter((i) => !suitcase.excludedItems.includes(i.itemKey));
    items = items.filter((i) => !q || i.label.toLowerCase().includes(q));
    if (hidePacked) items = items.filter((i) => !suitcase.packed[i.itemKey]);
    if (!items.length) return '';
    anyVisible = true;
    const collapsed = collapsedGroups.has(group.key);
    return `
      <div class="pc-item-group ${collapsed ? 'collapsed' : ''}" data-group-key="${escapeAttr(group.key)}">
        <button type="button" class="pc-group-header">
          <span class="chevron">${CHEVRON_SVG}</span>
          <span class="pc-group-title">${escapeHtml(group.title)}</span>
          <span class="pc-group-count">${items.length}</span>
        </button>
        <ul class="pc-checklist">
          ${items.map((item) => itemRowHtml(item, group.title, !!suitcase.packed[item.itemKey])).join('')}
        </ul>
      </div>`;
  }).join('');

  if (!anyVisible) {
    groupsMount.innerHTML = `<p class="pc-checklist-empty">${q || hidePacked ? 'No items match.' : 'Nothing here yet.'}</p>`;
  }

  groupsMount.querySelectorAll('.pc-group-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupEl = btn.closest('.pc-item-group');
      const key = groupEl.dataset.groupKey;
      if (collapsedGroups.has(key)) collapsedGroups.delete(key);
      else collapsedGroups.add(key);
      groupEl.classList.toggle('collapsed');
    });
  });

  groupsMount.querySelectorAll('li[data-key]').forEach((li) => bindItemRow(li, suitcase));

  if (hiddenWrap) {
    const hiddenItems = showHiddenItems
      ? allItems.filter((i) => suitcase.excludedItems.includes(i.itemKey) && (!q || i.label.toLowerCase().includes(q)))
      : [];
    hiddenWrap.innerHTML = hiddenItems.length ? `
      <div class="pc-item-group">
        <ul class="pc-checklist">
          ${hiddenItems.map((item) => `
            <li class="pc-item-hidden-row" data-key="${escapeAttr(item.itemKey)}">
              <span>${escapeHtml(item.label)}</span>
              <span class="pc-source">${escapeHtml(item.sources.join(', '))}</span>
              <button type="button" class="pc-item-restore" data-restore-key="${escapeAttr(item.itemKey)}">Restore</button>
            </li>`).join('')}
        </ul>
      </div>` : '';

    hiddenWrap.querySelectorAll('.pc-item-restore').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.restoreKey;
        suitcase.excludedItems = suitcase.excludedItems.filter((k) => k !== key);
        saveState();
        renderPackList();
      });
    });
  }

  renderCustomItemsEditor();
}

function renderCustomItemsEditor() {
  let mount = document.getElementById('custom-items-editor');
  const body = document.querySelector('.pc-suitcase-body');
  if (!mount && body) {
    mount = document.createElement('div');
    mount.id = 'custom-items-editor';
    body.appendChild(mount);
  }
  if (!mount) return;

  const suitcase = activeSuitcase();
  mount.innerHTML = `
    <div class="pc-section-label">Custom items</div>
    <div id="custom-items"></div>
    <button type="button" class="b-add-row-btn" id="add-custom-btn" style="margin-top:6px">+ Add custom item</button>
  `;

  document.getElementById('add-custom-btn').addEventListener('click', () => {
    suitcase.customItems.push({ label: '' });
    saveState();
    renderCustomItemRows();
    renderPackList();
  });

  renderCustomItemRows();
}

function renderCustomItemRows() {
  const suitcase = activeSuitcase();
  const mount = document.getElementById('custom-items');
  if (!mount) return;

  mount.innerHTML = (suitcase.customItems || []).map((item, i) => `
    <div class="b-item-row" data-idx="${i}">
      <input type="text" class="b-mini-input custom-label"
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
      renderCustomItemRows();
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

function updateAuthLink() {
  const link = document.getElementById('nav-auth-link');
  if (!link) return;
  link.textContent = isOwner ? 'Log out' : 'Log in';
  link.href = isOwner ? '/api/logout' : '/private/';
}

// Open the inline "create a cube" modal instead of navigating away, for
// any link that points at the standalone builder page (nav bar + header
// button both use this href).
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href="/packing-cubes/builder.html"]');
  if (!link) return;
  e.preventDefault();
  openBuilderModal(null);
});

fetch('/api/save-cube')
  .then((r) => r.json())
  .then((d) => { isOwner = !!d.authed; })
  .catch(() => { isOwner = false; })
  .finally(() => {
    updateAuthLink();
    if (catalog.length) renderCubeList();
  });

fetch(catalogUrl)
  .then((r) => {
    if (!r.ok) throw new Error(`Catalog request failed (${r.status})`);
    return r.json();
  })
  .then((cubes) => {
    if (!Array.isArray(cubes)) throw new Error('Catalog is not an array');
    catalog = cubes;
    ensureSuitcase();
    if (addCubeId) {
      const suitcase = activeSuitcase();
      if (!suitcase.cubeIds.includes(addCubeId)) {
        suitcase.cubeIds.push(addCubeId);
        saveState();
      }
      const url = new URL(location.href);
      url.searchParams.delete('add');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    try {
      render();
      if (addCubeId) {
        const added = catalog.find((c) => c.id === addCubeId);
        if (added) showToast(`Added "${added.title}" to your suitcase`);
      }
    } catch (err) {
      console.error('Packing cubes render error:', err);
      root.innerHTML = '<p style="padding:40px;text-align:center;font-weight:700;color:var(--brown)">Something went wrong loading the app.</p>';
    }
  })
  .catch((err) => {
    console.error('Packing cubes catalog error:', err);
    root.innerHTML = '<p style="padding:40px;text-align:center;font-weight:700;color:var(--brown)">Could not load the cube catalog.</p>';
  });
