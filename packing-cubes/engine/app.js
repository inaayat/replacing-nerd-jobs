// Packing Cubes app: a flat packing list first (the source of truth), with
// cubes as an organization layer — every cube is the user's own choice, the
// catalog offers common starter cubes (never auto-attached), optional add-ons
// per cube, and an Organize mode that files list items into cubes.
// All list/cube semantics live in the pure module ./model.js (tested by
// scripts/test-packing-cubes-model.mjs); this file is fetch + DOM only.
import { catalogUrl, cubeJsonUrl } from './paths.js';
import { initBuilder } from './builder.js';
import { initAuth, wireAuthLink, refreshToken } from './auth.js';
import { cubesApi, suitcasesApi } from './api.js';
import {
  isCommonCube,
  matchesQuery,
  sortCatalog,
  newSuitcase,
  isLegacySuitcase,
  migrateSuitcase,
  normalizeSuitcase,
  addItem,
  removeItem,
  updateItemLabel,
  setItemPacked,
  assignItem,
  packedStats,
  allPacked,
  attachCube,
  detachCube,
  cubeAddOns,
  addOnEnabled,
  setAddOn,
  releaseDeletedCube,
  groupedItems,
  unsortedCount,
  UNSORTED_KEY,
} from './model.js';

const STORAGE_KEY = 'packing-cubes:suitcases';
const VIEW_KEY = 'packing-cubes:list-view';

const root = document.getElementById('app-root');
const toastEl = document.getElementById('toast');
const params = new URLSearchParams(location.search);
const addCubeId = params.get('add');

let catalog = [];
let state = { activeSuitcaseId: null, suitcases: [] };
let auth = null;
let guestMode = false;

let searchQuery = '';
let listFilter = '';
let hidePacked = false;
let organizeMode = false;
let listView = localStorage.getItem(VIEW_KEY) === 'cube' ? 'cube' : 'list';
let mobilePane = 'list';
let saveTimer = null;
let wasAllPacked = false;
const collapsedGroups = new Set();
const expandedCubeIds = new Set();

const cubeCache = new Map();
const cubeFetches = new Map();

const BAG_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>`;
const EDIT_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHEVRON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

// ---------------------------------------------------------------------------
// State persistence: localStorage always (instant + guest mode), cloud when
// signed in, debounced.
// ---------------------------------------------------------------------------

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { activeSuitcaseId: null, suitcases: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSave();
}

function scheduleCloudSave() {
  if (guestMode || !auth?.signedIn || !auth.token) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    suitcasesApi.put(auth.token, state).catch((err) => {
      if (err.status === 401) {
        auth.needsReauth = true;
        auth.signedIn = false;
        guestMode = true;
        renderFooter();
        showToast('Session expired — changes are staying on this device.');
        return;
      }
      console.warn('Suitcase sync failed:', err);
      showToast(`Couldn't sync: ${err.message}`);
    });
  }, 450);
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
}

function activeSuitcase() {
  ensureSuitcase();
  return state.suitcases.find((s) => s.id === state.activeSuitcaseId) || state.suitcases[0];
}

// ---------------------------------------------------------------------------
// Cube resolution
// ---------------------------------------------------------------------------

