// Editor for both map quiz types (click-the-map and name-the-highlight —
// identical item shape {regionId}, so map-highlight.js re-exports this).
// Pick a map from the full amCharts CDN catalog, then click regions on a
// live chart to add them; chips below show what's in the quiz.
import { MAP_REGIONS } from '../map-regions.js';
import { loadAmChartsCore, loadGeodata, resolveRegionStem } from '../map-loader.js';

const SELECTED = 0x16a34a;
const BASE = 0xcdd3e0;

let editorRoot5 = null;

export default {
  render(container, quiz, onChange) {
    quiz.region = resolveRegionStem(quiz.region || 'worldLow');

    container.innerHTML = `
      <div class="b-field" style="max-width:320px;margin-bottom:8px;">
        <label>Map</label>
        <select class="b-mini-input" id="me-region">
          ${MAP_REGIONS.map((r) => `<option value="${r.id}" ${r.id === quiz.region ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>
      <div class="b-map-hint">Click regions on the map to add them to the quiz — click again to remove.</div>
      <div class="q-map-wrap" style="margin-bottom:8px;"><div id="me-chart" style="width:100%;height:320px"></div></div>
      <div style="margin-bottom:8px;">
        <button class="b-add-row-btn" id="me-add-all" type="button" style="width:auto;">+ Add all regions on this map</button>
        <button class="b-add-row-btn" id="me-clear" type="button" style="width:auto;">Clear all</button>
      </div>
      <div class="b-chip-list" id="me-chips"></div>`;

    const regionSelect = container.querySelector('#me-region');
    const chartDiv = container.querySelector('#me-chart');
    const chipsEl = container.querySelector('#me-chips');

    let nameById = new Map();
    let polygonSeries = null;
    const selected = () => new Set(quiz.items.map((it) => it.regionId));

    function syncFills() {
      if (!polygonSeries) return;
      const sel = selected();
      polygonSeries.mapPolygons.each((polygon) => {
        const id = polygon.dataItem && polygon.dataItem.get('id');
        polygon.set('fill', am5.color(sel.has(id) ? SELECTED : BASE));
      });
    }

    function renderChips() {
      chipsEl.innerHTML = quiz.items.map((it, i) =>
        `<span class="b-chip">${nameById.get(it.regionId) || it.regionId}<button type="button" data-i="${i}">✕</button></span>`).join('');
      chipsEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        quiz.items.splice(+b.dataset.i, 1);
        renderChips(); syncFills(); onChange();
      }));
    }

    function toggleRegion(id) {
      const idx = quiz.items.findIndex((it) => it.regionId === id);
      if (idx >= 0) quiz.items.splice(idx, 1);
      else quiz.items.push({ regionId: id });
      renderChips(); syncFills(); onChange();
    }

    async function loadMap() {
      chartDiv.textContent = 'Loading map…';
      let geoJSON;
      try {
        await loadAmChartsCore();
        geoJSON = await loadGeodata(quiz.region);
      } catch (e) {
        console.error(e);
        chartDiv.textContent = 'Could not load this map.';
        return;
      }
      nameById = new Map(geoJSON.features.map((f) => [f.id, f.properties.name || f.id]));
      chartDiv.textContent = '';

      if (editorRoot5) { editorRoot5.dispose(); editorRoot5 = null; }
      const root5 = am5.Root.new(chartDiv);
      editorRoot5 = root5;
      root5.setThemes([am5themes_Animated.new(root5)]);
      const chart = root5.container.children.push(am5map.MapChart.new(root5, {
        panX: 'translateX', panY: 'translateY', projection: am5map.geoMercator(),
      }));
      polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root5, { geoJSON }));
      polygonSeries.mapPolygons.template.setAll({
        tooltipText: '{name}', interactive: true,
        fill: am5.color(BASE), stroke: am5.color(0xffffff), strokeWidth: 0.5,
      });
      polygonSeries.mapPolygons.template.states.create('hover', { fill: am5.color(0xf267a0) });
      polygonSeries.mapPolygons.template.events.on('click', (ev) => {
        const id = ev.target.dataItem && ev.target.dataItem.get('id');
        if (id) toggleRegion(id);
      });
      polygonSeries.events.once('datavalidated', () => { renderChips(); syncFills(); });
    }

    regionSelect.addEventListener('change', () => {
      quiz.region = regionSelect.value;
      quiz.items = [];
      renderChips(); onChange();
      loadMap();
    });

    container.querySelector('#me-add-all').addEventListener('click', () => {
      quiz.items = [...nameById.keys()].filter(Boolean).map((id) => ({ regionId: id }));
      renderChips(); syncFills(); onChange();
    });
    container.querySelector('#me-clear').addEventListener('click', () => {
      quiz.items = [];
      renderChips(); syncFills(); onChange();
    });

    renderChips();
    onChange();
    loadMap();
  },
};
