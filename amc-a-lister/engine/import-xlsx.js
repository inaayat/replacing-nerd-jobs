/** Parse A-List Tracking.xlsx (Movies sheet) into import JSON. */

import { toLocalISO } from './dates.js';

// SheetJS moved off npm after 0.18.5; that last npm build (which esm.sh served)
// predates the prototype-pollution and ReDoS fixes. Pull a current release from
// the vendor's own CDN instead.
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

/**
 * Columns are matched by header name, not position. The previous version read
 * fixed indices (row[0], row[3], …) and blindly dropped row 1, so a re-ordered
 * or re-labelled sheet imported values into the wrong fields with no error.
 */
const COLUMNS = {
  watched_on: ['date', 'watched', 'watched on'],
  title: ['movie', 'title', 'film'],
  location: ['location', 'theater', 'theatre'],
  format: ['format'],
  saw_alone: ['saw alone?', 'saw alone', 'alone'],
  auditorium: ['auditorium', 'audi'],
  seat: ['seat'],
  ticket_cents: ['charge', 'ticket', 'price'],
  rating: ['personal rating', 'rating'],
};

export async function parseXlsxFile(file) {
  const XLSX = await import(/* @vite-ignore */ SHEETJS_URL);
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const ws = wb.Sheets.Movies;
  if (!ws) {
    throw new Error(`No "Movies" sheet found. Sheets in this file: ${wb.SheetNames.join(', ') || 'none'}.`);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) throw new Error('The Movies sheet is empty.');

  const index = headerIndex(rows[0]);
  for (const required of ['watched_on', 'title']) {
    if (index[required] == null) {
      throw new Error(`Could not find a "${required === 'watched_on' ? 'Date' : 'Movie'}" column in the Movies sheet header.`);
    }
  }

  const cell = (row, key) => (index[key] != null ? row[index[key]] : '');
  const watches = [];

  for (const row of rows.slice(1)) {
    const watched_on = toIsoDate(cell(row, 'watched_on'));
    const title = String(cell(row, 'title') || '').trim();
    if (!watched_on || !title) continue;

    const ratingRaw = cell(row, 'rating');
    const dnf = String(ratingRaw).trim().toUpperCase() === 'DNF';

    watches.push({
      watched_on,
      title,
      location: String(cell(row, 'location') || '').trim() || null,
      format: String(cell(row, 'format') || '').trim(),
      saw_alone: String(cell(row, 'saw_alone') || '').trim().toUpperCase() === 'X',
      auditorium: cellText(cell(row, 'auditorium')),
      seat: cellText(cell(row, 'seat')),
      ticket_cents: moneyCents(cell(row, 'ticket_cents')),
      rating: dnf ? null : (Number(ratingRaw) || null),
      dnf,
    });
  }

  if (!watches.length) throw new Error('No movie rows found.');
  return watches;
}

function headerIndex(headerRow) {
  const index = {};
  headerRow.forEach((raw, i) => {
    const label = String(raw || '').trim().toLowerCase();
    if (!label) return;
    for (const [key, aliases] of Object.entries(COLUMNS)) {
      if (index[key] == null && aliases.includes(label)) index[key] = i;
    }
  });
  return index;
}

function toIsoDate(value) {
  if (!value) return null;
  // cellDates gives local-time Dates; toISOString() would shift them back a day
  // for anyone west of UTC.
  if (value instanceof Date) return toLocalISO(value);
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function cellText(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function moneyCents(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : Math.round(n * 100);
}