async function fetchCube(id) {
  if (cubeCache.has(id)) return cubeCache.get(id);
  if (cubeFetches.has(id)) return cubeFetches.get(id);

  const promise = (async () => {
    const listed = catalog.find((c) => c.id === id);
    if (listed?.items) {
      cubeCache.set(id, listed);
      return listed;
    }
    if (!guestMode && auth?.token) {
      try {
        const { cube } = await cubesApi.get(auth.token, id);
        cubeCache.set(id, cube);
        return cube;
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
    const res = await fetch(cubeJsonUrl(id));
    if (!res.ok) throw new Error(`Could not load cube "${id}"`);
    const cube = await res.json();
    cube.source = cube.source || 'static';
    cubeCache.set(id, cube);
    return cube;
  })().finally(() => cubeFetches.delete(id));

  cubeFetches.set(id, promise);
  return promise;
}

/** Titles resolve from cache or the catalog index; items need the cache. */
function cubesById() {
  const map = new Map();
  for (const cube of catalog) map.set(cube.id, cubeCache.get(cube.id) || cube);
  for (const [id, cube] of cubeCache) map.set(id, cube);
  return map;
}

async function prefetchSuitcaseCubes(suitcase) {
  const wanted = new Set(suitcase.cubeIds);
  for (const item of suitcase.items) if (item.cubeId) wanted.add(item.cubeId);
  await Promise.all([...wanted].map((id) => fetchCube(id).catch(() => null)));
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
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
    <div class="pc-app-inner pane-${mobilePane}">
      <header class="pc-app-header">
        <div>
          <h1 class="pc-app-title">Packing Cubes</h1>
          <p class="pc-app-subtitle">Build your packing list first. Organize it into cubes whenever you're ready.</p>
        </div>
        <div class="pc-pane-tabs" role="tablist" aria-label="Panel">
          <button type="button" role="tab" data-pane="list" aria-selected="${mobilePane === 'list'}">Packing list</button>
          <button type="button" role="tab" data-pane="cubes" aria-selected="${mobilePane === 'cubes'}">Cube library</button>
        </div>
      </header>

      <main class="pc-list-panel" id="list-panel">
        <div id="list-content"></div>
      </main>

      <aside class="pc-cubes-panel">
        <div class="pc-panel-head">
          <div class="pc-panel-head-row">
            <h2>Cube library</h2>
            <a href="/packing-cubes/builder.html" class="pc-btn primary sm">+ New cube</a>
          </div>
          <label class="pc-sr-only" for="cube-search">Search cubes</label>
          <input type="search" class="pc-search-input" id="cube-search"
            placeholder="Search cubes…" value="${escapeAttr(searchQuery)}" autocomplete="off">
        </div>
        <div class="pc-cube-list" id="cube-list"></div>
      </aside>
    </div>

    <div class="pc-modal-overlay hidden" id="builder-overlay">
      <div class="pc-modal pc-builder-modal" id="builder-modal-root" role="dialog" aria-modal="true"></div>
    </div>
  `;

  document.getElementById('cube-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderCubeList();
  });

  root.querySelectorAll('.pc-pane-tabs [data-pane]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mobilePane = btn.dataset.pane;
      const inner = root.querySelector('.pc-app-inner');
      inner.classList.toggle('pane-list', mobilePane === 'list');
      inner.classList.toggle('pane-cubes', mobilePane === 'cubes');
      root.querySelectorAll('.pc-pane-tabs [data-pane]').forEach((b) => {
        b.setAttribute('aria-selected', String(b.dataset.pane === mobilePane));
      });
    });
  });

  document.getElementById('builder-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'builder-overlay') closeBuilderModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeBuilderModal();
    if (expandedCubeIds.size) {
      expandedCubeIds.clear();
      renderCubeList();
    }
  });

  renderCubeList();
  renderListPanel();
}

// ---------------------------------------------------------------------------
// Cube library (left rail)
// ---------------------------------------------------------------------------

function canEditCube(cube) {
  return !guestMode && !!cube?.mine;
}

function renderCubeList() {
  const mount = document.getElementById('cube-list');
  if (!mount) return;

  const suitcase = activeSuitcase();
  const q = searchQuery.trim().toLowerCase();
  const cubes = sortCatalog(catalog).filter((c) => matchesQuery(cubeCache.get(c.id) || c, q));

  if (!cubes.length) {
    mount.innerHTML = `<p class="pc-no-results">No cubes match "${escapeHtml(searchQuery)}".</p>`;
    return;
  }

  mount.innerHTML = cubes.map((c) => {
    const attached = suitcase.cubeIds.includes(c.id);
    const common = isCommonCube(c);
    const expanded = expandedCubeIds.has(c.id);
    return `
      <div class="pc-cube-card ${attached ? 'in-suitcase' : ''} ${expanded ? 'expanded' : ''}" data-cube-id="${escapeAttr(c.id)}">
        <div class="pc-cube-card-header" role="button" tabindex="0" aria-expanded="${expanded}"
             aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeAttr(c.title)}">
          <div class="pc-cube-icon">${BAG_SVG}</div>
          <div class="pc-cube-info">
            <div class="title">
              ${escapeHtml(c.title)}
              ${common ? '<span class="pc-cube-badge standard">Common</span>' : ''}
              ${c.mine && !c.is_public && c.source === 'db' ? '<span class="pc-cube-badge">Private</span>' : ''}
              ${c.mine && c.is_public ? '<span class="pc-cube-badge">Public</span>' : ''}
            </div>
            <div class="blurb">${escapeHtml(c.blurb || '')}</div>
          </div>
          ${canEditCube(c) ? `<button type="button" class="pc-cube-edit" data-edit-id="${escapeAttr(c.id)}" title="Edit cube" aria-label="Edit ${escapeAttr(c.title)}">${EDIT_SVG}</button>` : ''}
          <button type="button" class="pc-cube-quick-add ${attached ? 'added' : ''}" data-quick-id="${escapeAttr(c.id)}"
            title="${attached ? 'Remove from packing list' : 'Add to packing list'}"
            aria-label="${attached ? 'Remove' : 'Add'} ${escapeAttr(c.title)}">${attached ? CHECK_SVG : '+'}</button>
          <span class="pc-cube-chevron">${CHEVRON_SVG}</span>
        </div>
        ${expanded ? `<div class="pc-cube-expand" id="cube-expand-${escapeAttr(c.id)}">${expandBodyHtml(c.id)}</div>` : ''}
      </div>`;
  }).join('');

  mount.querySelectorAll('.pc-cube-card-header').forEach((header) => {
    const toggle = () => toggleCubeExpand(header.closest('.pc-cube-card').dataset.cubeId);
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  mount.querySelectorAll('.pc-cube-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBuilderModal(btn.dataset.editId);
    });
  });

  mount.querySelectorAll('.pc-cube-quick-add').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      quickToggleCube(btn.dataset.quickId);
    });
  });

  for (const cubeId of expandedCubeIds) bindExpandInteractions(cubeId);
}

async function quickToggleCube(cubeId) {
  const suitcase = activeSuitcase();
  if (suitcase.cubeIds.includes(cubeId)) {
    const removed = suitcase.items.filter((i) => i.cubeId === cubeId).length;
    const title = (cubeCache.get(cubeId) || catalog.find((c) => c.id === cubeId))?.title || cubeId;
    detachCube(suitcase, cubeId);
    saveState();
    renderCubeList();
    renderList();
    showToast(`Removed "${title}"${removed ? ` — ${removed} item${removed === 1 ? '' : 's'} off the list` : ''}`);
    return;
  }
  try {
    const cube = await fetchCube(cubeId);
    const imported = attachCube(suitcase, cube);
    saveState();
    renderCubeList();
    renderList();
    showToast(imported ? `Added ${imported} item${imported === 1 ? '' : 's'} from "${cube.title}"` : `"${cube.title}" attached — its items were already on your list`);
  } catch (err) {
    showToast(err.message);
  }
}

function toggleCubeExpand(cubeId) {
  if (expandedCubeIds.has(cubeId)) {
    expandedCubeIds.delete(cubeId);
  } else {
    expandedCubeIds.add(cubeId);
  }
  renderCubeList();
}

function expandBodyHtml(cubeId) {
  const cube = cubeCache.get(cubeId);
  if (!cube) return `<p class="pc-expand-loading">Loading…</p>`;

  const suitcase = activeSuitcase();
  const attached = suitcase.cubeIds.includes(cubeId);
  const mine = canEditCube(catalog.find((c) => c.id === cubeId) || cube);
  const tags = (cube.tags || []).map((t) => `<span class="pc-tag">${escapeHtml(t)}</span>`).join('');
  const addOns = cubeAddOns(cube);

  return `
    ${cube.blurb ? `<p class="pc-expand-blurb">${escapeHtml(cube.blurb)}</p>` : ''}
    ${tags ? `<div class="pc-tags">${tags}</div>` : ''}
    <ul class="pc-expand-items">
      ${(cube.items || []).map((item) => `<li>${escapeHtml(item.label)}</li>`).join('')}
    </ul>
    ${addOns.length ? `
      <div class="pc-addon-section">
        <div class="pc-section-label">Add-ons for this trip</div>
        <div class="pc-addon-chips">
          ${addOns.map((a) => {
            const on = addOnEnabled(suitcase, cubeId, a.id);
            return `<button type="button" class="pc-addon-chip ${on ? 'on' : ''}" data-addon-cube="${escapeAttr(cubeId)}" data-addon-id="${escapeAttr(a.id)}" aria-pressed="${on}">
              ${on ? CHECK_SVG : '+'} ${escapeHtml(a.title)} <span class="count">${(a.items || []).length}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
    ` : ''}
    <div class="pc-expand-actions">
      <button type="button" class="pc-btn ${attached ? '' : 'primary'}" id="attach-btn-${escapeAttr(cubeId)}" style="width:100%">
        ${attached ? 'Remove from packing list' : 'Add to packing list'}
      </button>
      ${!mine ? `<button type="button" class="pc-expand-link" id="template-cube-link-${escapeAttr(cubeId)}">Copy into a cube of my own</button>` : ''}
      ${mine ? `
        <button type="button" class="pc-expand-link" id="edit-cube-link-${escapeAttr(cubeId)}">Edit this cube</button>
        ${!cube.is_public ? `<button type="button" class="pc-expand-link" id="publish-cube-btn-${escapeAttr(cubeId)}">Make public</button>` : ''}
        <button type="button" class="pc-delete-cube-btn" id="delete-cube-btn-${escapeAttr(cubeId)}">Delete this cube</button>
      ` : ''}
    </div>
  `;
}

function bindExpandInteractions(cubeId) {
  const container = document.getElementById(`cube-expand-${cubeId}`);
  if (!container) return;

  if (!cubeCache.has(cubeId)) {
    fetchCube(cubeId)
      .then(() => {
        if (!expandedCubeIds.has(cubeId)) return;
        container.innerHTML = expandBodyHtml(cubeId);
        bindExpandInteractions(cubeId);
      })
      .catch(() => {
        container.innerHTML = `<p class="pc-expand-loading">Could not load that cube.</p>`;
      });
    return;
  }

  const attachBtn = document.getElementById(`attach-btn-${cubeId}`);
  if (attachBtn) attachBtn.addEventListener('click', () => quickToggleCube(cubeId));

  container.querySelectorAll('.pc-addon-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      toggleAddOn(chip.dataset.addonCube, chip.dataset.addonId);
    });
  });

  const editLink = document.getElementById(`edit-cube-link-${cubeId}`);
  if (editLink) editLink.addEventListener('click', () => openBuilderModal(cubeId));
  const templateLink = document.getElementById(`template-cube-link-${cubeId}`);
  if (templateLink) templateLink.addEventListener('click', () => openBuilderModal(null, cubeId));
  const publishBtn = document.getElementById(`publish-cube-btn-${cubeId}`);
  if (publishBtn) publishBtn.addEventListener('click', () => makeCubePublic(cubeId));
  const deleteBtn = document.getElementById(`delete-cube-btn-${cubeId}`);
  if (deleteBtn) deleteBtn.addEventListener('click', () => deleteCubeEverywhere(cubeId));
}

