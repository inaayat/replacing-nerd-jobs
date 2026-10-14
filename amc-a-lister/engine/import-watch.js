/**
 * Normalize one imported screening (JSON paste or spreadsheet row).
 * Browser + API — keep this file dependency-free.
 */

import { toLocalISO } from './dates.js';

const WATCH_FORMATS = ['', 'IMAX', 'Dolby', 'IMAX 3D', '70MM', 'PRIME', 'VistaVision', 'Q&A'];

export const IMPORT_FIELD_ALIASES = {
  watched_on: ['watched_on', 'date', 'watch_date', 'watch date', 'watched', 'watched on'],
  title: ['title', 'movie', 'movie_title', 'movie title', 'film'],
  location: ['location', 'theater', 'theatre'],
  format: ['format'],
  ticket_cents: ['ticket_cents'],
  ticket_price: ['ticket_price', 'ticket price', 'price', 'cost', 'charge', 'ticket'],
  seat: ['seat'],
  auditorium: ['auditorium', 'audi'],
  companions: ['companions', 'seen_with', 'seen with'],
  rating: ['rating', 'personal_rating', 'personal rating'],
  notes: ['notes', 'note'],
  in_theaters: ['in_theaters', 'in theaters', 'where'],
  at_home: ['at_home', 'at home'],
  saw_alone: ['saw_alone', 'saw alone', 'saw alone?', 'alone'],
  tmdb_id: ['tmdb_id', 'tmdb'],
  dnf: ['dnf'],
};

export const TEMPLATE_HEADERS = [
  'Watch date',
  'Movie title',
  'Theater',
  'Format',
  'Ticket price',
  'Seat',
  'Auditorium',
  'Companions',
  'Rating',
  'Notes',
  'Where',
  'Saw alone',
];

export const FORMAT_CHOICES = WATCH_FORMATS.filter(Boolean);
export const WHERE_IN_THEATERS = 'In theaters';
export const WHERE_AT_HOME = 'At home';

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'x', 'in theaters', 'theater', 'theatre']);
const FALSY = new Set(['false', 'no', 'n', '0', 'at home', 'home']);

function keyFold(name) {
  return String(name || '').toLowerCase().replace(/[_?]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function lookupMap(raw) {
  const map = new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map;
  for (const [key, value] of Object.entries(raw)) {
    const folded = keyFold(key);
    if (!folded || map.has(folded)) continue;
    map.set(folded, value);
  }
  return map;
}

function pick(map, aliases) {
  for (const alias of aliases) {
    const folded = keyFold(alias);
    if (map.has(folded)) return map.get(folded);
  }
  return undefined;
}

export function toIsoDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toLocalISO(value);
  const s = String(value).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, '0');
    const day = mdy[2].padStart(2, '0');
    return `${mdy[3]}-${month}-${day}`;
  }
  return null;
}

function cellText(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Dollars ("$15.99", 15.99) → cents. */
export function parseDollarCents(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

/**
 * `ticket_cents` as an integer stays cents (legacy JSON). Anything with $ or a
 * decimal, and every ticket_price/price/cost/charge field, is dollars.
 */
export function parseTicketCents(raw, { fromCentsField = false } = {}) {
  if (raw == null || raw === '') return null;
  if (fromCentsField) {
    if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
    const s = String(raw).trim();
    if (/^\d+$/.test(s)) return Number(s);
  }
  return parseDollarCents(raw);
}

export function parseCompanions(raw) {
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw)
    ? raw.flatMap((item) => String(item || '').split(/[,;]+/))
    : String(raw).split(/[,;]+/);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const username = String(part || '').trim().toLowerCase();
    if (!username || seen.has(username)) continue;
    if (username.length < 3 || username.length > 24) continue;
    if (!/^[a-z0-9_]+$/.test(username)) continue;
    seen.add(username);
    out.push(username);
    if (out.length >= 12) break;
  }
  return out;
}

export function parseInTheaters(raw, atHomeRaw) {
  if (atHomeRaw != null && atHomeRaw !== '') {
    const home = String(atHomeRaw).trim().toLowerCase();
    if (TRUTHY.has(home)) return false;
    if (FALSY.has(home)) return true;
  }
  if (raw == null || raw === '') return true;
  if (raw === true) return true;
  if (raw === false) return false;
  const s = String(raw).trim().toLowerCase();
  if (FALSY.has(s) || s === 'at home') return false;
  if (TRUTHY.has(s) || s === 'in theaters') return true;
  return true;
}

