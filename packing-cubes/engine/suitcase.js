import { catalogUrl, cubeJsonUrl } from './paths.js';

const STORAGE_KEY = 'packing-cubes:suitcases';

const root = document.getElementById('suitcase-root');
const params = new URLSearchParams(location.search);
const addCubeId = params.get('add');

let catalog = [];
let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    activeSuitcaseId: null,
    suitcases: [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureSuitcase() {
  if (!state.suitcases.length) {
    const id = crypto.randomUUID();
    state.suitcases.push({ id, name: 'My trip', cubeIds: [], customItems: [], packed: {} });
    state.activeSuitcaseId = id;
    saveState();
  }
  if (!state.activeSuitcaseId) state.activeSuitcaseId = state.suitcases[0].id;
}

function activeSuitcase() {
  ensureSuitcase();
  return state.suitcases.find((s) => s.id === state.activeSuitcaseId) || state.suitcases[0];
}

function itemKey(cubeId, label) {
  return `${cubeId}:${label.toLowerCase().trim()}`;
}

async function fetchCube(id) {
  const res = await fetch(cubeJsonUrl(id));
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

function render() {
  const suitcase = activeSuitcase();
  root.innerHTML = `
    <div class="pc-card" style="text-align:left;margin-bottom:16px">
      <div class="b-field-row" style="margin-bottom:0">
        <div class="b-field">
          <label>Suitcase</label>
          <select id="suitcase-select" class="b-mini-input">
            ${state.suitcases.map((s) => `<option value="${s.id}" ${s.id === suitcase.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="b-field">
          <label>Trip name</label>
          <input type="text" id="trip-name" class="b-mini-input" value="${escapeAttr(suitcase.name)}">
        </div>
      </div>
      <div class="pc-actions" style="justify-content:flex-start;margin-top:12px">
        <button type="button" class="pc-btn" id="new-suitcase-btn">+ New suitcase</button>
        <button type="button" class="pc-btn danger" id="delete-suitcase-btn" style="color:var(--red);border-color:var(--red)">Delete</button>
      </div>
    </div>

    <div class="pc-section-label">Add cubes to this suitcase</div>
    <div id="cube-picker" class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4"></div>

    <div class="pc-section-label">Custom items</div>
    <div id="custom-items"></div>
    <button type="button" class="b-add-row-btn" id="add-custom-btn" style="margin-bottom:20px">+ Add custom item</button>

    <div class="pc-hud" id="pack-hud">
      <div class="pc-stat"><b id="packed-num">0</b><span>packed</span></div>
      <div class="pc-stat"><b id="total-num">0</b><span>total</span></div>
      <div class="pc-spacer"></div>
    </div>
    <div class="pc-progress-bar"><i id="progress-bar"></i></div>

    <ul class="pc-checklist pc-card" style="padding:0;margin-top:12px;text-align:left" id="pack-list"></ul>
  `;

  document.getElementById('suitcase-select').addEventListener('change', (e) => {
    state.activeSuitcaseId = e.target.value;
    saveState();
    renderPackList();
    renderCubePicker();
  });
  document.getElementById('trip-name').addEventListener('input', (e) => {
    suitcase.name = e.target.value;
    saveState();
    const opt = document.querySelector(`#suitcase-select option[value="${suitcase.id}"]`);
    if (opt) opt.textContent = suitcase.name || 'Untitled trip';
  });
  document.getElementById('new-suitcase-btn').addEventListener('click', () => {
    const id = crypto.randomUUID();
    state.suitcases.push({ id, name: 'New trip', cubeIds: [], customItems: [], packed: {} });
    state.activeSuitcaseId = id;
    saveState();
    render();
  });
  document.getElementById('delete-suitcase-btn').addEventListener('click', () => {
    if (state.suitcases.length <= 1) return;
    state.suitcases = state.suitcases.filter((s) => s.id !== suitcase.id);
    state.activeSuitcaseId = state.suitcases[0].id;
    saveState();
    render();
  });
  document.getElementById('add-custom-btn').addEventListener('click', () => {
    suitcase.customItems.push({ label: '' });
    saveState();
    renderCustomItems();
    renderPackList();
  });

  renderCubePicker();
  renderCustomItems();
  renderPackList();
}

function renderCubePicker() {
  const suitcase = activeSuitcase();
  const mount = document.getElementById('cube-picker');
  mount.innerHTML = catalog.map((c) => {
    const checked = suitcase.cubeIds.includes(c.id);
    return `
      <label class="flex items-start gap-2 p-2 border-2 border-[#2c2e25] rounded cursor-pointer ${checked ? 'bg-[#e8f5ea]' : 'bg-[#fffdf3]'}" style="font-size:12px;font-weight:700">
        <input type="checkbox" data-cube-id="${c.id}" ${checked ? 'checked' : ''} style="margin-top:2px;accent-color:#6b9e78">
        <span>
          <span class="block font-extrabold text-gray-900">${escapeHtml(c.title)}</span>
          <span class="block text-[10px] text-gray-500 font-semibold">${escapeHtml(c.blurb || '')}</span>
        </span>
      </label>`;
  }).join('');

  mount.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.cubeId;
      if (e.target.checked) {
        if (!suitcase.cubeIds.includes(id)) suitcase.cubeIds.push(id);
      } else {
        suitcase.cubeIds = suitcase.cubeIds.filter((x) => x !== id);
      }
      saveState();
      renderPackList();
    });
  });
}

function renderCustomItems() {
  const suitcase = activeSuitcase();
  const mount = document.getElementById('custom-items');
  mount.innerHTML = (suitcase.customItems || []).map((item, i) => `
    <div class="b-item-row" data-idx="${i}">
      <input type="text" class="b-mini-input custom-label" value="${escapeAttr(item.label)}" placeholder="One-off item">
      <button type="button" class="b-remove-btn custom-remove">&times;</button>
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
  const items = await mergeItems(suitcase);
  const packed = packedCount(suitcase, items);
  document.getElementById('packed-num').textContent = packed;
  document.getElementById('total-num').textContent = items.length;
  document.getElementById('progress-bar').style.width = items.length ? `${(packed / items.length) * 100}%` : '0%';

  const list = document.getElementById('pack-list');
  if (!items.length) {
    list.innerHTML = '<li style="justify-content:center;color:var(--gray)">Pick some cubes above to build your packing list.</li>';
    return;
  }

  list.innerHTML = items.map((item) => {
    const isPacked = !!suitcase.packed[item.itemKey];
    return `
      <li class="${isPacked ? 'packed' : ''}">
        <input type="checkbox" data-key="${escapeAttr(item.itemKey)}" ${isPacked ? 'checked' : ''}>
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

fetch(catalogUrl)
  .then((r) => {
    if (!r.ok) throw new Error(`Catalog request failed (${r.status})`);
    return r.json();
  })
  .then((cubes) => {
    catalog = cubes;
    ensureSuitcase();
    if (addCubeId) {
      const suitcase = activeSuitcase();
      if (!suitcase.cubeIds.includes(addCubeId)) {
        suitcase.cubeIds.push(addCubeId);
        saveState();
      }
      history.replaceState(null, '', './suitcase.html');
    }
    render();
  })
  .catch(() => {
    root.innerHTML = '<p class="text-gray-500 font-bold">Could not load the cube catalog.</p>';
  });