function toggleAddOn(cubeId, addOnId) {
  const cube = cubeCache.get(cubeId);
  if (!cube) return;
  const suitcase = activeSuitcase();
  const enabled = addOnEnabled(suitcase, cubeId, addOnId);
  const count = setAddOn(suitcase, cube, addOnId, !enabled);
  saveState();
  renderCubeList();
  renderList();
  const addOn = cubeAddOns(cube).find((a) => a.id === addOnId);
  if (!enabled) showToast(`Added "${addOn?.title}" — ${count} item${count === 1 ? '' : 's'}`);
  else showToast(`Removed "${addOn?.title}"${count ? ` — ${count} item${count === 1 ? '' : 's'} off the list` : ''}`);
}

async function makeCubePublic(cubeId) {
  if (!confirm('Make this cube public? It will be added to the site catalog (GitHub PR auto-merged).')) return;
  try {
    const data = await cubesApi.publish(auth.token, cubeId);
    cubeCache.set(cubeId, data.cube);
    const idx = catalog.findIndex((c) => c.id === cubeId);
    if (idx >= 0) catalog[idx] = { ...catalog[idx], ...data.cube };
    renderCubeList();
    showToast('Published — live for everyone after deploy');
  } catch (err) {
    showToast(`Couldn't publish: ${err.message}`);
  }
}

