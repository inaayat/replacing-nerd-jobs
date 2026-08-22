/**
 * JSON → a rectangular table the column picker and workbook can share.
 * Browser-safe ESM — no node: imports, no npm.
 *
 * Arrays of objects become rows. Nested objects flatten to dotted keys.
 * A few public-API shapes get a first-class unwrap (GeoJSON, World Bank
 * [meta, rows], Census header+rows, Open-Meteo parallel arrays).
 */

export const MAX_ROWS = 5000;
export const MAX_COLS = 80;
export const MAX_CELL = 8000;
export const MAX_DEPTH = 4;

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function cellValue(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'string') {
    return value.length > MAX_CELL ? value.slice(0, MAX_CELL) : value;
  }
  const json = JSON.stringify(value);
  if (json == null) return '';
  return json.length > MAX_CELL ? json.slice(0, MAX_CELL) : json;
}

function pathDepth(path) {
  return path ? path.split('.').length : 0;
}

/**
 * Flatten one record. Arrays and deep objects become a JSON/text cell rather
 * than exploding into an unbounded column set.
 */
export function flattenRecord(obj, prefix = '', out = {}) {
  if (!isPlainObject(obj)) {
    out[prefix || 'value'] = cellValue(obj);
    return out;
  }
  const keys = Object.keys(obj);
  if (!keys.length) {
    if (prefix) out[prefix] = '';
    return out;
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (isPlainObject(value) && Object.keys(value).length && pathDepth(path) < MAX_DEPTH) {
      flattenRecord(value, path, out);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length && value.every((item) => typeof item === 'string' || typeof item === 'number')) {
        out[path] = value.join(', ');
      } else {
        out[path] = cellValue(value);
      }
      continue;
    }
    out[path] = cellValue(value);
  }
  return out;
}

/**
 * Columnar APIs (Open-Meteo daily/hourly) store one array per field.
 * Turn `{ time: [...], temp: [...] }` into rows if every array is the same length.
 */
export function recordsFromParallel(obj) {
  if (!isPlainObject(obj)) return null;
  const keys = Object.keys(obj).filter((key) => Array.isArray(obj[key]));
  if (keys.length < 2) return null;
  const lead = keys.includes('time') ? 'time' : keys[0];
  const n = obj[lead].length;
  if (!n || n > MAX_ROWS * 2) return null;
  if (!keys.every((key) => obj[key].length === n)) return null;
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const row = {};
    for (const key of keys) row[key] = obj[key][i];
    rows.push(row);
  }
  return rows;
}

function recordsFromCensus(data) {
  if (!Array.isArray(data) || data.length < 2) return null;
  if (!data.every(Array.isArray)) return null;
  const headers = data[0].map((h, i) => String(h ?? `col_${i + 1}`));
  return data.slice(1).map((row) => {
    const out = {};
    headers.forEach((h, i) => {
      out[h] = row[i];
    });
    return out;
  });
}

function recordsFromWorldBank(data) {
  if (!Array.isArray(data) || data.length !== 2) return null;
  if (!isPlainObject(data[0]) || !Array.isArray(data[1])) return null;
  if (data[0].page == null && data[0].pages == null && data[0].total == null) return null;
  return data[1];
}

function recordsFromGeoJSON(data) {
  if (!isPlainObject(data) || data.type !== 'FeatureCollection') return null;
  if (!Array.isArray(data.features)) return null;
  return data.features.map((feature) => {
    const props = isPlainObject(feature?.properties) ? { ...feature.properties } : {};
    const coords = feature?.geometry?.coordinates;
    const row = flattenRecord(props);
    row.geometry = feature?.geometry?.type || '';
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      row.lon = coords[0];
      row.lat = coords[1];
    }
    return row;
  });
}

function largestArray(data) {
  if (!isPlainObject(data)) return null;
  let best = null;
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value) || !value.length) continue;
    if (!best || value.length > best.value.length) best = { key, value };
  }
  return best;
}

/**
 * Pull a list of row-shaped records out of an arbitrary JSON value.
 */
export function findRecords(data) {
  const census = recordsFromCensus(data);
  if (census) return census;
  const worldBank = recordsFromWorldBank(data);
  if (worldBank) return findRecords(worldBank);
  const geo = recordsFromGeoJSON(data);
  if (geo) return geo;

  if (Array.isArray(data)) {
    if (!data.length) return [];
    if (data.every((item) => item == null || typeof item !== 'object')) {
      return data.map((value) => ({ value }));
    }
    return data;
  }

  if (isPlainObject(data)) {
    const daily = recordsFromParallel(data.daily);
    if (daily) return daily;
    const hourly = recordsFromParallel(data.hourly);
    if (hourly) return hourly;
    const self = recordsFromParallel(data);
    if (self) return self;

    const best = largestArray(data);
    if (best && best.value.length >= 1) return findRecords(best.value);
    return [data];
  }

  if (data == null) return [];
  return [{ value: data }];
}

