// Shared amCharts 5 loading for map quiz types and the builder's map
// editors. Everything loads from amCharts' official CDN on demand via
// injected <script> tags (the library ships as browser globals, not ES
// modules), so no map code is paid for unless a map actually renders.
export const AMCHARTS_CDN = 'https://cdn.amcharts.com/lib/5';

let corePromise = null;
const geodataPromises = new Map();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function loadAmChartsCore() {
  if (!corePromise) {
    corePromise = (async () => {
      await loadScript(`${AMCHARTS_CDN}/index.js`);
      await loadScript(`${AMCHARTS_CDN}/map.js`);
      await loadScript(`${AMCHARTS_CDN}/themes/Animated.js`);
    })();
  }
  return corePromise;
}

// Older quizzes stored region as "world"/"usa"; geodata files are named
// with an explicit detail suffix (worldLow, usaLow, franceHigh, …).
export function resolveRegionStem(region) {
  const r = region || 'world';
  return /(?:Low|High|Ultra)$/.test(r) ? r : `${r}Low`;
}

// Resolves to the parsed GeoJSON object the geodata file registers on window.
export async function loadGeodata(region) {
  const stem = resolveRegionStem(region);
  if (!geodataPromises.has(stem)) {
    geodataPromises.set(stem, (async () => {
      await loadScript(`${AMCHARTS_CDN}/geodata/${stem}.js`);
      const geoJSON = window[`am5geodata_${stem}`];
      if (!geoJSON) throw new Error(`geodata "${stem}" loaded but global not found`);
      return geoJSON;
    })());
  }
  return geodataPromises.get(stem);
}