async function deleteCubeEverywhere(cubeId) {
  const cube = cubeCache.get(cubeId) || catalog.find((c) => c.id === cubeId);
  const title = cube?.title || cubeId;
  const isPublic = !!cube?.is_public;
  if (!confirm(`Delete "${title}"? This removes it from your account${isPublic ? ' and the public catalog' : ''}. Items already on your lists stay (they just become unsorted).`)) return;

  try {
    await cubesApi.remove(auth.token, cubeId);
    let changed = false;
    for (const s of state.suitcases) {
      if (releaseDeletedCube(s, cubeId)) changed = true;
    }
    if (changed) saveState();
    cubeCache.delete(cubeId);
    expandedCubeIds.delete(cubeId);
    catalog = catalog.filter((c) => c.id !== cubeId);
    renderCubeList();
    renderList();
    showToast(`Deleted "${title}" — its list items were kept`);
  } catch (err) {
    showToast(`Couldn't delete: ${err.message}`);
  }
}

function openBuilderModal(editId, templateId = null) {
  if (guestMode || !auth?.signedIn) {
    location.href = `/account.html?next=${encodeURIComponent('/packing-cubes/')}`;
    return;
  }
  const overlay = document.getElementById('builder-overlay');
  const builderRoot = document.getElementById('builder-modal-root');
  if (!overlay || !builderRoot) return;
  builderRoot.innerHTML = '';
  overlay.classList.remove('hidden');
  initBuilder({
    root: builderRoot,
    editId: editId || null,
    templateId,
    auth,
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
    catalog = await loadCatalog();
    renderCubeList();
    renderList();
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Packing list (right panel)
// ---------------------------------------------------------------------------

function renderListPanel() {
  const suitcase = activeSuitcase();
  const content = document.getElementById('list-content');
  if (!content) return;

  content.innerHTML = `
    <div class="pc-list-head">
      <h2>Packing list</h2>
      <div class="pc-list-controls">
        <input type="text" id="trip-name" class="pc-input" value="${escapeAttr(suitcase.name)}"
          placeholder="Trip name" aria-label="Trip name">
        <select id="suitcase-select" aria-label="Switch packing list">
          ${state.suitcases.map((s) => `<option value="${s.id}" ${s.id === suitcase.id ? 'selected' : ''}>${escapeHtml(s.name || 'Untitled')}</option>`).join('')}
        </select>
        <button type="button" class="pc-btn sm" id="new-suitcase-btn">+ New</button>
        <button type="button" class="pc-btn sm" id="delete-suitcase-btn" ${state.suitcases.length <= 1 ? 'disabled' : ''}>Delete</button>
      </div>
    </div>

    <div class="pc-list-body">
      <form class="pc-quick-add" id="quick-add-form">
        <label class="pc-sr-only" for="quick-add-input">Add an item to the list</label>
        <input type="text" id="quick-add-input" class="pc-input" placeholder="Add an item — passport, chargers, that one hat…" autocomplete="off">
        <button type="submit" class="pc-btn primary">Add</button>
      </form>

      <div class="pc-hud" id="pack-hud">
        <div class="pc-stat"><b id="packed-num">0</b><span>packed</span></div>
        <div class="pc-stat"><b id="total-num">0</b><span>items</span></div>
        <div class="pc-spacer"></div>
        <span class="pc-hud-note" id="hud-note"></span>
      </div>
      <div class="pc-progress-bar"><i id="progress-bar"></i></div>

      <div class="pc-list-toolbar">
        <input type="search" id="list-filter" class="pc-input sm grow" placeholder="Filter items…"
          aria-label="Filter the packing list" value="${escapeAttr(listFilter)}">
        <div class="pc-view-toggle" role="group" aria-label="List view">
          <button type="button" data-view="list" class="${listView === 'list' ? 'selected' : ''}">List</button>
          <button type="button" data-view="cube" class="${listView === 'cube' ? 'selected' : ''}">By cube</button>
        </div>
        <label class="pc-toggle-chip"><input type="checkbox" id="hide-packed-toggle" ${hidePacked ? 'checked' : ''}> Hide packed</label>
        <button type="button" class="pc-btn sm ${organizeMode ? 'primary' : ''}" id="organize-btn"></button>
      </div>

      <div id="pack-list"></div>
    </div>
    <div class="pc-list-footer" id="list-footer"></div>
  `;

  document.getElementById('quick-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('quick-add-input');
    const suitcaseNow = activeSuitcase();
    const item = addItem(suitcaseNow, input.value);
    if (!item) return;
    input.value = '';
    input.focus();
    saveState();
    renderList();
  });

  document.getElementById('trip-name').addEventListener('input', (e) => {
    suitcase.name = e.target.value;
    saveState();
    const opt = document.querySelector(`#suitcase-select option[value="${suitcase.id}"]`);
    if (opt) opt.textContent = suitcase.name || 'Untitled';
  });

  document.getElementById('suitcase-select').addEventListener('change', async (e) => {
    state.activeSuitcaseId = e.target.value;
    saveState();
    organizeMode = false;
    wasAllPacked = allPacked(activeSuitcase());
    await prefetchSuitcaseCubes(activeSuitcase());
    renderCubeList();
    renderListPanel();
  });

  document.getElementById('new-suitcase-btn').addEventListener('click', () => {
    const suitcaseNew = newSuitcase('New trip');
    state.suitcases.push(suitcaseNew);
    state.activeSuitcaseId = suitcaseNew.id;
    saveState();
    organizeMode = false;
    wasAllPacked = false;
    renderCubeList();
    renderListPanel();
    showToast('New packing list');
  });

  document.getElementById('delete-suitcase-btn').addEventListener('click', () => {
    if (state.suitcases.length <= 1) return;
    if (!confirm(`Delete "${suitcase.name || 'Untitled'}"? This can't be undone.`)) return;
    state.suitcases = state.suitcases.filter((s) => s.id !== suitcase.id);
    state.activeSuitcaseId = state.suitcases[0].id;
    saveState();
    renderCubeList();
    renderListPanel();
    showToast('Packing list deleted');
  });

  document.getElementById('list-filter').addEventListener('input', (e) => {
    listFilter = e.target.value;
    renderList();
  });

  document.getElementById('hide-packed-toggle').addEventListener('change', (e) => {
    hidePacked = e.target.checked;
    renderList();
  });

  content.querySelectorAll('.pc-view-toggle [data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      listView = btn.dataset.view;
      localStorage.setItem(VIEW_KEY, listView);
      content.querySelectorAll('.pc-view-toggle [data-view]').forEach((b) => {
        b.classList.toggle('selected', b.dataset.view === listView);
      });
      renderList();
    });
  });

  document.getElementById('organize-btn').addEventListener('click', () => {
    organizeMode = !organizeMode;
    renderListPanel();
  });

  renderFooter();
  renderList();
}