export function tableFromJson(data, opts = {}) {
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const maxCols = opts.maxCols ?? MAX_COLS;
  const found = findRecords(data);
  const totalRows = found.length;
  const records = found.slice(0, maxRows);
  const order = [];
  const seen = new Set();
  const flats = records.map((rec) => {
    const flat =
      isPlainObject(rec) && !Array.isArray(rec) ? flattenRecord(rec) : flattenRecord({ value: rec });
    for (const key of Object.keys(flat)) {
      if (seen.has(key)) continue;
      seen.add(key);
      order.push(key);
    }
    return flat;
  });
  const truncatedCols = order.length > maxCols;
  const columns = order.slice(0, maxCols);
  const rows = flats.map((flat) => {
    const row = {};
    for (const col of columns) {
      row[col] = col in flat ? flat[col] : '';
    }
    return row;
  });
  return {
    columns,
    rows,
    totalRows,
    truncatedRows: totalRows > maxRows,
    truncatedCols,
  };
}

export function projectTable(table, selectedKeys) {
  const want = new Set((selectedKeys || []).filter((key) => table.columns.includes(key)));
  const columns = table.columns.filter((key) => want.has(key));
  return {
    columns,
    rows: table.rows.map((row) => {
      const next = {};
      for (const col of columns) next[col] = row[col];
      return next;
    }),
    totalRows: table.totalRows,
    truncatedRows: table.truncatedRows,
    truncatedCols: table.truncatedCols,
  };
}

export const MAX_VALUE_OPTIONS = 800;

export function valueKey(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function displayValue(value) {
  if (value == null || value === '') return '(blank)';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function isNumericCell(value) {
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Number.isFinite(Number(trimmed));
}

/**
 * Unique values in one column, plus whether they are worth listing as
 * checkboxes (categories) or treating as a numeric series (min / max).
 */
export function summarizeField(table, col) {
  const counts = new Map();
  const samples = new Map();
  let blanks = 0;
  let numeric = 0;
  let min = null;
  let max = null;
  const rows = table?.rows || [];
  for (const row of rows) {
    const value = row?.[col];
    if (value == null || value === '') {
      blanks += 1;
      counts.set('', (counts.get('') || 0) + 1);
      samples.set('', '');
      continue;
    }
    const key = valueKey(value);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!samples.has(key)) samples.set(key, value);
    if (isNumericCell(value)) {
      numeric += 1;
      const n = typeof value === 'number' ? value : Number(value);
      if (min == null || n < min) min = n;
      if (max == null || n > max) max = n;
    }
  }
  const filled = rows.length - blanks;
  const uniqueCount = counts.size;
  const mostlyNumeric = filled > 0 && numeric / filled >= 0.8;
  const highCard = uniqueCount > 60 && uniqueCount / Math.max(1, rows.length) > 0.45;
  const asOptions = uniqueCount <= MAX_VALUE_OPTIONS && !(mostlyNumeric && highCard);
  const options = [...counts.entries()]
    .map(([key, count]) => ({
      key,
      value: samples.get(key),
      count,
      label: displayValue(samples.get(key)),
    }))
    .sort((a, b) => {
      if (a.key === '' && b.key !== '') return 1;
      if (b.key === '' && a.key !== '') return -1;
      return b.count - a.count || a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  return {
    uniqueCount,
    blanks,
    filled,
    mostlyNumeric,
    asOptions,
    min,
    max,
    options,
    examples: options.filter((opt) => opt.key !== '').slice(0, 3).map((opt) => opt.label),
  };
}

export function summarizeFields(table) {
  const out = {};
  for (const col of table?.columns || []) out[col] = summarizeField(table, col);
  return out;
}

/**
 * Keep rows whose value in each filtered column is in that column's allowed set.
 * A missing / non-Set entry means "all values".
 */
export function filterTable(table, allowedByCol) {
  const checks = Object.entries(allowedByCol || {}).filter(([, allowed]) => allowed instanceof Set);
  if (!checks.length) return table;
  const rows = (table.rows || []).filter((row) =>
    checks.every(([col, allowed]) => allowed.has(valueKey(row[col])))
  );
  return { ...table, rows };
}

export function parseFetchUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { error: 'Paste an https URL.' };
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: 'That is not a URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Only http(s) URLs.' };
  }
  return { url: url.toString() };
}
