import {
  PRIVATE_NOTES,
  MAX_COMPARE,
  PRESETS,
  SCREENER_COLUMNS,
  CHART_METRICS,
  RATIO_GROUPS,
  FILED_GROUPS,
  LOWER_BETTER,
  isPublic,
  tickerLabel,
  defFor,
  sourceFor,
} from './catalog.js';
import { formatMetric, formatDerived, ensureRatios } from './extract.js';
import {
  buildInsights,
  similarByRevenue,
  metricNumber,
  ratioNumber,
  percentile,
  poolFor,
  coverageOf,
  leadersFor,
  suggestComparisons,
} from './insights.js';

const listEl = document.getElementById('list');
const detailEl = document.getElementById('detail');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const layoutEl = document.getElementById('layout');
const compareBar = document.getElementById('compare-bar');
const compareLabel = document.getElementById('compare-label');
const compareChips = document.getElementById('compare-chips');
const compareGo = document.getElementById('compare-go');
const compareClear = document.getElementById('compare-clear');
const presetsEl = document.getElementById('presets');

const headlinesByCik = new Map();
let snapshotCompanies = {};

let companies = [];
let filter = 'all';
let query = '';
let selectedRank = null;
let compareRanks = [];
let compareMode = false;
let screenerSort = { key: 'rank', dir: 'asc' };
let chartKey = 'net_margin';
let lastCompareRows = [];
let lastCompareStatus = 'ok';
let homeView = 'table';
let extraCol = null;
let sharedOnly = false;
let explainKey = 'net_margin';
let companyPane = 'ratios';
let comparePane = 'ratios';

function parseUrl() {
  const u = new URL(location.href);
  const raw = u.searchParams.get('compare');
  if (raw) {
    const ranks = raw
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 500)
      .slice(0, MAX_COMPARE);
    return { compareMode: ranks.length >= 2, compareRanks: ranks, selectedRank: null };
  }
  const n = Number(u.searchParams.get('rank'));
  const selectedRank = Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
  return { compareMode: false, compareRanks: [], selectedRank };
}

function setUrl(opts = {}) {
  const url = new URL(location.href);
  url.searchParams.delete('rank');
  url.searchParams.delete('compare');
  if (opts.compareMode && opts.compareRanks?.length >= 2) {
    url.searchParams.set('compare', opts.compareRanks.join(','));
  } else if (opts.selectedRank) {
    url.searchParams.set('rank', String(opts.selectedRank));
  }
  history[opts.replace ? 'replaceState' : 'pushState']({}, '', url);
}

function companyByRank(rank) {
  return companies.find((c) => c.rank === rank);
}

function rememberHeadline(row) {
  if (row?.cik == null) return;
  const full = ensureRatios(row);
  headlinesByCik.set(row.cik, full);
  snapshotCompanies[String(row.cik)] = full;
}

function headlinesOf(c) {
  return c?.cik != null ? headlinesByCik.get(c.cik) : undefined;
}