function renderFooter() {
  const footer = document.getElementById('list-footer');
  if (!footer) return;
  if (guestMode) {
    const loginHref = `/account.html?next=${encodeURIComponent(location.pathname)}`;
    footer.innerHTML = `
      <p class="pc-footer-note guest">
        ${auth?.needsReauth ? 'Your session expired — this list is saved on this device only.' : 'Saved on this device.'}
        <a href="${loginHref}">Sign in</a> to sync across devices and create your own cubes.
      </p>`;
  } else {
    footer.innerHTML = `<p class="pc-footer-note">Saved to your account automatically.</p>`;
  }
}

function updateHud(suitcase) {
  const { packed, total } = packedStats(suitcase);
  const packedEl = document.getElementById('packed-num');
  const totalEl = document.getElementById('total-num');
  const barEl = document.getElementById('progress-bar');
  const noteEl = document.getElementById('hud-note');
  if (packedEl) packedEl.textContent = packed;
  if (totalEl) totalEl.textContent = total;
  if (barEl) barEl.style.width = total ? `${(packed / total) * 100}%` : '0%';
  if (noteEl) {
    const unsorted = unsortedCount(suitcase);
    const parts = [`${suitcase.cubeIds.length} cube${suitcase.cubeIds.length === 1 ? '' : 's'}`];
    if (unsorted) parts.push(`${unsorted} unsorted`);
    noteEl.textContent = parts.join(' · ');
  }

  const nowAllPacked = allPacked(suitcase);
  if (nowAllPacked && !wasAllPacked) showToast('All packed.');
  wasAllPacked = nowAllPacked;

  const organizeBtn = document.getElementById('organize-btn');
  if (organizeBtn) {
    const unsorted = unsortedCount(suitcase);
    organizeBtn.textContent = organizeMode
      ? 'Done'
      : (unsorted ? `Organize (${unsorted})` : 'Organize');
    organizeBtn.title = 'Assign items to cubes, rename, or remove them';
  }
}

