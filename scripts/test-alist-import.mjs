/**
 * A-Lister watch-log import: JSON aliases, template xlsx, round-trip, legacy headers.
 * Run: node scripts/test-alist-import.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeImportWatch,
  watchesFromTable,
  matchTheaterName,
  parseTicketCents,
  parseCompanions,
  parseInTheaters,
  watchToTemplateRow,
  TEMPLATE_HEADERS,
  EXAMPLE_TEMPLATE_ROWS,
  EXAMPLE_IMPORT_JSON,
} from '../amc-a-lister/engine/import-watch.js';
import { buildImportTemplate, IMPORT_TEMPLATE_FILENAME } from '../amc-a-lister/engine/import-template.js';

function unzipStored(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(buf.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    assert.equal(method, 0, `${name} must be STORED`);
    files.set(name, new TextDecoder().decode(buf.subarray(start, start + compSize)));
    offset = start + compSize;
  }
  return files;
}

// --- already-supported JSON keys (legacy paste) ---
const legacy = normalizeImportWatch({
  watched_on: '2025-01-15',
  title: 'Dune: Part Two',
  ticket_cents: 2495,
});
assert.equal(legacy.watched_on, '2025-01-15');
assert.equal(legacy.title, 'Dune: Part Two');
assert.equal(legacy.ticket_cents, 2495, 'integer ticket_cents stays cents');
assert.equal(legacy.in_theaters, true);
assert.equal(legacy.location, null);

const movieAlias = normalizeImportWatch({ date: '2025-01-15', movie: 'Dune: Part Two', charge: '24.95' });
assert.equal(movieAlias.ticket_cents, 2495, 'charge still parses as dollars');

// --- newly accepted aliases ---
const flexible = normalizeImportWatch({
  watch_date: '2025-01-15',
  film: 'Dune: Part Two',
  theatre: 'Lincoln Square',
  format: 'IMAX',
  ticket_price: '$19.99',
  seat: 'G12',
  companions: 'alice, bob_1',
  rating: 4.5,
  notes: 'Opening night',
  in_theaters: true,
});
assert.equal(flexible.location, 'Lincoln Square');
assert.equal(flexible.format, 'IMAX');
assert.equal(flexible.ticket_cents, 1999, '$19.99 is dollars');
assert.equal(flexible.seat, 'G12');
assert.deepEqual(flexible.companions, ['alice', 'bob_1']);
assert.equal(flexible.rating, 4.5);

assert.equal(parseTicketCents('$15.99'), 1599);
assert.equal(parseTicketCents(15.99), 1599);
assert.equal(parseTicketCents('2495', { fromCentsField: true }), 2495);
assert.deepEqual(parseCompanions('Alice, bob_1; x'), ['alice', 'bob_1']);
assert.equal(parseInTheaters('At home'), false);
assert.equal(parseInTheaters('In theaters'), true);
assert.equal(parseInTheaters(undefined, true), false);

const home = normalizeImportWatch({
  watched_on: '2025-02-01',
  title: 'Past Lives',
  where: 'At home',
  ticket_price: 12,
  companions: 'alice',
});
assert.equal(home.in_theaters, false);
assert.equal(home.ticket_cents, null, 'at-home ticket is dropped');
assert.deepEqual(home.companions, []);

assert.equal(
  matchTheaterName('lincoln square', ['AMC Lincoln Square 13', 'AMC Empire 25']),
  'AMC Lincoln Square 13',
);
assert.equal(
  matchTheaterName('AMC Empire 25', ['AMC Empire 25']),
  'AMC Empire 25',
);
assert.equal(
  matchTheaterName('Mystery Theater', ['AMC Lincoln Square 13']),
  'Mystery Theater',
  'unknown names stay as typed',
);

const mapped = normalizeImportWatch(
  { watched_on: '2025-01-15', title: 'X', theater: 'lincoln square' },
  { knownTheaters: ['AMC Lincoln Square 13'] },
);
assert.equal(mapped.location, 'AMC Lincoln Square 13');

// --- template table round-trip ---
const exported = [watchToTemplateRow(EXAMPLE_TEMPLATE_ROWS[0]), watchToTemplateRow(EXAMPLE_TEMPLATE_ROWS[1])];
const roundTrip = watchesFromTable([TEMPLATE_HEADERS, ...exported]);
assert.equal(roundTrip.length, 2);
assert.equal(roundTrip[0].title, 'Dune: Part Two');
assert.equal(roundTrip[0].ticket_cents, 1999);
assert.equal(roundTrip[0].format, 'IMAX');
assert.deepEqual(roundTrip[0].companions, ['alice']);
assert.equal(roundTrip[0].in_theaters, true);
assert.equal(roundTrip[1].in_theaters, false);
assert.equal(roundTrip[1].title, 'Past Lives');

const sameKey = (a, b) => (
  `${a.watched_on}|${a.title.toLowerCase()}|${(a.location || '').toLowerCase()}`
  === `${b.watched_on}|${b.title.toLowerCase()}|${(b.location || '').toLowerCase()}`
);
assert.ok(sameKey(roundTrip[0], EXAMPLE_TEMPLATE_ROWS[0]), 'round-trip keeps date+title+theater');

// --- legacy A-List Tracking.xlsx headers still parse ---
const legacyTable = watchesFromTable([
  ['Date', 'Movie', 'Location', 'Format', 'Saw Alone?', 'Auditorium', 'Seat', 'Charge', 'Personal Rating'],
  ['2024-03-01', 'Dune', 'AMC Empire 25', 'Dolby', 'X', '4', 'H8', 18.5, 4],
]);
assert.equal(legacyTable[0].watched_on, '2024-03-01');
assert.equal(legacyTable[0].title, 'Dune');
assert.equal(legacyTable[0].location, 'AMC Empire 25');
assert.equal(legacyTable[0].format, 'Dolby');
assert.equal(legacyTable[0].saw_alone, true);
assert.equal(legacyTable[0].auditorium, '4');
assert.equal(legacyTable[0].seat, 'H8');
assert.equal(legacyTable[0].ticket_cents, 1850);
assert.equal(legacyTable[0].rating, 4);

const example = JSON.parse(EXAMPLE_IMPORT_JSON);
assert.ok(Array.isArray(example) && example[0].theater && example[0].ticket_price);
const fromExample = normalizeImportWatch(example[0]);
assert.equal(fromExample.location, 'AMC Lincoln Square 13');
assert.equal(fromExample.ticket_cents, 1999);

// --- xlsx bytes ---
const bytes = buildImportTemplate();
assert.ok(bytes instanceof Uint8Array);
assert.equal(bytes[0], 0x50);
const zip = unzipStored(bytes);
assert.ok(zip.get('xl/workbook.xml').includes('Instructions'));
assert.ok(zip.get('xl/workbook.xml').includes('Watches'));
assert.doesNotMatch(zip.get('xl/workbook.xml'), /JSON/, 'template has no JSON tab');
const watchesXml = zip.get('xl/worksheets/sheet2.xml');
for (const header of TEMPLATE_HEADERS) {
  assert.match(watchesXml, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(watchesXml, /Dune: Part Two/);
assert.match(watchesXml, /<dataValidations/);
assert.match(watchesXml, /In theaters/);
assert.match(zip.get('xl/worksheets/sheet1.xml'), /YYYY-MM-DD/);
assert.match(zip.get('xl/worksheets/sheet1.xml'), /sample rows/);

const exportedBytes = buildImportTemplate([]);
const exportedZip = unzipStored(exportedBytes);
assert.doesNotMatch(exportedZip.get('xl/worksheets/sheet2.xml'), /Dune: Part Two/, 'empty export has no sample rows');
assert.equal(IMPORT_TEMPLATE_FILENAME, 'a-lister-watch-log.xlsx');

const settings = readFileSync(new URL('../amc-a-lister/engine/settings.js', import.meta.url), 'utf8');
assert.match(settings, /Download import template/);
assert.match(settings, /Upload filled template/);
assert.match(settings, /Export my watch log/);
assert.match(settings, /Import JSON/);
assert.doesNotMatch(settings, /A-List Tracking/);
assert.doesNotMatch(settings, /Upload spreadsheet/);
assert.match(settings, /id="template-download-btn"/);
assert.match(settings, /id="export-log-btn"/);
assert.match(settings, /EXAMPLE_IMPORT_JSON/);

const api = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
assert.match(api, /normalizeImportWatch/, 'import API uses the shared normalizer');
assert.match(api, /in_theaters/, 'import writes in_theaters');
assert.match(api, /applySeenWith/, 'import can tag companions');

const howTo = readFileSync(new URL('../amc-a-lister/engine/how-to-use.js', import.meta.url), 'utf8');
assert.match(howTo, /Download import template/);
assert.match(howTo, /ticket_price/);
assert.doesNotMatch(howTo, /A-List Tracking/);

console.log('alist import tests passed');