function matches(c) {
  const pub = isPublic(c);
  if (filter === 'public' && !pub) return false;
  if (filter === 'private' && pub) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  const blob = [
    c.company,
    c.sec_name,
    c.fortune_ticker,
    c.sec_ticker,
    c.cik_padded,
    String(c.cik ?? ''),
    String(c.rank),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return blob.includes(q);
}

function lookupDef(key) {
  return defFor(key);
}

function screenerColumns() {
  const cols = [...SCREENER_COLUMNS];
  if (extraCol && !cols.some((c) => c.key === extraCol.key)) {
    const def = lookupDef(extraCol.key);
    if (def) {
      cols.push({
        key: extraCol.key,
        label: def.label,
        type: 'extra',
        source: extraCol.source || sourceFor(extraCol.key),
      });
    }
  }
  return cols;
}

function lookupNumber(headlines, key) {
  if (sourceFor(key) === 'metric') return metricNumber(headlines, key);
  return ratioNumber(headlines, key);
}

function lookupShown(headlines, key) {
  const def = lookupDef(key);
  if (!def || !headlines) return null;
  if (sourceFor(key) === 'metric') return formatMetric(def, headlines.metrics?.[key]);
  return formatDerived(def, headlines.ratios?.[key]);
}

function screenerValue(c, col) {
  if (col.type === 'rank') return c.rank;
  if (col.type === 'name') return c.company;
  const h = headlinesOf(c);
  if (col.type === 'year') return h?.asOfYear ?? null;
  if (col.source === 'metric') return metricNumber(h, col.key);
  if (col.source === 'ratio') return ratioNumber(h, col.key);
  return null;
}

function formatScreenerCell(col, value) {
  if (value == null || value === '') return dash();
  if (col.type === 'rank' || col.type === 'year') return escapeHtml(String(value));
  if (col.type === 'name') return escapeHtml(value);
  const def = lookupDef(col.key);
  if (!def) return escapeHtml(String(value));
  if (col.source === 'metric') return escapeHtml(formatMetric(def, { val: value }) || '—');
  return escapeHtml(formatDerived(def, value) || '—');
}

function renderCompareBar() {
  const n = compareRanks.length;
  compareBar.hidden = n === 0;
  compareLabel.textContent =
    n === 0
      ? ''
      : n === 1
        ? '1 company — pick 1–4 more, or a peer set'
        : n >= MAX_COMPARE
          ? `${n} companies (max)`
          : `${n} companies selected`;
  compareGo.disabled = n < 2;
  if (compareChips) {
    compareChips.innerHTML = compareRanks
      .map((r) => {
        const c = companyByRank(r);
        if (!c) return '';
        return `<button type="button" class="f5-chip" data-unchip="${r}">${escapeHtml(c.company)} <span aria-hidden="true">×</span></button>`;
      })
      .join('');
  }
}

function renderPresets() {
  if (!presetsEl) return;
  presetsEl.innerHTML = PRESETS.map(
    (p) =>
      `<button type="button" class="f5-preset" data-preset="${escapeAttr(p.id)}">${escapeHtml(p.label)}</button>`
  ).join('');
}

function renderList() {
  const rows = companies.filter(matches);
  countEl.textContent = `${rows.length} shown${window.__f500Stats ? ' · ' + window.__f500Stats : ''}`;
  const atCap = compareRanks.length >= MAX_COMPARE;
  const html = rows
    .map((c) => {
      const pub = isPublic(c);
      const selected = c.rank === selectedRank && !compareMode;
      const checked = compareRanks.includes(c.rank);
      const check = pub
        ? `<input class="f5-check" type="checkbox" data-check="${c.rank}" ${checked ? 'checked' : ''} ${atCap && !checked ? 'disabled' : ''} aria-label="Add ${escapeAttr(c.company)} to compare" />`
        : `<span></span>`;
      const nm = formatDerived(lookupDef('net_margin'), headlinesOf(c)?.ratios?.net_margin);
      const right = pub
        ? `<span class="f5-row-fig">${nm ? escapeHtml(nm) : ''}</span>`
        : `<span class="f5-pill f5-pill-private">Private</span>`;
      return `<div class="f5-row${pub ? '' : ' is-private'}">
        ${check}
        <button type="button" class="f5-row-main" data-rank="${c.rank}" aria-selected="${selected}">
          <span class="f5-rank">${c.rank}</span>
          <span>
            <span class="f5-row-name">${escapeHtml(c.company)}</span>
            <span class="f5-row-sub">${escapeHtml(tickerLabel(c))}</span>
          </span>
          ${right}
        </button>
      </div>`;
    })
    .join('');
  listEl.innerHTML = html || `<p class="f5-count" style="padding:12px">No matches.</p>`;
  renderCompareBar();
}

function dash() {
  return `<span class="muted" title="Not tagged in the current 10-K">—</span>`;
}

function sortRows(rows) {
  const cols = screenerColumns();
  const col = cols.find((c) => c.key === screenerSort.key) || cols[0];
  const dir = screenerSort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = screenerValue(a, col);
    const bv = screenerValue(b, col);
    if (col.type === 'name') {
      const cmp = String(av || '').localeCompare(String(bv || ''));
      return cmp === 0 ? a.rank - b.rank : dir * cmp;
    }
    const aMissing = av == null || (typeof av === 'number' && !Number.isFinite(av));
    const bMissing = bv == null || (typeof bv === 'number' && !Number.isFinite(bv));
    if (aMissing && bMissing) return a.rank - b.rank;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (av === bv) return a.rank - b.rank;
    return dir * (av < bv ? -1 : 1);
  });
}

function viewTabs() {
  return `<div class="f5-view-tabs" role="tablist" aria-label="Ratios or glossary">
    <button type="button" class="f5-view-tab" data-home-view="table" aria-pressed="${homeView === 'table'}">Compare table</button>
    <button type="button" class="f5-view-tab" data-home-view="learn" aria-pressed="${homeView === 'learn'}">What ratios mean</button>
  </div>`;
}

function paneTabs(kind, current) {
  return `<div class="f5-view-tabs" role="tablist" aria-label="Ratios or filed tags">
    <button type="button" class="f5-view-tab" data-${kind}-pane="ratios" aria-pressed="${current === 'ratios'}">Key ratios</button>
    <button type="button" class="f5-view-tab" data-${kind}-pane="filed" aria-pressed="${current === 'filed'}">Filed numbers</button>
  </div>`;
}

