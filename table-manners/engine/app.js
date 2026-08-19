import { initAuth, wireAuthLink, loginUrl } from './auth.js';
import { loadSheet, saveSheet, debounceSave } from './store.js';
import { renderGrid, bindGridKeys } from './grid.js';
import { renderForm } from './views.js';
import { downloadWorkbook } from './workbook.js';
import {
  emptySheet,
  firstCell,
  neighborCell,
  normalizeSheet,
  addRow,
  addColumn,
  deleteRow,
  deleteColumn,
  setCell,
  setColumnName,
  setTitle,
  addRecord,
  findColumn,
} from './sheet.js';

const FACE_KEY = 'tm-face';
const GROUP_KEY = 'tm-group-by';

const els = {
  landing: document.getElementById('tm-landing'),
  app: document.getElementById('tm-app'),
  well: document.getElementById('tm-well'),
  title: document.getElementById('tm-title'),
  status: document.getElementById('tm-status'),
  faces: document.getElementById('tm-faces'),
  export: document.getElementById('tm-export'),
  groupBy: document.getElementById('tm-group-by'),
  addRow: document.getElementById('tm-add-row'),
  addCol: document.getElementById('tm-add-col'),
  delRow: document.getElementById('tm-del-row'),
  delCol: document.getElementById('tm-del-col'),
  signin: document.getElementById('tm-signin'),
};

const state = {
  auth: null,
  sheet: emptySheet(),
  face: readFace(),
  groupBy: readGroupBy(),
  selected: null,
  editing: false,
  draft: null,
  save: 'idle',
  lastSaved: null,
  error: '',
};

function readFace() {
  try {
    const stored = localStorage.getItem(FACE_KEY);
    if (stored === 'form' || stored === 'grid') return stored;
  } catch {
    // ignore
  }
  return 'grid';
}

function writeFace(face) {
  try {
    localStorage.setItem(FACE_KEY, face);
  } catch {
    // ignore
  }
}

function readGroupBy() {
  try {
    return localStorage.getItem(GROUP_KEY) || '';
  } catch {
    return '';
  }
}

function writeGroupBy(colId) {
  try {
    if (colId) localStorage.setItem(GROUP_KEY, colId);
    else localStorage.removeItem(GROUP_KEY);
  } catch {
    // ignore
  }
}

function formatSaved(date) {
  if (!date) return 'Not saved yet';
  const ms = Date.now() - date.getTime();
  if (ms < 8000) return 'Saved just now';
  if (ms < 60_000) return 'Saved seconds ago';
  const min = Math.round(ms / 60_000);
  return min === 1 ? 'Saved 1 min ago' : `Saved ${min} min ago`;
}

function setStatus() {
  if (!els.status) return;
  if (state.error) {
    els.status.textContent = state.error;
    els.status.dataset.tone = 'bad';
    return;
  }
  if (state.save === 'saving') {
    els.status.textContent = 'Saving…';
    els.status.dataset.tone = '';
    return;
  }
  if (state.save === 'dirty') {
    els.status.textContent = 'Unsaved changes';
    els.status.dataset.tone = '';
    return;
  }
  els.status.textContent = formatSaved(state.lastSaved);
  els.status.dataset.tone = 'ok';
}

const persist = debounceSave(async (sheet, opts) => {
  if (!state.auth?.token) return;
  state.save = 'saving';
  setStatus();
  try {
    const data = await saveSheet(state.auth.token, sheet, opts);
    state.sheet = normalizeSheet(data.sheet || sheet);
    state.lastSaved = data.updatedAt ? new Date(data.updatedAt) : new Date();
    state.save = 'saved';
    state.error = '';
  } catch (err) {
    state.save = 'error';
    state.error = err.message || 'Could not save.';
  }
  setStatus();
});

function markDirty() {
  state.save = 'dirty';
  state.error = '';
  setStatus();
  persist(state.sheet);
}

function applySheet(next, { dirty = true } = {}) {
  state.sheet = normalizeSheet(next);
  if (state.selected) {
    const rowOk = state.sheet.rows.some((row) => row.id === state.selected.rowId);
    const colOk = state.sheet.columns.some((col) => col.id === state.selected.colId);
    if (!rowOk || !colOk) state.selected = firstCell(state.sheet);
  } else {
    state.selected = firstCell(state.sheet);
  }
  if (els.title && document.activeElement !== els.title) {
    els.title.value = state.sheet.title;
  }
  if (dirty) markDirty();
  render();
}

function renderGroupControl() {
  if (!els.groupBy) return;
  if (state.groupBy && !findColumn(state.sheet, state.groupBy)) {
    state.groupBy = '';
    writeGroupBy('');
  }
  const current = state.groupBy;
  els.groupBy.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No grouping';
  els.groupBy.appendChild(none);
  state.sheet.columns.forEach((col) => {
    const opt = document.createElement('option');
    opt.value = col.id;
    opt.textContent = col.name;
    els.groupBy.appendChild(opt);
  });
  els.groupBy.value = current;
}

