/** Parse an A-Lister import template (Watches sheet) or a legacy Movies sheet. */

import { watchesFromTable } from './import-watch.js';

// SheetJS moved off npm after 0.18.5; that last npm build (which esm.sh served)
// predates the prototype-pollution and ReDoS fixes. Pull a current release from
// the vendor's own CDN instead.
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

export async function parseXlsxFile(file, { knownTheaters = [] } = {}) {
  const XLSX = await import(/* @vite-ignore */ SHEETJS_URL);
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const ws = pickSheet(wb);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return watchesFromTable(rows, { knownTheaters });
}

function pickSheet(wb) {
  const names = wb.SheetNames || [];
  if (!names.length) {
    throw new Error('No sheets found in this file.');
  }
  const folded = names.map((n) => String(n || '').trim().toLowerCase());
  const watches = names[folded.indexOf('watches')];
  if (watches) return wb.Sheets[watches];
  const movies = names[folded.indexOf('movies')];
  if (movies) return wb.Sheets[movies];
  const dataName = names.find((n) => String(n || '').trim().toLowerCase() !== 'instructions');
  if (dataName && wb.Sheets[dataName]) return wb.Sheets[dataName];
  throw new Error(`No Watches sheet found. Sheets in this file: ${names.join(', ')}.`);
}
