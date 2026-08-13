import {
  PRIVATE_NOTES,
  MAX_COMPARE,
  PRESETS,
  SCREENER_COLUMNS,
  CHART_METRICS,
  RATIO_GROUPS,
  FILED_GROUPS,
  COMPARE_SCALE_GROUP,
  BANK_CASH_KEYS,
  LOWER_BETTER,
  isPublic,
  tickerLabel,
  defFor,
  sourceFor,
} from './catalog.js';
import {
  formatMetric,
  formatDerived,
  formatUsd,
  ensureRatios,
  explainCalculation,
  FLAG_COPY,
  ordinal,
  periodEndOf,
  formatPeriodEnd,
  plausibleMargin,
  MARGIN_KEYS,
} from './extract.js';
import { seedAssumptions, applyScenario, runPracticeModel, effectiveGrowth, MODEL_YEARS } from './model.js';
import {
  PLAYBOOKS,
  GOLDEN_RULES,
  DECISION_TREE,
  guessPlaybook,
  playbookById,
  industryPlaybooks,
  playbookDog,
} from './playbooks.js';
import { buildWorkbookXml, workbookFilename, downloadWorkbook } from './workbook.js';
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
import {
  priceTicker,
  formatPrice,
  formatChangePct,
  sparklineSvg,
  DEFAULT_PRICE_RANGE,
} from './prices.js';

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
const pricesByTicker = new Map();
let snapshotCompanies = {};
let quoteRange = DEFAULT_PRICE_RANGE;

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
let playbookKey = 'saas';
let extraCol = null;
let sharedOnly = false;
let explainKey = 'net_margin';
let companyPane = 'ratios';
let comparePane = 'ratios';
let pickMode = false;
let modelDraft = null;

function hashHome() {
  const hash = (location.hash || '').replace(/^#/, '');
  if (hash === 'learn') return { homeView: 'learn', playbookKey };
  if (hash === 'industries' || hash.startsWith('industries/')) {
    const id = hash.split('/')[1];
    const book = id ? playbookById(id) : null;
    return {
      homeView: 'industries',
      playbookKey: book && book.id === id ? id : playbookKey,
    };
  }
  return { homeView: 'table', playbookKey };
}

function parseUrl() {
  const u = new URL(location.href);
  const raw = u.searchParams.get('compare');
  if (raw) {
    const ranks = raw
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 500)
      .slice(0, MAX_COMPARE);
    return { compareMode: ranks.length >= 2, compareRanks: ranks, selectedRank: null, homeView: 'table' };
  }
  const n = Number(u.searchParams.get('rank'));
  const selectedRank = Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
  if (selectedRank) return { compareMode: false, compareRanks: [], selectedRank, homeView: 'table' };
  return { compareMode: false, compareRanks: [], selectedRank: null, ...hashHome() };
}

