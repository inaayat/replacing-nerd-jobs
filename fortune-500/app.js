import {
  SOURCES,
  METRICS,
  DERIVED,
  GLOSSARY,
  PRIVATE_NOTES,
  MATCH_LABELS,
  isPublic,
  tickerLabel,
} from './catalog.js';
import { formatMetric, formatDerived } from './extract.js';

const listEl = document.getElementById('list');
const detailEl = document.getElementById('detail');
const countEl = document.getElementById('count');
const statsEl = document.getElementById('stats');
const searchEl = document.getElementById('search');
const layoutEl = document.getElementById('layout');
const compareBar = document.getElementById('compare-bar');
const compareLabel = document.getElementById('compare-label');
const compareGo = document.getElementById('compare-go');
const compareClear = document.getElementById('compare-clear');

const MAX_COMPARE = 4;
const headlinesByCik = new Map();

let companies = [];
let filter = 'all';
let query = '';
let selectedRank = null;
let compareRanks = [];
let compareMode = false;

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

function renderCompareBar() {
  const n = compareRanks.length;
  compareBar.hidden = n === 0;
  document.body.style.paddingBottom = n === 0 ? '' : '72px';
  compareLabel.textContent =
    n === 0
      ? ''
      : n === 1
        ? '1 company selected — pick 1–3 more to compare'
        : `${n} companies selected`;
  compareGo.disabled = n < 2;
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
      return `<div class="f5-row${pub ? '' : ' is-private'}">
        ${check}
        <button type="button" class="f5-row-main" data-rank="${c.rank}" aria-selected="${selected}">
          <span class="f5-rank">${c.rank}</span>
          <span>
            <span class="f5-row-name">${escapeHtml(c.company)}</span>
            <span class="f5-row-sub">${escapeHtml(tickerLabel(c))}${pub && c.sec_name ? ' · ' + escapeHtml(c.sec_name) : ''}</span>
          </span>
          <span class="f5-pill ${pub ? 'f5-pill-public' : 'f5-pill-private'}">${pub ? 'SEC filer' : 'Private'}</span>
        </button>
      </div>`;
    })
    .join('');
  listEl.innerHTML = html || `<p class="f5-count" style="padding:12px">No matches.</p>`;
  renderCompareBar();
}

