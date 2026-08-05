// Map (highlight). One region at a time lights up on the map and the player
// types its name. The accepted answer is the region's own name from the
// geodata, plus any authored aliases. items: [{ regionId, accept?:[...] }].
// quiz.region picks the geodata map, same as the click type.
import { loadAmChartsCore, loadGeodata } from '../map-loader.js';

const HIGHLIGHT = 0xcf4520; // red accent (matches site palette)
const SOLVED = 0x16a34a;    // green
const MISSED = 0xf59e0b;    // orange (skipped / revealed)
const BASE = 0xcdd3e0;

let currentRoot5 = null;

export default {
  async render(root, quiz, engine) {
    const items = quiz.shuffle ? shuffle(quiz.items.slice()) : quiz.items.slice();
    let cur = 0;
    let ended = false;

    root.innerHTML = `
      <div class="q-map-target">Name the highlighted region</div>
      <div class="q-mini-row" style="display:flex;gap:8px;margin-bottom:12px;">
        <input class="q-input" id="mh-input" placeholder="${quiz.prompt || 'Type its name…'}" autocomplete="off" autocapitalize="off" spellcheck="false" style="flex:1;margin:0;">
        <button class="q-btn" id="mh-skip" type="button">Skip →</button>
      </div>
      <div class="q-map-wrap"><div id="q-map-chart" style="width:100%;height:420px"></div></div>`;
    const input = root.querySelector('#mh-input');
    const skipBtn = root.querySelector('#mh-skip');
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
      wheelY: 'zoom', maxZoomLevel: 16,
    }));
    const polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root5, { geoJSON }));
    polygonSeries.mapPolygons.template.setAll({
      fill: am5.color(BASE), stroke: am5.color(0xffffff), strokeWidth: 0.5,
    });

    function polygonFor(regionId) {
      const dataItem = polygonSeries.getDataItemById(regionId);
      return dataItem ? dataItem.get('mapPolygon') : null;
    }

    // Highlight in place — no auto-zoom. Zooming to the region would fill
    // the frame with a context-free shape and give the answer away less
    // fairly than a small pink state on the full map; players can wheel/
    // pinch-zoom themselves.
    function highlightCurrent() {
      if (cur >= items.length) return;
      const polygon = polygonFor(items[cur].regionId);
      if (polygon) polygon.set('fill', am5.color(HIGHLIGHT));
    }

    function settle(color) {
      const polygon = polygonFor(items[cur].regionId);
      if (polygon) polygon.set('fill', am5.color(color));
    }

    function advance(correct) {
      if (ended || cur >= items.length) return;
      settle(correct ? SOLVED : MISSED);
      if (correct) engine.correct(); else engine.advance();
      cur++;
      input.value = '';
      if (cur < items.length) {
        highlightCurrent();
        input.focus();
      } else {
        input.disabled = true;
        skipBtn.disabled = true;
        chart.goHome();
        root.querySelector('.q-map-target').textContent = 'All regions done!';
      }
    }

    function acceptListFor(item) {
      const name = nameById.get(item.regionId);
      return [...(name ? [name] : []), ...(item.accept || [])];
    }

    input.addEventListener('input', () => {
      if (ended || cur >= items.length) return;
      if (engine.matchAccept(input.value, acceptListFor(items[cur]))) {
        input.classList.remove('q-flash-ok'); void input.offsetWidth; input.classList.add('q-flash-ok');
        advance(true);
      }
    });
    skipBtn.addEventListener('click', () => advance(false));

    engine.registerReveal(() => {
      ended = true;
      input.disabled = true;
      skipBtn.disabled = true;
      for (let k = cur; k < items.length; k++) {
        const polygon = polygonFor(items[k].regionId);
        if (polygon) polygon.set('fill', am5.color(MISSED));
        engine.advance();
      }
      cur = items.length;
      chart.goHome();
    });

    // Highlight the first region only once the series has actually built
    // its polygons; zoomToDataItem is a no-op before that.
    polygonSeries.events.once('datavalidated', () => {
      highlightCurrent();
      setTimeout(() => input.focus(), 50);
    });
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
