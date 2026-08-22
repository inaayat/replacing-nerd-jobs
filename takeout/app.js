/**
 * Takeout page — pick API fields, stack sheets, download .xlsx.
 * All mutation of the preview lives here; flatten / catalog / workbook stay pure.
 */
import {
  SOURCES,
  sourceById,
  defaultParams,
  groupsOf,
  loadSource,
} from './catalog.js';
import { projectTable } from './flatten.js';
import { buildWorkbook, downloadBytes, workbookFilename, sheetTabName } from './workbook.js';

const PREVIEW_ROWS = 12;

const els = {
  sourceList: document.getElementById('source-list'),
  setupTitle: document.getElementById('setup-title'),
  setupBlurb: document.getElementById('setup-blurb'),
  setupDocs: document.getElementById('setup-docs'),
  paramsForm: document.getElementById('params-form'),
  fetchBtn: document.getElementById('fetch-btn'),
  status: document.getElementById('status'),
  pick: document.getElementById('pick'),
  pickMeta: document.getElementById('pick-meta'),
  colFilter: document.getElementById('col-filter'),
  cols: document.getElementById('cols'),
  preview: document.getElementById('preview'),
  previewMeta: document.getElementById('preview-meta'),
  sheetName: document.getElementById('sheet-name'),
  addSheet: document.getElementById('add-sheet'),
  exportThis: document.getElementById('export-this'),
  exportNav: document.getElementById('export-nav'),
  exportBook: document.getElementById('export-book'),
  sheets: document.getElementById('sheets'),
  trayEmpty: document.getElementById('tray-empty'),
  colsAll: document.getElementById('cols-all'),
  colsNone: document.getElementById('cols-none'),
};

const state = {
  sourceId: SOURCES[0].id,
  params: defaultParams(SOURCES[0]),
  selected: new Set(),
  colQuery: '',
  result: null,
  sheets: [],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function currentSource() {
  return sourceById(state.sourceId) || SOURCES[0];
}

function setStatus(text, tone) {
  els.status.textContent = text || '';
  els.status.classList.toggle('is-bad', tone === 'bad');
  els.status.classList.toggle('is-ok', tone === 'ok');
}

function renderSources() {
  const groups = groupsOf(SOURCES);
  els.sourceList.innerHTML = groups
    .map(
      (group) => `<div class="tk-group">
      <p class="tk-group-name">${escapeHtml(group.name)}</p>
      ${group.sources
        .map((source) => {
          const on = source.id === state.sourceId ? ' is-on' : '';
          return `<button type="button" class="tk-source${on}" data-source="${escapeHtml(source.id)}">
            <span class="tk-source-name">${escapeHtml(source.name)}</span>
            <span class="tk-source-blurb">${escapeHtml(source.blurb)}</span>
          </button>`;
        })
        .join('')}
    </div>`
    )
    .join('');
}

function renderSetup() {
  const source = currentSource();
  els.setupTitle.textContent = source.name;
  els.setupBlurb.textContent = source.blurb;
  els.setupDocs.innerHTML = source.docs
    ? `<a href="${escapeHtml(source.docs)}" ${source.docs.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>About this source</a>`
    : '';
  els.paramsForm.innerHTML = (source.params || [])
    .map((param) => {
      const value = state.params[param.key] ?? param.default ?? '';
      if (param.type === 'select') {
        const options = (param.options || [])
          .map((opt) => {
            const v = typeof opt === 'string' ? opt : opt.value;
            const label = typeof opt === 'string' ? opt : opt.label;
            const sel = String(v) === String(value) ? ' selected' : '';
            return `<option value="${escapeHtml(v)}"${sel}>${escapeHtml(label)}</option>`;
          })
          .join('');
        return `<label class="tk-field"><span>${escapeHtml(param.label)}</span>
          <select name="${escapeHtml(param.key)}">${options}</select></label>`;
      }
      if (param.type === 'textarea') {
        return `<label class="tk-field"><span>${escapeHtml(param.label)}</span>
          <textarea name="${escapeHtml(param.key)}" spellcheck="false">${escapeHtml(value)}</textarea></label>`;
      }
      return `<label class="tk-field"><span>${escapeHtml(param.label)}</span>
        <input type="text" name="${escapeHtml(param.key)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(param.placeholder || '')}" /></label>`;
    })
    .join('');
  els.fetchBtn.textContent = source.kind === 'paste' ? 'Use JSON' : 'Fetch';
}

function readParams() {
  const source = currentSource();
  const next = { ...state.params };
  for (const param of source.params || []) {
    const field = els.paramsForm.elements.namedItem(param.key);
    if (field) next[param.key] = field.value;
  }
  state.params = next;
  return next;
}

function selectedTable() {
  if (!state.result) return null;
  const keys = state.result.table.columns.filter((col) => state.selected.has(col));
  return projectTable(state.result.table, keys);
}

function renderColumns() {
  if (!state.result) return;
  const q = state.colQuery.trim().toLowerCase();
  const cols = state.result.table.columns.filter((col) => !q || col.toLowerCase().includes(q));
  els.cols.innerHTML = cols
    .map((col) => {
      const on = state.selected.has(col);
      return `<label class="tk-col${on ? '' : ' is-off'}">
        <input type="checkbox" data-col="${escapeHtml(col)}" ${on ? 'checked' : ''} />
        <code title="${escapeHtml(col)}">${escapeHtml(col)}</code>
      </label>`;
    })
    .join('');
}

function fmtCell(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  }
  return String(value);
}

