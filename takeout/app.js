/**
 * Takeout page — pick API fields and their values, stack sheets, download .xlsx.
 * Flatten / catalog / workbook stay pure; this file only renders and wires events.
 */
import {
  SOURCES,
  sourceById,
  defaultParams,
  groupsOf,
  loadSource,
} from './catalog.js';
import { projectTable, summarizeFields, filterTable } from './flatten.js';
import { buildWorkbook, downloadBytes, workbookFilename, sheetTabName } from './workbook.js';

const PAGE_SIZE = 25;

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
  values: document.getElementById('values'),
  valuesTitle: document.getElementById('values-title'),
  valuesMeta: document.getElementById('values-meta'),
  valuesClose: document.getElementById('values-close'),
  valueFilter: document.getElementById('value-filter'),
  valueList: document.getElementById('value-list'),
  valuesTools: document.getElementById('values-tools'),
  valsAll: document.getElementById('vals-all'),
  valsNone: document.getElementById('vals-none'),
  preview: document.getElementById('preview'),
  previewMeta: document.getElementById('preview-meta'),
  pager: document.getElementById('pager'),
  pagerInfo: document.getElementById('pager-info'),
  pagePrev: document.getElementById('page-prev'),
  pageNext: document.getElementById('page-next'),
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
  summaries: {},
  valueFilters: {},
  openField: null,
  colQuery: '',
  valueQuery: '',
  page: 0,
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

function allowedSet(col) {
  const existing = state.valueFilters[col];
  if (existing instanceof Set) return existing;
  const options = state.summaries[col]?.options || [];
  return new Set(options.map((opt) => opt.key));
}

function selectedTable() {
  if (!state.result) return null;
  const filtered = filterTable(state.result.table, state.valueFilters);
  const keys = state.result.table.columns.filter((col) => state.selected.has(col));
  return projectTable(filtered, keys);
}

function fmtCell(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  }
  return String(value);
}

function fmtCompact(value) {
  const text = fmtCell(value);
  if (text.length <= 28) return text;
  return `${text.slice(0, 26)}…`;
}