function parseSawAlone(raw) {
  if (raw == null || raw === '') return false;
  if (raw === true) return true;
  const s = String(raw).trim().toLowerCase();
  return TRUTHY.has(s);
}

function parseRatingValue(raw) {
  if (raw == null || raw === '') return { rating: null, dnf: false };
  const s = String(raw).trim();
  if (s.toUpperCase() === 'DNF') return { rating: null, dnf: true };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || n > 5) return { rating: null, dnf: false };
  const stepped = Math.round(n * 2) / 2;
  return { rating: stepped, dnf: false };
}

function normalizeFormat(raw) {
  const s = String(raw || '').trim();
  if (!s || /^standard$/i.test(s)) return '';
  const match = FORMAT_CHOICES.find((f) => f.toLowerCase() === s.toLowerCase());
  return match || s.slice(0, 40);
}

/**
 * Map a typed theater to an existing location string when the match is unique.
 * Theaters are names on watch rows — there is no separate theater table.
 */
export function matchTheaterName(name, knownTheaters = []) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const needle = raw.toLowerCase().replace(/\s+/g, ' ');
  const known = (knownTheaters || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (!known.length) return raw;

  const exact = known.find((n) => n.toLowerCase() === needle);
  if (exact) return exact;

  const stripAmc = (n) => n.toLowerCase().replace(/^amc\s+/, '').replace(/\s+/g, ' ');
  const exactBare = known.find((n) => stripAmc(n) === stripAmc(raw));
  if (exactBare) return exactBare;

  const contains = known.filter((n) => {
    const hay = n.toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });
  if (contains.length === 1) return contains[0];
  return raw;
}

/**
 * @returns {null | {
 *   watched_on: string, title: string, location: string|null, format: string,
 *   saw_alone: boolean, auditorium: string|null, seat: string|null,
 *   ticket_cents: number|null, rating: number|null, dnf: boolean,
 *   notes: string|null, tmdb_id: number|null, in_theaters: boolean,
 *   companions: string[]
 * }}
 */
export function normalizeImportWatch(raw, { knownTheaters = [] } = {}) {
  const map = lookupMap(raw);
  const watched_on = toIsoDate(pick(map, IMPORT_FIELD_ALIASES.watched_on));
  const title = String(pick(map, IMPORT_FIELD_ALIASES.title) || '').trim();
  if (!watched_on || !title) return null;

  const centsField = pick(map, IMPORT_FIELD_ALIASES.ticket_cents);
  const priceField = pick(map, IMPORT_FIELD_ALIASES.ticket_price);
  const ticket_cents = centsField != null && centsField !== ''
    ? parseTicketCents(centsField, { fromCentsField: true })
    : parseTicketCents(priceField);

  const ratingField = pick(map, IMPORT_FIELD_ALIASES.rating);
  const dnfFlag = pick(map, IMPORT_FIELD_ALIASES.dnf);
  const parsedRating = parseRatingValue(ratingField);
  const dnf = dnfFlag === true || String(dnfFlag || '').toUpperCase() === 'DNF' || parsedRating.dnf;

  const companions = parseCompanions(pick(map, IMPORT_FIELD_ALIASES.companions));
  const in_theaters = parseInTheaters(
    pick(map, IMPORT_FIELD_ALIASES.in_theaters),
    pick(map, IMPORT_FIELD_ALIASES.at_home),
  );

  let location = cellText(pick(map, IMPORT_FIELD_ALIASES.location));
  if (location) location = matchTheaterName(location, knownTheaters);

  const tmdbRaw = pick(map, IMPORT_FIELD_ALIASES.tmdb_id);
  const tmdb_id = tmdbRaw != null && tmdbRaw !== '' ? Number(tmdbRaw) : null;

  return {
    watched_on,
    title,
    location: in_theaters === false ? (location || null) : (location || null),
    format: in_theaters === false ? '' : normalizeFormat(pick(map, IMPORT_FIELD_ALIASES.format)),
    saw_alone: companions.length ? false : parseSawAlone(pick(map, IMPORT_FIELD_ALIASES.saw_alone)),
    auditorium: in_theaters === false ? null : cellText(pick(map, IMPORT_FIELD_ALIASES.auditorium)),
    seat: in_theaters === false ? null : cellText(pick(map, IMPORT_FIELD_ALIASES.seat)),
    ticket_cents: in_theaters === false ? null : ticket_cents,
    rating: dnf ? null : parsedRating.rating,
    dnf,
    notes: cellText(pick(map, IMPORT_FIELD_ALIASES.notes)),
    tmdb_id: Number.isInteger(tmdb_id) && tmdb_id > 0 ? tmdb_id : null,
    in_theaters,
    companions: in_theaters === false ? [] : companions,
  };
}

