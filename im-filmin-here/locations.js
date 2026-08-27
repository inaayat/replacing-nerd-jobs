// Curated Manhattan film & TV locations for I'm Filmin Here (W 59th–W 145th).
//
// This is the default page's catalog: named productions on a small map, not
// the live city permit layer. Browser-safe ESM. No `node:` imports.

export const LOCATIONS_SCHEMA = 1;

export const FORMATS = [
  { id: 'Film', label: 'Film', color: '#3d6ea8' },
  { id: 'TV', label: 'TV', color: '#cf4520' },
];

export const FORMAT_IDS = FORMATS.map((row) => row.id);

export const PRECISION_LABEL = {
  address: 'building',
  landmark: 'landmark',
  intersection: 'intersection',
  neighborhood: 'neighborhood',
  street: 'this street (approximate)',
  corridor: 'neighborhood corridor (approximate)',
};

/** Tight box around today's 59th–145th list. Tests use this so a stray Brooklyn pin fails. */
export const MAP_BOX = {
  west: -74.0,
  east: -73.93,
  south: 40.76,
  north: 40.83,
};

/** @deprecated use MAP_BOX — kept so older tests/imports keep working. */
export const UWS_BOX = MAP_BOX;

const APPROXIMATE = new Set(['street', 'corridor', 'neighborhood']);

export function formatColor(format) {
  return FORMATS.find((row) => row.id === format)?.color || '#6b5f5e';
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLngLat(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

export function inMapBox(lngLat, box = MAP_BOX) {
  if (!isLngLat(lngLat)) return false;
  const [lng, lat] = lngLat;
  return lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north;
}

export const inUwsBox = inMapBox;

export function normalizeShoot(raw, index = 0) {
  const production = String(raw?.production || '').trim();
  const format = FORMAT_IDS.includes(raw?.format) ? raw.format : '';
  const scene = String(raw?.scene || '').trim();
  const source = isHttpUrl(raw?.source) ? raw.source : '';
  if (!production || !format) return null;
  return {
    id: raw?.id || `${slug(production) || 'shoot'}-${index + 1}`,
    production,
    format,
    scene,
    source,
  };
}

export function normalizePlace(raw) {
  const id = slug(raw?.id || raw?.name);
  const name = String(raw?.name || '').trim();
  const lngLat = isLngLat(raw?.lngLat) ? [Number(raw.lngLat[0]), Number(raw.lngLat[1])] : null;
  const shoots = (raw?.shoots || []).map(normalizeShoot).filter(Boolean);
  if (!id || !name || !lngLat || !shoots.length) return null;
  const precision = PRECISION_LABEL[raw?.precision] ? raw.precision : 'landmark';
  return {
    id,
    name,
    address: String(raw?.address || '').trim(),
    band: String(raw?.band || '').trim(),
    precision,
    approximate: APPROXIMATE.has(precision),
    lngLat,
    shoots,
  };
}

export function normalizeCatalog(payload) {
  const places = [];
  const seen = new Set();
  for (const raw of payload?.places || []) {
    const place = normalizePlace(raw);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push(place);
  }
  places.sort((a, b) => a.lngLat[1] - b.lngLat[1] || a.name.localeCompare(b.name));
  return {
    schema: payload?.schema ?? null,
    source: payload?.source || null,
    places,
  };
}

export function placeColor(place) {
  const formats = new Set((place?.shoots || []).map((shoot) => shoot.format));
  if (formats.size === 1) return formatColor([...formats][0]);
  return '#1c1c1c';
}

export function placeProductions(place) {
  return [...new Set((place?.shoots || []).map((shoot) => shoot.production))];
}

export function filterPlaces(places, { formats, query } = {}) {
  const allowed = formats?.size ? formats : null;
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  return (places || []).filter((place) => {
    if (allowed && !place.shoots.some((shoot) => allowed.has(shoot.format))) return false;
    if (!needle) return true;
    const hay = [
      place.name,
      place.address,
      place.band,
      ...place.shoots.map((shoot) => `${shoot.production} ${shoot.scene}`),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

export function statsOf(places) {
  let shoots = 0;
  let films = 0;
  let tv = 0;
  const productions = new Set();
  for (const place of places || []) {
    shoots += place.shoots.length;
    for (const shoot of place.shoots) {
      productions.add(shoot.production);
      if (shoot.format === 'Film') films += 1;
      if (shoot.format === 'TV') tv += 1;
    }
  }
  return {
    places: (places || []).length,
    shoots,
    films,
    tv,
    productions: productions.size,
  };
}

/** [[minLng, minLat], [maxLng, maxLat]] from the pins that should set the camera. */
export function boundsOf(places) {
  // Corridor pins are a neighborhood smear, not a doorway — they stay on the
  // map but do not yank the camera open. A new building or landmark does.
  const pts = (places || []).filter((place) => place.precision !== 'corridor' && isLngLat(place.lngLat));
  const use = pts.length ? pts : (places || []).filter((place) => isLngLat(place.lngLat));
  if (!use.length) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const place of use) {
    const [lng, lat] = place.lngLat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** Expand a lng/lat box so the camera can breathe, then grow if a new pin is outside. */
export function paddedBounds(bounds, pad = 0.0024) {
  if (!bounds) return null;
  const [[west, south], [east, north]] = bounds;
  return [
    [west - pad, south - pad],
    [east + pad, north + pad],
  ];
}

/**
 * MapLibre interaction limits for the locations page.
 *
 * Do not pass a pin-tight `maxBounds`. That box is already the starting camera,
 * so any trackpad zoom-out would show land outside it and MapLibre swallows
 * the gesture. Scroll/trackpad zoom stays on; rotate stays off so a two-finger
 * swipe zooms instead of spinning the map.
 */
export function mapInteractionOptions() {
  return {
    scrollZoom: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    minZoom: 10,
    maxZoom: 18,
  };
}

export function toFeatures(places) {
  return {
    type: 'FeatureCollection',
    features: (places || []).map((place) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: place.lngLat },
      properties: {
        id: place.id,
        name: place.name,
        address: place.address,
        band: place.band,
        precision: place.precision,
        approximate: place.approximate ? 1 : 0,
        color: placeColor(place),
        shootCount: place.shoots.length,
        productions: placeProductions(place).join(' · '),
      },
    })),
  };
}
