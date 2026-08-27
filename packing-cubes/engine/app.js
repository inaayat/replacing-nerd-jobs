// Packing Cubes app: a flat packing list first (the source of truth), with
// cubes as an organization layer. Every cube is one the user built — there is
// no shared catalog and nothing to publish. Cubes may carry optional add-ons
// (shown in Organize as "Toiletries - Beauty Basics"), and any cube or add-on
// can be marked include-by-default so it seeds new trips.
// All list/cube semantics live in the pure module ./model.js (tested by
// scripts/test-packing-cubes-model.mjs); this file is fetch + DOM only.
import { initBuilder } from './builder.js';
import { initAuth, wireAuthLink, refreshToken, renderPackingSignIn, focusPackingAuthForm } from './auth.js';
import { cubesApi, suitcasesApi } from './api.js';
import {
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
  organizeTargets,
  assignmentKey,
  parseAssignment,
  addOnLabel,
  isDefaultCube,
  isDefaultAddOn,
  expandContents,
  absorbItemIntoCube,
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
const PIN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M8 4h8l-1.2 6.5A3 3 0 0 1 12 13a3 3 0 0 1-2.8-2.5L8 4z"/><path d="M7 4h10"/></svg>`;

// A packed little suitcase for the sign-in gate: two cubes inside, a couple of
// travel stickers, and a handle. Decorative only.
const SUITCASE_ART = `
<svg class="pc-gate-art" viewBox="0 0 120 110" width="132" height="121" role="img" aria-label="A packed suitcase">
  <ellipse cx="60" cy="99" rx="38" ry="5" fill="#23282d" opacity="0.07"/>
  <path d="M46 26v-6a8 8 0 0 1 8-8h12a8 8 0 0 1 8 8v6" fill="none" stroke="#23282d" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="18" y="26" width="84" height="66" rx="11" fill="#2f6b4f"/>
  <rect x="18" y="26" width="84" height="66" rx="11" fill="none" stroke="#23282d" stroke-width="3"/>
  <rect x="27" y="35" width="66" height="48" rx="6" fill="#ffffff" opacity="0.94"/>
  <rect x="34" y="43" width="24" height="15" rx="3" fill="#2f6b4f" opacity="0.22"/>
  <rect x="62" y="43" width="24" height="15" rx="3" fill="#3d6c96" opacity="0.22"/>
  <path d="M36 68h20" stroke="#23282d" stroke-width="3" stroke-linecap="round" opacity="0.32"/>
  <path d="M36 75h32" stroke="#23282d" stroke-width="3" stroke-linecap="round" opacity="0.18"/>
  <circle cx="79" cy="72" r="7" fill="#f0a24a"/>
  <path d="M76 72.2l2.2 2.2 4-4.4" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="14" y="46" width="8" height="16" rx="3" fill="#23282d" opacity="0.85"/>
  <circle cx="36" cy="97" r="5" fill="#23282d"/>
  <circle cx="84" cy="97" r="5" fill="#23282d"/>
</svg>`;

// ---------------------------------------------------------------------------
// State persistence: localStorage for instant local reads, cloud (debounced)
// as the real store. Signing in is required, so there is no offline-only mode.
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
  if (!auth?.signedIn || !auth.token) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    suitcasesApi.put(auth.token, state).catch((err) => {
      if (err.status === 401) {
        // The session died mid-edit. The last change is still in localStorage,
        // so send them back through the gate rather than pretending it saved.
        auth.needsReauth = true;
        auth.signedIn = false;
        renderSignInGate();
        return;
      }
      console.warn('Suitcase sync failed:', err);
      showToast(`Couldn't sync: ${err.message}`);
    });
  }, 450);
}

