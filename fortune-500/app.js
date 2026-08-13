import {
  SOURCES,
  METRICS,
  DERIVED,
  GLOSSARY,
  PRIVATE_NOTES,
  MATCH_LABELS,
  MAX_COMPARE,
  PRESETS,
  SCREENER_COLUMNS,
  CHART_METRICS,
  FEATURED,
  METRIC_GROUPS,
  LOWER_BETTER,
  HOW_TO,
  NOT_IN_EDGAR,
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
  coverageOverlap,
  leadersFor,
  suggestComparisons,
} from './insights.js';

const listEl = document.getElementById('list');
const detailEl = document.getElementById('detail');
const countEl = document.getElementById('count');
const statsEl = document.getElementById('stats');
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
let explainKey = null;

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
  if (METRICS.some((m) => m.key === key)) return metricNumber(headlines, key);
  return ratioNumber(headlines, key);
}

function lookupShown(headlines, key) {
  const def = lookupDef(key);
  if (!def || !headlines) return null;
  if (METRICS.some((m) => m.key === key)) return formatMetric(def, headlines.metrics?.[key]);
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
  countEl.textContent = `${rows.length} shown`;
  const atCap = compareRanks.length >= MAX_COMPARE;
  const html = rows
    .map((c) => {
      const pub = isPublic(c);
      const selected = c.rank === selectedRank && !compareMode;
      const checked = compareRanks.includes(c.rank);
      const check = pub
        ? `<input class="f5-check" type="checkbox" data-check="${c.rank}" ${checked ? 'checked' : ''} ${atCap && !checked ? 'disabled' : ''} aria-label="Add ${escapeAttr(c.company)} to compare" />`
        : `<span></span>`;
      const rev = formatMetric({ unit: 'USD' }, headlinesOf(c)?.metrics?.revenue);
      const right = pub
        ? `<span class="f5-row-fig">${rev ? escapeHtml(rev) : ''}</span>`
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

function explainBanner(key) {
  const def = lookupDef(key);
  if (!def) return '';
  return `<div class="f5-note" id="explain-banner">
    <p><strong>${escapeHtml(def.label)} — like you’re five.</strong> ${escapeHtml(def.eli5)}</p>
    ${def.whyMissing ? `<p class="f5-missing-why">${escapeHtml(def.whyMissing)}</p>` : ''}
  </div>`;
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
  return `<div class="f5-view-tabs" role="tablist" aria-label="Browse or learn">
    <button type="button" class="f5-view-tab" data-home-view="table" aria-pressed="${homeView === 'table'}">All companies</button>
    <button type="button" class="f5-view-tab" data-home-view="learn" aria-pressed="${homeView === 'learn'}">What the numbers mean</button>
  </div>`;
}

function storyCards() {
  return `<div class="f5-stories" aria-label="Try a comparison">
    ${PRESETS.map(
      (p) => `<button type="button" class="f5-story${p.story ? ' is-story' : ''}" data-preset="${escapeAttr(p.id)}">
        <strong>${escapeHtml(p.label)}</strong>
        <span>${escapeHtml(p.blurb)}</span>
      </button>`
    ).join('')}
  </div>`;
}

function howTo() {
  return `<ol class="f5-howto">
    ${HOW_TO.map((s) => `<li><strong>${escapeHtml(s.title)}</strong> ${escapeHtml(s.body)}</li>`).join('')}
  </ol>`;
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
            return `<td class="f5-name-cell">${check}<button type="button" class="f5-linkish" data-rank="${c.rank}">${escapeHtml(c.company)}</button><div class="muted">${escapeHtml(tickerLabel(c))}</div></td>`;
          }
          const value = screenerValue(c, col);
          const extra = col.type === 'rank' ? ' class="mono"' : '';
          return `<td${extra}>${formatScreenerCell(col, value)}</td>`;
        })
        .join('');
      return `<tr class="${pub ? '' : 'is-private'}">${tds}</tr>`;
    })
    .join('');

  const extraNote = extraCol
    ? `<p class="f5-section-lede">Extra column: <strong>${escapeHtml(lookupDef(extraCol.key)?.label || extraCol.key)}</strong>. Sort it like the others. A dash still means not tagged.</p>`
    : '';

  return `
    <div class="f5-screener">
      ${viewTabs()}
      <h2>Latest 10-K headlines</h2>
      <p class="f5-section-lede">
        These are SEC tags from each company’s annual report — not Fortune magazine’s ranking dollars.
        Click a name to see <em>which</em> numbers that 10-K actually filed, with a kid-level explanation.
        Check up to ${MAX_COMPARE} public filers and hit <strong>Compare</strong>, or tap a story below.
      </p>
      ${howTo()}
      ${storyCards()}
      ${extraNote}
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
  const groups = METRIC_GROUPS.map((group) => {
    const cards = group.keys
      .map((key) => {
        const def = lookupDef(key);
        if (!def) return '';
        const source = sourceFor(key);
        const pool = poolFor(snapshotCompanies, source, key);
        const n = pool.length;
        const preferHigh = def.better !== 'lower';
        const leaders = leadersFor(companies, snapshotCompanies, key, source, 3, preferHigh);
        const leaderLine = leaders.length
          ? `<p class="f5-leaders">${preferHigh ? 'Highest here' : 'Lowest here'}: ${leaders
              .map((l) => {
                const shown =
                  source === 'ratio'
                    ? formatDerived(def, l.value)
                    : formatMetric(def, { val: l.value });
                return `<button type="button" class="f5-linkish" data-rank="${l.company.rank}">${escapeHtml(l.company.company)}</button> ${escapeHtml(shown || '')}`;
              })
              .join(' · ')}</p>`
          : '';
        const compareBtn =
          leaders.length >= 2
            ? `<button type="button" class="f5-mini" data-compare-leaders="${escapeAttr(key)}">Compare the leaders</button>`
            : '';
        const sortBtn = `<button type="button" class="f5-mini f5-mini-ghost" data-sort-metric="${escapeAttr(key)}">Show in the table</button>`;
        const coverage =
          publicCount > 0
            ? `<p class="f5-coverage-line"><strong>${n}</strong> of ${publicCount} public companies tagged this${n ? ` (${Math.round((100 * n) / publicCount)}%)` : ''}.</p>`
            : '';
        return `<article class="f5-eli5-card" id="metric-${escapeAttr(key)}">
          <h4>${escapeHtml(def.label)}</h4>
          <p class="f5-eli5">${escapeHtml(def.eli5)}</p>
          ${coverage}
          <p class="f5-missing-why">${escapeHtml(def.whyMissing || '')}</p>
          ${leaderLine}
          <div class="f5-eli5-actions">${compareBtn}${sortBtn}</div>
        </article>`;
      })
      .join('');
    return `<section class="f5-eli5-group">
      <h3 class="f5-h3">${escapeHtml(group.label)}</h3>
      <p class="f5-section-lede">${escapeHtml(group.kid)}</p>
      <div class="f5-eli5-grid">${cards}</div>
    </section>`;
  }).join('');

  return `
    <div class="f5-learn">
      ${viewTabs()}
      <h2>Every number, like you’re five</h2>
      <p class="f5-section-lede">
        We look for these tags in each public company’s latest 10-K. Not every company has every tag —
        that’s the point. Compare companies on what they <em>share</em>, and treat a blank as unknown.
      </p>
      <div class="f5-note">
        <p><strong>Not in EDGAR Company Facts:</strong> ${escapeHtml(NOT_IN_EDGAR.join(' '))}</p>
      </div>
      ${groups}
    </div>`;
}

function sourceCard(c, src) {
  const href = c[src.urlKey];
  if (!href) return '';
  const jsonBtn = `<a class="f5-open" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${src.id === 'browse' ? 'Open on sec.gov' : 'Open JSON'}</a>`;
  const extra =
    src.id === 'submissions' && c.edgar_filings_browse
      ? `<a class="f5-open f5-open-ghost" href="${escapeAttr(c.edgar_filings_browse)}" target="_blank" rel="noopener noreferrer">Filing browser</a>`
      : '';
  return `<article class="f5-source">
    <div class="f5-source-top">
      <h3>${escapeHtml(src.title)}</h3>
      <span class="f5-source-meta">${escapeHtml(src.api)} · ${escapeHtml(src.format)} · ${escapeHtml(src.cadence)}</span>
    </div>
    <p>${escapeHtml(src.summary)}</p>
    <ul>${src.youGet.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
    ${jsonBtn}${extra}
  </article>`;
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

function featuredCard(headlines, item) {
  const def = lookupDef(item.key);
  if (!def) return '';
  const value = item.source === 'ratio' ? ratioNumber(headlines, item.key) : metricNumber(headlines, item.key);
  const shown =
    item.source === 'ratio'
      ? formatDerived(def, headlines?.ratios?.[item.key])
      : formatMetric(def, headlines?.metrics?.[item.key]);
  return `<article class="f5-kpi">
    <h4>${escapeHtml(def.label)}</h4>
    <p class="val${shown ? '' : ' missing'}">${shown ? escapeHtml(shown) : 'Not tagged'}</p>
    ${shown ? pctPill(value, item.source, item.key) : ''}
    <p class="f5-eli5">${escapeHtml(def.plain)}</p>
  </article>`;
}

function coverageBanner(headlines) {
  const cov = coverageOf(headlines);
  const dots = METRICS.map((m) => {
    const on = cov.tagged.includes(m.key);
    return `<span class="f5-dot${on ? ' is-on' : ''}" title="${escapeAttr(m.label + (on ? ' — tagged' : ' — not tagged'))}"></span>`;
  }).join('');
  return `<div class="f5-coverage">
    <p><strong>${cov.tagged.length} of ${cov.total}</strong> SEC tags found in this 10-K. ${cov.derivedOk.length} of ${DERIVED.length} ratios we can compute from those tags.</p>
    <div class="f5-dots" aria-hidden="true">${dots}</div>
    <p class="f5-section-lede" style="margin:8px 0 0">A blank isn’t zero — banks skip inventory, some retailers have a stale gross-profit tag we refuse to use, and a few companies name the same idea differently.</p>
  </div>`;
}

function metricExplainCard(def, headlines) {
  const source = sourceFor(def.key);
  const shown = lookupShown(headlines, def.key);
  const tagged = shown != null;
  const tagUsed =
    source === 'metric' && headlines?.metrics?.[def.key]?.tag
      ? headlines.metrics[def.key].tag
      : def.tags || '';
  return `<article class="f5-metric ${tagged ? '' : 'is-missing'}">
    <div class="f5-metric-top">
      <h4>${escapeHtml(def.label)}</h4>
      <p class="val${tagged ? '' : ' missing'}">${tagged ? escapeHtml(shown) : 'Not tagged'}</p>
    </div>
    <p class="f5-eli5">${escapeHtml(def.eli5)}</p>
    ${tagged ? '' : `<p class="f5-missing-why">${escapeHtml(def.whyMissing || '')}</p>`}
    ${tagUsed ? `<p class="tags">${escapeHtml(tagUsed)}</p>` : ''}
  </article>`;
}

function publicDetail(c, headlines, status) {
  const alias =
    c.fortune_ticker && c.sec_ticker && c.fortune_ticker !== c.sec_ticker
      ? `<p class="f5-section-lede">Fortune lists this as <strong>${escapeHtml(c.fortune_ticker)}</strong>; the SEC ticker file uses <strong>${escapeHtml(c.sec_ticker)}</strong>. Same company, different symbol.</p>`
      : '';
  const match = MATCH_LABELS[c.match_source] || c.match_source || '';
  let numbers = '';
  if (status === 'loading') {
    numbers = `<p class="f5-section-lede">Loading latest 10-K headlines from the SEC…</p>`;
  } else if (status === 'error') {
    numbers = `<div class="f5-note"><p>Couldn’t load Company Facts (${escapeHtml(headlines?.error || 'network')}). The SEC links below still work.</p></div>`;
  } else if (headlines) {
    const year = headlines.asOfYear ? `FY${headlines.asOfYear}` : 'latest 10-K';
    const groups = METRIC_GROUPS.map((group) => {
      const cards = group.keys
        .map((key) => {
          const def = lookupDef(key);
          return def ? metricExplainCard(def, headlines) : '';
        })
        .join('');
      return `<section class="f5-eli5-group">
        <h3 class="f5-h3">${escapeHtml(group.label)}</h3>
        <p class="f5-section-lede">${escapeHtml(group.kid)}</p>
        <div class="f5-metrics">${cards}</div>
      </section>`;
    }).join('');
    const peers = similarByRevenue(c, companies, snapshotCompanies, 4);
    const peerBtns = peers
      .map((p) => {
        const shown = formatMetric({ unit: 'USD' }, { val: p.revenue });
        return `<button type="button" class="f5-peer" data-peer="${p.company.rank}">${escapeHtml(p.company.company)}<span>${escapeHtml(shown || '')}</span></button>`;
      })
      .join('');
    const suggestions = suggestComparisons(c, companies, snapshotCompanies, 3);
    const suggestBlock = suggestions.length
      ? `<div class="f5-suggest">
          <h3 class="f5-h3">Interesting comparisons</h3>
          <p class="f5-section-lede">Built from metrics this company actually tagged.</p>
          <div class="f5-stories">
            ${suggestions
              .map(
                (s) => `<button type="button" class="f5-story is-story" data-suggest="${escapeAttr(s.id)}" data-suggest-ranks="${s.ranks.join(',')}">
                  <strong>${escapeHtml(s.title)}</strong>
                  <span>${escapeHtml(s.why)}</span>
                </button>`
              )
              .join('')}
          </div>
        </div>`
      : '';
    const peerBlock =
      peers.length >= 2
        ? `<div class="f5-peers">
            <h3 class="f5-h3">Similar scale</h3>
            <p class="f5-section-lede">Closest revenue among public Fortune 500 filers in this snapshot.</p>
            <div class="f5-peer-row">${peerBtns}</div>
            <button type="button" class="f5-peer-compare" data-compare-peers="${c.rank}">Compare with these</button>
          </div>`
        : '';
    numbers = `
      <h3 class="f5-h3">Headline numbers (${escapeHtml(year)})</h3>
      <p class="f5-section-lede">From Company Facts, same annual period as the latest revenue/net-income 10-K. Percentile is vs other public Fortune 500 filers that tagged the same item.</p>
      ${coverageBanner(headlines)}
      <div class="f5-kpis">${FEATURED.map((item) => featuredCard(headlines, item)).join('')}</div>
      ${suggestBlock}
      ${peerBlock}
      ${groups}
    `;
  }
  const inCompare = compareRanks.includes(c.rank);
  const addBtn = inCompare
    ? `<button type="button" class="f5-add-compare" disabled>In compare set</button>`
    : `<button type="button" class="f5-add-compare" data-add-compare="${c.rank}">Add to compare</button>`;
  const sources = `<details class="f5-sec-links">
    <summary>SEC links for this company</summary>
    <p class="f5-section-lede">Raw EDGAR feeds for this CIK — the same files we read. Optional if you just wanted the numbers.</p>
    <div class="f5-sources">${SOURCES.map((s) => sourceCard(c, s)).join('')}</div>
    <p class="f5-section-lede">Not in EDGAR Company Facts: ${escapeHtml(NOT_IN_EDGAR.join(' '))}</p>
  </details>`;
  return `
    <button type="button" class="f5-back" id="back">← All companies</button>
    <div class="f5-company-head">
      <div>
        <p class="f5-kicker">Fortune #${c.rank}</p>
        <h2>${escapeHtml(c.company)}</h2>
        <p class="f5-legal">${escapeHtml(c.sec_name || '')}</p>
      </div>
      <div class="f5-head-actions">
        ${addBtn}
        <span class="f5-pill f5-pill-public">SEC filer</span>
      </div>
    </div>
    ${alias}
    <dl class="f5-dl">
      <div><dt>Fortune ticker</dt><dd>${escapeHtml(c.fortune_ticker || '—')}</dd></div>
      <div><dt>SEC ticker</dt><dd>${escapeHtml(c.sec_ticker || '—')}</dd></div>
      <div><dt>CIK</dt><dd class="mono">${escapeHtml(c.cik_padded || String(c.cik))}</dd></div>
      <div><dt>How we matched</dt><dd>${escapeHtml(match)}</dd></div>
    </dl>
    ${numbers}
    ${sources}
  `;
}

function privateDetail(c) {
  const note = PRIVATE_NOTES[c.rank] || 'Private or mutual — no public 10-K/10-Q ticker in the SEC JSON APIs.';
  return `
    <button type="button" class="f5-back" id="back">← All companies</button>
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
    <p class="f5-section-lede">They stay on the Fortune 500 list so rank gaps are honest. We do not invent numbers or scrape a substitute.</p>
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
  const insights = status === 'ok' ? buildInsights(insightRows, snapshotCompanies) : [];
  const insightBlock = insights.length
    ? `<ul class="f5-insights">${insights.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    : '';
  const overlap = status === 'ok' ? coverageOverlap(insightRows) : null;
  const overlapNote = overlap
    ? `<p class="f5-section-lede">${overlap.shared.length} tags everyone here filed · ${overlap.split.length} tagged by only some · ${overlap.none.length} tagged by none. ${
        overlap.split.length
          ? 'Turn on “shared tags only” to hide rows that aren’t a fair fight.'
          : ''
      }</p>`
    : '';

  const head = names
    .map((c) => {
      const h = rows.find((x) => x.cik === c.cik);
      const fy = h?.asOfYear ? `FY${h.asOfYear}` : '';
      const cov = h ? coverageOf(h) : null;
      const covLine = cov ? `${cov.tagged.length}/${cov.total} tags` : '';
      return `<th><button type="button" class="f5-linkish" data-rank="${c.rank}">${escapeHtml(c.company)}</button><div class="muted">${escapeHtml(c.fortune_ticker || '')} ${fy}${covLine ? ' · ' + covLine : ''}</div></th>`;
    })
    .join('');

  let body = '';
  if (status === 'loading') {
    body = `<tr><td colspan="${names.length + 1}">Loading Company Facts from the SEC…</td></tr>`;
  } else if (status === 'error') {
    body = `<tr><td colspan="${names.length + 1}">Couldn’t reach /api/f500-headlines. On a static server this route doesn’t run — use the deployed site or <code>vercel dev</code>.</td></tr>`;
  } else {
    body = METRIC_GROUPS.map((group) => {
      const keys = group.keys.filter((key) => {
        if (!sharedOnly || !overlap) return true;
        if (METRICS.some((m) => m.key === key)) return overlap.shared.includes(key);
        const def = lookupDef(key);
        if (!def?.needs) return true;
        return def.needs.every((need) => overlap.shared.includes(need));
      });
      if (!keys.length) return '';
      const groupRow = `<tr class="f5-group"><td colspan="${names.length + 1}">${escapeHtml(group.label)} — ${escapeHtml(group.kid)}</td></tr>`;
      const metricRows = keys
        .map((key) => {
          const def = lookupDef(key);
          if (!def) return '';
          const vals = names.map((c) => lookupNumber(rows.find((x) => x.cik === c.cik), key));
          const tds = names
            .map((c, i) => {
              const shown = lookupShown(rows.find((x) => x.cik === c.cik), key);
              const cls = cellClass(vals, vals[i], def.better);
              const title = shown ? '' : def.whyMissing ? ` title="${escapeAttr(def.whyMissing)}"` : '';
              return `<td class="${cls}"${title}>${shown ? escapeHtml(shown) : dash()}</td>`;
            })
            .join('');
          return `<tr>
            <td>
              <button type="button" class="f5-linkish" data-explain="${escapeAttr(key)}">${escapeHtml(def.label)}</button>
              <div class="f5-eli5-mini">${escapeHtml(def.plain)}</div>
            </td>
            ${tds}
          </tr>`;
        })
        .join('');
      return groupRow + metricRows;
    }).join('');
  }

  const chart = status === 'ok' ? barChart(names, rows) : '';
  const toggle = `<label class="f5-shared-toggle"><input type="checkbox" id="shared-only" ${sharedOnly ? 'checked' : ''}/> Shared tags only</label>`;
  const explain = explainKey ? explainBanner(explainKey) : '';

  return `
    <button type="button" class="f5-back" id="back">← All companies</button>
    <h2 class="f5-h3">Compare what they actually filed</h2>
    <p class="f5-section-lede">Latest annual 10-K period per company. Fiscal year-ends can differ (Apple is not calendar). Green = best in the row for “higher/lower is better” metrics; red = worst. Em-dash = not tagged. Tap a metric name for the kid explanation.</p>
    ${insightBlock}
    ${explain}
    ${overlapNote}
    ${toggle}
    ${chart}
    <p class="f5-legend"><span><i class="f5-swatch best"></i>best in row</span><span><i class="f5-swatch worst"></i>worst in row</span></p>
    <div class="f5-table-wrap">
      <table class="f5-table">
        <thead><tr><th>Metric</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
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
  const pulled = window.__f500PulledAt
    ? new Date(window.__f500PulledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  statsEl.innerHTML = `
    <span class="f5-stat"><strong>${companies.length}</strong> Fortune 500</span>
    <span class="f5-stat"><strong>${pub}</strong> public SEC filers</span>
    <span class="f5-stat"><strong>${withFy}</strong> with 10-K figures${pulled ? ' · ' + pulled : ''}</span>
    <span class="f5-stat"><strong>${companies.length - pub}</strong> private / mutual</span>
  `;
  document.getElementById('glossary-list').innerHTML = GLOSSARY.map(
    (g) => `<div><dt>${escapeHtml(g.term)}</dt><dd>${escapeHtml(g.def)}</dd></div>`
  ).join('');
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
