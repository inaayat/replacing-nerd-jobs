// Map. Click regions on an amCharts 5 map to find the one currently asked
// for. The amCharts vendor bundle (~1MB across index/map/geodata) is loaded
// lazily via <script> tags so quizzes that aren't maps never pay for it.
// items: [{ regionId }, ...] — regionId must match a feature "id" in the
// selected geodata file (ISO-2 country code for "world", "US-XX" for "usa").
// quiz.region: "world" | "usa" (default "world") picks the geodata file.
const VENDOR = './vendor/amcharts5';

let coreLoaded = null;
const geodataLoaded = new Map();
const GEODATA_VAR = { world: 'am5geodata_worldLow', usa: 'am5geodata_usaLow' };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadCore() {
  if (!coreLoaded) {
    coreLoaded = (async () => {
      await loadScript(`${VENDOR}/index.js`);
      await loadScript(`${VENDOR}/map.js`);
      await loadScript(`${VENDOR}/themes/Animated.js`);
    })();
  }
  return coreLoaded;
}

function loadGeodata(region) {
  if (!geodataLoaded.has(region)) {
    geodataLoaded.set(region, loadScript(`${VENDOR}/geodata/${region}Low.js`));
  }
  return geodataLoaded.get(region);
}

let currentRoot5 = null;

export default {
  async render(root, quiz, engine) {
    const region = quiz.region || 'world';
    const items = quiz.items.slice();
    let cur = 0;
    let ended = false;

    root.innerHTML = `
      <div class="q-map-target" id="q-map-target">Loading map…</div>
      <div class="q-map-wrap"><div id="q-map-chart" style="width:100%;height:420px"></div></div>`;
    const targetEl = root.querySelector('#q-map-target');
    const chartDiv = root.querySelector('#q-map-chart');

    let geoJSON;
    try {
      await loadCore();
      await loadGeodata(region);
      geoJSON = window[GEODATA_VAR[region]];
      if (!geoJSON) throw new Error(`missing geodata for region "${region}"`);
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="q-card"><h1>Map failed to load</h1><p class="blurb">Could not load map data.</p></div>';
      return;
    }

    const nameById = new Map(geoJSON.features.map((f) => [f.id, f.properties.name || f.id]));

    if (currentRoot5) { currentRoot5.dispose(); currentRoot5 = null; }
    const root5 = am5.Root.new(chartDiv);
    currentRoot5 = root5;
    root5.setThemes([am5themes_Animated.new(root5)]);
    const chart = root5.container.children.push(am5map.MapChart.new(root5, {
      panX: 'translateX', panY: 'translateY', projection: am5map.geoMercator(),
    }));
    const polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root5, { geoJSON }));
    polygonSeries.mapPolygons.template.setAll({
      interactive: true,
      fill: am5.color(0xcdd3e0), stroke: am5.color(0xffffff), strokeWidth: 0.5,
    });
    polygonSeries.mapPolygons.template.states.create('hover', { fill: am5.color(0xf267a0) });

    function showTarget() {
      targetEl.textContent = `Click: ${nameById.get(items[cur].regionId) || items[cur].regionId}`;
    }
    showTarget();

    polygonSeries.mapPolygons.template.events.on('click', (ev) => {
      if (ended || cur >= items.length) return;
      const target = ev.target;
      const id = target.dataItem && target.dataItem.get('id');
      if (!id) return;
      if (id !== items[cur].regionId) {
        const prevFill = target.get('fill');
        target.set('fill', am5.color(0xdc2626));
        setTimeout(() => target.set('fill', prevFill), 300);
        return;
      }
      target.set('fill', am5.color(0x16a34a));
      target.set('interactive', false);
      cur++;
      if (cur < items.length) showTarget(); else targetEl.textContent = 'All regions found!';
      engine.correct();
    });

    engine.registerReveal(() => {
      ended = true;
      for (let k = cur; k < items.length; k++) {
        const dataItem = polygonSeries.getDataItemById(items[k].regionId);
        const mapPolygon = dataItem && dataItem.get('mapPolygon');
        if (mapPolygon) { mapPolygon.set('fill', am5.color(0xf59e0b)); mapPolygon.set('interactive', false); }
        engine.advance();
      }
      cur = items.length;
      targetEl.textContent = 'Revealed';
    });
  },
};