function render() {
  if (els.faces) {
    els.faces.querySelectorAll('[data-face]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.face === state.face);
    });
  }
  renderGroupControl();
  if (!els.well) return;
  if (state.face === 'form') {
    renderForm(els.well, state.sheet, {
      selected: state.selected,
      groupBy: state.groupBy,
      onSelect: (sel) => {
        state.selected = sel;
        render();
      },
      onCommit: (rowId, colId, value) => {
        applySheet(setCell(state.sheet, rowId, colId, value));
      },
      onAddRecord: (seed) => {
        const next = addRecord(state.sheet, seed);
        state.selected = { rowId: next.rows[next.rows.length - 1].id, colId: next.columns[0]?.id };
        applySheet(next);
      },
      onDeleteRow: (rowId) => applySheet(deleteRow(state.sheet, rowId)),
    });
    return;
  }

  renderGrid(els.well, state.sheet, {
    selected: state.selected,
    editing: state.editing,
    groupBy: state.groupBy,
    onSelect: (sel) => {
      state.editing = false;
      state.draft = null;
      state.selected = sel;
      render();
    },
    onStartEdit: (rowId, colId, seed) => {
      state.selected = { rowId, colId };
      state.editing = true;
      state.draft = seed != null ? seed : null;
      render();
      if (state.draft != null) {
        const input = els.well.querySelector('.tm-grid-edit');
        if (input) {
          input.value = state.draft;
          input.setSelectionRange(input.value.length, input.value.length);
        }
        state.draft = null;
      }
    },
    onCommit: (rowId, colId, value, move) => {
      if (!state.editing) return;
      state.editing = false;
      applySheet(setCell(state.sheet, rowId, colId, value));
      if (move) state.selected = neighborCell(state.sheet, { rowId, colId }, move.dRow, move.dCol);
      render();
    },
    onCancel: () => {
      state.editing = false;
      render();
    },
    onRenameColumn: (colId, name) => {
      applySheet(setColumnName(state.sheet, colId, name));
    },
  });
}

function showSignedOut() {
  els.landing.hidden = false;
  els.app.hidden = true;
  if (els.status) els.status.hidden = true;
  if (els.signin) els.signin.href = loginUrl();
}

function showApp() {
  els.landing.hidden = true;
  els.app.hidden = false;
  if (els.status) els.status.hidden = false;
}

function bindChrome() {
  els.faces?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-face]');
    if (!btn) return;
    state.face = btn.dataset.face === 'form' ? 'form' : 'grid';
    state.editing = false;
    writeFace(state.face);
    render();
  });

  els.groupBy?.addEventListener('change', () => {
    state.groupBy = els.groupBy.value;
    writeGroupBy(state.groupBy);
    render();
  });

  els.title?.addEventListener('change', () => {
    applySheet(setTitle(state.sheet, els.title.value));
  });

  els.addRow?.addEventListener('click', () => {
    applySheet(addRow(state.sheet, state.selected?.rowId));
  });
  els.addCol?.addEventListener('click', () => {
    applySheet(addColumn(state.sheet, state.selected?.colId));
  });
  els.delRow?.addEventListener('click', () => {
    if (!state.selected?.rowId) return;
    applySheet(deleteRow(state.sheet, state.selected.rowId));
  });
  els.delCol?.addEventListener('click', () => {
    if (!state.selected?.colId) return;
    applySheet(deleteColumn(state.sheet, state.selected.colId));
  });

  const doExport = async () => {
    await persist.flush();
    downloadWorkbook(state.sheet);
  };
  els.export?.addEventListener('click', doExport);
  document.getElementById('tm-export-landing')?.addEventListener('click', doExport);

  bindGridKeys(document, () => state, {
    onSelect: (sel) => {
      state.selected = sel;
      render();
    },
    onStartEdit: (rowId, colId, seed) => {
      state.selected = { rowId, colId };
      state.editing = true;
      render();
      if (seed != null) {
        const input = els.well?.querySelector('.tm-grid-edit');
        if (input) {
          input.value = seed;
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }
    },
    onClear: (rowId, colId) => {
      applySheet(setCell(state.sheet, rowId, colId, ''));
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist.flush({ keepalive: true });
  });
  window.addEventListener('beforeunload', () => {
    persist.flush({ keepalive: true });
  });
  setInterval(setStatus, 15_000);
}

async function boot() {
  bindChrome();
  const auth = await initAuth();
  state.auth = auth;
  wireAuthLink(auth);

  if (!auth.signedIn) {
    showSignedOut();
    return;
  }

  showApp();
  setStatus();
  try {
    const data = await loadSheet(auth.token);
    state.sheet = normalizeSheet(data.sheet || emptySheet());
    state.lastSaved = data.updatedAt ? new Date(data.updatedAt) : (data.created ? null : new Date());
    state.save = data.created ? 'idle' : 'saved';
    state.selected = firstCell(state.sheet);
    if (els.title) els.title.value = state.sheet.title;
    setStatus();
    render();
  } catch (err) {
    state.error = err.message || 'Could not load sheet.';
    setStatus();
    state.selected = firstCell(state.sheet);
    render();
  }
}

boot();