function screenerView() {
  if (homeView === 'learn') return learnView();
  const cols = screenerColumns();
  const rows = sortRows(companies.filter(matches));
  const atCap = compareRanks.length >= MAX_COMPARE;
  const head = cols
    .map((col) => {
      const active = screenerSort.key === col.key;
      const arrow = active ? (screenerSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
      const sortState = active ? (screenerSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      const def = lookupDef(col.key);
      const tip = def?.plain ? ` title="${escapeAttr(def.plain)}"` : '';
      return `<th data-sort="${escapeAttr(col.key)}" aria-sort="${sortState}" class="${active ? 'is-sorted' : ''}"${tip}>${escapeHtml(col.label)}${arrow}</th>`;
    })
    .join('');
  const body = rows
    .map((c) => {
      const pub = isPublic(c);
      const checked = compareRanks.includes(c.rank);
      const check = pub
        ? `<input class="f5-check" type="checkbox" data-check="${c.rank}" ${checked ? 'checked' : ''} ${atCap && !checked ? 'disabled' : ''} aria-label="Add ${escapeAttr(c.company)} to compare" />`
        : '';
      const tds = cols
        .map((col) => {
          if (col.type === 'name') {
            return `<td class="f5-name-cell">${check}<button type="button" class="f5-linkish" data-rank="${c.rank}">${escapeHtml(c.company)}</button></td>`;
          }
          const value = screenerValue(c, col);
          const extra = col.type === 'rank' ? ' class="mono"' : '';
          return `<td${extra}>${formatScreenerCell(col, value)}</td>`;
        })
        .join('');
      return `<tr class="${pub ? '' : 'is-private'}">${tds}</tr>`;
    })
    .join('');

  return `
    <div class="f5-screener">
      <div class="f5-toolbar">
        ${viewTabs()}
        <p class="f5-toolbar-hint">Check 2–5 companies, then Compare. Dash = ratio ingredients weren’t tagged.</p>
      </div>
      <div class="f5-table-wrap">
        <table class="f5-table f5-screener-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body || `<tr><td colspan="${cols.length}">No matches.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function learnView() {
  const publicCount = Object.keys(snapshotCompanies).length || companies.filter(isPublic).length;
  const groups = RATIO_GROUPS.map((group) => {
    const rows = group.keys
      .map((key) => {
        const def = lookupDef(key);
        if (!def) return '';
        const n = poolFor(snapshotCompanies, sourceFor(key), key).length;
        const on = explainKey === key;
        return `<tr class="${on ? 'is-on' : ''}">
          <td><button type="button" class="f5-linkish" data-explain="${escapeAttr(key)}">${escapeHtml(def.label)}</button><div class="muted">${escapeHtml(def.formula || '')}</div></td>
          <td class="f5-plain-cell">${escapeHtml(def.plain)}</td>
          <td class="mono">${n ? `${n}/${publicCount}` : '—'}</td>
        </tr>`;
      })
      .join('');
    return `<tbody>
      <tr class="f5-group"><td colspan="3">${escapeHtml(group.label)}</td></tr>
      ${rows}
    </tbody>`;
  }).join('');

  return `
    <div class="f5-workspace">
      <div class="f5-workspace-main">
        <div class="f5-toolbar">${viewTabs()}</div>
        <div class="f5-table-wrap">
          <table class="f5-table f5-learn-table">
            <thead><tr><th>Ratio</th><th>In one line</th><th>Have it</th></tr></thead>
            ${groups}
          </table>
        </div>
      </div>
      ${explainDock(explainKey)}
    </div>`;
}

function explainDock(key, headlines) {
  const def = lookupDef(key);
  if (!def) {
    return `<aside class="f5-dock"><p class="muted">Tap a ratio to see what it means.</p></aside>`;
  }
  const source = sourceFor(key);
  const shown = headlines ? lookupShown(headlines, key) : null;
  const value = headlines ? lookupNumber(headlines, key) : null;
  const publicCount = Object.keys(snapshotCompanies).length || companies.filter(isPublic).length;
  const n = poolFor(snapshotCompanies, source, key).length;
  const preferHigh = def.better !== 'lower';
  const leaders = leadersFor(companies, snapshotCompanies, key, source, 3, preferHigh);
  const leaderLine = leaders.length
    ? `<p class="f5-leaders">${preferHigh ? 'Highest' : 'Lowest'}: ${leaders
        .map((l) => {
          const v =
            source === 'ratio' ? formatDerived(def, l.value) : formatMetric(def, { val: l.value });
          return `<button type="button" class="f5-linkish" data-rank="${l.company.rank}">${escapeHtml(l.company.company)}</button> ${escapeHtml(v || '')}`;
        })
        .join(' · ')}</p>`
    : '';
  const compareBtn =
    leaders.length >= 2
      ? `<button type="button" class="f5-mini" data-compare-leaders="${escapeAttr(key)}">Compare leaders</button>`
      : '';
  const sortBtn = `<button type="button" class="f5-mini f5-mini-ghost" data-sort-metric="${escapeAttr(key)}">Add to table</button>`;
  return `<aside class="f5-dock">
    <p class="f5-kicker">${escapeHtml(def.formula || 'Key ratio')}</p>
    <h3>${escapeHtml(def.label)}${shown ? ` · ${escapeHtml(shown)}` : ''}</h3>
    ${shown && headlines ? pctPill(value, source, key) : ''}
    <p class="f5-eli5">${escapeHtml(def.eli5)}</p>
    ${shown ? '' : `<p class="f5-missing-why">${escapeHtml(def.whyMissing || '')}</p>`}
    <p class="f5-coverage-line"><strong>${n}</strong> / ${publicCount} public companies have this.</p>
    ${leaderLine}
    <div class="f5-eli5-actions">${compareBtn}${sortBtn}</div>
  </aside>`;
}

function pctPill(value, source, key) {
  const invert = LOWER_BETTER.has(key);
  const pctile = percentile(value, poolFor(snapshotCompanies, source, key), invert);
  if (pctile == null) return '';
  const tone = pctile >= 75 ? 'high' : pctile <= 25 ? 'low' : 'mid';
  const title = invert
    ? 'Lower is better; percentile is inverted among public Fortune 500 filers with this tag'
    : 'Among public Fortune 500 filers with this tag in the snapshot';
  return `<span class="f5-pct f5-pct-${tone}" title="${escapeAttr(title)}">${pctile}th percentile</span>`;
}

function ratioTile(def, headlines) {
  const shown = lookupShown(headlines, def.key);
  const on = explainKey === def.key;
  return `<button type="button" class="f5-tile${on ? ' is-on' : ''}${shown ? '' : ' is-missing'}" data-explain="${escapeAttr(def.key)}">
    <span class="f5-tile-label">${escapeHtml(def.label)}</span>
    <span class="f5-tile-val">${shown ? escapeHtml(shown) : '—'}</span>
  </button>`;
}

function filedRow(def, headlines) {
  const shown = lookupShown(headlines, def.key);
  const on = explainKey === def.key;
  const tag = headlines?.metrics?.[def.key]?.tag || def.tags || '';
  return `<tr class="${on ? 'is-on' : ''}">
    <td><button type="button" class="f5-linkish" data-explain="${escapeAttr(def.key)}">${escapeHtml(def.label)}</button></td>
    <td>${shown ? escapeHtml(shown) : dash()}</td>
    <td class="muted">${escapeHtml(tag)}</td>
  </tr>`;
}

function publicDetail(c, headlines, status) {
  const inCompare = compareRanks.includes(c.rank);
  const addBtn = inCompare
    ? `<button type="button" class="f5-add-compare" disabled>In compare</button>`
    : `<button type="button" class="f5-add-compare" data-add-compare="${c.rank}">Compare</button>`;
  let main = '';
  if (status === 'loading') {
    main = `<p class="f5-toolbar-hint">Loading 10-K ratios…</p>`;
  } else if (status === 'error') {
    main = `<p class="f5-toolbar-hint">Couldn’t load Company Facts (${escapeHtml(headlines?.error || 'network')}).</p>`;
  } else if (headlines) {
    const year = headlines.asOfYear ? `FY${headlines.asOfYear}` : 'FY?';
    const cov = coverageOf(headlines);
    const suggestions = suggestComparisons(c, companies, snapshotCompanies, 2);
    const suggest = suggestions.length
      ? `<div class="f5-inline-suggest">${suggestions
          .map(
            (s) =>
              `<button type="button" class="f5-preset" data-suggest="${escapeAttr(s.id)}" data-suggest-ranks="${s.ranks.join(',')}" title="${escapeAttr(s.why)}">${escapeHtml(s.title)}</button>`
          )
          .join('')}</div>`
      : '';
    if (companyPane === 'filed') {
      const tables = FILED_GROUPS.map((group) => {
        const rows = group.keys
          .map((key) => {
            const def = lookupDef(key);
            return def ? filedRow(def, headlines) : '';
          })
          .join('');
        return `<tbody><tr class="f5-group"><td colspan="3">${escapeHtml(group.label)}</td></tr>${rows}</tbody>`;
      }).join('');
      main = `
        ${paneTabs('company', companyPane)}
        <p class="f5-toolbar-hint">${year} · ${cov.tagged.length}/${cov.total} tags · ${cov.derivedOk.length} ratios · a dash is not zero</p>
        ${suggest}
        <div class="f5-table-wrap">
          <table class="f5-table">
            <thead><tr><th>Tag</th><th>Value</th><th>XBRL</th></tr></thead>
            ${tables}
          </table>
        </div>`;
    } else {
      const groups = RATIO_GROUPS.map((group) => {
        const tiles = group.keys
          .map((key) => {
            const def = lookupDef(key);
            return def ? ratioTile(def, headlines) : '';
          })
          .join('');
        return `<section class="f5-tile-group">
          <h3>${escapeHtml(group.label)}</h3>
          <div class="f5-tiles">${tiles}</div>
        </section>`;
      }).join('');
      main = `
        ${paneTabs('company', companyPane)}
        <p class="f5-toolbar-hint">${year} · ${cov.derivedOk.length} ratios from ${cov.tagged.length}/${cov.total} tagged items · tap a tile</p>
        ${suggest}
        ${groups}`;
    }
  }
  return `
    <div class="f5-workspace">
      <div class="f5-workspace-main">
        <button type="button" class="f5-back" id="back">← Table</button>
        <div class="f5-company-head">
          <div>
            <p class="f5-kicker">#${c.rank} · ${escapeHtml(tickerLabel(c))} · ${escapeHtml(c.cik_padded || '')}</p>
            <h2>${escapeHtml(c.company)}</h2>
          </div>
          <div class="f5-head-actions">${addBtn}</div>
        </div>
        ${main}
      </div>
      ${status === 'ok' || headlines ? explainDock(explainKey, headlines) : ''}
    </div>`;
}

function privateDetail(c) {
  const note = PRIVATE_NOTES[c.rank] || 'Private or mutual — no public 10-K/10-Q ticker in the SEC JSON APIs.';
  return `
    <div class="f5-workspace-main">
    <button type="button" class="f5-back" id="back">← Table</button>
    <div class="f5-company-head">
      <div>
        <p class="f5-kicker">Fortune #${c.rank}</p>
        <h2>${escapeHtml(c.company)}</h2>
      </div>
      <span class="f5-pill f5-pill-private">No SEC ticker</span>
    </div>
    <div class="f5-note private">
      <p><strong>EDGAR does not have the same public financials for this company.</strong> ${escapeHtml(note)}. Mutuals, cooperatives, and private firms generally do not file 10-Ks under a tradable ticker, so there is no Submissions / Company Facts URL to open.</p>
    </div>
    <p class="f5-toolbar-hint">They stay on the list so rank gaps are honest. No invented numbers.</p>
    </div>
  `;
}

function cellClass(values, value, better) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (better == null || nums.length < 2 || typeof value !== 'number') return '';
  const hi = Math.max(...nums);
  const lo = Math.min(...nums);
  if (hi === lo) return '';
  if (better === 'higher') {
    if (value === hi) return 'is-best';
    if (value === lo) return 'is-worst';
  }
  if (better === 'lower') {
    if (value === lo) return 'is-best';
    if (value === hi) return 'is-worst';
  }
  return '';
}

function barChart(names, rows) {
  const spec = CHART_METRICS.find((m) => m.key === chartKey) || CHART_METRICS[0];
  const def = lookupDef(spec.key);
  const vals = names.map((c) => {
    const h = rows.find((x) => x.cik === c.cik);
    return spec.source === 'ratio' ? ratioNumber(h, spec.key) : metricNumber(h, spec.key);
  });
  const absMax = Math.max(0, ...vals.filter((v) => v != null).map((v) => Math.abs(v)));
  const tabs = CHART_METRICS.map(
    (m) =>
      `<button type="button" class="f5-chart-tab${m.key === spec.key ? ' is-on' : ''}" data-chart="${escapeAttr(m.key)}">${escapeHtml(m.label)}</button>`
  ).join('');
  const bars = names
    .map((c, i) => {
      const v = vals[i];
      const shown = v == null ? null : spec.source === 'ratio' ? formatDerived(def, v) : formatMetric(def, { val: v });
      const width = v == null || !absMax ? 0 : (Math.abs(v) / absMax) * 100;
      const cls = cellClass(vals, v, def?.better);
      const neg = v != null && v < 0 ? ' is-neg' : '';
      return `<div class="f5-bar-row">
        <span class="f5-bar-name">${escapeHtml(c.company)}</span>
        <div class="f5-bar-track">${v == null ? '' : `<div class="f5-bar-fill ${cls}${neg}" style="width:${width.toFixed(1)}%"></div>`}</div>
        <span class="f5-bar-val">${shown ? escapeHtml(shown) : '—'}</span>
      </div>`;
    })
    .join('');
  return `
    <div class="f5-chart">
      <div class="f5-chart-tabs" role="tablist" aria-label="Chart metric">${tabs}</div>
      <div class="f5-bars">${bars}</div>
    </div>`;
}

function compareView(rows, status) {
  const names = compareRanks.map((r) => companyByRank(r)).filter(Boolean);
  const insightRows = names.map((c) => ({
    company: c,
    headlines: rows.find((x) => x.cik === c.cik),
  }));
  const insights = status === 'ok' ? buildInsights(insightRows, snapshotCompanies).slice(0, 3) : [];
  const groups = comparePane === 'filed' ? FILED_GROUPS : RATIO_GROUPS;

  const head = names
    .map((c) => {
      const h = rows.find((x) => x.cik === c.cik);
      const fy = h?.asOfYear ? `FY${h.asOfYear}` : '';
      return `<th><button type="button" class="f5-linkish" data-rank="${c.rank}">${escapeHtml(c.company)}</button><div class="muted">${escapeHtml(c.fortune_ticker || '')} ${fy}</div></th>`;
    })
    .join('');

  let body = '';
  if (status === 'loading') {
    body = `<tr><td colspan="${names.length + 1}">Loading…</td></tr>`;
  } else if (status === 'error') {
    body = `<tr><td colspan="${names.length + 1}">Couldn’t reach /api/f500-headlines.</td></tr>`;
  } else {
    body = groups
      .map((group) => {
        const keys = group.keys.filter((key) => {
          if (!sharedOnly) return true;
          return names.every((c) => lookupNumber(rows.find((x) => x.cik === c.cik), key) != null);
        });
        if (!keys.length) return '';
        const groupRow = `<tr class="f5-group"><td colspan="${names.length + 1}">${escapeHtml(group.label)}</td></tr>`;
        const metricRows = keys
          .map((key) => {
            const def = lookupDef(key);
            if (!def) return '';
            const vals = names.map((c) => lookupNumber(rows.find((x) => x.cik === c.cik), key));
            const tds = names
              .map((c, i) => {
                const shown = lookupShown(rows.find((x) => x.cik === c.cik), key);
                const cls = cellClass(vals, vals[i], def.better);
                return `<td class="${cls}">${shown ? escapeHtml(shown) : dash()}</td>`;
              })
              .join('');
            const on = explainKey === key ? ' is-on' : '';
            return `<tr class="${on.trim()}">
              <td><button type="button" class="f5-linkish" data-explain="${escapeAttr(key)}">${escapeHtml(def.label)}</button></td>
              ${tds}
            </tr>`;
          })
          .join('');
        return groupRow + metricRows;
      })
      .join('');
  }

  return `
    <div class="f5-workspace">
      <div class="f5-workspace-main">
        <button type="button" class="f5-back" id="back">← Table</button>
        <div class="f5-toolbar">
          ${paneTabs('compare', comparePane)}
          <label class="f5-shared-toggle"><input type="checkbox" id="shared-only" ${sharedOnly ? 'checked' : ''}/> Shared only</label>
        </div>
        ${insights.length ? `<ul class="f5-insights">${insights.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
        ${status === 'ok' ? barChart(names, rows) : ''}
        <div class="f5-table-wrap">
          <table class="f5-table">
            <thead><tr><th></th>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
      ${explainDock(explainKey)}
    </div>`;
}

async function fetchHeadlines(ciks) {
  const missing = ciks.filter((cik) => !headlinesByCik.has(cik));
  if (!missing.length) return ciks.map((cik) => headlinesByCik.get(cik));
  try {
    const res = await fetch(`/api/f500-headlines?ciks=${missing.join(',')}`);
    if (res.ok) {
      const data = await res.json();
      for (const row of data.companies || []) rememberHeadline(row);
    }
  } catch {
    // Snapshot is enough for compare; live API is a fallback when deployed.
  }
  return ciks.map((cik) => headlinesByCik.get(cik));
}

async function renderDetail() {
  layoutEl.classList.toggle('show-detail', compareMode || Boolean(selectedRank));
  if (compareMode) {
    const names = compareRanks.map(companyByRank).filter((c) => c && isPublic(c));
    lastCompareRows = [];
    lastCompareStatus = 'loading';
    detailEl.innerHTML = compareView([], 'loading');
    try {
      const rows = await fetchHeadlines(names.map((c) => c.cik));
      if (!compareMode) return;
      lastCompareRows = rows.filter(Boolean);
      lastCompareStatus = 'ok';
      detailEl.innerHTML = compareView(lastCompareRows, 'ok');
    } catch {
      if (!compareMode) return;
      lastCompareRows = [];
      lastCompareStatus = 'error';
      detailEl.innerHTML = compareView([], 'error');
    }
    return;
  }

  const c = companyByRank(selectedRank);
  if (!c) {
    detailEl.innerHTML = screenerView();
    return;
  }
  if (!isPublic(c)) {
    detailEl.innerHTML = privateDetail(c);
    return;
  }

  const cached = headlinesByCik.get(c.cik);
  detailEl.innerHTML = publicDetail(c, cached, cached ? 'ok' : 'loading');
  if (cached) return;
  try {
    const [row] = await fetchHeadlines([c.cik]);
    if (selectedRank !== c.rank || compareMode) return;
    detailEl.innerHTML = publicDetail(c, row, row?.error ? 'error' : 'ok');
  } catch (err) {
    if (selectedRank !== c.rank || compareMode) return;
    detailEl.innerHTML = publicDetail(c, { error: err.message }, 'error');
  }
}

function applyState(opts = {}) {
  if (!opts.fromPop) {
    setUrl({
      compareMode,
      compareRanks,
      selectedRank,
      replace: opts.replace,
    });
  }
  renderList();
  renderDetail();
  if ((compareMode || selectedRank) && window.matchMedia('(max-width: 820px)').matches) {
    detailEl.scrollIntoView({ block: 'start' });
  }
}

function select(rank, opts = {}) {
  compareMode = false;
  selectedRank = rank;
  applyState(opts);
}

function openCompare() {
  if (compareRanks.length < 2) return;
  compareMode = true;
  selectedRank = null;
  applyState();
}

function toggleCompare(rank, on) {
  const c = companyByRank(rank);
  if (!c || !isPublic(c)) return;
  if (on) {
    if (!compareRanks.includes(rank) && compareRanks.length < MAX_COMPARE) {
      compareRanks = [...compareRanks, rank];
    }
  } else {
    compareRanks = compareRanks.filter((r) => r !== rank);
    if (compareMode && compareRanks.length < 2) compareMode = false;
  }
  renderList();
  if (compareMode) applyState();
  else if (!selectedRank) renderDetail();
  else renderCompareBar();
}

function applyPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  compareRanks = preset.ranks.filter((r) => {
    const c = companyByRank(r);
    return c && isPublic(c);
  }).slice(0, MAX_COMPARE);
  openCompare();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", '&#39;');
}

listEl.addEventListener('click', (e) => {
  const check = e.target.closest('[data-check]');
  if (check) {
    e.stopPropagation();
    toggleCompare(Number(check.dataset.check), check.checked);
    return;
  }
  const btn = e.target.closest('[data-rank]');
  if (!btn) return;
  select(Number(btn.dataset.rank));
});

detailEl.addEventListener('click', (e) => {
  if (e.target.closest('#back')) {
    select(null);
    return;
  }
  const check = e.target.closest('[data-check]');
  if (check) {
    e.stopPropagation();
    toggleCompare(Number(check.dataset.check), check.checked);
    return;
  }
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) {
    const key = sortBtn.dataset.sort;
    if (screenerSort.key === key) {
      screenerSort = { key, dir: screenerSort.dir === 'asc' ? 'desc' : 'asc' };
    } else {
      screenerSort = { key, dir: key === 'name' || key === 'rank' ? 'asc' : 'desc' };
    }
    if (!selectedRank && !compareMode) detailEl.innerHTML = screenerView();
    return;
  }
  const chart = e.target.closest('[data-chart]');
  if (chart && compareMode) {
    chartKey = chart.dataset.chart;
    detailEl.innerHTML = compareView(lastCompareRows, lastCompareStatus);
    return;
  }
  const add = e.target.closest('[data-add-compare]');
  if (add) {
    toggleCompare(Number(add.dataset.addCompare), true);
    if (selectedRank) renderDetail();
    return;
  }
  const peers = e.target.closest('[data-compare-peers]');
  if (peers) {
    const rank = Number(peers.dataset.comparePeers);
    const c = companyByRank(rank);
    const similar = similarByRevenue(c, companies, snapshotCompanies, MAX_COMPARE - 1);
    compareRanks = [rank, ...similar.map((p) => p.company.rank)].slice(0, MAX_COMPARE);
    openCompare();
    return;
  }
  const peer = e.target.closest('[data-peer]');
  if (peer) {
    select(Number(peer.dataset.peer));
    return;
  }
  const rankBtn = e.target.closest('[data-rank]');
  if (rankBtn) {
    select(Number(rankBtn.dataset.rank));
    return;
  }
  const viewBtn = e.target.closest('[data-home-view]');
  if (viewBtn) {
    homeView = viewBtn.dataset.homeView === 'learn' ? 'learn' : 'table';
    compareMode = false;
    selectedRank = null;
    applyState();
    return;
  }
  const companyPaneBtn = e.target.closest('[data-company-pane]');
  if (companyPaneBtn) {
    companyPane = companyPaneBtn.dataset.companyPane === 'filed' ? 'filed' : 'ratios';
    renderDetail();
    return;
  }
  const comparePaneBtn = e.target.closest('[data-compare-pane]');
  if (comparePaneBtn) {
    comparePane = comparePaneBtn.dataset.comparePane === 'filed' ? 'filed' : 'ratios';
    if (compareMode) detailEl.innerHTML = compareView(lastCompareRows, lastCompareStatus);
    return;
  }
  const preset = e.target.closest('[data-preset]');
  if (preset) {
    applyPreset(preset.dataset.preset);
    return;
  }
  const leaderBtn = e.target.closest('[data-compare-leaders]');
  if (leaderBtn) {
    const key = leaderBtn.dataset.compareLeaders;
    const def = lookupDef(key);
    const source = sourceFor(key);
    const preferHigh = def?.better !== 'lower';
    const top = leadersFor(companies, snapshotCompanies, key, source, MAX_COMPARE, preferHigh);
    compareRanks = top.map((x) => x.company.rank);
    if (compareRanks.length >= 2) openCompare();
    return;
  }
  const sortMetric = e.target.closest('[data-sort-metric]');
  if (sortMetric) {
    const key = sortMetric.dataset.sortMetric;
    extraCol = { key, source: sourceFor(key) };
    const def = lookupDef(key);
    const dir = key === 'name' || key === 'rank' || def?.better === 'lower' ? 'asc' : 'desc';
    screenerSort = { key, dir };
    homeView = 'table';
    compareMode = false;
    selectedRank = null;
    applyState();
    return;
  }
  const suggest = e.target.closest('[data-suggest]');
  if (suggest) {
    const ranks = String(suggest.dataset.suggestRanks || '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 500);
    compareRanks = ranks
      .filter((r) => {
        const c = companyByRank(r);
        return c && isPublic(c);
      })
      .slice(0, MAX_COMPARE);
    if (compareRanks.length >= 2) openCompare();
    return;
  }
  const explain = e.target.closest('[data-explain]');
  if (explain) {
    explainKey = explain.dataset.explain;
    if (compareMode) detailEl.innerHTML = compareView(lastCompareRows, lastCompareStatus);
    else if (selectedRank) renderDetail();
    else if (homeView === 'learn') detailEl.innerHTML = learnView();
    return;
  }
});

detailEl.addEventListener('change', (e) => {
  if (e.target.id !== 'shared-only') return;
  sharedOnly = e.target.checked;
  if (compareMode) detailEl.innerHTML = compareView(lastCompareRows, lastCompareStatus);
});

presetsEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  applyPreset(btn.dataset.preset);
});

function openLearn(e) {
  e?.preventDefault();
  homeView = 'learn';
  compareMode = false;
  selectedRank = null;
  applyState();
  if (window.matchMedia('(max-width: 820px)').matches) {
    detailEl.scrollIntoView({ block: 'start' });
  }
}

document.getElementById('nav-learn')?.addEventListener('click', openLearn);
document.getElementById('glossary-learn')?.addEventListener('click', openLearn);

compareBar.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-unchip]');
  if (!chip) return;
  toggleCompare(Number(chip.dataset.unchip), false);
});

searchEl.addEventListener('input', () => {
  query = searchEl.value.trim();
  renderList();
  if (!selectedRank && !compareMode) renderDetail();
});

document.querySelector('.f5-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  for (const b of document.querySelectorAll('.f5-filters [data-filter]')) {
    b.setAttribute('aria-pressed', String(b === btn));
  }
  renderList();
  if (!selectedRank && !compareMode) renderDetail();
});

compareGo.addEventListener('click', openCompare);
compareClear.addEventListener('click', () => {
  compareRanks = [];
  compareMode = false;
  applyState();
});

window.addEventListener('popstate', () => {
  const s = parseUrl();
  compareMode = s.compareMode;
  compareRanks = s.compareRanks;
  selectedRank = s.selectedRank;
  applyState({ fromPop: true });
});

try {
  const res = await fetch('./data/fortune500_edgar_mapping.json');
  if (!res.ok) throw new Error(`Could not load mapping (${res.status})`);
  companies = await res.json();
  companies.sort((a, b) => a.rank - b.rank);
  const snapRes = await fetch('./data/headlines-snapshot.json');
  if (snapRes.ok) {
    const snap = await snapRes.json();
    snapshotCompanies = snap.companies || {};
    for (const row of Object.values(snapshotCompanies)) rememberHeadline(row);
    window.__f500PulledAt = snap.pulled_at;
  }
  const pub = companies.filter(isPublic).length;
  const withFy = [...headlinesByCik.values()].filter((h) => h.asOfYear).length;
  window.__f500Stats = `${pub} public · ${withFy} with 10-Ks`;
  renderPresets();
  const s = parseUrl();
  compareMode = s.compareMode;
  compareRanks = s.compareRanks;
  selectedRank = s.selectedRank;
  if (location.hash === '#learn' && !compareMode && !selectedRank) homeView = 'learn';
  applyState({ replace: true, fromPop: true });
} catch (err) {
  detailEl.innerHTML = `<p class="f5-error">${escapeHtml(err.message)}</p>`;
}
