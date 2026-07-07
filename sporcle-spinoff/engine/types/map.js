// Map (click). Click regions on an amCharts 5 map to find the one currently
// asked for. amCharts + geodata load lazily from the official CDN via
// ../map-loader.js. items: [{ regionId }, ...] — regionId must match a
// feature "id" in the selected geodata (ISO-2 country code for world maps,
// "US-XX" for US states). quiz.region names the geodata map ("worldLow",
// "usaLow", "franceLow", …; bare names like "world" get "Low" appended).
import { loadAmChartsCore, loadGeodata } from '../map-loader.js';

let currentRoot5 = null;

export default {
  async render(root, quiz, engine) {
    const items = quiz.shuffle ? shuffle(quiz.items.slice()) : quiz.items.slice();
    let cur = 0;
    let ended = false;

    root.innerHTML = `
      <div class="q-map-target" id="q-map-target">Loading map…</div>
      <div class="q-map-wrap"><div id="q-map-chart" style="width:100%;height:420px"></div></div>`;
    const targetEl = root.querySelector('#q-map-target');
    const chartDiv = root.querySelector('#q-map-chart');

    let geoJSON;
    try {
      await loadAmChartsCore();
      geoJSON = await loadGeodata(quiz.region);
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
      // Use custom prompt if provided (e.g., for city->state quizzes), otherwise show region name
      if (items[cur].prompt) {
        targetEl.textContent = items[cur].prompt;
      } else {
        targetEl.textContent = `Click: ${nameById.get(items[cur].regionId) || items[cur].regionId}`;
      }
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

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
