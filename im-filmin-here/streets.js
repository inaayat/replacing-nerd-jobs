// Street naming and geometry for I'm Filmin Here.
//
// Film permits describe a location as prose ("WEST   48 STREET between 6 AVENUE
// and 7 AVENUE") and carry no coordinates. The Street Centerline dataset has the
// geometry but exposes no cross-street columns, so the two sides are joined on a
// normalized street name plus the intersections computed from the geometry
// itself. This module owns both halves of that: the normalizer (used by the
// build script on centerline names and by the browser on permit names — the same
// function on both sides, or the join silently rots) and the runtime index that
// turns a street plus two cross streets into a drawable block face.
//
// Dependency-free ESM. No `node:` imports: the build script and the browser both
// load this file.

export const STREETS_SCHEMA = 1;

// Centerline abbreviates and permits spell out. Applied token by token to both
// sides, so the target spelling only has to be self-consistent.
const TOKENS = {
  STREET: 'ST',
  STR: 'ST',
  AVENUE: 'AVE',
  AV: 'AVE',
  DRIVE: 'DR',
  PLACE: 'PL',
  BOULEVARD: 'BLVD',
  BOULEVARDE: 'BLVD',
  PARKWAY: 'PKWY',
  PKWAY: 'PKWY',
  ROAD: 'RD',
  TERRACE: 'TER',
  SQUARE: 'SQ',
  COURT: 'CT',
  LANE: 'LN',
  ALLEY: 'ALY',
  PLAZA: 'PLZ',
  BRIDGE: 'BRG',
  HIGHWAY: 'HWY',
  EXPRESSWAY: 'EXPY',
  CIRCLE: 'CIR',
  WEST: 'W',
  EAST: 'E',
  NORTH: 'N',
  SOUTH: 'S',
  JUNIOR: 'JR',
  SAINT: 'ST',
};

const ORDINAL_WORDS = {
  FIRST: '1',
  SECOND: '2',
  THIRD: '3',
  FOURTH: '4',
  FIFTH: '5',
  SIXTH: '6',
  SEVENTH: '7',
  EIGHTH: '8',
  NINTH: '9',
  TENTH: '10',
  ELEVENTH: '11',
  TWELFTH: '12',
};

// A cross street can resolve under more than one name: the honorific renamings
// in Harlem, the two names Sixth Avenue answers to, permit-side typos, and the
// stretches where a numbered street is signed as something else. These are
// alternates tried after the primary name, never replacements — West 59th Street
// really exists west of Columbus Circle, and Central Park South really is its
// name to the east.
const ALIASES = {
  '6 AVE': ['AVE OF THE AMERICAS'],
  'AVE OF THE AMERICAS': ['6 AVE'],
  '7 AVE': ['ADAM CLAYTON POWELL JR BLVD', 'FASHION AVE'],
  'ADAM CLAYTON POWELL JR BLVD': ['7 AVE'],
  'ADAM CLAYTON POWELL BLVD': ['ADAM CLAYTON POWELL JR BLVD', '7 AVE'],
  'ACP JR BLVD': ['ADAM CLAYTON POWELL JR BLVD', '7 AVE'],
  '8 AVE': ['FREDERICK DOUGLASS BLVD', 'CENTRAL PARK W'],
  'FREDERICK DOUGLASS BLVD': ['8 AVE'],
  'FREDRICK DOUGLAS BLVD': ['FREDERICK DOUGLASS BLVD', '8 AVE'],
  'FREDERICK DOUGLAS BLVD': ['FREDERICK DOUGLASS BLVD', '8 AVE'],
  'LENOX AVE': ['MALCOLM X BLVD', '6 AVE'],
  'MALCOLM X BLVD': ['LENOX AVE'],
  'CENTRAL PARK W': ['8 AVE'],
  'CENTRAL PARK S': ['W 59 ST'],
  'W 59 ST': ['CENTRAL PARK S'],
  'CENTRAL PARK N': ['W 110 ST', 'CATHEDRAL PKWY'],
  'W 110 ST': ['CATHEDRAL PKWY', 'CENTRAL PARK N'],
  'CATHEDRAL PKWY': ['W 110 ST'],
  'W 125 ST': ['DR MARTIN LUTHER KING JR BLVD'],
  'DR MARTIN LUTHER KING JR BLVD': ['W 125 ST'],
  'MACDOUGAL ST': ['MAC DOUGAL ST'],
  'MACDOUGAL ALY': ['MAC DOUGAL ALY'],
  'LAGUARDIA PL': ['LA GUARDIA PL'],
  'BLEEKER ST': ['BLEECKER ST'],
  'COENTIES SLIP': ['COENTIES ALY', 'COENTIES SLP'],
  'EDWARD MORGAN PL': ['EDWARD M MORGAN PL'],
  'W WASHINGTON PL': ['WASHINGTON PL'],
  'FDR DR': ['FDR DR VIADUCT'],
  'AVE OF THE FINEST': ['POLICE PLZ'],
  'ML KING JR BLVD': ['DR MARTIN LUTHER KING JR BLVD', 'W 125 ST'],
};

