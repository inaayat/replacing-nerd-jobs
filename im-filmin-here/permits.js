// Film permit query + rollup for I'm Filmin Here.
//
// Source: NYC Open Data "Film Permits" (Socrata dataset tg4x-b46p), queried live
// from the browser. The dataset is CORS-open, so there is no serverless function
// and no committed copy of the permits — what you see is what the city has right
// now, including the rolling window that quietly drops older rows.
//
// The one thing this dataset does not have is a production title. MOME withholds
// them. Nothing here invents one.
//
// Dependency-free ESM. No `node:` imports.

import { normalizeStreetName } from './streets.js';

export const DATASET_ID = 'tg4x-b46p';
export const DATASET_URL = `https://data.cityofnewyork.us/resource/${DATASET_ID}.json`;
export const DATASET_PAGE = `https://data.cityofnewyork.us/City-Government/Film-Permits/${DATASET_ID}`;
export const ROW_LIMIT = 20000;

// Shooting only. Theater load-in/load-out is Broadway trucks, and a rigging
// permit is lighting prep with no camera, so both would pad the map with work
// that is not a shoot.
export const EVENT_TYPES = ['Shooting Permit', 'DCAS Prep/Shoot/Wrap Permit'];

export const CATEGORIES = [
  { id: 'Television', label: 'Television', color: '#cf4520' },
  { id: 'Film', label: 'Film', color: '#3d6ea8' },
  { id: 'Music Video', label: 'Music video', color: '#e3a72e' },
];