function visibleItems(items) {
  const q = listFilter.trim().toLowerCase();
  let out = items;
  if (q) out = out.filter((i) => i.label.toLowerCase().includes(q));
  if (hidePacked && !organizeMode) out = out.filter((i) => !i.packed);
  return out;
}

function itemRowHtml(item, { showCubeChip, cubeMap }) {
  if (organizeMode) {
    const suitcase = activeSuitcase();
    const options = suitcase.cubeIds.map((id) => {
      const title = cubeMap.get(id)?.title || id;
      return `<option value="${escapeAttr(id)}" ${item.cubeId === id ? 'selected' : ''}>${escapeHtml(title)}</option>`;
    }).join('');
    return `
      <li class="organize" data-item-id="${escapeAttr(item.id)}">
        <input type="text" class="pc-input sm pc-item-label-input" value="${escapeAttr(item.label)}" aria-label="Item name">
        <select class="pc-item-cube-select" aria-label="Cube for ${escapeAttr(item.label)}">
          <option value="" ${!item.cubeId ? 'selected' : ''}>No cube</option>
          ${options}
          ${item.cubeId && !suitcase.cubeIds.includes(item.cubeId)
            ? `<option value="${escapeAttr(item.cubeId)}" selected>${escapeHtml(cubeMap.get(item.cubeId)?.title || item.cubeId)}</option>`
            : ''}
        </select>
        <button type="button" class="pc-item-remove" title="Remove item" aria-label="Remove ${escapeAttr(item.label)}">&times;</button>
      </li>`;
  }

  const chip = showCubeChip && item.cubeId
    ? `<span class="pc-cube-chip">${escapeHtml(cubeMap.get(item.cubeId)?.title || item.cubeId)}</span>`
    : '';
  return `
    <li class="${item.packed ? 'packed' : ''}" data-item-id="${escapeAttr(item.id)}">
      <input type="checkbox" ${item.packed ? 'checked' : ''} aria-label="Mark ${escapeAttr(item.label)} as packed">
      <span class="pc-item-label">${escapeHtml(item.label)}</span>
      ${chip}
      <button type="button" class="pc-item-remove" title="Remove item" aria-label="Remove ${escapeAttr(item.label)}">&times;</button>
    </li>`;
}