function renderPreview() {
  const table = selectedTable();
  const thead = els.preview.querySelector('thead');
  const tbody = els.preview.querySelector('tbody');
  if (!table || !table.columns.length) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td>Select at least one column.</td></tr>';
    els.previewMeta.textContent = '';
    return;
  }
  thead.innerHTML = `<tr>${table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
  const slice = table.rows.slice(0, PREVIEW_ROWS);
  tbody.innerHTML = slice
    .map(
      (row) =>
        `<tr>${table.columns.map((c) => `<td title="${escapeHtml(fmtCell(row[c]))}">${escapeHtml(fmtCell(row[c]))}</td>`).join('')}</tr>`
    )
    .join('');
  const extra = table.rows.length > PREVIEW_ROWS ? ` · showing ${PREVIEW_ROWS}` : '';
  els.previewMeta.textContent = `${table.rows.length} row${table.rows.length === 1 ? '' : 's'} × ${table.columns.length} column${table.columns.length === 1 ? '' : 's'}${extra}`;
}

function renderPickMeta() {
  if (!state.result) return;
  const t = state.result.table;
  const bits = [`${t.totalRows} row${t.totalRows === 1 ? '' : 's'}`, `${t.columns.length} fields`];
  if (t.truncatedRows) bits.push(`capped at ${t.rows.length}`);
  if (t.truncatedCols) bits.push('extra nested fields omitted');
  els.pickMeta.textContent = bits.join(' · ');
}

function renderTray() {
  const n = state.sheets.length;
  els.trayEmpty.hidden = n > 0;
  els.sheets.innerHTML = state.sheets
    .map(
      (sheet, i) => `<li class="tk-sheet">
      <strong>${escapeHtml(sheet.name)}</strong>
      <p>${sheet.rows.length} × ${sheet.columns.length}${sheet.source ? ` · ${escapeHtml(sheet.source)}` : ''}</p>
      <div class="tk-sheet-tools">
        <button type="button" class="tk-btn tk-btn-ghost tk-btn-tiny" data-remove="${i}">Remove</button>
      </div>
    </li>`
    )
    .join('');
  const canBook = n > 0;
  const canThis = Boolean(selectedTable()?.columns.length);
  els.exportBook.disabled = !canBook;
  els.exportNav.disabled = !canBook && !canThis;
}

function showResult(result) {
  state.result = result;
  state.selected = new Set(result.table.columns);
  state.colQuery = '';
  els.colFilter.value = '';
  els.sheetName.value = sheetTabName(result.name);
  els.pick.hidden = false;
  renderPickMeta();
  renderColumns();
  renderPreview();
  renderTray();
}

async function fetchCurrent() {
  const source = currentSource();
  const params = readParams();
  setStatus(source.kind === 'paste' ? 'Reading JSON…' : 'Fetching…');
  els.fetchBtn.disabled = true;
  try {
    const result = await loadSource(source, params);
    if (!result.table.columns.length) {
      setStatus('That payload had no fields to pick.', 'bad');
      return;
    }
    showResult(result);
    setStatus(`Loaded ${result.table.rows.length} rows.`, 'ok');
  } catch (err) {
    setStatus(err.message || String(err), 'bad');
  } finally {
    els.fetchBtn.disabled = false;
  }
}

function projectedSheet(name) {
  const table = selectedTable();
  if (!table?.columns.length) throw new Error('Pick at least one column.');
  return {
    name: sheetTabName(name || currentSource().name),
    columns: table.columns,
    rows: table.rows,
    source: currentSource().name,
    url: state.result?.url || '',
    fetchedAt: state.result?.fetchedAt || new Date().toISOString(),
  };
}

function addSheet() {
  try {
    const sheet = projectedSheet(els.sheetName.value);
    state.sheets.push(sheet);
    renderTray();
    setStatus(`Added “${sheet.name}”.`, 'ok');
  } catch (err) {
    setStatus(err.message, 'bad');
  }
}

function exportSheets(sheets, title) {
  const bytes = buildWorkbook(sheets);
  downloadBytes(bytes, workbookFilename(title));
}

function exportThis() {
  try {
    exportSheets([projectedSheet(els.sheetName.value)], els.sheetName.value || currentSource().name);
    setStatus('Downloaded this sheet.', 'ok');
  } catch (err) {
    setStatus(err.message, 'bad');
  }
}

function exportBook() {
  if (!state.sheets.length) {
    exportThis();
    return;
  }
  try {
    exportSheets(state.sheets, 'takeout');
    setStatus('Downloaded workbook.', 'ok');
  } catch (err) {
    setStatus(err.message, 'bad');
  }
}

els.sourceList.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-source]');
  if (!btn) return;
  const source = sourceById(btn.getAttribute('data-source'));
  if (!source) return;
  state.sourceId = source.id;
  state.params = defaultParams(source);
  renderSources();
  renderSetup();
  setStatus('');
});

els.paramsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  fetchCurrent();
});

els.fetchBtn.addEventListener('click', fetchCurrent);

els.cols.addEventListener('change', (event) => {
  const input = event.target.closest('input[data-col]');
  if (!input) return;
  const col = input.getAttribute('data-col');
  if (input.checked) state.selected.add(col);
  else state.selected.delete(col);
  renderColumns();
  renderPreview();
  renderTray();
});

els.colFilter.addEventListener('input', () => {
  state.colQuery = els.colFilter.value;
  renderColumns();
});

els.colsAll.addEventListener('click', () => {
  if (!state.result) return;
  state.selected = new Set(state.result.table.columns);
  renderColumns();
  renderPreview();
});

els.colsNone.addEventListener('click', () => {
  state.selected = new Set();
  renderColumns();
  renderPreview();
});

els.addSheet.addEventListener('click', addSheet);
els.exportThis.addEventListener('click', exportThis);
els.exportBook.addEventListener('click', exportBook);
els.exportNav.addEventListener('click', exportBook);

els.sheets.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-remove]');
  if (!btn) return;
  const i = Number(btn.getAttribute('data-remove'));
  if (!Number.isInteger(i)) return;
  state.sheets.splice(i, 1);
  renderTray();
});

renderSources();
renderSetup();
renderTray();
