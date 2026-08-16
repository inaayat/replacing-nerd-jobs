/**
 * Financial Modeler information page: search a filer and inspect every
 * extracted XBRL metric. Does not run the three-statement engine.
 */
import { isPublic, METRICS, DERIVED } from '../fortune-500/catalog.js';
import {
  ensureRatios,
  formatMetric,
  formatDerived,
  formatUsd,
  formatPeriodEnd,
  ALL_FILED_METRICS,
  ALL_DERIVED,
} from '../fortune-500/extract.js';
import {
  FILED_PACK_GROUPS,
  DERIVED_PACK_GROUPS,
  EXTENDED_FILED_BY_KEY,
  EXTENDED_DERIVED_BY_KEY,
  studentText,
} from '../fortune-500/metric-packs.js';
import { SEGMENT_METRIC_DEFS } from '../fortune-500/extract-segments.js';

const state = {
  companies: [],
  snapshot: new Map(),
  segments: new Map(),
  company: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function filedDef(key) {
  return ALL_FILED_METRICS.find((m) => m.key === key) || METRICS.find((m) => m.key === key) || EXTENDED_FILED_BY_KEY[key] || null;
}

function derivedDef(key) {
  return ALL_DERIVED.find((d) => d.key === key) || DERIVED.find((d) => d.key === key) || EXTENDED_DERIVED_BY_KEY[key] || null;
}

function tickerOf(c) {
  return c.fortune_ticker || c.sec_ticker || '';
}

async function loadData() {
  const [mapRes, snapRes, extraRes, extraSnapRes, segRes] = await Promise.all([
    fetch('/fortune-500/data/fortune500_edgar_mapping.json'),
    fetch('/fortune-500/data/headlines-snapshot.json'),
    fetch('/financial-modeler/extras.json'),
    fetch('/financial-modeler/extras-headlines.json'),
    fetch('/fortune-500/data/segments-snapshot.json'),
  ]);
  const mapping = await mapRes.json();
  const extras = extraRes.ok ? await extraRes.json() : [];
  const extraSnap = extraSnapRes.ok ? await extraSnapRes.json() : { companies: {} };
  const seenCik = new Set(mapping.map((c) => c.cik).filter((cik) => cik != null));
  const seenTicker = new Set(mapping.map((c) => c.fortune_ticker).filter(Boolean));
  const extraOnly = extras.filter(
    (c) => (c.cik == null || !seenCik.has(c.cik)) && !seenTicker.has(c.fortune_ticker)
  );
  state.companies = [...mapping, ...extraOnly].filter(isPublic);
  const snap = await snapRes.json();
  for (const [cik, row] of Object.entries({ ...snap.companies, ...extraSnap.companies } || {})) {
    state.snapshot.set(Number(cik), ensureRatios(row));
  }
  if (segRes.ok) {
    const segs = await segRes.json();
    for (const [cik, row] of Object.entries(segs.companies || {})) {
      state.segments.set(Number(cik), row);
    }
  }
}

function searchCompanies(q) {
  const needle = String(q || '')
    .trim()
    .toLowerCase();
  if (!needle) return state.companies.slice(0, 12);
  return state.companies
    .filter((c) => {
      const hay = `${c.company} ${c.sec_name || ''} ${tickerOf(c)}`.toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, 20);
}

function sourceLine(point, def) {
  if (!point || typeof point.val !== 'number') {
    return def?.whyMissing
      ? `Not tagged in this annual report. ${def.whyMissing}`
      : 'Not tagged in this annual report.';
  }
  const taxonomy = point.taxonomy || 'us-gaap';
  const tag = point.tag || def?.tags || '';
  const form = point.form || '10-K';
  const ended = point.end ? formatPeriodEnd(point.end) : 'the latest fiscal year';
  const filed = point.filed ? `, filed ${formatPeriodEnd(point.filed)}` : '';
  return `SEC Company Facts · ${taxonomy}:${tag} · ${form} for the period ended ${ended}${filed}.`;
}

function derivedSource(def) {
  const formula = def?.formula ? ` Computed as ${def.formula}.` : '';
  const missing = def?.whyMissing ? ` ${def.whyMissing}` : '';
  return `Derived from other tagged lines in the same annual report.${formula}${missing}`;
}

function seriesNote(headlines, key) {
  const rows = headlines?.seriesAnnual?.[key];
  if (!rows?.length) return '';
  const bits = rows.map((r) => `${r.year}: ${formatUsd(r.val) || r.val}`);
  return `Annual series: ${bits.join(' · ')}`;
}

function quarterlyNote(headlines, key) {
  const rows = headlines?.seriesQuarterly?.[key];
  if (!rows?.length) return '';
  const bits = rows.map((r) => `${r.fp || r.year}: ${formatUsd(r.val) || r.val}`);
  return `Quarterly (10-Q): ${bits.join(' · ')}`;
}

function countTagged(headlines) {
  let tagged = 0;
  const total = ALL_FILED_METRICS.length;
  for (const def of ALL_FILED_METRICS) {
    const p = headlines?.metrics?.[def.key];
    if (p && typeof p.val === 'number' && Number.isFinite(p.val)) tagged += 1;
  }
  return { tagged, total };
}

function renderResults(list) {
  const box = $('info-results');
  if (!list.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = list
    .map(
      (c) => `<button type="button" class="fm-result" data-cik="${c.cik}">
        <strong>${escapeHtml(c.company)}</strong>
        <span>${escapeHtml(tickerOf(c))}</span>
      </button>`
    )
    .join('');
}

function filedRow(def, headlines) {
  const point = headlines?.metrics?.[def.key];
  const shown = formatMetric(def, point);
  const missing = shown == null;
  const series = [seriesNote(headlines, def.key), quarterlyNote(headlines, def.key)].filter(Boolean).join(' ');
  return `<tr>
    <td class="label">${escapeHtml(def.label)}</td>
    <td class="val${missing ? ' is-missing' : ''}">${escapeHtml(shown || '—')}</td>
    <td>
      <div class="def">${escapeHtml(studentText(def))}</div>
      <div class="src">${escapeHtml(sourceLine(point, def))}</div>
      ${series ? `<div class="fm-info-series">${escapeHtml(series)}</div>` : ''}
    </td>
  </tr>`;
}

function derivedRow(def, headlines) {
  const value = headlines?.ratios?.[def.key];
  const shown = formatDerived(def, value);
  const missing = shown == null;
  return `<tr>
    <td class="label">${escapeHtml(def.label)}</td>
    <td class="val${missing ? ' is-missing' : ''}">${escapeHtml(shown || '—')}</td>
    <td>
      <div class="def">${escapeHtml(studentText(def))}</div>
      <div class="src">${escapeHtml(derivedSource(def))}</div>
    </td>
  </tr>`;
}

function groupTable(title, summary, rowsHtml, id) {
  if (!rowsHtml) return '';
  return `<section class="fm-info-group" id="${id}">
    <h3>${escapeHtml(title)}</h3>
    <p class="fm-info-summary">${escapeHtml(summary)}</p>
    <table class="fm-info-table">
      <thead><tr><th>Metric</th><th>Value</th><th>Definition and source</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </section>`;
}

function renderSegments(seg) {
  if (!seg || (seg.error && !(seg.axes || []).length)) {
    return groupTable(
      'Reportable segments',
      'Product, operating-segment, and geographic cuts from the 10-K’s dimensional XBRL (not Company Facts).',
      `<tr><td class="label">Segments</td><td class="val is-missing">—</td><td>
        <div class="def">${escapeHtml(SEGMENT_METRIC_DEFS[0].student)}</div>
        <div class="src">${escapeHtml(
          seg?.error
            ? `Not available: ${seg.error}.`
            : 'This filing did not yield at least two members on a product, operating, or geographic axis.'
        )}</div>
      </td></tr>`,
      'group-segments'
    );
  }
  const axisHtml = (seg.axes || [])
    .map((axis) => {
      const rows = axis.members
        .map((m) => {
          const bits = [
            m.revenue != null ? `Revenue ${formatUsd(m.revenue)}` : null,
            m.operating_income != null ? `Operating income ${formatUsd(m.operating_income)}` : null,
            m.assets != null ? `Assets ${formatUsd(m.assets)}` : null,
            m.depreciation_amortization != null ? `D&A ${formatUsd(m.depreciation_amortization)}` : null,
          ].filter(Boolean);
          const filing = seg.filing?.form
            ? ` (${escapeHtml(seg.filing.form)} filed ${escapeHtml(seg.filing.filingDate || '')})`
            : '';
          return `<tr>
            <td class="label">${escapeHtml(m.label)}</td>
            <td class="val">${escapeHtml(formatUsd(m.revenue) || '—')}</td>
            <td>
              <div class="def">${escapeHtml(bits.join(' · ') || 'No tagged amounts for this member.')}</div>
              <div class="src">Inline XBRL member ${escapeHtml(m.member)} on the ${escapeHtml(axis.label)} axis of the latest annual report${filing}.</div>
            </td>
          </tr>`;
        })
        .join('');
      return `<div class="fm-info-axis"><h4>${escapeHtml(axis.label)}</h4>
        <table class="fm-info-table">
          <thead><tr><th>Member</th><th>Revenue</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
    })
    .join('');
  return `<section class="fm-info-group" id="group-segments">
    <h3>Reportable segments</h3>
    <p class="fm-info-summary">Dimensional facts from the annual report. Product and geography are alternative decompositions of consolidated revenue; do not add them together.</p>
    ${axisHtml}
  </section>`;
}

function renderCompany(company) {
  const headlines = state.snapshot.get(Number(company.cik));
  const root = $('info-company');
  if (!headlines || headlines.error || !headlines.asOfYear) {
    root.hidden = false;
    root.innerHTML = `<div class="fm-info-head">
      <div>
        <h2>${escapeHtml(company.company)}</h2>
        <p class="fm-info-meta">${escapeHtml(tickerOf(company))} · no usable annual XBRL in the snapshot.</p>
      </div>
    </div>
    <p class="fm-info-note">Private issuers have no 10-K. Public issuers with a missing Company Facts payload are listed as not tagged rather than zero.</p>`;
    return;
  }

  const { tagged, total } = countTagged(headlines);
  const period = formatPeriodEnd(headlines.metrics?.revenue?.end || headlines.metrics?.assets?.end);
  const toc = [
    ...FILED_PACK_GROUPS.map((g) => `<a href="#group-${g.id}">${escapeHtml(g.label)}</a>`),
    ...DERIVED_PACK_GROUPS.map((g) => `<a href="#group-${g.id}">${escapeHtml(g.label)}</a>`),
    `<a href="#group-segments">Segments</a>`,
  ].join('');

  const filedHtml = FILED_PACK_GROUPS.map((g) => {
    const rows = g.keys
      .map((key) => filedDef(key))
      .filter(Boolean)
      .map((def) => filedRow(def, headlines))
      .join('');
    return groupTable(g.label, g.summary, rows, `group-${g.id}`);
  }).join('');

  const derivedHtml = DERIVED_PACK_GROUPS.map((g) => {
    const rows = g.keys
      .map((key) => derivedDef(key))
      .filter(Boolean)
      .map((def) => derivedRow(def, headlines))
      .join('');
    return groupTable(g.label, g.summary, rows, `group-${g.id}`);
  }).join('');

  const seg = state.segments.get(Number(company.cik));

  root.hidden = false;
  root.innerHTML = `<div class="fm-info-head">
      <div>
        <h2>${escapeHtml(company.company)}</h2>
        <p class="fm-info-meta">${escapeHtml(tickerOf(company))} · FY${headlines.asOfYear}${
          period ? ` ended ${escapeHtml(period)}` : ''
        } · ${escapeHtml(headlines.entityName || '')}</p>
      </div>
      <div class="fm-info-counts">${tagged} of ${total} filed tags present<br />Dash = not tagged</div>
    </div>
    <nav class="fm-info-toc">${toc}</nav>
    ${filedHtml}
    ${derivedHtml}
    ${renderSegments(seg)}`;
}

function selectCompany(company) {
  state.company = company;
  const ticker = tickerOf(company);
  const url = new URL(window.location.href);
  url.searchParams.set('ticker', ticker);
  url.searchParams.set('cik', String(company.cik));
  history.replaceState({}, '', url);
  $('info-search').value = `${company.company} (${ticker})`;
  $('info-results').hidden = true;
  renderCompany(company);
  $('info-company').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function findByQuery() {
  const params = new URLSearchParams(window.location.search);
  const cik = Number(params.get('cik'));
  const ticker = String(params.get('ticker') || '').toUpperCase();
  if (Number.isInteger(cik) && cik > 0) {
    return state.companies.find((c) => c.cik === cik) || null;
  }
  if (ticker) {
    return state.companies.find((c) => tickerOf(c).toUpperCase() === ticker) || null;
  }
  return null;
}

function bind() {
  const input = $('info-search');
  input.addEventListener('input', () => {
    renderResults(searchCompanies(input.value));
  });
  input.addEventListener('focus', () => {
    renderResults(searchCompanies(input.value));
  });
  $('info-results').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cik]');
    if (!btn) return;
    const company = state.companies.find((c) => String(c.cik) === btn.dataset.cik);
    if (company) selectCompany(company);
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.fm-info-search-wrap')) $('info-results').hidden = true;
  });
}

await loadData();
$('info-status').textContent = `${state.companies.length} public filers. Search a name to open its tagged metrics.`;
bind();
const initial = findByQuery();
if (initial) selectCompany(initial);
else renderResults(searchCompanies('apple'));
