// MapLibre layer definitions for the permit map.
//
// These live in their own module because a bad paint expression does not throw:
// MapLibre validates a layer, fires an error event, and simply does not add it.
// The page then loads, the sidebar fills in, and the map is blank — which is
// exactly what happened when these were inline in app.js. Kept out here they are
// plain data that `scripts/test-im-filmin-here.mjs` can validate without a
// browser.
//
// The rule that broke it: `["zoom"]` may only be the input to the OUTERMOST
// step/interpolate. A property interpolation with zoom interpolations as its
// outputs is invalid, and so is any arithmetic wrapped around a zoom expression.
// The legal shape for "scale with both zoom and a property" is zoom on the
// outside, property on the inside — which is what every expression below does.
//
// Dependency-free ESM. No `node:` imports.

export const LINE_SOURCE = 'permit-lines';
export const DOT_SOURCE = 'permit-dots';

/** Nothing is selected until a key matches; no feature carries this key. */
export const NO_SELECTION = ['==', ['get', 'key'], '__none__'];

export function selectionFilter(key) {
  return ['==', ['get', 'key'], key ?? '__none__'];
}

/** Busier stretches read heavier, at every zoom. */
const byCount = (min, max) => ['interpolate', ['linear'], ['get', 'permitCount'], 1, min, 25, max];

const lineWidth = [
  'interpolate',
  ['linear'],
  ['zoom'],
  11,
  byCount(1.8, 5),
  14,
  byCount(3, 9),
  16,
  byCount(4, 13),
];

const selectedLineWidth = [
  'interpolate',
  ['linear'],
  ['zoom'],
  11,
  byCount(4.8, 8),
  14,
  byCount(6, 12),
  16,
  byCount(7, 16),
];

const dotRadius = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10,
  byCount(1.6, 3.4),
  12,
  byCount(2.2, 4.8),
  14,
  byCount(3.2, 7),
  16,
  byCount(4.6, 10),
];

const selectedDotRadius = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10,
  byCount(4.1, 5.9),
  12,
  byCount(4.7, 7.3),
  14,
  byCount(5.7, 9.5),
  16,
  byCount(7.1, 12.5),
];

/** Layer ids that respond to hover and click, in query order. */
export const INTERACTIVE_LAYERS = ['permits-hit', 'permit-dots'];

/**
 * In paint order. `permits-hit` is a fat invisible line under everything so a
 * hairline block face is still clickable; the dots sit on top because they are
 * the smallest target.
 */
export const PERMIT_LAYERS = [
  {
    id: 'permits-hit',
    type: 'line',
    source: LINE_SOURCE,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 14 },
  },
  {
    id: 'permits',
    type: 'line',
    source: LINE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': lineWidth,
      'line-opacity': 0.82,
    },
  },
  {
    id: 'permits-selected',
    type: 'line',
    source: LINE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    filter: NO_SELECTION,
    paint: { 'line-color': '#1c1c1c', 'line-width': selectedLineWidth, 'line-opacity': 0.95 },
  },
  {
    id: 'permit-dots',
    type: 'circle',
    source: DOT_SOURCE,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': dotRadius,
      'circle-opacity': 0.9,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 15, 1],
      'circle-stroke-color': 'rgba(250,243,227,0.9)',
    },
  },
  {
    id: 'permits-selected-dot',
    type: 'circle',
    source: DOT_SOURCE,
    filter: NO_SELECTION,
    paint: {
      'circle-color': '#1c1c1c',
      'circle-radius': selectedDotRadius,
      'circle-opacity': 0.95,
    },
  },
];

/** Layers whose filter tracks the current selection. */
export const SELECTION_LAYERS = ['permits-selected', 'permits-selected-dot'];
