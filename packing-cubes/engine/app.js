// Unified packing app: catalog (left) + suitcase builder (right)
import { catalogUrl, cubeJsonUrl } from './paths.js';

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
const EYE_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EDIT_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

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

async function mergeItems(suitcase) {
  const merged = new Map();
  for (const cubeId of suitcase.cubeIds) {
    let cube;
    try { cube = await fetchCube(cubeId); } catch { continue; }
    for (const item of cube.items || []) {
      const label = item.label.trim();
      if (!label) continue;
      const key = itemKey(label);
      if (!merged.has(key)) {
        merged.set(key, { label, sources: [cube.title], itemKey: key });
      } else if (!merged.get(key).sources.includes(cube.title)) {
        merged.get(key).sources.push(cube.title);
      }
    }
  }
  for (const item of suitcase.customItems || []) {
    const label = item.label.trim();
    if (!label) continue;
    const key = itemKey(label);
    if (!merged.has(key)) {
      merged.set(key, { label, sources: ['Custom'], itemKey: key });
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
          <p class="pc-app-subtitle">Mix cubes into your suitcase. Basics start included — remove any you don't need.</p>
        </div>
        <a href="/packing-cubes/builder.html" class="pc-btn green sm">+ Create a cube</a>
      </header>

      <aside class="pc-cubes-panel">
        <div class="pc-panel-head">
          <h2>Available Cubes</h2>
          <label class="pc-sr-only" for="cube-search">Search cubes</label>
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

    <div class="pc-preview-overlay hidden" id="preview-overlay">
      <div class="pc-preview-modal" id="preview-modal" role="dialog" aria-modal="true"></div>
    </div>
  `;

  document.getElementById('cube-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderCubeList();
  });

  document.getElementById('preview-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'preview-overlay') closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
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
           aria-pressed="${inSuitcase}">
        <div class="pc-cube-icon">${BAG_SVG}</div>
        <div class="pc-cube-info">
          <div class="title">
            ${escapeHtml(c.title)}
            ${basic ? '<span class="pc-cube-badge">Basic</span>' : ''}
          </div>
          <div class="blurb">${escapeHtml(c.blurb || '')}</div>
        </div>
        <button type="button" class="pc-cube-peek" data-peek-id="${c.id}" title="Preview cube" aria-label="Preview ${escapeAttr(c.title)}">${EYE_SVG}</button>
        ${isOwner ? `<button type="button" class="pc-cube-edit" data-edit-id="${c.id}" title="Edit cube" aria-label="Edit ${escapeAttr(c.title)}">${EDIT_SVG}</button>` : ''}
        <span class="pc-cube-toggle" aria-hidden="true">${inSuitcase ? '✓' : '+'}</span>
      </div>`;
  }).join('');

  mount.querySelectorAll('.pc-cube-card').forEach((card) => {
    const toggle = () => toggleCube(card.dataset.cubeId);
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  mount.querySelectorAll('.pc-cube-peek').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPreview(btn.dataset.peekId);
    });
  });

  mount.querySelectorAll('.pc-cube-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      location.href = `/packing-cubes/builder.html?edit=${encodeURIComponent(btn.dataset.editId)}`;
    });
  });
}

function toggleCube(cubeId) {
  const suitcase = activeSuitcase();
  if (suitcase.cubeIds.includes(cubeId)) {
    suitcase.cubeIds = suitcase.cubeIds.filter((x) => x !== cubeId);
  } else {
    suitcase.cubeIds.push(cubeId);
  }
  saveState();
  renderCubeList();
  renderPackList();
}

async function openPreview(cubeId) {
  const overlay = document.getElementById('preview-overlay');
  const modal = document.getElementById('preview-modal');
  if (!overlay || !modal) return;

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

  const suitcase = activeSuitcase();
  const inSuitcase = suitcase.cubeIds.includes(cubeId);
  const tags = (catalogEntry?.tags || cube.tags || []).map((t) => `<span class="pc-tag">${escapeHtml(t)}</span>`).join('');

  modal.innerHTML = `
    <button type="button" class="pc-preview-close" id="preview-close" aria-label="Close preview">&times;</button>
    <h2 class="pc-preview-title">${escapeHtml(cube.title)}</h2>
    <p class="pc-preview-blurb">${escapeHtml(cube.blurb || '')}</p>
    <div class="pc-tags">${tags}</div>
    <ul class="pc-preview-items">
      ${(cube.items || []).map((item) => `<li>${escapeHtml(item.label)}</li>`).join('')}
    </ul>
    <button type="button" class="pc-btn primary" id="preview-add" style="width:100%">
      ${inSuitcase ? 'Remove from suitcase' : 'Add to suitcase'}
    </button>
  `;

  document.getElementById('preview-close').addEventListener('click', closePreview);
  document.getElementById('preview-add').addEventListener('click', () => {
    toggleCube(cubeId);
    closePreview();
  });
}