function ensureSuitcase() {
  if (!state.suitcases.length) {
    const suitcase = newSuitcase('My trip', catalog);
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
    if (!auth?.token) throw new Error('Sign in to load your cubes.');
    const { cube } = await cubesApi.get(auth.token, id);
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
          <button type="button" role="tab" data-pane="cubes" aria-selected="${mobilePane === 'cubes'}">My cubes</button>
        </div>
      </header>

      <main class="pc-list-panel" id="list-panel">
        <div id="list-content"></div>
      </main>

      <aside class="pc-cubes-panel">
        <div class="pc-panel-head">
          <div class="pc-panel-head-row">
            <h2>My cubes</h2>
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
// My cubes (side rail)
// ---------------------------------------------------------------------------

function canEditCube(cube) {
  return !!cube?.mine;
}

function renderCubeList() {
  const mount = document.getElementById('cube-list');
  if (!mount) return;

  const suitcase = activeSuitcase();
  const q = searchQuery.trim().toLowerCase();
  const cubes = sortCatalog(catalog).filter((c) => matchesQuery(cubeCache.get(c.id) || c, q));

  if (!cubes.length) {
    mount.innerHTML = catalog.length
      ? `<p class="pc-no-results">No cubes match "${escapeHtml(searchQuery)}".</p>`
      : `<div class="pc-cubes-empty">
           <p><b>No cubes yet.</b></p>
           <p>A cube is a named group — “Toiletries”, “Beach”, “Work trip”. Name one even if it’s empty, then file list items into it.</p>
           <button type="button" class="pc-btn primary" id="empty-create-cube">Build my first cube</button>
           <p class="pc-cubes-empty-note">Already have a list going? Use <b>Organize</b> to turn part of it into a cube later.</p>
         </div>`;
    const cta = document.getElementById('empty-create-cube');
    if (cta) cta.addEventListener('click', () => openBuilderModal(null));
    return;
  }

  mount.innerHTML = cubes.map((c) => {
    const attached = suitcase.cubeIds.includes(c.id);
    const expanded = expandedCubeIds.has(c.id);
    return `
      <div class="pc-cube-card ${attached ? 'in-suitcase' : ''} ${expanded ? 'expanded' : ''}" data-cube-id="${escapeAttr(c.id)}">
        <div class="pc-cube-card-header" role="button" tabindex="0" aria-expanded="${expanded}"
             aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeAttr(c.title)}">
          <div class="pc-cube-icon">${BAG_SVG}</div>
          <div class="pc-cube-info">
            <div class="title">
              ${escapeHtml(c.title)}
              ${isDefaultCube(c) ? '<span class="pc-cube-badge default">On new trips</span>' : ''}
            </div>
            <div class="blurb">${escapeHtml(c.blurb || '')}</div>
          </div>
          <button type="button" class="pc-cube-pin ${isDefaultCube(c) ? 'on' : ''}" data-default-id="${escapeAttr(c.id)}"
            title="${isDefaultCube(c) ? 'Stop including on new trips' : 'Include by default for any new trips'}"
            aria-label="${isDefaultCube(c) ? 'Stop including' : 'Include'} ${escapeAttr(c.title)} on new trips"
            aria-pressed="${isDefaultCube(c)}">${PIN_SVG}</button>
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

  mount.querySelectorAll('.pc-cube-pin').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCubeDefault(btn.dataset.defaultId);
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
    const itemCount = (cube.items || []).length;
    showToast(imported
      ? `Added ${imported} item${imported === 1 ? '' : 's'} from "${cube.title}"`
      : itemCount
        ? `"${cube.title}" attached — its items were already on your list`
        : `"${cube.title}" is on this list — file items into it`);
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
  const contents = expandContents(suitcase, cube);
  const addOnBlocks = contents.addOns.filter((a) => a.items.length);
  const hasItems = contents.items.length || addOnBlocks.length;

  function itemList(items) {
    return `<ul class="pc-expand-items">
      ${items.map((item) => `<li>${escapeHtml(item.label)}</li>`).join('')}
    </ul>`;
  }

  const emptyCopy = attached
    ? 'Nothing filed into this cube on this list yet.'
    : 'Empty — file list items into it from Organize.';

  return `
    ${cube.blurb ? `<p class="pc-expand-blurb">${escapeHtml(cube.blurb)}</p>` : ''}
    ${tags ? `<div class="pc-tags">${tags}</div>` : ''}
    ${hasItems
      ? `${contents.items.length ? itemList(contents.items) : ''}
         ${addOnBlocks.map((a) => `
           <div class="pc-expand-addon">
             <div class="pc-section-label">${escapeHtml(addOnLabel(cube, a))}</div>
             ${itemList(a.items)}
           </div>`).join('')}`
      : `<ul class="pc-expand-items"><li class="pc-expand-empty">${emptyCopy}</li></ul>`}
    ${addOns.length ? `
      <div class="pc-addon-section">
        <div class="pc-section-label">Add-ons for this trip</div>
        <div class="pc-addon-chips">
          ${addOns.map((a) => {
            const on = addOnEnabled(suitcase, cubeId, a.id);
            const isDefault = isDefaultAddOn(a);
            return `<div class="pc-addon-wrap">
              <button type="button" class="pc-addon-chip ${on ? 'on' : ''}" data-addon-cube="${escapeAttr(cubeId)}" data-addon-id="${escapeAttr(a.id)}" aria-pressed="${on}">
                ${on ? CHECK_SVG : '+'} ${escapeHtml(a.title)} <span class="count">${(a.items || []).length}</span>
              </button>
              <button type="button" class="pc-addon-pin ${isDefault ? 'on' : ''}" data-addon-cube="${escapeAttr(cubeId)}" data-addon-id="${escapeAttr(a.id)}"
                title="${isDefault ? 'Stop including on new trips' : 'Include by default for any new trips'}"
                aria-label="${isDefault ? 'Stop including' : 'Include'} ${escapeAttr(addOnLabel(cube, a))} on new trips"
                aria-pressed="${isDefault}">${PIN_SVG}</button>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}
    <div class="pc-expand-actions">
      <button type="button" class="pc-btn ${attached ? '' : 'primary'}" id="attach-btn-${escapeAttr(cubeId)}" style="width:100%">
        ${attached ? 'Remove from packing list' : 'Add to packing list'}
      </button>
      ${mine ? `
        <button type="button" class="pc-expand-link" id="edit-cube-link-${escapeAttr(cubeId)}">Edit this cube</button>
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

  container.querySelectorAll('.pc-addon-pin').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAddOnDefault(btn.dataset.addonCube, btn.dataset.addonId);
    });
  });

  const editLink = document.getElementById(`edit-cube-link-${cubeId}`);
  if (editLink) editLink.addEventListener('click', () => openBuilderModal(cubeId));
  const deleteBtn = document.getElementById(`delete-cube-btn-${cubeId}`);
  if (deleteBtn) deleteBtn.addEventListener('click', () => deleteCubeEverywhere(cubeId));
}

function cubePayload(cube) {
  return {
    id: cube.id,
    title: cube.title,
    blurb: cube.blurb || '',
    tags: cube.tags || [],
    items: cube.items || [],
    includeByDefault: !!cube.includeByDefault,
    addOns: cubeAddOns(cube).map((a) => ({
      id: a.id,
      title: a.title,
      items: a.items || [],
      includeByDefault: !!a.includeByDefault,
    })),
  };
}

function rememberCube(cube) {
  cubeCache.set(cube.id, cube);
  const idx = catalog.findIndex((c) => c.id === cube.id);
  if (idx >= 0) catalog[idx] = { ...catalog[idx], ...cube };
  else catalog.push(cube);
}

const cubeSaveTimers = new Map();
function persistCubeSoon(cubeId) {
  if (!auth?.signedIn || !auth.token) return;
  clearTimeout(cubeSaveTimers.get(cubeId));
  cubeSaveTimers.set(cubeId, setTimeout(async () => {
    const cube = cubeCache.get(cubeId);
    if (!cube) return;
    try {
      const data = await cubesApi.update(auth.token, cubePayload(cube));
      rememberCube(data.cube);
    } catch (err) {
      showToast(`Couldn't save "${cube.title}": ${err.message}`);
    }
  }, 400));
}

async function absorbFiledItem(cubeId, label, addOnId) {
  if (!cubeId || !label) return;
  try {
    const cube = await fetchCube(cubeId);
    if (!absorbItemIntoCube(cube, label, addOnId)) return;
    rememberCube(cube);
    persistCubeSoon(cubeId);
    renderCubeList();
  } catch { /* list already shows the filed row */ }
}

async function toggleCubeDefault(cubeId) {
  try {
    const cube = await fetchCube(cubeId);
    const next = cubePayload(cube);
    next.includeByDefault = !isDefaultCube(cube);
    const data = await cubesApi.update(auth.token, next);
    rememberCube(data.cube);
    renderCubeList();
    showToast(next.includeByDefault
      ? `"${cube.title}" will be on every new trip`
      : `"${cube.title}" won’t auto-add to new trips`);
  } catch (err) {
    showToast(`Couldn't update: ${err.message}`);
  }
}

async function toggleAddOnDefault(cubeId, addOnId) {
  try {
    const cube = await fetchCube(cubeId);
    const next = cubePayload(cube);
    const addOn = next.addOns.find((a) => a.id === addOnId);
    if (!addOn) return;
    addOn.includeByDefault = !addOn.includeByDefault;
    const data = await cubesApi.update(auth.token, next);
    rememberCube(data.cube);
    renderCubeList();
    showToast(addOn.includeByDefault
      ? `"${addOnLabel(cube, addOn)}" will be on every new trip`
      : `"${addOnLabel(cube, addOn)}" won’t auto-add to new trips`);
  } catch (err) {
    showToast(`Couldn't update: ${err.message}`);
  }
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

/**
 * Turn the unsorted items into a reusable cube. This is how most cubes get
 * built: you type a real list first, then keep the useful part of it.
 */
async function saveUnsortedAsCube() {
  const suitcase = activeSuitcase();
  const unsorted = suitcase.items.filter((i) => !i.cubeId);
  if (!unsorted.length) {
    showToast('Add an unsorted item first, or create an empty cube with + New cube.');
    return;
  }

  const name = prompt(`Name this cube (${unsorted.length} items):`, '');
  if (name === null) return;
  const title = name.trim();
  if (!title) {
    showToast('A cube needs a name.');
    return;
  }

  try {
    const { cube } = await cubesApi.create(auth.token, {
      title,
      blurb: '',
      tags: [],
      items: unsorted.map((i) => ({ label: i.label.trim() })).filter((i) => i.label),
      addOns: [],
      includeByDefault: false,
    });
    cubeCache.set(cube.id, cube);
    catalog.push(cube);
    // The items are already on the list — file them rather than re-importing.
    if (!suitcase.cubeIds.includes(cube.id)) suitcase.cubeIds.push(cube.id);
    for (const item of unsorted) assignItem(suitcase, item.id, cube.id);
    saveState();
    renderCubeList();
    renderList();
    showToast(`Saved "${cube.title}" — reuse it on any trip`);
  } catch (err) {
    showToast(`Couldn't save that cube: ${err.message}`);
  }
}

async function deleteCubeEverywhere(cubeId) {
  const cube = cubeCache.get(cubeId) || catalog.find((c) => c.id === cubeId);
  const title = cube?.title || cubeId;
  if (!confirm(`Delete the cube "${title}"? Items already on your lists stay — they just become unsorted.`)) return;

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

function openBuilderModal(editId) {
  if (!auth?.signedIn || !auth.token) {
    if (!focusPackingAuthForm()) location.href = '/packing-cubes/';
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
    auth,
    onClose: closeBuilderModal,
    onSaved: afterCubeSaved,
  });
}

function afterCubeSaved({ isEditing, cube }) {
  refreshCatalog();
  if (isEditing || !cube?.id) return;
  const suitcase = activeSuitcase();
  attachCube(suitcase, cube);
  saveState();
  if (!(cube.items || []).length) {
    organizeMode = true;
    listView = 'cube';
    try { localStorage.setItem(VIEW_KEY, listView); } catch { /* ignore */ }
  }
  renderCubeList();
  renderList();
  showToast(`"${cube.title}" is on this list — file items into it`);
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
    const suitcaseNew = newSuitcase('New trip', catalog);
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
  footer.innerHTML = `<p class="pc-footer-note">Saved to your account automatically.</p>`;
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
    organizeBtn.title = 'Assign items to cubes or add-ons, rename, or remove them';
  }
}

function visibleItems(items) {
  const q = listFilter.trim().toLowerCase();
  let out = items;
  if (q) out = out.filter((i) => i.label.toLowerCase().includes(q));
  if (hidePacked && !organizeMode) out = out.filter((i) => !i.packed);
  return out;
}

function itemAssignmentLabel(item, cubeMap) {
  if (!item.cubeId) return '';
  const cube = cubeMap.get(item.cubeId);
  if (item.addOnId) {
    const addOn = cubeAddOns(cube).find((a) => a.id === item.addOnId);
    if (addOn) return addOnLabel(cube || { id: item.cubeId, title: item.cubeId }, addOn);
    return addOnLabel({ title: cube?.title || item.cubeId }, { title: item.addOnId });
  }
  return cube?.title || item.cubeId;
}

function organizeSelectHtml(item, cubeMap) {
  const suitcase = activeSuitcase();
  const targets = organizeTargets(catalog.map((c) => cubeCache.get(c.id) || c), suitcase);
  const selected = assignmentKey(item.cubeId, item.addOnId);
  const known = new Set([...targets.onList, ...targets.others].map((t) => t.value));
  const option = (t) => `<option value="${escapeAttr(t.value)}" ${t.value === selected ? 'selected' : ''}>${escapeHtml(t.label)}</option>`;
  const onListOpts = targets.onList.map(option).join('');
  const otherOpts = targets.others.map(option).join('');
  let fallback = '';
  if (selected && !known.has(selected)) {
    fallback = `<option value="${escapeAttr(selected)}" selected>${escapeHtml(itemAssignmentLabel(item, cubeMap))}</option>`;
  }
  return `
    <select class="pc-item-cube-select" aria-label="Cube for ${escapeAttr(item.label)}">
      <option value="" ${!selected ? 'selected' : ''}>No cube</option>
      ${onListOpts && otherOpts
        ? `<optgroup label="On this list">${onListOpts}</optgroup><optgroup label="My other cubes">${otherOpts}</optgroup>`
        : `${onListOpts}${otherOpts}`}
      ${fallback}
    </select>`;
}

function itemRowHtml(item, { showCubeChip, cubeMap }) {
  if (organizeMode) {
    return `
      <li class="organize" data-item-id="${escapeAttr(item.id)}">
        <input type="text" class="pc-input sm pc-item-label-input" value="${escapeAttr(item.label)}" aria-label="Item name">
        ${organizeSelectHtml(item, cubeMap)}
        <button type="button" class="pc-item-remove" title="Remove item" aria-label="Remove ${escapeAttr(item.label)}">&times;</button>
      </li>`;
  }

  const chip = showCubeChip && item.cubeId
    ? `<span class="pc-cube-chip">${escapeHtml(itemAssignmentLabel(item, cubeMap))}</span>`
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
        const { cubeId, addOnId } = parseAssignment(select.value);
        const item = suitcase.items.find((i) => i.id === itemId);
        assignItem(suitcase, itemId, cubeId, addOnId);
        saveState();
        renderCubeList();
        renderList();
        if (cubeId && item) absorbFiledItem(cubeId, item.label, addOnId);
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
    mount.innerHTML = `<p class="pc-list-empty">Your list is empty. Start typing items above — you can group them into cubes later.</p>`;
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
  const groups = groupedItems(suitcase, cubeMap, { includeEmptyAddOns: organizeMode });
  let anyVisible = false;
  mount.innerHTML = groups.map((group) => {
    const items = visibleItems(group.items);
    const isUnsorted = group.key === UNSORTED_KEY;
    const isAddOnGroup = !!group.addOnId;
    // Hide groups whose items were all filtered away; keep genuinely empty
    // attached cubes (and, in Organize, empty add-ons) visible as filing targets.
    if (!organizeMode && group.items.length && !items.length) return '';
    anyVisible = true;
    const collapsed = collapsedGroups.has(group.key) && !organizeMode;
    const cube = group.cubeId ? cubeMap.get(group.cubeId) : null;
    const addOns = cube && !isAddOnGroup ? cubeAddOns(cube) : [];
    const removable = !isUnsorted && !isAddOnGroup && suitcase.cubeIds.includes(group.cubeId);
    const canSaveAsCube = isUnsorted && group.items.length >= 1;
    return `
      <div class="pc-item-group ${collapsed ? 'collapsed' : ''} ${isUnsorted ? 'unsorted' : ''} ${isAddOnGroup ? 'addon' : ''}" data-group-key="${escapeAttr(group.key)}">
        <div class="pc-group-row">
          <button type="button" class="pc-group-header">
            <span class="chevron">${CHEVRON_SVG}</span>
            <span class="pc-group-title">${escapeHtml(group.title)}</span>
            <span class="pc-group-count">${group.items.filter((i) => i.packed).length}/${group.items.length}</span>
          </button>
          ${canSaveAsCube ? `<button type="button" class="pc-group-action" id="save-unsorted-cube">Save as cube</button>` : ''}
          ${removable ? `<button type="button" class="pc-group-remove" data-remove-cube="${escapeAttr(group.cubeId)}"
            title="Remove this cube and its items from the list" aria-label="Remove ${escapeAttr(group.title)} from the list">&times;</button>` : ''}
        </div>
        ${addOns.length && !collapsed ? `
          <div class="pc-addon-chips in-group">
            ${addOns.map((a) => {
              const on = addOnEnabled(suitcase, group.cubeId, a.id);
              return `<button type="button" class="pc-addon-chip ${on ? 'on' : ''}" data-addon-cube="${escapeAttr(group.cubeId)}" data-addon-id="${escapeAttr(a.id)}" aria-pressed="${on}">
                ${on ? CHECK_SVG : '+'} ${escapeHtml(a.title)}
              </button>`;
            }).join('')}
          </div>
        ` : ''}
        ${!collapsed ? `
          <ul class="pc-checklist ${organizeMode ? 'organizing' : ''}">
            ${items.map((item) => itemRowHtml(item, { showCubeChip: false, cubeMap })).join('')}
            ${!items.length ? `<li class="pc-group-empty">${isUnsorted ? 'Nothing unsorted.' : isAddOnGroup ? 'No items in this add-on yet.' : 'No items in this cube yet.'}</li>` : ''}
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

  const saveUnsorted = document.getElementById('save-unsorted-cube');
  if (saveUnsorted) saveUnsorted.addEventListener('click', saveUnsortedAsCube);

  bindItemRows(mount, suitcase);

  // Fetch full cubes we only know by title so add-on chips appear once loaded.
  for (const group of groups) {
    if (group.key === UNSORTED_KEY || group.addOnId) continue;
    const cubeId = group.cubeId || group.key;
    if (!cubeCache.has(cubeId) && suitcase.cubeIds.includes(cubeId)) {
      fetchCube(cubeId).then(() => renderList()).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Catalog + hydration
// ---------------------------------------------------------------------------

/** Your cubes, and only yours — there is no shared catalog. */
async function loadCatalog() {
  if (!auth?.token) return [];
  const { cubes = [] } = await cubesApi.list(auth.token);
  for (const cube of cubes) {
    if (cube.items) cubeCache.set(cube.id, cube);
  }
  return cubes;
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

/**
 * Signing in is the front door: packing lists and cubes both live on the
 * account, so there is nothing meaningful to show a stranger.
 */
function renderSignInGate() {
  const note = !auth?.configured
    ? '<p class="pc-gate-error">Sign-in isn’t configured on this deployment yet.</p>'
    : (auth?.needsReauth ? '<p class="pc-gate-error">Your session expired. Sign in again to pick up where you left off.</p>' : '');

  renderPackingSignIn(root, {
    art: SUITCASE_ART,
    title: 'Packing Cubes',
    copy: 'Write your packing list, tick things off as they go in the bag, and save the groups you repeat every trip.',
    note,
    onSuccess: () => location.reload(),
  });
  if (!auth?.configured) {
    const form = root.querySelector('#pc-auth');
    if (form) form.hidden = true;
  }
  wireAuthLink(auth || { configured: true, signedIn: false });
}

boot();

async function boot() {
  auth = await initAuth();
  if (auth.configured && auth.user && !auth.token) {
    await refreshToken(auth);
  }
  wireAuthLink(auth);

  if (!auth.configured || !auth.signedIn || !auth.token) {
    renderSignInGate();
    return;
  }

  try {
    await hydrateSuitcases();
    catalog = await loadCatalog();
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
      auth.needsReauth = true;
      auth.signedIn = false;
      renderSignInGate();
      return;
    }
    root.innerHTML = `<p class="pc-boot-message">Could not load Packing Cubes: ${escapeHtml(err.message)}</p>`;
  }
}