function hostLabel(url) {
  if (!url) return 'pasted JSON';
  try {
    if (url.startsWith('/')) return 'this site';
    return new URL(url).host;
  } catch {
    return url;
  }
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
  els.fetchBtn.textContent = source.kind === 'paste' ? 'Use JSON' : 'Fetch live data';
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

function renderColumns() {
  if (!state.result) return;
  const q = state.colQuery.trim().toLowerCase();
  const cols = state.result.table.columns.filter((col) => !q || col.toLowerCase().includes(q));
  els.cols.innerHTML = cols
    .map((col) => {
      const on = state.selected.has(col);
      const open = state.openField === col;
      const sum = state.summaries[col];
      const examples = (sum?.examples || []).map(fmtCompact).join(' · ') || 'no values';
      const filterOn = state.valueFilters[col] instanceof Set;
      const kept = filterOn ? state.valueFilters[col].size : sum?.uniqueCount ?? 0;
      let action = `${sum?.uniqueCount ?? 0} values`;
      if (sum && !sum.asOptions && sum.min != null) {
        action = `${fmtCompact(sum.min)} – ${fmtCompact(sum.max)}`;
      } else if (filterOn) {
        action = `${kept} of ${sum.uniqueCount} values`;
      }
      return `<div class="tk-field-row${on ? '' : ' is-off'}${open ? ' is-open' : ''}" role="listitem">
        <label class="tk-field-inc">
          <input type="checkbox" data-col="${escapeHtml(col)}" ${on ? 'checked' : ''} />
          <code title="${escapeHtml(col)}">${escapeHtml(col)}</code>
        </label>
        <p class="tk-field-ex" title="${escapeHtml((sum?.examples || []).join(' · '))}">${escapeHtml(examples)}</p>
        <button type="button" class="tk-btn tk-btn-ghost tk-btn-tiny" data-open-values="${escapeHtml(col)}">${escapeHtml(action)}</button>
      </div>`;
    })
    .join('');
}

function renderValues() {
  const col = state.openField;
  if (!col || !state.summaries[col]) {
    els.values.hidden = true;
    return;
  }
  const sum = state.summaries[col];
  els.values.hidden = false;
  els.valuesTitle.textContent = col;
  const allowed = allowedSet(col);
  els.valuesTools.hidden = !sum.asOptions;
  if (!sum.asOptions) {
    els.valuesMeta.textContent = `${sum.uniqueCount} distinct numbers · every value is kept`;
    els.valueList.innerHTML = '';
    const note = document.createElement('p');
    note.className = 'tk-values-note';
    note.textContent =
      'This field is a numeric series (almost every row is different), so listing each number as a checkbox would not help. It stays in the sheet. Uncheck the column on the left to drop it.';
    els.valueList.appendChild(note);
    return;
  }
  els.valuesMeta.textContent = `${allowed.size} of ${sum.uniqueCount} values selected`;
  const q = state.valueQuery.trim().toLowerCase();
  const options = sum.options.filter((opt) => !q || opt.label.toLowerCase().includes(q));
  els.valueList.innerHTML = options
    .map((opt) => {
      const checked = allowed.has(opt.key) ? 'checked' : '';
      return `<label class="tk-val">
        <input type="checkbox" data-val="${escapeHtml(opt.key)}" ${checked} />
        <span class="tk-val-label" title="${escapeHtml(opt.label)}">${escapeHtml(opt.label)}</span>
        <span class="tk-val-count">${opt.count}</span>
      </label>`;
    })
    .join('');
  if (!options.length) {
    els.valueList.innerHTML = '<p class="tk-values-note">No values match that search.</p>';
  }
}

function renderPreview() {
  const table = selectedTable();
  const thead = els.preview.querySelector('thead');
  const tbody = els.preview.querySelector('tbody');
  if (!table || !table.columns.length) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td>Select at least one column.</td></tr>';
    els.previewMeta.textContent = '';
    els.pager.hidden = true;
    return;
  }
  const total = table.rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page >= pages) state.page = pages - 1;
  if (state.page < 0) state.page = 0;
  const start = state.page * PAGE_SIZE;
  const slice = table.rows.slice(start, start + PAGE_SIZE);
  thead.innerHTML = `<tr>${table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
  tbody.innerHTML = slice
    .map(
      (row) =>
        `<tr>${table.columns.map((c) => `<td title="${escapeHtml(fmtCell(row[c]))}">${escapeHtml(fmtCell(row[c]))}</td>`).join('')}</tr>`
    )
    .join('');
  const fetched = state.result.table.rows.length;
  const filtered = total !== fetched ? ` · ${total} after value filters` : '';
  els.previewMeta.textContent = `${fetched} live row${fetched === 1 ? '' : 's'}${filtered} × ${table.columns.length} column${table.columns.length === 1 ? '' : 's'}`;
  els.pager.hidden = total <= PAGE_SIZE;
  const from = total ? start + 1 : 0;
  const to = Math.min(start + PAGE_SIZE, total);
  els.pagerInfo.textContent = `${from}–${to} of ${total}`;
  els.pagePrev.disabled = state.page <= 0;
  els.pageNext.disabled = state.page >= pages - 1;
}

function renderPickMeta() {
  if (!state.result) return;
  const t = state.result.table;
  const bits = [
    `live from ${hostLabel(state.result.url)}`,
    `${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`,
    `${t.columns.length} fields`,
  ];
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

function renderAll() {
  renderPickMeta();
  renderColumns();
  renderValues();
  renderPreview();
  renderTray();
}

function showResult(result) {
  state.result = result;
  state.selected = new Set(result.table.columns);
  state.summaries = summarizeFields(result.table);
  state.valueFilters = {};
  const firstList =
    result.table.columns.find((col) => state.summaries[col]?.asOptions) || result.table.columns[0] || null;
  state.openField = firstList;
  state.colQuery = '';
  state.valueQuery = '';
  state.page = 0;
  els.colFilter.value = '';
  els.valueFilter.value = '';
  els.sheetName.value = sheetTabName(result.name);
  els.pick.hidden = false;
  renderAll();
}

async function fetchCurrent() {
  const source = currentSource();
  const params = readParams();
  setStatus(source.kind === 'paste' ? 'Reading JSON…' : 'Fetching live data…');
  els.fetchBtn.disabled = true;
  try {
    const result = await loadSource(source, params);
    if (!result.table.columns.length) {
      setStatus('That payload had no fields to pick.', 'bad');
      return;
    }
    showResult(result);
    setStatus(
      `Loaded ${result.table.rows.length} rows from ${hostLabel(result.url)}. Open a field to see every value.`,
      'ok'
    );
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

function openValues(col) {
  state.openField = col;
  state.valueQuery = '';
  els.valueFilter.value = '';
  renderColumns();
  renderValues();
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
  setStatus('Fetch to pull live rows for this source.');
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

els.cols.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-open-values]');
  if (!btn) return;
  openValues(btn.getAttribute('data-open-values'));
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

els.valueFilter.addEventListener('input', () => {
  state.valueQuery = els.valueFilter.value;
  renderValues();
});

els.valueList.addEventListener('change', (event) => {
  const input = event.target.closest('input[data-val]');
  if (!input || !state.openField) return;
  const next = new Set(allowedSet(state.openField));
  const key = input.getAttribute('data-val');
  if (input.checked) next.add(key);
  else next.delete(key);
  state.valueFilters[state.openField] = next;
  state.page = 0;
  renderAll();
});

els.valsAll.addEventListener('click', () => {
  if (!state.openField) return;
  delete state.valueFilters[state.openField];
  state.page = 0;
  renderAll();
});

els.valsNone.addEventListener('click', () => {
  if (!state.openField) return;
  state.valueFilters[state.openField] = new Set();
  state.page = 0;
  renderAll();
});

els.valuesClose.addEventListener('click', () => {
  state.openField = null;
  renderColumns();
  renderValues();
});

els.pagePrev.addEventListener('click', () => {
  state.page -= 1;
  renderPreview();
});

els.pageNext.addEventListener('click', () => {
  state.page += 1;
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
fetchCurrent();