function closePreview() {
  const overlay = document.getElementById('preview-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function renderSuitcase() {
  const suitcase = activeSuitcase();
  const content = document.getElementById('suitcase-content');
  if (!content) return;

  content.innerHTML = `
    <div class="pc-suitcase-head">
      <h2>Your Suitcase</h2>
      <div class="pc-suitcase-controls">
        <input type="text" id="trip-name" class="b-mini-input" style="border-radius:var(--radius-sm);width:auto;min-width:130px"
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
        <span style="font-size:0.75rem;font-weight:800;color:var(--brown)">${suitcase.cubeIds.length} cube${suitcase.cubeIds.length === 1 ? '' : 's'}</span>
      </div>
      <div class="pc-progress-bar"><i id="progress-bar"></i></div>

      <div class="pc-checklist-toolbar">
        <input type="search" id="checklist-filter" class="pc-search-input sm" placeholder="Filter items…" aria-label="Filter packing checklist" value="${escapeAttr(checklistFilter)}">
        <label class="pc-toggle-chip"><input type="checkbox" id="hide-packed-toggle" ${hidePacked ? 'checked' : ''}> Hide packed</label>
      </div>
      <div class="pc-checklist-wrap">
        <ul class="pc-checklist" id="pack-list"></ul>
      </div>
      <button type="button" class="pc-hidden-toggle hidden" id="hidden-items-toggle"></button>

      <div class="pc-section-label">Custom items</div>
      <div id="custom-items"></div>
      <button type="button" class="b-add-row-btn" id="add-custom-btn" style="margin-top:6px">+ Add custom item</button>
    </div>
    <p class="pc-footer-note">Saved automatically in this browser — won't sync to other devices.</p>
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

  document.getElementById('add-custom-btn').addEventListener('click', () => {
    suitcase.customItems.push({ label: '' });
    saveState();
    renderCustomItems();
    renderPackList();
  });

  document.getElementById('checklist-filter').addEventListener('input', (e) => {
    checklistFilter = e.target.value;
    renderPackList();
  });

  document.getElementById('hide-packed-toggle').addEventListener('change', (e) => {
    hidePacked = e.target.checked;
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

function itemRowHtml(item, isPacked) {
  return `
    <li class="${isPacked ? 'packed' : ''}" data-key="${escapeAttr(item.itemKey)}">
      <input type="checkbox" data-key="${escapeAttr(item.itemKey)}" ${isPacked ? 'checked' : ''}
        aria-label="Mark ${escapeAttr(item.label)} as packed">
      <span>${escapeHtml(item.label)}</span>
      <span class="pc-source">${escapeHtml(item.sources.join(', '))}</span>
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
  const list = document.getElementById('pack-list');
  if (!list) return;

  const allItems = await mergeItems(suitcase);
  const visibleItems = allItems.filter((i) => !suitcase.excludedItems.includes(i.itemKey));

  if (hudOnly) {
    updateHud(suitcase, visibleItems);
    return;
  }

  updateHud(suitcase, visibleItems);

  const hiddenCount = allItems.length - visibleItems.length;
  const hiddenToggle = document.getElementById('hidden-items-toggle');
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
  let displayItems = visibleItems.filter((i) => !q || i.label.toLowerCase().includes(q));
  if (hidePacked) displayItems = displayItems.filter((i) => !suitcase.packed[i.itemKey]);

  const hiddenItems = showHiddenItems
    ? allItems.filter((i) => suitcase.excludedItems.includes(i.itemKey) && (!q || i.label.toLowerCase().includes(q)))
    : [];

  if (!allItems.length) {
    list.innerHTML = '<li class="pc-checklist-empty">Add cubes from the left to build your packing list.</li>';
    list.classList.remove('two-col');
    return;
  }

  if (!displayItems.length && !hiddenItems.length) {
    list.innerHTML = `<li class="pc-checklist-empty">${q || hidePacked ? 'No items match.' : 'Nothing here yet.'}</li>`;
    list.classList.remove('two-col');
    return;
  }

  list.classList.toggle('two-col', displayItems.length > DENSE_CHECKLIST_THRESHOLD);

  list.innerHTML =
    displayItems.map((item) => itemRowHtml(item, !!suitcase.packed[item.itemKey])).join('') +
    hiddenItems.map((item) => `
      <li class="pc-item-hidden-row" data-key="${escapeAttr(item.itemKey)}">
        <span>${escapeHtml(item.label)}</span>
        <span class="pc-source">${escapeHtml(item.sources.join(', '))}</span>
        <button type="button" class="pc-item-restore" data-restore-key="${escapeAttr(item.itemKey)}">Restore</button>
      </li>`).join('');

  list.querySelectorAll('li[data-key]:not(.pc-item-hidden-row)').forEach((li) => bindItemRow(li, suitcase));

  list.querySelectorAll('.pc-item-restore').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.restoreKey;
      suitcase.excludedItems = suitcase.excludedItems.filter((k) => k !== key);
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

fetch('/api/save-cube')
  .then((r) => r.json())
  .then((d) => { isOwner = !!d.authed; })
  .catch(() => { isOwner = false; })
  .finally(() => {
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