function headerIndex(headerRow) {
  const index = {};
  (headerRow || []).forEach((raw, i) => {
    const folded = keyFold(raw);
    if (!folded) return;
    for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
      if (index[field] != null) continue;
      if (aliases.some((alias) => keyFold(alias) === folded)) index[field] = i;
    }
  });
  return index;
}

function rowObject(row, index) {
  const obj = {};
  for (const [field, i] of Object.entries(index)) {
    obj[field] = row[i];
  }
  return obj;
}

/** Turn a header + data table (SheetJS header:1, or our template) into watches. */
export function watchesFromTable(rows, { knownTheaters = [] } = {}) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('The sheet is empty.');
  }
  const index = headerIndex(rows[0]);
  if (index.watched_on == null || index.title == null) {
    throw new Error('Could not find Watch date and Movie title columns.');
  }
  const watches = [];
  for (const row of rows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const watch = normalizeImportWatch(rowObject(row, index), { knownTheaters });
    if (watch) watches.push(watch);
  }
  if (!watches.length) throw new Error('No movie rows found.');
  return watches;
}

export function ticketDollars(cents) {
  if (cents == null || cents === '') return '';
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

export function watchToTemplateRow(watch) {
  const inTheaters = watch?.in_theaters !== false;
  const companions = Array.isArray(watch?.companions)
    ? watch.companions.map((c) => (typeof c === 'string' ? c : c?.username)).filter(Boolean).join(', ')
    : (watch?.seen_with || '');
  return [
    String(watch?.watched_on || '').slice(0, 10),
    watch?.title || '',
    inTheaters ? (watch?.location || '') : '',
    watch?.format || (inTheaters ? 'Standard' : ''),
    inTheaters ? ticketDollars(watch?.ticket_cents) : '',
    inTheaters ? (watch?.seat || '') : '',
    inTheaters ? (watch?.auditorium || '') : '',
    inTheaters ? companions : '',
    watch?.dnf ? 'DNF' : (watch?.rating ?? ''),
    watch?.notes || '',
    inTheaters ? WHERE_IN_THEATERS : WHERE_AT_HOME,
    inTheaters && watch?.saw_alone ? 'Yes' : (inTheaters ? 'No' : ''),
  ];
}

export const EXAMPLE_TEMPLATE_ROWS = [
  {
    watched_on: '2018-06-15',
    title: 'Dune: Part Two',
    location: 'AMC Lincoln Square 13',
    format: 'IMAX',
    ticket_cents: 1999,
    seat: 'G12',
    auditorium: '12',
    companions: [{ username: 'alice' }],
    rating: 4.5,
    dnf: false,
    notes: 'Opening night',
    in_theaters: true,
    saw_alone: false,
  },
  {
    watched_on: '2018-06-16',
    title: 'Past Lives',
    location: null,
    format: '',
    ticket_cents: null,
    seat: null,
    auditorium: null,
    companions: [],
    rating: 5,
    dnf: false,
    notes: 'On the sofa',
    in_theaters: false,
    saw_alone: false,
  },
];

/** Friendly JSON paste example (dollar strings + theater alias). */
export const EXAMPLE_IMPORT_JSON = `[
  {
    "watched_on": "2025-01-15",
    "title": "Dune: Part Two",
    "theater": "AMC Lincoln Square 13",
    "format": "IMAX",
    "ticket_price": "$19.99",
    "seat": "G12",
    "companions": "alice",
    "rating": 4.5,
    "notes": "Opening night",
    "in_theaters": true
  }
]`;