function primer() {
  return `
    <div class="f5-empty">
      <h2>Start with a company — or compare a few</h2>
      <p class="f5-section-lede">
        EDGAR is the SEC’s public filing cabinet. Check two to four <strong>SEC filer</strong>
        boxes, then <strong>Compare headlines</strong> to line up the latest 10-K numbers.
        Click a name to see that company’s feeds and tags.
      </p>
      <div class="f5-note">
        <p><strong>What “not tagged” means.</strong> Company Facts is a giant JSON of XBRL tags. A bank often has no <code>GrossProfit</code>; Amazon’s last <code>GrossProfit</code> point is from 2009. We only show a number if it is from the same annual period as that company’s latest revenue/net income 10-K. A blank is “this tag isn’t in the current 10-K,” not $0.</p>
      </div>
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

function metricCard(def, point) {
  const shown = formatMetric(def, point);
  return `<article class="f5-metric">
    <h4>${escapeHtml(def.label)}</h4>
    <p class="val${shown ? '' : ' missing'}">${shown ? escapeHtml(shown) : 'Not tagged'}</p>
    <p>${escapeHtml(def.plain)}</p>
    <p class="tags">${escapeHtml(def.tags)}${point?.end ? ' · ' + escapeHtml(point.end) : ''}</p>
  </article>`;
}

function derivedCard(def, value) {
  const shown = formatDerived(def, value);
  return `<article class="f5-metric">
    <h4>${escapeHtml(def.label)}</h4>
    <p class="val${shown ? '' : ' missing'}">${shown ? escapeHtml(shown) : 'Not tagged'}</p>
    <p>${escapeHtml(def.plain)}</p>
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
    numbers = `<div class="f5-note"><p>Couldn’t load Company Facts (${escapeHtml(headlines?.error || 'network')}). The map of feeds below still works — open JSON on sec.gov.</p></div>`;
  } else if (headlines) {
    const year = headlines.asOfYear ? `FY${headlines.asOfYear}` : 'latest 10-K';
    numbers = `
      <h3 class="f5-h3">Headline numbers (${escapeHtml(year)})</h3>
      <p class="f5-section-lede">From Company Facts, same annual period as the latest revenue/net-income 10-K. Blank means the tag isn’t in that filing.</p>
      <div class="f5-metrics">${METRICS.map((m) => metricCard(m, headlines.metrics?.[m.key])).join('')}</div>
      <h3 class="f5-h3">Ratios we compute (not stored by the SEC)</h3>
      <div class="f5-metrics">${DERIVED.map((d) => derivedCard(d, headlines.ratios?.[d.key])).join('')}</div>
    `;
  }
  return `
    <button type="button" class="f5-back" id="back">← All companies</button>
    <div class="f5-company-head">
      <div>
        <p class="f5-kicker">Fortune #${c.rank}</p>
        <h2>${escapeHtml(c.company)}</h2>
        <p class="f5-legal">${escapeHtml(c.sec_name || '')}</p>
      </div>
      <span class="f5-pill f5-pill-public">SEC filer</span>
    </div>
    ${alias}
    <dl class="f5-dl">
      <div><dt>Fortune ticker</dt><dd>${escapeHtml(c.fortune_ticker || '—')}</dd></div>
      <div><dt>SEC ticker</dt><dd>${escapeHtml(c.sec_ticker || '—')}</dd></div>
      <div><dt>CIK</dt><dd class="mono">${escapeHtml(c.cik_padded || String(c.cik))}</dd></div>
      <div><dt>How we matched</dt><dd>${escapeHtml(match)}</dd></div>
    </dl>
    ${numbers}
    <h3 class="f5-h3">Four public feeds</h3>
    <p class="f5-section-lede">Each card is a real SEC URL for this CIK.</p>
    <div class="f5-sources">${SOURCES.map((s) => sourceCard(c, s)).join('')}</div>
    <p class="f5-section-lede">Not in EDGAR Company Facts: stock price, market cap, Fortune’s published revenue ranking dollars, or employee count.</p>
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

function dash() {
  return `<span class="muted" title="Not tagged in the current 10-K">—</span>`;
}

function compareView(rows, status) {
  const names = compareRanks.map((r) => companyByRank(r)).filter(Boolean);
  const head = names
    .map((c) => {
      const h = rows.find((x) => x.cik === c.cik);
      const fy = h?.asOfYear ? `FY${h.asOfYear}` : '';
      return `<th>${escapeHtml(c.company)}<div class="muted">${escapeHtml(c.fortune_ticker || '')} ${fy}</div></th>`;
    })
    .join('');

  let body = '';
  if (status === 'loading') {
    body = `<tr><td colspan="${names.length + 1}">Loading Company Facts from the SEC…</td></tr>`;
  } else if (status === 'error') {
    body = `<tr><td colspan="${names.length + 1}">Couldn’t reach /api/f500-headlines. On a static server this route doesn’t run — use the deployed site or <code>vercel dev</code>.</td></tr>`;
  } else {
    const metricRows = METRICS.map((def) => {
      const vals = names.map((c) => {
        const h = rows.find((x) => x.cik === c.cik);
        return h?.metrics?.[def.key]?.val;
      });
      const tds = names
        .map((c, i) => {
          const h = rows.find((x) => x.cik === c.cik);
          const point = h?.metrics?.[def.key];
          const shown = formatMetric(def, point);
          const cls = cellClass(vals, point?.val, def.better);
          return `<td class="${cls}">${shown ? escapeHtml(shown) : dash()}</td>`;
        })
        .join('');
      return `<tr><td>${escapeHtml(def.label)}</td>${tds}</tr>`;
    }).join('');
    const ratioRows = DERIVED.map((def) => {
      const vals = names.map((c) => {
        const h = rows.find((x) => x.cik === c.cik);
        return h?.ratios?.[def.key];
      });
      const tds = names
        .map((c, i) => {
          const h = rows.find((x) => x.cik === c.cik);
          const value = h?.ratios?.[def.key];
          const shown = formatDerived(def, value);
          const cls = cellClass(vals, value, def.better);
          return `<td class="${cls}">${shown ? escapeHtml(shown) : dash()}</td>`;
        })
        .join('');
      return `<tr><td>${escapeHtml(def.label)}</td>${tds}</tr>`;
    }).join('');
    body = `${metricRows}<tr><td colspan="${names.length + 1}" class="muted">Ratios (computed here, not stored by the SEC)</td></tr>${ratioRows}`;
  }

  return `
    <button type="button" class="f5-back" id="back">← All companies</button>
    <h2 class="f5-h3">Compare headline numbers</h2>
    <p class="f5-section-lede">Latest annual 10-K period per company. Fiscal year-ends can differ (Apple is not calendar). Green = best in the row for “higher/lower is better” metrics; red = worst. Em-dash = not tagged.</p>
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
  const res = await fetch(`/api/f500-headlines?ciks=${missing.join(',')}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  for (const row of data.companies || []) headlinesByCik.set(row.cik, row);
  return ciks.map((cik) => headlinesByCik.get(cik));
}

async function renderDetail() {
  layoutEl.classList.toggle('show-detail', compareMode || Boolean(selectedRank));
  if (compareMode) {
    const names = compareRanks.map(companyByRank).filter((c) => c && isPublic(c));
    detailEl.innerHTML = compareView([], 'loading');
    document.getElementById('back')?.addEventListener('click', () => select(null));
    try {
      const rows = await fetchHeadlines(names.map((c) => c.cik));
      if (!compareMode) return;
      detailEl.innerHTML = compareView(rows.filter(Boolean), 'ok');
      document.getElementById('back')?.addEventListener('click', () => select(null));
    } catch {
      if (!compareMode) return;
      detailEl.innerHTML = compareView([], 'error');
      document.getElementById('back')?.addEventListener('click', () => select(null));
    }
    return;
  }

  const c = companyByRank(selectedRank);
  if (!c) {
    detailEl.innerHTML = primer();
    return;
  }
  if (!isPublic(c)) {
    detailEl.innerHTML = privateDetail(c);
    document.getElementById('back')?.addEventListener('click', () => select(null));
    return;
  }

  const cached = headlinesByCik.get(c.cik);
  detailEl.innerHTML = publicDetail(c, cached, cached ? 'ok' : 'loading');
  document.getElementById('back')?.addEventListener('click', () => select(null));
  if (cached) return;
  try {
    const [row] = await fetchHeadlines([c.cik]);
    if (selectedRank !== c.rank || compareMode) return;
    detailEl.innerHTML = publicDetail(c, row, row?.error ? 'error' : 'ok');
    document.getElementById('back')?.addEventListener('click', () => select(null));
  } catch (err) {
    if (selectedRank !== c.rank || compareMode) return;
    detailEl.innerHTML = publicDetail(c, { error: err.message }, 'error');
    document.getElementById('back')?.addEventListener('click', () => select(null));
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
  else renderCompareBar();
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

searchEl.addEventListener('input', () => {
  query = searchEl.value.trim();
  renderList();
});

document.querySelector('.f5-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  for (const b of document.querySelectorAll('.f5-filters [data-filter]')) {
    b.setAttribute('aria-pressed', String(b === btn));
  }
  renderList();
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
  const pub = companies.filter(isPublic).length;
  statsEl.innerHTML = `
    <span class="f5-stat"><strong>${companies.length}</strong> Fortune 500</span>
    <span class="f5-stat"><strong>${pub}</strong> public SEC filers</span>
    <span class="f5-stat"><strong>${companies.length - pub}</strong> private / mutual</span>
  `;
  document.getElementById('glossary-list').innerHTML = GLOSSARY.map(
    (g) => `<div><dt>${escapeHtml(g.term)}</dt><dd>${escapeHtml(g.def)}</dd></div>`
  ).join('');
  const s = parseUrl();
  compareMode = s.compareMode;
  compareRanks = s.compareRanks;
  selectedRank = s.selectedRank;
  applyState({ replace: true, fromPop: true });
} catch (err) {
  detailEl.innerHTML = `<p class="f5-error">${escapeHtml(err.message)}</p>`;
}