// Cross-street slots that name no street at all. Treated as "unknown end",
// which downgrades a block face to a single intersection rather than dropping it.
const NON_STREETS = new Set([
  'DEAD END',
  'DEADEND',
  'END OF ST',
  'END',
  'CUL DE SAC',
  'NA',
  'N/A',
]);

/** Canonical form of a street name, for both centerline and permit sides. */
export function normalizeStreetName(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1');
  const out = [];
  for (const token of s.split(' ')) {
    if (!token) continue;
    const ordinal = ORDINAL_WORDS[token];
    // Only an ordinal word directly before a street type is a number: "FIFTH
    // AVENUE" is 5 AVE, but "SECOND PL" as a proper name would be too, and
    // that is the lesser evil versus mangling names like SEVENTH REGIMENT.
    out.push(ordinal !== undefined ? ordinal : TOKENS[token] || token);
  }
  return out.join(' ');
}

export function isNonStreet(name) {
  return NON_STREETS.has(normalizeStreetName(name));
}

/** Primary name first, then the alternates worth trying. */
export function streetCandidates(raw) {
  const name = normalizeStreetName(raw);
  if (!name) return [];
  return [name, ...(ALIASES[name] || [])];
}

const M_PER_DEG_LAT = 111320;

/** Planar metre length of a lng/lat path. Fine at one borough's scale. */
export function pathLength(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const lat = (coords[i][1] + coords[i + 1][1]) / 2;
    const dx = (coords[i + 1][0] - coords[i][0]) * Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LAT;
    const dy = (coords[i + 1][1] - coords[i][1]) * M_PER_DEG_LAT;
    total += Math.hypot(dx, dy);
  }
  return total;
}

/** The point half-way along a path by distance, not by vertex count. */
export function pathMidpoint(coords) {
  if (!coords?.length) return null;
  if (coords.length === 1) return coords[0].slice();
  const half = pathLength(coords) / 2;
  let walked = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const step = pathLength([coords[i], coords[i + 1]]);
    if (walked + step >= half) {
      const frac = step ? (half - walked) / step : 0;
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * frac,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * frac,
      ];
    }
    walked += step;
  }
  return coords[coords.length - 1].slice();
}

function interpolate(coords, at) {
  const last = coords.length - 1;
  if (at <= 0) return coords[0].slice();
  if (at >= last) return coords[last].slice();
  const i = Math.floor(at);
  const frac = at - i;
  const [x1, y1] = coords[i];
  const [x2, y2] = coords[i + 1];
  return [x1 + (x2 - x1) * frac, y1 + (y2 - y1) * frac];
}

/**
 * The stretch of `coords` between two fractional vertex positions, with the
 * ends interpolated so a block face starts and stops at the intersections
 * rather than at the nearest shape point.
 */
export function slicePart(coords, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const out = [interpolate(coords, lo)];
  for (let i = Math.ceil(lo); i <= Math.floor(hi); i += 1) {
    const pt = coords[i];
    if (!pt) continue;
    const prev = out[out.length - 1];
    if (prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt.slice());
  }
  const end = interpolate(coords, hi);
  const prev = out[out.length - 1];
  if (prev[0] !== end[0] || prev[1] !== end[1]) out.push(end);
  return out;
}

/**
 * Runtime index over the committed street payload.
 *
 * `resolve` returns a tier alongside the geometry, because how a location was
 * found is part of what it means:
 *   block — both cross streets hit the same run of the street; a real block face
 *   span  — both hit, but on different runs; a straight line between them
 *   point — one cross street hit; the intersection only
 * Anything else returns null and has to be counted as unplaced, not dropped.
 */