// News crews shoot constantly and everywhere; including them buries scripted
// production under daily coverage.
export const EXCLUDED_SUBCATEGORIES = ['News'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function categoryColor(category) {
  return CATEGORIES.find((c) => c.id === category)?.color || '#6b5f5e';
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function orList(field, values) {
  return `(${values.map((v) => `${field}=${quote(v)}`).join(' OR ')})`;
}

/** ISO date (YYYY-MM-DD) as a floating timestamp Socrata will compare. */
function stamp(date, endOfDay) {
  return `${date}T${endOfDay ? '23:59:59' : '00:00:00'}`;
}

/**
 * SoQL for the cut. Date filtering is overlap, not containment: a permit that
 * starts before the window and ends inside it was still shooting during it.
 */
export function buildWhere({ from, to, categories = CATEGORY_IDS } = {}) {
  const cats = categories.length ? categories : CATEGORY_IDS;
  const clauses = [
    "borough='Manhattan'",
    orList('category', cats),
    orList('eventtype', EVENT_TYPES),
    ...EXCLUDED_SUBCATEGORIES.map((s) => `subcategoryname!=${quote(s)}`),
  ];
  if (from) clauses.push(`enddatetime>=${quote(stamp(from, false))}`);
  if (to) clauses.push(`startdatetime<=${quote(stamp(to, true))}`);
  return clauses.join(' AND ');
}

export function buildPermitUrl(options = {}) {
  const params = new URLSearchParams();
  params.set('$select', 'eventid,eventtype,startdatetime,enddatetime,category,subcategoryname,parkingheld,communityboard_s');
  params.set('$where', buildWhere(options));
  params.set('$order', 'startdatetime DESC');
  params.set('$limit', String(options.limit || ROW_LIMIT));
  return `${DATASET_URL}?${params.toString()}`;
}

/** Date range the UI opens on: the trailing `months` up to `today`. */
export function defaultWindow(today = new Date(), months = 12) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

/**
 * `parkingheld` is prose, packs several segments into one comma-separated
 * string, and has irregular internal whitespace ("WEST   48 STREET"). Cross
 * streets are not in geographic order, so nothing may assume from < to.
 */
export function parseParkingHeld(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  return text
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((raw) => {
      const match = /^(.*?) between (.*) and (.*)$/i.exec(raw);
      if (!match) return { raw, street: raw, from: null, to: null, parsed: false };
      return {
        raw,
        street: match[1].trim(),
        from: match[2].trim(),
        to: match[3].trim(),
        parsed: true,
      };
    });
}

/** One record per (permit, segment) mention. */
export function explodePermits(rows) {
  const out = [];
  for (const row of rows || []) {
    for (const segment of parseParkingHeld(row.parkingheld)) {
      out.push({ permit: row, segment });
    }
  }
  return out;
}

function segmentKey(street, from, to) {
  const ends = [normalizeStreetName(from || ''), normalizeStreetName(to || '')].sort();
  return `${normalizeStreetName(street)}|${ends[0]}|${ends[1]}`;
}

function shootDays(row) {
  const start = Date.parse(row.startdatetime);
  const end = Date.parse(row.enddatetime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) || 1);
}

/**
 * Roll mentions up into one feature per block face.
 *
 * Everything that fails to place lands in `unplaced`, grouped by street name and
 * counted, so the page can say how much of the data it is not showing. A map
 * that silently drops a fifth of its input looks exactly like a map that
 * doesn't.
 */
export function buildFeatures(rows, index) {
  const mentions = explodePermits(rows);
  const groups = new Map();
  const unplacedByStreet = new Map();
  const tiers = { block: 0, span: 0, point: 0 };
  let placedMentions = 0;
  let unplacedMentions = 0;
  let unparsed = 0;

  for (const { permit, segment } of mentions) {
    if (!segment.parsed) unparsed += 1;
    const resolved = segment.parsed ? index.resolve(segment) : null;
    if (!resolved) {
      unplacedMentions += 1;
      const name = normalizeStreetName(segment.street) || segment.raw;
      const hit = unplacedByStreet.get(name);
      if (hit) {
        hit.mentions += 1;
        hit.permits.add(permit.eventid);
      } else {
        unplacedByStreet.set(name, { street: name, mentions: 1, permits: new Set([permit.eventid]) });
      }
      continue;
    }
    placedMentions += 1;
    tiers[resolved.tier] += 1;

    const key = segmentKey(resolved.street, resolved.from, resolved.to) + `|${resolved.tier}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        tier: resolved.tier,
        street: resolved.street,
        from: resolved.from,
        to: resolved.to,
        coords: resolved.coords,
        permits: new Map(),
      };
      groups.set(key, group);
    }
    if (!group.permits.has(permit.eventid)) {
      group.permits.set(permit.eventid, {
        eventid: permit.eventid,
        category: permit.category,
        subcategory: permit.subcategoryname,
        eventtype: permit.eventtype,
        start: permit.startdatetime,
        end: permit.enddatetime,
        days: shootDays(permit),
      });
    }
  }

  const lines = [];
  const points = [];
  for (const group of groups.values()) {
    const permits = [...group.permits.values()].sort((a, b) => String(b.start).localeCompare(String(a.start)));
    const counts = {};
    let days = 0;
    for (const p of permits) {
      counts[p.category] = (counts[p.category] || 0) + 1;
      days += p.days;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const feature = {
      type: 'Feature',
      geometry:
        group.tier === 'point'
          ? { type: 'Point', coordinates: group.coords[0] }
          : { type: 'LineString', coordinates: group.coords },
      properties: {
        key: group.key,
        tier: group.tier,
        street: group.street,
        from: group.from,
        to: group.to,
        label: group.to ? `${group.street} between ${group.from} and ${group.to}` : `${group.street} at ${group.from}`,
        permitCount: permits.length,
        shootDays: days,
        topCategory: top ? top[0] : null,
        color: categoryColor(top ? top[0] : null),
        permits,
      },
    };
    (group.tier === 'point' ? points : lines).push(feature);
  }

  const unplaced = [...unplacedByStreet.values()]
    .map((u) => ({ street: u.street, mentions: u.mentions, permits: u.permits.size }))
    .sort((a, b) => b.mentions - a.mentions);

  return {
    lines: { type: 'FeatureCollection', features: lines },
    points: { type: 'FeatureCollection', features: points },
    stats: {
      permits: (rows || []).length,
      mentions: mentions.length,
      placedMentions,
      unplacedMentions,
      unparsed,
      tiers,
      blockFaces: lines.length,
      intersections: points.length,
      unplaced,
      placedShare: mentions.length ? placedMentions / mentions.length : 0,
    },
  };
}

export function formatDateRange(start, end) {
  const fmt = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  const a = fmt(start);
  const b = fmt(end);
  return a === b ? a : `${a} – ${b}`;
}