function bindItemRows(mount, suitcase) {
  mount.querySelectorAll('li[data-item-id]').forEach((li) => {
    const itemId = li.dataset.itemId;

    const checkbox = li.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        setItemPacked(suitcase, itemId, checkbox.checked);
        saveState();
        if (hidePacked) {
          renderList();
        } else {
          li.classList.toggle('packed', checkbox.checked);
          updateHud(suitcase);
        }
      });
      // The whole row is a tap target; ignore clicks on controls.
      li.addEventListener('click', (e) => {
        if (e.target.closest('input, button, select, a')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });
    }

    const labelInput = li.querySelector('.pc-item-label-input');
    if (labelInput) {
      labelInput.addEventListener('input', () => {
        updateItemLabel(suitcase, itemId, labelInput.value);
        saveState();
      });
      labelInput.addEventListener('blur', () => {
        if (!labelInput.value.trim()) {
          removeItem(suitcase, itemId);
          saveState();
          renderList();
        }
      });
    }

    const select = li.querySelector('.pc-item-cube-select');
    if (select) {
      select.addEventListener('change', () => {
        assignItem(suitcase, itemId, select.value || null);
        saveState();
        renderList();
      });
    }

    const removeBtn = li.querySelector('.pc-item-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        removeItem(suitcase, itemId);
        saveState();
        renderList();
      });
    }
  });
}