export function createStreetIndex(payload) {
  const streets = payload?.streets || [];
  const byName = new Map();
  streets.forEach((street, idx) => byName.set(street.name, idx));

  // key `${aStreetIdx}|${bStreetIdx}` -> [{ part, at }] positions on A
  const xings = new Map();
  const addXing = (a, b, part, at) => {
    const key = `${a}|${b}`;
    const hit = xings.get(key);
    if (hit) hit.push({ part, at });
    else xings.set(key, [{ part, at }]);
  };
  for (const row of payload?.xings || []) {
    const [a, ap, av, b, bp, bv] = row;
    addXing(a, b, ap, av);
    addXing(b, a, bp, bv);
  }

  const partCoords = (streetIdx, partIdx) => streets[streetIdx]?.parts?.[partIdx] || null;

  function crossingsOf(streetIdx, crossName) {
    for (const candidate of streetCandidates(crossName)) {
      const crossIdx = byName.get(candidate);
      if (crossIdx === undefined) continue;
      const hits = xings.get(`${streetIdx}|${crossIdx}`);
      if (hits && hits.length) return { name: candidate, hits };
    }
    return null;
  }

  function resolve(segment) {
    const { street, from, to } = segment || {};
    let streetIdx;
    let streetName = '';
    for (const candidate of streetCandidates(street)) {
      if (byName.has(candidate)) {
        streetIdx = byName.get(candidate);
        streetName = candidate;
        break;
      }
    }
    if (streetIdx === undefined) return null;

    const a = isNonStreet(from) ? null : crossingsOf(streetIdx, from);
    const b = isNonStreet(to) ? null : crossingsOf(streetIdx, to);
    if (!a && !b) return null;

    if (a && b) {
      // Prefer a pair on the same run of the street, and among those the
      // geometrically shortest — a long street can meet the same avenue more
      // than once (Broadway crosses the numbered grid repeatedly), and vertex
      // distance is not a stand-in for ground distance on a chained run.
      let best = null;
      for (const ha of a.hits) {
        for (const hb of b.hits) {
          if (ha.part !== hb.part) continue;
          const coords = partCoords(streetIdx, ha.part);
          if (!coords) continue;
          const slice = slicePart(coords, ha.at, hb.at);
          const length = pathLength(slice);
          if (!best || length < best.length) best = { ha, hb, slice, length };
        }
      }
      if (best) {
        // A run chained through a fork can double back on itself, which would
        // draw a block face as a mile-long detour. When the path is far longer
        // than the straight line between the two intersections, the chain is not
        // trustworthy — say so by dropping to a straight span instead.
        const straight = pathLength([best.slice[0], best.slice[best.slice.length - 1]]);
        const detour = straight > 0 ? best.length / straight : 1;
        if (best.length <= 150 || detour <= 2.5) {
          return {
            tier: 'block',
            street: streetName,
            from: a.name,
            to: b.name,
            coords: best.slice,
          };
        }
        return {
          tier: 'span',
          street: streetName,
          from: a.name,
          to: b.name,
          coords: [best.slice[0], best.slice[best.slice.length - 1]],
        };
      }
      const ha = a.hits[0];
      const hb = b.hits[0];
      const ca = partCoords(streetIdx, ha.part);
      const cb = partCoords(streetIdx, hb.part);
      if (ca && cb) {
        return {
          tier: 'span',
          street: streetName,
          from: a.name,
          to: b.name,
          coords: [interpolate(ca, ha.at), interpolate(cb, hb.at)],
        };
      }
      return null;
    }

    const only = a || b;
    const hit = only.hits[0];
    const coords = partCoords(streetIdx, hit.part);
    if (!coords) return null;
    return {
      tier: 'point',
      street: streetName,
      from: only.name,
      to: null,
      coords: [interpolate(coords, hit.at)],
    };
  }

  return {
    generatedAt: payload?.generatedAt || null,
    schema: payload?.schema ?? null,
    streetCount: streets.length,
    xingCount: (payload?.xings || []).length,
    hasStreet: (name) => streetCandidates(name).some((c) => byName.has(c)),
    resolve,
  };
}