function setUrl(opts = {}) {
  const url = new URL(location.href);
  url.searchParams.delete('rank');
  url.searchParams.delete('compare');
  if (opts.compareMode && opts.compareRanks?.length >= 2) {
    url.searchParams.set('compare', opts.compareRanks.join(','));
    url.hash = '';
  } else if (opts.selectedRank) {
    url.searchParams.set('rank', String(opts.selectedRank));
    url.hash = '';
  } else if (homeView === 'learn') {
    url.hash = 'learn';
  } else if (homeView === 'industries') {
    url.hash = playbookKey ? `industries/${playbookKey}` : 'industries';
  } else {
    url.hash = '';
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

function isBankLike(company) {
  return guessPlaybook(company)?.id === 'banking';
}

function bankCashSuppressed(company, key) {
  return Boolean(company) && BANK_CASH_KEYS.has(key) && isBankLike(company);
}

function missingTagHint(def, headlines) {
  if (!def) return '';
  if (def.needs?.length) {
    for (const key of def.needs) {
      if (metricNumber(headlines, key) == null) {
        const m = lookupDef(key);
        const tag = (m?.candidates?.[0]?.tag || m?.tags || key).split(',')[0].trim();
        return `${tag} missing`;
      }
    }
    if (def.key === 'revenue_yoy' && !headlines?.priorRevenue) return 'prior-year revenue missing';
  }
  const tag = (def.candidates?.[0]?.tag || def.tags || '').split(',')[0].trim();
  return tag ? `${tag} missing` : 'not tagged';
}

function flagNote(headlines, key) {
  const code = headlines?.flags?.[key] || headlines?.flags?.revenue;
  if (!code) return '';
  if (key === 'roe' && headlines?.flags?.roe) return FLAG_COPY.thin_equity;
  if (MARGIN_KEYS.includes(key) && headlines?.flags?.[key]) return FLAG_COPY[headlines.flags[key]] || '';
  if (headlines?.flags?.revenue === 'fee_subtotal' && MARGIN_KEYS.includes(key)) return FLAG_COPY.fee_subtotal;
  return '';
}

function edgarLinks(c) {
  const browse = c?.edgar_filings_browse;
  const facts = c?.edgar_companyfacts_api;
  if (!browse && !facts) return '';
  const bits = [];
  if (browse) {
    bits.push(
      `<a class="f5-edgar-link" href="${escapeAttr(browse)}" target="_blank" rel="noopener noreferrer">View 10-K on EDGAR</a>`
    );
  }
  if (facts) {
    bits.push(
      `<a class="f5-edgar-link" href="${escapeAttr(facts)}" target="_blank" rel="noopener noreferrer">Company facts</a>`
    );
  }
  return `<p class="f5-edgar-links">${bits.join(' · ')}</p>`;
}

function fyLabel(headlines) {
  if (headlines?.asOfYear) return `FY${headlines.asOfYear}`;
  return 'No 10-K data parsed yet';
}

function skeletonHtml(rows = 4) {
  const blocks = Array.from({ length: rows }, () => '<div class="f5-skel-line"></div>').join('');
  return `<div class="f5-skel" aria-busy="true" aria-label="Loading companies…"><p class="f5-toolbar-hint">Loading companies…</p>${blocks}</div>`;
}

function quoteMount(c, compact = false) {
  const t = priceTicker(c);
  if (!t) return '';
  return `<div class="f5-price${compact ? ' is-compact' : ''}" data-quote-ticker="${escapeAttr(t)}" data-quote-rank="${c.rank}">
    <p class="f5-toolbar-hint">Loading price…</p>
  </div>`;
}

function quoteHtml(c, data, range, compact = false) {
  if (!data || data.error || data.last == null) {
    return `<p class="f5-toolbar-hint">Price unavailable</p>`;
  }
  const last = formatPrice(data.last, data.currency) || '—';
  const chg = formatChangePct(data.changePct);
  const up = data.changePct != null && data.changePct > 0;
  const down = data.changePct != null && data.changePct < 0;
  const shares = metricNumber(headlinesOf(c), 'shares_out');
  const mcap = shares != null && data.last != null ? data.last * shares : null;
  const mcapShown = mcap != null ? formatUsd(mcap) : null;
  const spark = compact ? '' : sparklineSvg(data.bars);
  const rangeBtns = compact
    ? ''
    : `<div class="f5-price-ranges" role="group" aria-label="Price history range">
        ${['1y', '5y']
          .map(
            (r) =>
              `<button type="button" class="f5-view-tab" data-price-range="${r}" data-price-ticker="${escapeAttr(data.symbol)}" aria-pressed="${range === r}">${r}</button>`
          )
          .join('')}
      </div>`;
  return `
    <div class="f5-price-row">
      <div>
        <p class="f5-price-last">${escapeHtml(last)} <span class="f5-price-chg${up ? ' is-up' : ''}${down ? ' is-down' : ''}">${chg ? escapeHtml(chg) : ''}</span></p>
        ${mcapShown ? `<p class="f5-price-mcap">≈ ${escapeHtml(mcapShown)} mkt cap <span class="muted">(last × shares outstanding)</span></p>` : ''}
        <p class="f5-price-src">Yahoo Finance, delayed, not for trading.</p>
      </div>
      ${spark}
      ${rangeBtns}
    </div>`;
}

async function fetchPrices(ticker, range) {
  const key = `${ticker}|${range}`;
  if (pricesByTicker.has(key)) return pricesByTicker.get(key);
  try {
    const res = await fetch(`/api/f500-prices?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(range)}`);
    const data = res.ok ? await res.json() : { error: 'price unavailable' };
    pricesByTicker.set(key, data);
    return data;
  } catch {
    const data = { error: 'price unavailable' };
    pricesByTicker.set(key, data);
    return data;
  }
}

async function fillQuotes(cos, range = quoteRange, compact = false) {
  const jobs = (cos || []).map(async (c) => {
    const t = priceTicker(c);
    if (!t) return;
    const el = detailEl.querySelector(`[data-quote-ticker="${CSS.escape(t)}"]`);
    if (!el) return;
    try {
      const data = await fetchPrices(t, range);
      if (!detailEl.contains(el)) return;
      el.innerHTML = quoteHtml(c, data, range, compact);
    } catch {
      if (detailEl.contains(el)) el.innerHTML = `<p class="f5-toolbar-hint">Price unavailable</p>`;
    }
  });
  await Promise.all(jobs);
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
  countEl.textContent = `${rows.length} shown${window.__f500Stats ? ' · ' + window.__f500Stats : ''}${pickMode ? ' · picking' : ''}`;
  const html = rows
    .map((c) => {
      const pub = isPublic(c);
      const selected = c.rank === selectedRank && !compareMode;
      const picked = compareRanks.includes(c.rank);
      const nm = formatDerived(lookupDef('net_margin'), headlinesOf(c)?.ratios?.net_margin);
      const right = pub
        ? `<span class="f5-row-fig">${nm ? escapeHtml(nm) : ''}</span>`
        : `<span class="f5-pill f5-pill-private">Private</span>`;
      return `<div class="f5-row${pub ? '' : ' is-private'}${picked ? ' is-picked' : ''}">
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
  return `<div class="f5-view-tabs" role="tablist" aria-label="Table, glossary, or industry models">
    <button type="button" class="f5-view-tab" data-home-view="table" aria-pressed="${homeView === 'table'}">Compare table</button>
    <button type="button" class="f5-view-tab" data-home-view="learn" aria-pressed="${homeView === 'learn'}">What ratios mean</button>
    <button type="button" class="f5-view-tab" data-home-view="industries" aria-pressed="${homeView === 'industries'}">Industry models</button>
  </div>`;
}

function paneTabs(kind, current) {
  const modelTab =
    kind === 'company'
      ? `<button type="button" class="f5-view-tab" data-company-pane="model" aria-pressed="${current === 'model'}">Practice model</button>`
      : '';
  return `<div class="f5-view-tabs" role="tablist" aria-label="Ratios, filed tags, or model">
    <button type="button" class="f5-view-tab" data-${kind}-pane="ratios" aria-pressed="${current === 'ratios'}">Key ratios</button>
    <button type="button" class="f5-view-tab" data-${kind}-pane="filed" aria-pressed="${current === 'filed'}">Filed numbers</button>
    ${modelTab}
  </div>`;
}

function screenerView() {
  if (homeView === 'learn') return learnView();
  if (homeView === 'industries') return industriesView();
  const cols = screenerColumns();
  const rows = sortRows(companies.filter(matches));
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
      const picked = compareRanks.includes(c.rank);
      const tds = cols
        .map((col) => {
          if (col.type === 'name') {
            return `<td class="f5-name-cell"><button type="button" class="f5-linkish" data-rank="${c.rank}">${escapeHtml(c.company)}</button></td>`;
          }
          const value = screenerValue(c, col);
          const extra = col.type === 'rank' ? ' class="mono"' : '';
          return `<td${extra}>${formatScreenerCell(col, value)}</td>`;
        })
        .join('');
      return `<tr class="${pub ? '' : 'is-private'}${picked ? ' is-picked' : ''}" data-row-rank="${c.rank}">${tds}</tr>`;
    })
    .join('');

  const hint = pickMode
    ? 'Click companies to add or remove them. Compare in the bar when you have 2–5.'
    : 'Open a company, or turn on Pick to compare. Dash = ratio ingredients weren’t tagged.';

  return `
    <div class="f5-screener">
      <div class="f5-toolbar">
        ${viewTabs()}
        <button type="button" class="f5-view-tab" data-pick-mode aria-pressed="${pickMode}">Pick to compare</button>
        <p class="f5-toolbar-hint">${hint}</p>
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

function listBlock(title, items) {
  if (!items?.length) return '';
  return `<div class="f5-info-block">
    <h4>${escapeHtml(title)}</h4>
    <ul class="f5-play-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </div>`;
}

function playbookBody(playbook) {
  const dog = playbookDog(playbook);
  return `
    <p class="f5-quote"><img src="${escapeAttr(dog)}" alt="" width="28" height="28">${escapeHtml(playbook.quote)}</p>
    <p class="f5-eli5">${escapeHtml(playbook.intro)}</p>
    <div class="f5-calc">
      <p class="f5-kicker">Core formula</p>
      <pre class="f5-calc-eq">${escapeHtml(playbook.formula)}</pre>
    </div>
    <div class="f5-dock-cols">
      ${listBlock('Key inputs', playbook.inputs)}
      ${listBlock('Key metrics', playbook.metrics)}
    </div>
    ${
      playbook.subs?.length
        ? `<p class="f5-kicker">Sub-industries</p><div class="f5-subs">${playbook.subs
            .map((s) => `<span class="f5-sub-tag">${escapeHtml(s)}</span>`)
            .join('')}</div>`
        : ''
    }`;
}

function playbookDock(id) {
  const playbook = playbookById(id);
  return `<aside class="f5-dock" id="playbook-dock">
    <p class="f5-kicker">${escapeHtml(playbook.subtitle)}</p>
    <h3>${escapeHtml(playbook.label)}</h3>
    ${playbookBody(playbook)}
    <ol class="f5-model-rules">${GOLDEN_RULES.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ol>
  </aside>`;
}

function industriesView() {
  const books = industryPlaybooks();
  const selected = playbookById(playbookKey);
  const tree = DECISION_TREE.map(
    (step) => `<div class="f5-calc f5-tree-step">
      <p class="f5-kicker">Q${step.n}</p>
      <p class="f5-tree-q">${escapeHtml(step.q)}</p>
      <div class="f5-tree-opts">
        ${step.picks
          .map(
            (pick) =>
              `<button type="button" class="f5-tree-chip${playbookKey === pick.id ? ' is-on' : ''}" data-playbook="${escapeAttr(pick.id)}">${escapeHtml(pick.label)}</button>`
          )
          .join('')}
      </div>
      ${step.no ? `<p class="muted">${escapeHtml(step.no)}</p>` : ''}
    </div>`
  ).join('');
  const cards = books
    .map(
      (p, i) => `<button type="button" class="f5-tile f5-play-card${p.id === selected.id ? ' is-on' : ''}" data-playbook="${escapeAttr(p.id)}">
        <span class="f5-tile-label">${String(i + 1).padStart(2, '0')}</span>
        <span class="f5-tile-val">${escapeHtml(p.label)}</span>
        <span class="muted">${escapeHtml(p.subtitle)}</span>
      </button>`
    )
    .join('');
  return `
    <div class="f5-workspace">
      <div class="f5-workspace-main">
        <div class="f5-toolbar">${viewTabs()}</div>
        <p class="f5-toolbar-hint">Four questions to pick a starting model, then the industry for formulas, inputs, and metrics. Practice them on a company 10-K.</p>
        <div class="f5-tree">${tree}</div>
        <h3 class="f5-model-sub">${books.length} industries</h3>
        <div class="f5-play-grid">${cards}</div>
      </div>
      ${playbookDock(selected.id)}
    </div>`;
}

function renderCalcParts(expl) {
  if (!expl?.parts?.length) return '';
  return `<ul class="f5-calc-parts">${expl.parts
    .map((p) => {
      if (p.missing) {
        return `<li class="muted">${escapeHtml(p.label)} — not tagged in this 10-K</li>`;
      }
      const meta = [p.tag, p.form, p.end ? `period ending ${p.end}` : '', p.filed ? `filed ${p.filed}` : '']
        .filter(Boolean)
        .join(' · ');
      return `<li><strong>${escapeHtml(p.label)}</strong> ${escapeHtml(p.shown || '')}${
        meta ? `<div class="muted">${escapeHtml(meta)}</div>` : ''
      }</li>`;
    })
    .join('')}</ul>`;
}

function calcBlock(expl, name) {
  if (!expl) return '';
  const who = name ? `<p class="f5-kicker">${escapeHtml(name)}</p>` : '';
  const eq = expl.arithmetic
    ? `<p class="f5-calc-eq">${escapeHtml(expl.arithmetic)}</p>`
    : `<p class="muted">A tagged ingredient is missing, so we don’t compute this.</p>`;
  return `<div class="f5-calc">${who}${eq}${renderCalcParts(expl)}</div>`;
}

function explainDock(key, headlines, comparePairs, company) {
  const def = lookupDef(key);
  if (!def) {
    return `<aside class="f5-dock"><p class="muted">Tap a ratio to see what it means.</p></aside>`;
  }
  const source = sourceFor(key);
  const bank = bankCashSuppressed(company, key);
  const shown = bank ? null : headlines ? lookupShown(headlines, key) : null;
  const value = bank ? null : headlines ? lookupNumber(headlines, key) : null;
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

  let calcHtml = '';
  if (comparePairs?.length) {
    const lines = comparePairs
      .filter((p) => p.company)
      .map((p) => {
        const expl = p.headlines ? explainCalculation(p.headlines, key) : null;
        return `<p class="f5-calc-line"><strong>${escapeHtml(p.company.company)}</strong> ${escapeHtml(expl?.arithmetic || '—')}</p>`;
      })
      .join('');
    calcHtml = `<div class="f5-calc">${lines}<p class="muted">Open a company to see the XBRL tags in the equation.</p></div>`;
  } else if (headlines) {
    calcHtml = calcBlock(explainCalculation(headlines, key));
  } else {
    calcHtml = `<p class="muted">Open a company to plug its 10-K numbers into ${escapeHtml(def.formula || 'this formula')}.</p>`;
  }

  return `<aside class="f5-dock">
    <p class="f5-kicker">${escapeHtml(def.formula || 'Key ratio')}</p>
    <h3>${escapeHtml(def.label)}${shown ? ` · ${escapeHtml(shown)}` : ''}</h3>
    ${shown && headlines ? pctPill(value, source, key, headlines) : ''}
    ${bank ? `<p class="f5-flag">${escapeHtml(FLAG_COPY.bank_cash)}</p>` : ''}
    ${!bank && headlines?.flags?.[key] === 'thin_equity' ? `<p class="f5-flag">${escapeHtml(FLAG_COPY.thin_equity)}</p>` : ''}
    ${
      !bank &&
      (headlines?.flags?.[key] === 'impossible_margin' ||
        (headlines?.flags?.revenue === 'fee_subtotal' && MARGIN_KEYS.includes(key)))
        ? `<p class="f5-flag">${escapeHtml(flagNote(headlines, key) || FLAG_COPY.impossible_margin)}</p>`
        : ''
    }
    ${calcHtml}
    <p class="f5-eli5">${escapeHtml(def.eli5)}</p>
    ${shown || comparePairs?.length ? '' : `<p class="f5-missing-why">${escapeHtml(def.whyMissing || '')}</p>`}
    <p class="f5-coverage-line"><strong>${n}</strong> / ${publicCount} public companies have this.</p>
    ${leaderLine}
    ${company ? edgarLinks(company) : comparePairs?.[0]?.company ? edgarLinks(comparePairs[0].company) : ''}
    <div class="f5-eli5-actions">${compareBtn}${sortBtn}</div>
  </aside>`;
}

function currentPlaybook(company) {
  if (modelDraft && modelDraft.rank === selectedRank && modelDraft.playbookId) {
    return playbookById(modelDraft.playbookId);
  }
  return guessPlaybook(company);
}

function modelAssumptions(headlines, company) {
  if (modelDraft && modelDraft.rank === selectedRank) {
    return {
      years: MODEL_YEARS,
      ...modelDraft,
    };
  }
  return seedAssumptions(headlines, guessPlaybook(company));
}

function signedUsd(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const shown = formatUsd(Math.abs(n));
  if (!shown) return '—';
  return n > 0 ? `+${shown}` : `−${shown}`;
}

function driverField(key, label, value, help, extraKey) {
  const attr = extraKey ? `data-driver="${escapeAttr(key)}" data-extra="${escapeAttr(extraKey)}"` : `data-driver="${escapeAttr(key)}"`;
  const empty = value == null || !Number.isFinite(value);
  const shown = empty ? '' : (value * 100).toFixed(1);
  const min = extraKey === 'nrr' ? 80 : -20;
  const max = extraKey === 'nrr' ? 150 : 40;
  const range = empty
    ? ''
    : `<input type="range" min="${min}" max="${max}" step="0.5" ${attr} data-scale="pct" value="${shown}" />`;
  return `<label class="f5-driver" title="${escapeAttr(help || '')}">
    <span>${escapeHtml(label)}${empty ? ' <span class="muted">practice</span>' : ''}</span>
    <span class="f5-driver-controls">
      ${range}
      <input class="f5-model-input" type="number" step="0.1" ${attr} data-scale="pct" value="${shown}" placeholder="—" />
    </span>
  </label>`;
}

function modelLiveHtml(c, headlines) {
  const playbook = currentPlaybook(c);
  const a = modelAssumptions(headlines, c);
  const model = runPracticeModel(headlines, a, playbook);
  if (!model.ok) return `<p class="f5-toolbar-hint">${escapeHtml(model.reason)}</p>`;
  const rows = model.rows
    .map(
      (r) => `<tr class="${r.filed ? 'is-on' : ''}">
        <td>${r.filed ? `FY${r.year} filed` : `FY${r.year}`}</td>
        <td>${escapeHtml(formatUsd(r.revenue) || '—')}</td>
        <td>${r.netIncome == null ? '—' : escapeHtml(formatUsd(r.netIncome))}</td>
        <td>${r.fcf == null ? '—' : escapeHtml(formatUsd(r.fcf))}</td>
        <td>${r.grossProfit == null ? '—' : escapeHtml(formatUsd(r.grossProfit))}</td>
      </tr>`
    )
    .join('');
  const last = model.rows[model.rows.length - 1];
  const g = formatDerived(lookupDef('revenue_yoy'), model.growth) || '—';
  const implied = formatDerived(lookupDef('revenue_yoy'), model.impliedGrowth) || '—';
  const sens = model.sensitivity;
  const sensHead = `<th></th>${sens.cols.map((col) => `<th>${escapeHtml(((col || 0) * 100).toFixed(1))}%</th>`).join('')}`;
  const sensBody = sens.rows
    .map((r) => {
      const on = Math.abs(r.growth - model.growth) < 1e-9;
      return `<tr class="${on ? 'is-on' : ''}"><th>${escapeHtml((r.growth * 100).toFixed(1))}%</th>${r.cells
        .map((cell) => `<td>${cell == null ? '—' : escapeHtml(formatUsd(cell) || '—')}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  return `
    <p class="f5-model-delta">FY${last.year} vs filed:
      revenue <strong>${escapeHtml(signedUsd(model.vsFiled.revenue))}</strong>
      · NI <strong>${escapeHtml(signedUsd(model.vsFiled.netIncome))}</strong>
      · FCF <strong>${escapeHtml(signedUsd(model.vsFiled.fcf))}</strong>
      · effective growth <strong>${escapeHtml(g)}</strong>${
        playbook.extras?.length ? ` <span class="muted">(from industry drivers ${escapeHtml(implied)})</span>` : ''
      }
    </p>
    <div class="f5-table-wrap">
      <table class="f5-table">
        <thead><tr><th>Year</th><th>Revenue</th><th>Net income</th><th>FCF</th><th>Gross profit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <h3 class="f5-model-sub">Sensitivity — year-5 net income (growth ↓, net margin →)</h3>
    <div class="f5-table-wrap">
      <table class="f5-table f5-sens-table">
        <thead><tr>${sensHead}</tr></thead>
        <tbody>${sensBody}</tbody>
      </table>
    </div>
    <ul class="f5-model-notes">${model.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
}

function modelDock(headlines, company) {
  const playbook = currentPlaybook(company);
  const a = modelAssumptions(headlines, company);
  const growth = formatDerived(lookupDef('revenue_yoy'), effectiveGrowth(a, playbook)) || '—';
  return `<aside class="f5-dock" id="model-dock">
    <p class="f5-kicker">${escapeHtml(playbook.subtitle)}</p>
    <h3>${escapeHtml(playbook.label)}</h3>
    ${playbookBody(playbook)}
    <p class="f5-coverage-line">Effective growth ${escapeHtml(growth)} · year 0 is filed, everything else is practice.</p>
    <p class="f5-leaders"><button type="button" class="f5-linkish" data-home-view="industries" data-playbook="${escapeAttr(playbook.id)}">All industry models</button></p>
  </aside>`;
}

function modelPanel(headlines, company) {
  const playbook = currentPlaybook(company);
  const a = modelAssumptions(headlines, company);
  const model = runPracticeModel(headlines, a, playbook);
  if (!model.ok) {
    return `${paneTabs('company', 'model')}<p class="f5-toolbar-hint">${escapeHtml(model.reason)}</p>`;
  }
  const options = PLAYBOOKS.map(
    (p) =>
      `<option value="${escapeAttr(p.id)}" ${p.id === playbook.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
  ).join('');
  const extras = (playbook.extras || [])
    .map((field) => driverField(field.key, field.label, a.extras?.[field.key], field.help, field.key))
    .join('');
  const scenarios = ['base', 'bull', 'bear']
    .map(
      (s) =>
        `<button type="button" class="f5-view-tab" data-scenario="${s}" aria-pressed="${a.scenario === s}">${s}</button>`
    )
    .join('');
  return `
    ${paneTabs('company', 'model')}
    <p class="f5-toolbar-hint">Year 0 is the 10-K. Change drivers and watch the sheet. Industry templates live on this page.</p>
    <div class="f5-model-toolbar">
      <label class="f5-playbook-pick">Industry
        <select id="model-playbook">${options}</select>
      </label>
      <div class="f5-view-tabs" role="tablist" aria-label="Scenario">${scenarios}</div>
      <button type="button" class="f5-mini f5-mini-ghost" id="model-reset">Reset to 10-K</button>
      <button type="button" class="f5-mini" id="model-xlsx">Download Excel</button>
    </div>
    <form class="f5-model-form" id="model-form">
      ${extras}
      ${playbook.extras?.length ? '' : driverField('revenueGrowth', 'Rev growth % / yr', a.revenueGrowth, 'Used when there is no industry split.')}
      ${driverField('netMargin', 'Net margin %', a.netMargin, 'Keep-the-dollar rate from the 10-K, unless you change it.')}
      ${driverField('fcfMargin', 'FCF margin %', a.fcfMargin, 'Free cash flow / sales.')}
      ${driverField('grossMargin', 'Gross margin %', a.grossMargin, 'Blank if the 10-K did not tag gross profit.')}
    </form>
    <div id="model-live">${modelLiveHtml(company, headlines)}</div>`;
}

function pctPill(value, source, key, headlines) {
  if (MARGIN_KEYS.includes(key) && !plausibleMargin(value)) return '';
  const invert = LOWER_BETTER.has(key);
  const pctile = percentile(value, poolFor(snapshotCompanies, source, key), invert);
  if (pctile == null) return '';
  const tone = pctile >= 75 ? 'high' : pctile <= 25 ? 'low' : 'mid';
  const title = invert
    ? 'Lower is better; percentile is inverted among public Fortune 500 filers with this tag'
    : 'Among public Fortune 500 filers with this tag in the snapshot';
  const flag = headlines?.flags?.[key] === 'thin_equity' ? ' · check equity base' : '';
  return `<span class="f5-pct f5-pct-${tone}" title="${escapeAttr(title)}">${ordinal(pctile)} percentile${flag}</span>`;
}

function ratioTile(def, headlines, company) {
  const bank = bankCashSuppressed(company, def.key);
  const shown = bank ? null : lookupShown(headlines, def.key);
  const on = explainKey === def.key;
  const miss = !shown ? (bank ? 'n/a for banks' : missingTagHint(def, headlines)) : '';
  const flag = shown && headlines?.flags?.[def.key] === 'thin_equity' ? 'check equity base' : '';
  return `<button type="button" class="f5-tile${on ? ' is-on' : ''}${shown ? '' : ' is-missing'}" data-explain="${escapeAttr(def.key)}" title="${escapeAttr(miss || flag || def.label)}">
    <span class="f5-tile-label">${escapeHtml(def.label)}</span>
    <span class="f5-tile-val">${shown ? escapeHtml(shown) : '—'}</span>
    ${miss ? `<span class="f5-tile-miss">${escapeHtml(miss)}</span>` : ''}
    ${flag ? `<span class="f5-tile-flag">${escapeHtml(flag)}</span>` : ''}
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
    ? `<button type="button" class="f5-add-compare" data-toggle-compare="${c.rank}">Remove</button>`
    : `<button type="button" class="f5-add-compare" data-toggle-compare="${c.rank}">Add to compare</button>`;
  let main = '';
  let dock = '';
  if (status === 'loading') {
    main = skeletonHtml(5);
  } else if (status === 'error') {
    main = `<p class="f5-toolbar-hint">Couldn’t load Company Facts (${escapeHtml(headlines?.error || 'network')}).</p>`;
  } else if (headlines) {
    const year = fyLabel(headlines);
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
        <p class="f5-toolbar-hint">${escapeHtml(year)} · ${cov.tagged.length}/${cov.total} tags · ${cov.derivedOk.length} ratios · a dash is not zero</p>
        ${suggest}
        <div class="f5-table-wrap">
          <table class="f5-table">
            <thead><tr><th>Tag</th><th>Value</th><th>XBRL</th></tr></thead>
            ${tables}
          </table>
        </div>`;
      dock = explainDock(explainKey, headlines, null, c);
    } else if (companyPane === 'model') {
      main = `${suggest}${modelPanel(headlines, c)}`;
      dock = modelDock(headlines, c);
    } else {
      const groups = RATIO_GROUPS.map((group) => {
        const tiles = group.keys
          .map((key) => {
            const def = lookupDef(key);
            return def ? ratioTile(def, headlines, c) : '';
          })
          .join('');
        return `<section class="f5-tile-group">
          <h3>${escapeHtml(group.label)}</h3>
          <div class="f5-tiles">${tiles}</div>
        </section>`;
      }).join('');
      main = `
        ${paneTabs('company', companyPane)}
        <p class="f5-toolbar-hint">${escapeHtml(year)} · ${cov.derivedOk.length} ratios from ${cov.tagged.length}/${cov.total} tagged items · tap a tile for the 10-K math</p>
        ${suggest}
        ${groups}`;
      dock = explainDock(explainKey, headlines, null, c);
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
            ${edgarLinks(c)}
          </div>
          <div class="f5-head-actions">${addBtn}</div>
        </div>
        ${quoteMount(c)}
        ${main}
      </div>
      ${status === 'ok' || headlines ? dock : `<aside class="f5-dock">${skeletonHtml(3)}</aside>`}
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

function median(nums) {
  const s = (nums || []).filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function compareView(rows, status) {
  const names = compareRanks.map((r) => companyByRank(r)).filter(Boolean);
  const insightRows = names.map((c) => ({
    company: c,
    headlines: rows.find((x) => x.cik === c.cik),
  }));
  const insights = status === 'ok' ? buildInsights(insightRows, snapshotCompanies).slice(0, 3) : [];
  const groups =
    comparePane === 'filed' ? FILED_GROUPS : [COMPARE_SCALE_GROUP, ...RATIO_GROUPS];
  const colCount = names.length + 2;

  const head = names
    .map((c) => {
      const h = rows.find((x) => x.cik === c.cik);
            const fy = !h ? '' : h.asOfYear ? `FY${h.asOfYear}` : fyLabel(h);
      const ended = formatPeriodEnd(periodEndOf(h));
      return `<th><button type="button" class="f5-linkish" data-rank="${c.rank}">${escapeHtml(c.company)}</button>
        <div class="muted">${escapeHtml(c.fortune_ticker || '')} ${escapeHtml(fy)}${ended ? ` · ${escapeHtml(ended)}` : ''}</div>
        ${quoteMount(c, true)}</th>`;
    })
    .join('');

  const renderMetricRow = (key) => {
    const def = lookupDef(key);
    if (!def) return '';
    const vals = names.map((c) => {
      const h = rows.find((x) => x.cik === c.cik);
      if (bankCashSuppressed(c, key)) return null;
      return lookupNumber(h, key);
    });
    const tds = names
      .map((c, i) => {
        const h = rows.find((x) => x.cik === c.cik);
        if (bankCashSuppressed(c, key)) {
          return `<td class="muted" title="${escapeAttr(FLAG_COPY.bank_cash)}">n/a (bank)</td>`;
        }
        const shown = lookupShown(h, key);
        const cls = cellClass(vals, vals[i], def.better);
        return `<td class="${cls}">${shown ? escapeHtml(shown) : dash()}</td>`;
      })
      .join('');
    const med = median(vals);
    const medShown =
      med == null
        ? '—'
        : sourceFor(key) === 'metric'
          ? formatMetric(def, { val: med })
          : formatDerived(def, med);
    const on = explainKey === key ? ' is-on' : '';
    return `<tr class="${on.trim()}">
      <td><button type="button" class="f5-linkish" data-explain="${escapeAttr(key)}">${escapeHtml(def.label)}</button></td>
      ${tds}
      <td class="muted">${medShown ? escapeHtml(medShown) : '—'}</td>
    </tr>`;
  };

  let body = '';
  if (status === 'loading') {
    body = `<tr><td colspan="${colCount}">${skeletonHtml(3)}</td></tr>`;
  } else if (status === 'error') {
    body = `<tr><td colspan="${colCount}">Couldn’t reach /api/f500-headlines.</td></tr>`;
  } else {
    body = groups
      .map((group) => {
        const keys = group.keys.filter((key) => {
          if (!sharedOnly) return true;
          return names.every((c) => {
            const h = rows.find((x) => x.cik === c.cik);
            if (bankCashSuppressed(c, key)) return false;
            return lookupNumber(h, key) != null;
          });
        });
        if (!keys.length) return '';
        const groupRow = `<tr class="f5-group"><td colspan="${colCount}">${escapeHtml(group.label)}</td></tr>`;
        return groupRow + keys.map(renderMetricRow).join('');
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
            <thead><tr><th></th>${head}<th>Median</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
      ${status === 'loading' ? `<aside class="f5-dock">${skeletonHtml(3)}</aside>` : explainDock(explainKey, null, insightRows)}
    </div>`;
}

function paintCompare(rows, status) {
  detailEl.innerHTML = compareView(rows, status);
  if (status === 'ok') {
    const names = compareRanks.map(companyByRank).filter((c) => c && isPublic(c));
    fillQuotes(names, '1y', true);
  }
}
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
    paintCompare([], 'loading');
    try {
      const rows = await fetchHeadlines(names.map((c) => c.cik));
      if (!compareMode) return;
      lastCompareRows = rows.filter(Boolean);
      lastCompareStatus = 'ok';
      paintCompare(lastCompareRows, 'ok');
    } catch {
      if (!compareMode) return;
      lastCompareRows = [];
      lastCompareStatus = 'error';
      paintCompare([], 'error');
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
  fillQuotes([c], quoteRange);
  if (cached) return;
  try {
    const [row] = await fetchHeadlines([c.cik]);
    if (selectedRank !== c.rank || compareMode) return;
    detailEl.innerHTML = publicDetail(c, row, row?.error ? 'error' : 'ok');
    fillQuotes([c], quoteRange);
  } catch (err) {
    if (selectedRank !== c.rank || compareMode) return;
    detailEl.innerHTML = publicDetail(c, { error: err.message }, 'error');
    fillQuotes([c], quoteRange);
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
  pickMode = false;
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
  else {
    renderCompareBar();
    renderDetail();
  }
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
  const btn = e.target.closest('[data-rank]');
  if (!btn) return;
  const rank = Number(btn.dataset.rank);
  if (pickMode) {
    const c = companyByRank(rank);
    if (c && isPublic(c)) {
      toggleCompare(rank, !compareRanks.includes(rank));
      return;
    }
  }
  select(rank);
});

detailEl.addEventListener('click', (e) => {
  if (e.target.closest('#back')) {
    select(null);
    return;
  }
  if (e.target.closest('#model-reset')) {
    modelDraft = null;
    renderDetail();
    return;
  }
  if (e.target.closest('#model-xlsx')) {
    const c = companyByRank(selectedRank);
    const headlines = headlinesOf(c);
    if (!c || !headlines) return;
    const playbook = currentPlaybook(c);
    const assumptions = modelAssumptions(headlines, c);
    const model = runPracticeModel(headlines, assumptions, playbook);
    if (!model.ok) return;
    downloadWorkbook(
      workbookFilename(c),
      buildWorkbookXml({ company: c, headlines, assumptions, model, playbook })
    );
    return;
  }
  const scenarioBtn = e.target.closest('[data-scenario]');
  if (scenarioBtn && selectedRank) {
    const c = companyByRank(selectedRank);
    const headlines = headlinesOf(c);
    const book = currentPlaybook(c);
    const base = seedAssumptions(headlines, book);
    modelDraft = { ...applyScenario(base, scenarioBtn.dataset.scenario), rank: selectedRank, playbookId: book.id };
    renderDetail();
    return;
  }
  const check = e.target.closest('[data-check]');
  if (check) {
    e.stopPropagation();
    toggleCompare(Number(check.dataset.check), check.checked);
    return;
  }
  const pickBtn = e.target.closest('[data-pick-mode]');
  if (pickBtn) {
    pickMode = !pickMode;
    if (!selectedRank && !compareMode) renderDetail();
    return;
  }
  const rowRank = e.target.closest('tr[data-row-rank]');
  if (pickMode && rowRank && !selectedRank && !compareMode) {
    const rank = Number(rowRank.dataset.rowRank);
    const c = companyByRank(rank);
    if (c && isPublic(c) && !e.target.closest('[data-sort]')) {
      e.preventDefault();
      toggleCompare(rank, !compareRanks.includes(rank));
      return;
    }
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
    paintCompare(lastCompareRows, lastCompareStatus);
    return;
  }
  const toggleCmp = e.target.closest('[data-toggle-compare]');
  if (toggleCmp) {
    const rank = Number(toggleCmp.dataset.toggleCompare);
    toggleCompare(rank, !compareRanks.includes(rank));
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
    if (compareRanks.length >= 2) {
      const ok = window.confirm('Replace the current compare set with peers by trailing 10-K revenue?');
      if (!ok) return;
    }
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
  const playBtn = e.target.closest('[data-playbook]');
  if (playBtn) {
    const id = playBtn.dataset.playbook;
    if (id && playbookById(id).id === id) playbookKey = id;
    if (playBtn.dataset.homeView === 'industries' || homeView === 'industries') {
      homeView = 'industries';
      compareMode = false;
      selectedRank = null;
      applyState();
    }
    return;
  }
  const viewBtn = e.target.closest('[data-home-view]');
  if (viewBtn) {
    const v = viewBtn.dataset.homeView;
    homeView = v === 'learn' || v === 'industries' ? v : 'table';
    compareMode = false;
    selectedRank = null;
    applyState();
    return;
  }
  const companyPaneBtn = e.target.closest('[data-company-pane]');
  if (companyPaneBtn) {
    const pane = companyPaneBtn.dataset.companyPane;
    companyPane = pane === 'filed' || pane === 'model' ? pane : 'ratios';
    renderDetail();
    return;
  }
  const comparePaneBtn = e.target.closest('[data-compare-pane]');
  if (comparePaneBtn) {
    comparePane = comparePaneBtn.dataset.comparePane === 'filed' ? 'filed' : 'ratios';
    if (compareMode) paintCompare(lastCompareRows, lastCompareStatus);
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
    const criterion =
      suggest.dataset.suggest === 'similar'
        ? 'peers by trailing 10-K revenue'
        : suggest.getAttribute('title') || 'this suggested set';
    if (compareRanks.length >= 2) {
      const ok = window.confirm(`Replace the current compare set with ${criterion}?`);
      if (!ok) return;
    }
    compareRanks = ranks
      .filter((r) => {
        const c = companyByRank(r);
        return c && isPublic(c);
      })
      .slice(0, MAX_COMPARE);
    if (compareRanks.length >= 2) openCompare();
    return;
  }
  const priceRange = e.target.closest('[data-price-range]');
  if (priceRange) {
    const next = priceRange.dataset.priceRange === '1y' ? '1y' : '5y';
    quoteRange = next;
    const c = companyByRank(selectedRank);
    if (c) fillQuotes([c], quoteRange);
    return;
  }
  const explain = e.target.closest('[data-explain]');
  if (explain) {
    explainKey = explain.dataset.explain;
    if (compareMode) paintCompare(lastCompareRows, lastCompareStatus);
    else if (selectedRank) renderDetail();
    else if (homeView === 'learn') detailEl.innerHTML = learnView();
    else if (homeView === 'industries') detailEl.innerHTML = industriesView();
    return;
  }
});

function applyDriverInput(el) {
  const c = companyByRank(selectedRank);
  const headlines = headlinesOf(c);
  if (!c || !headlines) return;
  const current = modelAssumptions(headlines, c);
  const raw = Number(el.value);
  if (!Number.isFinite(raw)) return;
  const value = el.dataset.scale === 'pct' ? raw / 100 : raw;
  const next = {
    rank: selectedRank,
    ...current,
    extras: { ...(current.extras || {}) },
    scenario: 'custom',
    playbookId: currentPlaybook(c).id,
  };
  if (el.dataset.extra) next.extras[el.dataset.extra] = value;
  else if (el.dataset.driver) next[el.dataset.driver] = value;
  modelDraft = next;
  const live = document.getElementById('model-live');
  if (live) live.innerHTML = modelLiveHtml(c, headlines);
  const dock = document.getElementById('model-dock');
  if (dock) dock.outerHTML = modelDock(headlines, c);
  const shown = (value * 100).toFixed(1);
  const key = el.dataset.driver;
  for (const other of detailEl.querySelectorAll(`[data-driver="${key}"]`)) {
    if (other !== el) other.value = shown;
  }
}

detailEl.addEventListener('input', (e) => {
  const el = e.target.closest('[data-driver]');
  if (!el || !selectedRank) return;
  applyDriverInput(el);
});

detailEl.addEventListener('change', (e) => {
  if (e.target.id === 'shared-only') {
    sharedOnly = e.target.checked;
    if (compareMode) paintCompare(lastCompareRows, lastCompareStatus);
    return;
  }
  if (e.target.id === 'model-playbook' && selectedRank) {
    const c = companyByRank(selectedRank);
    const headlines = headlinesOf(c);
    const book = playbookById(e.target.value);
    modelDraft = { ...seedAssumptions(headlines, book), rank: selectedRank, playbookId: book.id, scenario: 'base' };
    renderDetail();
  }
});

presetsEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  applyPreset(btn.dataset.preset);
});

function openHomeView(view) {
  return (e) => {
    e?.preventDefault();
    homeView = view;
    compareMode = false;
    selectedRank = null;
    applyState();
    if (window.matchMedia('(max-width: 820px)').matches) {
      detailEl.scrollIntoView({ block: 'start' });
    }
  };
}

document.getElementById('nav-learn')?.addEventListener('click', openHomeView('learn'));
document.getElementById('nav-industries')?.addEventListener('click', openHomeView('industries'));
document.getElementById('glossary-learn')?.addEventListener('click', openHomeView('learn'));

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
  homeView = s.homeView || 'table';
  if (s.playbookKey) playbookKey = s.playbookKey;
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
  homeView = s.homeView || 'table';
  if (s.playbookKey) playbookKey = s.playbookKey;
  applyState({ replace: true, fromPop: true });
} catch (err) {
  detailEl.innerHTML = `<p class="f5-error">${escapeHtml(err.message)}</p>`;
}