function renderList() {
  const suitcase = activeSuitcase();
  const mount = document.getElementById('pack-list');
  if (!mount) return;

  updateHud(suitcase);
  const cubeMap = cubesById();

  if (!suitcase.items.length) {
    mount.innerHTML = `<p class="pc-list-empty">Your list is empty. Type items above, or start from a common cube in the library.</p>`;
    return;
  }

  if (listView === 'list') {
    const items = visibleItems(suitcase.items);
    mount.innerHTML = items.length
      ? `<ul class="pc-checklist ${organizeMode ? 'organizing' : ''}">
          ${items.map((item) => itemRowHtml(item, { showCubeChip: true, cubeMap })).join('')}
        </ul>`
      : `<p class="pc-list-empty">No items match.</p>`;
    bindItemRows(mount, suitcase);
    return;
  }

  // By-cube view
  const groups = groupedItems(suitcase, cubeMap);
  let anyVisible = false;
  mount.innerHTML = groups.map((group) => {
    const items = visibleItems(group.items);
    const isUnsorted = group.key === UNSORTED_KEY;
    // Hide groups whose items were all filtered away; keep genuinely empty
    // attached cubes visible as organize targets.
    if (!organizeMode && group.items.length && !items.length) return '';
    anyVisible = true;
    const collapsed = collapsedGroups.has(group.key) && !organizeMode;
    const cube = !isUnsorted ? cubeMap.get(group.key) : null;
    const addOns = cube ? cubeAddOns(cube) : [];
    const removable = !isUnsorted && suitcase.cubeIds.includes(group.key);
    return `
      <div class="pc-item-group ${collapsed ? 'collapsed' : ''} ${isUnsorted ? 'unsorted' : ''}" data-group-key="${escapeAttr(group.key)}">
        <div class="pc-group-row">
          <button type="button" class="pc-group-header">
            <span class="chevron">${CHEVRON_SVG}</span>
            <span class="pc-group-title">${escapeHtml(group.title)}</span>
            <span class="pc-group-count">${group.items.filter((i) => i.packed).length}/${group.items.length}</span>
          </button>
          ${removable ? `<button type="button" class="pc-group-remove" data-remove-cube="${escapeAttr(group.key)}"
            title="Remove this cube and its items from the list" aria-label="Remove ${escapeAttr(group.title)} from the list">&times;</button>` : ''}
        </div>
        ${addOns.length && !collapsed ? `
          <div class="pc-addon-chips in-group">
            ${addOns.map((a) => {
              const on = addOnEnabled(suitcase, group.key, a.id);
              return `<button type="button" class="pc-addon-chip ${on ? 'on' : ''}" data-addon-cube="${escapeAttr(group.key)}" data-addon-id="${escapeAttr(a.id)}" aria-pressed="${on}">
                ${on ? CHECK_SVG : '+'} ${escapeHtml(a.title)}
              </button>`;
            }).join('')}
          </div>
        ` : ''}
        ${!collapsed ? `
          <ul class="pc-checklist ${organizeMode ? 'organizing' : ''}">
            ${items.map((item) => itemRowHtml(item, { showCubeChip: false, cubeMap })).join('')}
            ${!items.length ? `<li class="pc-group-empty">${isUnsorted ? 'Nothing unsorted.' : 'No items in this cube yet.'}</li>` : ''}
          </ul>
        ` : ''}
      </div>`;
  }).join('');

  if (!anyVisible) {
    mount.innerHTML = `<p class="pc-list-empty">No items match.</p>`;
    return;
  }

  mount.querySelectorAll('.pc-group-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.closest('.pc-item-group').dataset.groupKey;
      if (collapsedGroups.has(key)) collapsedGroups.delete(key);
      else collapsedGroups.add(key);
      renderList();
    });
  });

  mount.querySelectorAll('.pc-addon-chip').forEach((chip) => {
    chip.addEventListener('click', () => toggleAddOn(chip.dataset.addonCube, chip.dataset.addonId));
  });

  mount.querySelectorAll('.pc-group-remove').forEach((btn) => {
    btn.addEventListener('click', () => quickToggleCube(btn.dataset.removeCube));
  });

  bindItemRows(mount, suitcase);

  // Fetch full cubes we only know by title so add-on chips appear once loaded.
  for (const group of groups) {
    if (group.key === UNSORTED_KEY) continue;
    if (!cubeCache.has(group.key) && suitcase.cubeIds.includes(group.key)) {
      fetchCube(group.key).then(() => renderList()).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Catalog + hydration
// ---------------------------------------------------------------------------

async function loadStaticCatalog() {
  try {
    const res = await fetch(catalogUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list.map((c) => ({ ...c, source: 'static', mine: false, is_public: true }));
  } catch {
    return [];
  }
}

async function loadCatalog() {
  const staticCubes = await loadStaticCatalog();
  if (guestMode || !auth?.token) return staticCubes;

  const dbPayload = await cubesApi.list(auth.token);
  const byId = new Map();
  for (const cube of staticCubes) byId.set(cube.id, cube);
  for (const cube of dbPayload.cubes || []) {
    byId.set(cube.id, cube);
    if (cube.items) cubeCache.set(cube.id, cube);
  }
  return [...byId.values()];
}

async function hydrateSuitcases() {
  const remote = await suitcasesApi.get(auth.token);
  const local = loadLocalState();
  if (remote.suitcases?.length) {
    state = {
      activeSuitcaseId: remote.activeSuitcaseId || remote.suitcases[0].id,
      suitcases: remote.suitcases,
    };
  } else if (local.suitcases?.length) {
    state = local;
    await suitcasesApi.put(auth.token, state);
  } else {
    state = { activeSuitcaseId: null, suitcases: [] };
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Upgrade any v1 suitcases to the flat-list model, then normalize all. */
async function migrateLegacySuitcases() {
  const legacy = state.suitcases.filter(isLegacySuitcase);
  if (legacy.length) {
    const wanted = new Set(legacy.flatMap((s) => s.cubeIds || []));
    await Promise.all([...wanted].map((id) => fetchCube(id).catch(() => null)));
  }
  const map = cubesById();
  let changed = legacy.length > 0;
  state.suitcases = state.suitcases.map((s) => (isLegacySuitcase(s) ? migrateSuitcase(s, map) : normalizeSuitcase(s)));
  if (changed) saveState();
}

// Open the inline "create a cube" modal instead of navigating away, for any
// link that points at the standalone builder page.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href="/packing-cubes/builder.html"]');
  if (!link) return;
  e.preventDefault();
  openBuilderModal(null);
});

boot();

async function boot() {
  auth = await initAuth();
  if (auth.configured && auth.user && !auth.token) {
    await refreshToken(auth);
  }
  guestMode = !auth.configured || !auth.signedIn || !auth.token;
  wireAuthLink(auth);

  try {
    if (guestMode) {
      state = loadLocalState();
      catalog = await loadCatalog();
    } else {
      await hydrateSuitcases();
      catalog = await loadCatalog();
    }

    await migrateLegacySuitcases();
    ensureSuitcase();
    await prefetchSuitcaseCubes(activeSuitcase());

    if (addCubeId) {
      try {
        const cube = await fetchCube(addCubeId);
        const suitcase = activeSuitcase();
        const imported = attachCube(suitcase, cube);
        saveState();
        showToast(imported
          ? `Added "${cube.title}" — ${imported} item${imported === 1 ? '' : 's'}`
          : `"${cube.title}" is on your list`);
      } catch { /* unknown cube id in the link */ }
      const url = new URL(location.href);
      url.searchParams.delete('add');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    wasAllPacked = allPacked(activeSuitcase());
    render();
  } catch (err) {
    console.error('Packing cubes boot error:', err);
    if (err.status === 401) {
      guestMode = true;
      auth.needsReauth = true;
      state = loadLocalState();
      catalog = await loadCatalog();
      await migrateLegacySuitcases();
      ensureSuitcase();
      render();
      return;
    }
    root.innerHTML = `<p class="pc-boot-message">Could not load Packing Cubes: ${escapeHtml(err.message)}</p>`;
  }
}
