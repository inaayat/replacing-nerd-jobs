/**
 * Pure CSV/TSV parsing — no DB or auth dependency, so it can be unit tested
 * (and imported) without pulling in @neondatabase/serverless, matching how
 * engines/ keeps pure logic separate from lib/handlers/'s I/O code.
 */

/**
 * Detects which single character separates columns by counting occurrences
 * (outside quotes) in the header line. Pasting a range out of Excel/Sheets
 * puts tab-separated text on the clipboard, not comma-separated — without
 * this, every column after the first silently vanishes into one compound
 * header key and every row falls back to its placeholder default (this was
 * the reported bug: titles read "Imported row N", hours read 0, dates were
 * blank, because none of the expected field names ever matched).
 */
export function detectDelimiter(headerLine) {
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = countOutsideQuotes(headerLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function countOutsideQuotes(line, char) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === char && !inQuotes) count += 1;
  }
  return count;
}

/** Lowercases and strips spaces/underscores so "Work Hours", "work_hours",
 *  and "WORK HOURS" all match the same lookup key. */
export function normalizeHeaderKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s_]+/g, '');
}

/** Parse simple CSV/TSV (header row + data rows). Delimiter is auto-detected
 *  per parseCsv call from the header line — see detectDelimiter(). */
export function parseCsv(text) {
  const lines = String(text || '')
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const normalizedHeaders = headers.map((h) => normalizeHeaderKey(h));
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (cells[i] || '').trim();
    });
    // Also index by normalized key so lookups don't depend on exact case,
    // spacing, or underscore placement in the pasted header row.
    normalizedHeaders.forEach((h, i) => {
      if (!(h in row)) row[h] = (cells[i] || '').trim();
    });
    return row;
  });
  return { headers, rows };
}

export function splitCsvLine(line, delimiter = ',') {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

/** Built-in import columns (normalized). Anything else can map to a custom field. */
export const BUILTIN_IMPORT_KEYS = new Set([
  'title',
  'name',
  'workhours',
  'hours',
  'reviewhours',
  'dueweek',
  'duedate',
  'phase',
  'uniquekey',
  'key',
]);

export const VALID_FIELD_TYPES = new Set(['text', 'number', 'date', 'select']);

/**
 * Coerce a raw CSV cell to the field's type. Select mismatches are flagged
 * (warning) rather than silently accepted or dropped — the value is still
 * returned so the importer can surface the problem in preview.
 */
export function coerceCustomFieldValue(raw, field) {
  const text = raw == null ? '' : String(raw).trim();
  const label = field?.label || field?.key || 'field';
  const fieldType = VALID_FIELD_TYPES.has(field?.field_type) ? field.field_type : 'text';

  if (!text) {
    if (field?.required) {
      return { value: null, warning: `${label} is required` };
    }
    return { value: null, warning: null };
  }

  if (fieldType === 'number') {
    const n = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(n)) {
      return { value: null, warning: `${label}: "${text}" is not a number` };
    }
    return { value: n, warning: null };
  }

  if (fieldType === 'date') {
    const normalized = normalizeImportDate(text);
    if (!normalized) {
      return { value: null, warning: `${label}: "${text}" is not a date (use YYYY-MM-DD)` };
    }
    return { value: normalized, warning: null };
  }

  if (fieldType === 'select') {
    const options = Array.isArray(field?.options) ? field.options.map(String) : [];
    if (options.length && !options.includes(text)) {
      return {
        value: text,
        warning: `${label}: "${text}" is not in [${options.join(', ')}]`,
      };
    }
    return { value: text, warning: null };
  }

  return { value: text, warning: null };
}

/** Accepts YYYY-MM-DD, YYYY/MM/DD, or a parseable date string → YYYY-MM-DD. */
export function normalizeImportDate(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
  }
  const t = Date.parse(text);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Match CSV headers against a task type's custom fields by key or label
 * (case/spacing-insensitive via normalizeHeaderKey).
 */
export function matchCustomFieldHeaders(headers, fields) {
  const list = Array.isArray(fields) ? fields : [];
  const matched = [];
  const usedFieldIds = new Set();
  const unmatchedHeaders = [];

  for (const header of headers || []) {
    const norm = normalizeHeaderKey(header);
    if (!norm || BUILTIN_IMPORT_KEYS.has(norm)) continue;

    const field = list.find((f) => {
      if (usedFieldIds.has(f.id || f.key)) return false;
      return (
        normalizeHeaderKey(f.key) === norm || normalizeHeaderKey(f.label) === norm
      );
    });

    if (field) {
      usedFieldIds.add(field.id || field.key);
      matched.push({ header, field });
    } else {
      unmatchedHeaders.push(header);
    }
  }

  const recognizedFields = matched.map((m) => m.field);
  return { matched, unmatchedHeaders, recognizedFields };
}

/**
 * Pull custom-field values out of a parsed CSV row for the matched fields.
 * Returns attributes ready to merge into plan_items.attributes, plus warnings.
 */
export function extractCustomAttributes(row, matched) {
  const attributes = {};
  const warnings = [];
  for (const { field } of matched || []) {
    const raw =
      row[normalizeHeaderKey(field.key)] ??
      row[normalizeHeaderKey(field.label)] ??
      '';
    const { value, warning } = coerceCustomFieldValue(raw, field);
    if (warning) warnings.push(warning);
    if (value !== null && value !== undefined && value !== '') {
      attributes[field.key] = value;
    }
  }
  return { attributes, warnings };
}
