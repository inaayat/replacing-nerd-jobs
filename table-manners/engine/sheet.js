/**
 * One-sheet document model. Imported by the browser and by
 * `api/table-manners.js` — keep this file dependency-free ESM
 * (no `node:` imports, no npm packages).
 */

export const SHEET_LIMITS = {
  title: 80,
  columns: 40,
  rows: 500,
  name: 60,
  cell: 2000,
  json: 400_000,
};

const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const TYPES = new Set(['text', 'number']);

export function colLetter(n) {
  let x = n;
  let out = '';
  while (x > 0) {
    const rem = (x - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    x = Math.floor((x - 1) / 26);
  }
  return out;
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptySheet() {
  return {
    title: 'Untitled',
    columns: [
      { id: 'c1', name: 'Name', type: 'text' },
      { id: 'c2', name: 'Notes', type: 'text' },
    ],
    rows: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
    views: [],
    export: { tabs: [] },
    connectors: [],
  };
}

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

function cleanId(value, prefix, used) {
  const raw = String(value || '');
  let id = ID_RE.test(raw) ? raw : newId(prefix);
  while (used.has(id)) id = newId(prefix);
  used.add(id);
  return id;
}

function cleanType(value) {
  return TYPES.has(value) ? value : 'text';
}

function cellString(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return clip(value, SHEET_LIMITS.cell);
}

export function normalizeSheet(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const usedCols = new Set();
  const usedRows = new Set();

  let columns = Array.isArray(src.columns) ? src.columns : [];
  columns = columns.slice(0, SHEET_LIMITS.columns).map((col) => {
    const rec = col && typeof col === 'object' ? col : {};
    return {
      id: cleanId(rec.id, 'c', usedCols),
      name: clip(rec.name, SHEET_LIMITS.name) || 'Column',
      type: cleanType(rec.type),
    };
  });
  if (!columns.length) columns = emptySheet().columns.map((col) => ({ ...col }));

  const colIds = new Set(columns.map((col) => col.id));
  let rows = Array.isArray(src.rows) ? src.rows : [];
  rows = rows.slice(0, SHEET_LIMITS.rows).map((row) => {
    const rec = row && typeof row === 'object' ? row : {};
    const next = { id: cleanId(rec.id, 'r', usedRows) };
    for (const col of columns) {
      if (Object.prototype.hasOwnProperty.call(rec, col.id)) {
        next[col.id] = cellString(rec[col.id]);
      }
    }
    return next;
  });

  const sheet = {
    title: clip(String(src.title ?? '').trim(), SHEET_LIMITS.title) || 'Untitled',
    columns,
    rows,
    views: Array.isArray(src.views) ? src.views : [],
    export: src.export && typeof src.export === 'object' ? src.export : { tabs: [] },
    connectors: Array.isArray(src.connectors) ? src.connectors : [],
  };

  const json = JSON.stringify(sheet);
  if (json.length > SHEET_LIMITS.json) {
    throw new Error('Sheet is too large to save.');
  }
  return sheet;
}

export function cellValue(row, colId) {
  if (!row || row[colId] == null) return '';
  return String(row[colId]);
}

export function setTitle(sheet, title) {
  return normalizeSheet({ ...sheet, title });
}

export function setCell(sheet, rowId, colId, value) {
  const columns = sheet.columns;
  if (!columns.some((col) => col.id === colId)) return sheet;
  const rows = sheet.rows.map((row) => {
    if (row.id !== rowId) return row;
    return { ...row, [colId]: cellString(value) };
  });
  return normalizeSheet({ ...sheet, columns, rows });
}

export function setColumnName(sheet, colId, name) {
  const columns = sheet.columns.map((col) => (
    col.id === colId ? { ...col, name: clip(name, SHEET_LIMITS.name) || 'Column' } : col
  ));
  return normalizeSheet({ ...sheet, columns });
}

export function addRow(sheet, afterId) {
  const row = { id: newId('r') };
  const rows = sheet.rows.slice();
  const idx = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
  if (idx >= 0) rows.splice(idx + 1, 0, row);
  else rows.push(row);
  return normalizeSheet({ ...sheet, rows });
}

export function addColumn(sheet, afterId) {
  if (sheet.columns.length >= SHEET_LIMITS.columns) return sheet;
  const col = { id: newId('c'), name: 'Column', type: 'text' };
  const columns = sheet.columns.slice();
  const idx = afterId ? columns.findIndex((c) => c.id === afterId) : -1;
  if (idx >= 0) columns.splice(idx + 1, 0, col);
  else columns.push(col);
  return normalizeSheet({ ...sheet, columns });
}

export function deleteRow(sheet, rowId) {
  const rows = sheet.rows.filter((row) => row.id !== rowId);
  return normalizeSheet({ ...sheet, rows });
}

export function deleteColumn(sheet, colId) {
  if (sheet.columns.length <= 1) return sheet;
  const columns = sheet.columns.filter((col) => col.id !== colId);
  const rows = sheet.rows.map((row) => {
    const next = { ...row };
    delete next[colId];
    return next;
  });
  return normalizeSheet({ ...sheet, columns, rows });
}

export function cardsFromSheet(sheet) {
  return sheet.rows.map((row) => ({
    id: row.id,
    fields: sheet.columns.map((col) => ({
      colId: col.id,
      name: col.name,
      type: col.type,
      value: cellValue(row, col.id),
    })),
  }));
}

export function firstCell(sheet) {
  const row = sheet.rows[0];
  const col = sheet.columns[0];
  if (!row || !col) return null;
  return { rowId: row.id, colId: col.id };
}

export function neighborCell(sheet, selected, dRow, dCol) {
  if (!sheet.rows.length || !sheet.columns.length) return null;
  if (!selected) return firstCell(sheet);
  const ri = sheet.rows.findIndex((row) => row.id === selected.rowId);
  const ci = sheet.columns.findIndex((col) => col.id === selected.colId);
  if (ri < 0 || ci < 0) return firstCell(sheet);
  const row = sheet.rows[Math.max(0, Math.min(sheet.rows.length - 1, ri + dRow))];
  const col = sheet.columns[Math.max(0, Math.min(sheet.columns.length - 1, ci + dCol))];
  return { rowId: row.id, colId: col.id };
}
