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

const listEl = document.getElementById('list');
const detailEl = document.getElementById('detail');
const countEl = document.getElementById('count');
const statsEl = document.getElementById('stats');
const searchEl = document.getElementById('search');
const layoutEl = document.getElementById('layout');

let companies = [];
let filter = 'all';
let query = '';
let selectedRank = null;

function rankFromUrl() {
  const n = Number(new URL(location.href).searchParams.get('rank'));
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
}

function setUrl(rank, replace = false) {
  const url = new URL(location.href);
  if (rank) url.searchParams.set('rank', String(rank));
  else url.searchParams.delete('rank');
  history[replace ? 'replaceState' : 'pushState']({ rank }, '', url);
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

function renderList() {
  const rows = companies.filter(matches);
  countEl.textContent = `${rows.length} shown`;
  const html = rows
    .map((c) => {
      const pub = isPublic(c);
      const selected = c.rank === selectedRank;
      return `<button type="button" class="f5-row${pub ? '' : ' is-private'}" role="option" data-rank="${c.rank}" aria-selected="${selected}">
        <span class="f5-rank">${c.rank}</span>
        <span>
          <span class="f5-row-name">${escapeHtml(c.company)}</span>
          <span class="f5-row-sub">${escapeHtml(tickerLabel(c))}${pub && c.sec_name ? ' · ' + escapeHtml(c.sec_name) : ''}</span>
        </span>
        <span class="f5-pill ${pub ? 'f5-pill-public' : 'f5-pill-private'}">${pub ? 'SEC filer' : 'Private'}</span>
      </button>`;
    })
    .join('');
  listEl.innerHTML = html || `<p class="f5-count" style="padding:12px">No matches.</p>`;
}

function primer() {
  return `
    <div class="f5-empty">
      <h2>Start with a company</h2>
      <p class="f5-section-lede">
        EDGAR is the SEC’s public filing cabinet. Public Fortune 500 companies drop annual
        10-Ks and quarterly 10-Qs there. This page does not reprint Fortune’s revenue table —
        it shows <em>what the SEC publishes</em> for that rank, and where to open it.
      </p>
      <div class="f5-note">
        <p><strong>No dollar figures on this page yet.</strong> Company Facts JSON is large; we have the map (CIK + URLs) and will pull numbers in a later pass. Until then, use “Open JSON” to see the live SEC payload.</p>
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

function publicDetail(c) {
  const alias =
    c.fortune_ticker && c.sec_ticker && c.fortune_ticker !== c.sec_ticker
      ? `<p class="f5-section-lede">Fortune lists this as <strong>${escapeHtml(c.fortune_ticker)}</strong>; the SEC ticker file uses <strong>${escapeHtml(c.sec_ticker)}</strong>. Same company, different symbol.</p>`
      : '';
  const match = MATCH_LABELS[c.match_source] || c.match_source || '';
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
    <h3 class="f5-h3">Four public feeds</h3>
    <p class="f5-section-lede">Each card is a real SEC URL for this CIK. JSON links need a User-Agent if you fetch them from a script; in a browser, sec.gov will just show the file.</p>
    <div class="f5-sources">${SOURCES.map((s) => sourceCard(c, s)).join('')}</div>
    <h3 class="f5-h3">Headline numbers inside Company Facts</h3>
    <p class="f5-section-lede">These tags are usually in the Facts JSON. Availability varies — a bank may have no gross profit or inventory. Missing means “not tagged,” not zero.</p>
    <div class="f5-metrics">
      ${METRICS.map(
        (m) => `<article class="f5-metric">
          <h4>${escapeHtml(m.label)}</h4>
          <p>${escapeHtml(m.plain)}</p>
          <p class="tags">${escapeHtml(m.tags)}</p>
        </article>`
      ).join('')}
    </div>
    <h3 class="f5-h3">Ratios we would compute (not stored by the SEC)</h3>
    <div class="f5-metrics">
      ${DERIVED.map(
        (m) => `<article class="f5-metric"><h4>${escapeHtml(m.label)}</h4><p>${escapeHtml(m.plain)}</p></article>`
      ).join('')}
    </div>
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

function renderDetail() {
  const c = companies.find((x) => x.rank === selectedRank);
  layoutEl.classList.toggle('show-detail', Boolean(c));
  if (!c) {
    detailEl.innerHTML = primer();
    return;
  }
  detailEl.innerHTML = isPublic(c) ? publicDetail(c) : privateDetail(c);
  document.getElementById('back')?.addEventListener('click', () => select(null));
}

function select(rank, opts = {}) {
  selectedRank = rank;
  if (!opts.fromPop) setUrl(rank, opts.replace);
  renderList();
  renderDetail();
  if (rank && window.matchMedia('(max-width: 820px)').matches) {
    detailEl.scrollIntoView({ block: 'start' });
  }
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

window.addEventListener('popstate', () => {
  select(rankFromUrl(), { fromPop: true });
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
  select(rankFromUrl(), { replace: true, fromPop: true });
} catch (err) {
  detailEl.innerHTML = `<p class="f5-error">${escapeHtml(err.message)}</p>`;
}
