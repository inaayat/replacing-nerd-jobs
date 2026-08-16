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
  IMPLIED_LIABILITIES_TAG,
  liabilityComponents,
  debtStock,
  debtStockPoint,
} from '../fortune-500/extract.js';
import {
  FILED_PACK_GROUPS,
  DERIVED_PACK_GROUPS,
  EXTENDED_FILED_BY_KEY,
  EXTENDED_DERIVED_BY_KEY,
  studentText,
} from '../fortune-500/metric-packs.js';
import { SEGMENT_METRIC_DEFS } from '../fortune-500/extract-segments.js';
import {
  GROUP_TONE,
  annualSeries,
  quarterlySeries,
  hasExpandableSeries,
  metricMatchesQuery,
  filingSourceLinks,
  stackedAddends,
  filedTagsCacheKey,
  filedTagsApiUrl,
  filterFiledTagRows,
  filedTagsCountLabel,
  rankFiledTagMatches,
} from './information-view.js';
import {
  prepareHeadlines,
  saveOverride,
  clearOverride,
  loadOverridesForCik,
  blankMetricKeys,
} from './tag-overrides.js';

const state = {
  companies: [],
  snapshot: new Map(),
  segments: new Map(),
  company: null,
  metricQuery: '',
  expanded: new Set(),
  filedOpen: false,
  filedLoading: false,
  filedError: null,
  filedPayload: null,
  filedFilter: 'all',
  filedQuery: '',
  mapFocus: null,
  mapQuery: {},
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

function expandId(groupId, key) {
  return `${groupId}:${key}`;
}

async function loadData() {
  const [mapRes, snapRes, extraRes, extraSnapRes, segRes] = await Promise.all([
    fetch('/fortune-500/data/fortune500_edgar_mapping.json'),
    fetch('/fortune-500/data/extended-snapshot.json'),
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

function currentFiling() {
  const row = state.segments.get(Number(state.company?.cik));
  if (!row?.filing) return null;
  return { ...row.filing, factAnchors: row.factAnchors || {} };
}

function sourceLinksHtml(point, def, { derived = false } = {}) {
  const links = filingSourceLinks({
    company: state.company,
    point,
    def,
    filing: currentFiling(),
    derived,
  });
  if (!links.length) return '';
  return `<span class="fm-info-links">${links
    .map(
      (l) =>
        `<a class="fm-info-link is-${escapeHtml(l.kind)}" href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`
    )
    .join('')}</span>`;
}

function sourceLine(point, def) {
  if (point?.override) {
    const taxonomy = point.taxonomy || 'us-gaap';
    const tag = point.tag || '';
    const form = point.form || '10-K';
    const ended = point.end ? formatPeriodEnd(point.end) : 'the latest fiscal year';
    return `Your map: ${taxonomy}:${tag} · ${form} for the period ended ${ended}.`;
  }
  if (point?.tag === IMPLIED_LIABILITIES_TAG) {
    return 'Computed as total assets − shareholders’ equity. The 10-K did not tag a consolidated Liabilities line.';
  }
  if (point?.derived) {
    return `Computed from tagged lines in this annual report as ${point.formula || def?.formula || 'a derived value'}.`;
  }
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
  return `${taxonomy}:${tag} · ${form} for the period ended ${ended}${filed}.`;
}

function derivedSource(def) {
  const formula = def?.formula ? ` Computed as ${def.formula}.` : '';
  const missing = def?.whyMissing ? ` ${def.whyMissing}` : '';
  return `Derived from other tagged lines in the same annual report.${formula}${missing}`;
}

function componentsEquation(headlines, key) {
  if (key !== 'liabilities') return '';
  const parts = liabilityComponents(headlines?.metrics);
  if (!parts.length) return '';
  const total = headlines?.metrics?.liabilities;
  const totalVal = total && typeof total.val === 'number' ? total.val : null;
  const eq = stackedAddends(parts, totalVal);
  const body = eq.rows
    .map(
      (r) => `<tr>
        <td class="op">${escapeHtml(r.op)}</td>
        <td class="eq-label">${escapeHtml(r.label)}</td>
        <td class="eq-val">${escapeHtml(formatUsd(r.abs) || String(r.abs))}</td>
      </tr>`
    )
    .join('');
  const sumRow = eq.tiesTotal
    ? `<tr class="eq-sum">
      <td class="op">=</td>
      <td class="eq-label">Total liabilities</td>
      <td class="eq-val">${escapeHtml(formatUsd(eq.total) || String(eq.total))}</td>
    </tr>`
    : `<tr class="eq-sum">
      <td class="op">=</td>
      <td class="eq-label">Sum of tagged pieces</td>
      <td class="eq-val">${escapeHtml(formatUsd(eq.sum) || String(eq.sum))}</td>
    </tr>`;
  const totalRow =
    eq.tiesTotal || eq.total == null
      ? ''
      : `<tr class="eq-total is-untied">
      <td class="op">≠</td>
      <td class="eq-label">Total liabilities</td>
      <td class="eq-val">${escapeHtml(formatUsd(eq.total) || String(eq.total))}</td>
    </tr>`;
  const note = eq.tiesTotal
    ? 'These tagged lines add to the reported total.'
    : 'Tagged pieces — not a complete total. Individual debts do not roll up to liabilities.';
  return `<div class="fm-info-eq" role="group" aria-label="Liability components">
    <p class="fm-info-eq-lead">${note}</p>
    <table class="fm-info-eq-table">
      <tbody>${body}${sumRow}${eq.tiesTotal ? '' : totalRow}</tbody>
    </table>
  </div>`;
}

function formatSeriesValue(def, row) {
  if (def) {
    const shown = formatMetric(def, row);
    if (shown) return shown;
  }
  return formatUsd(row?.val) || String(row?.val ?? '—');
}

function seriesTable(title, rows, def) {
  if (!rows.length) return '';
  const body = rows
    .map((r) => {
      const period = r.fp && r.fp !== 'FY' ? `${escapeHtml(r.fp)} ${escapeHtml(r.year || '')}` : escapeHtml(String(r.year ?? ''));
      const ended = r.end ? formatPeriodEnd(r.end) : '';
      const form = r.form || '';
      const hrefs = filingSourceLinks({
        company: state.company,
        point: r,
        def,
        filing: currentFiling(),
      });
      const open = hrefs.find((l) => l.kind === 'document');
      const link = open
        ? `<a href="${escapeHtml(open.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(form || 'EDGAR')}</a>`
        : escapeHtml(form);
      return `<tr>
        <td>${period}</td>
        <td class="val">${escapeHtml(formatSeriesValue(def, r))}</td>
        <td>${escapeHtml(ended)}</td>
        <td>${link}</td>
      </tr>`;
    })
    .join('');
  return `<div class="fm-info-years">
    <h5>${escapeHtml(title)}</h5>
    <table>
      <thead><tr><th>Period</th><th>Value</th><th>Period end</th><th>Filing</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function seriesPanel(def, headlines, rowId, open) {
  const annual = annualSeries(headlines, def.key);
  const quarterly = quarterlySeries(headlines, def.key);
  if (!annual.length && !quarterly.length) return '';
  return `<tr class="fm-info-series-row${open ? ' is-open' : ''}" id="${escapeHtml(rowId)}"${open ? '' : ' hidden'}>
    <td colspan="4">
      <div class="fm-info-series-panel">
        <p class="fm-info-series-lead">Year-by-year from Company Facts. Click a filing to open it on EDGAR. XBRL does not record a PDF page number — the inline viewer highlights the tagged line in the HTML report.</p>
        ${seriesTable('Annual (10-K / 20-F)', annual, def)}
        ${seriesTable('Quarterly (10-Q)', quarterly, def)}
      </div>
    </td>
  </tr>`;
}

function headlinesForCompany(company) {
  const raw = state.snapshot.get(Number(company?.cik));
  if (!raw) return null;
  return prepareHeadlines(raw, company?.cik);
}

function formatFiledVal(row) {
  if (row?.unit === 'USD/shares') return formatMetric({ unit: 'USD/shares' }, row);
  if (row?.unit === 'shares') return formatMetric({ unit: 'shares' }, row);
  return formatUsd(row?.val) || '—';
}

function blankMetricGroups(company) {
  const base = state.snapshot.get(Number(company?.cik));
  const groups = [];
  for (const g of FILED_PACK_GROUPS) {
    const blanks = blankMetricKeys(base, g.keys);
    if (!blanks.length) continue;
    const options = blanks
      .map((key) => {
        const def = filedDef(key);
        return def ? `<option value="${escapeHtml(key)}">${escapeHtml(def.label)}</option>` : '';
      })
      .join('');
    groups.push({ id: g.id, label: g.label, options });
  }
  return groups;
}

function overrideForMetric(cik, metricKey) {
  const row = loadOverridesForCik(cik);
  return row[metricKey] || null;
}

function overrideBadge(cik, metricKey) {
  if (!overrideForMetric(cik, metricKey)) return '';
  return `<span class="fm-info-badge is-override">Your map</span>
    <button type="button" class="fm-info-clear-override" data-clear-override="${escapeHtml(metricKey)}">Clear</button>`;
}

async function loadFiledTags(company, headlines) {
  const cik = Number(company?.cik);
  const fy = headlines?.asOfYear;
  const cacheKey = filedTagsCacheKey(cik, fy);
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      state.filedPayload = JSON.parse(cached);
      state.filedError = state.filedPayload?.error || null;
      return;
    }
  } catch {
    // ignore bad cache
  }
  state.filedLoading = true;
  state.filedError = null;
  try {
    const res = await fetch(filedTagsApiUrl(cik));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
    }
    const data = await res.json();
    state.filedPayload = data;
    state.filedError = data?.error || null;
    if (!data?.error) {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // quota
      }
    }
  } catch (err) {
    state.filedError = err.message || 'Could not load filed tags';
    state.filedPayload = null;
  } finally {
    state.filedLoading = false;
  }
}

function renderFiledTagsPanel(company, headlines) {
  const counts = state.filedPayload?.counts;
  const summary = counts
    ? filedTagsCountLabel(counts)
    : state.filedError
      ? `Could not load: ${state.filedError}`
      : state.filedLoading
        ? 'Loading from Company Facts…'
        : 'Open to load every tag from this 10-K';
  const open = state.filedOpen;
  const rows = filterFiledTagRows(state.filedPayload?.rows || [], {
    query: state.filedQuery,
    filter: state.filedFilter,
  });
  const blankGroups = blankMetricGroups(company);
  const cik = Number(company.cik);
  const overrides = loadOverridesForCik(cik);

  const body = state.filedLoading
    ? '<p class="fm-info-note">Loading filed tags from SEC Company Facts…</p>'
    : state.filedError
      ? `<p class="fm-info-note">Could not load filed tags: ${escapeHtml(state.filedError)}. Live API only — not available on a plain static server.</p>`
      : !state.filedPayload
        ? '<p class="fm-info-note">Expand to fetch every statement-like tag from the latest annual report.</p>'
        : `<div class="fm-info-filed-toolbar">
            <input type="search" class="fm-search" id="filed-search" placeholder="Search tags or labels…" value="${escapeHtml(state.filedQuery)}" aria-label="Search filed tags" />
            <div class="fm-info-filed-chips" role="group" aria-label="Filter filed tags">
              <button type="button" class="fm-info-chip${state.filedFilter === 'all' ? ' is-active' : ''}" data-filed-filter="all">All</button>
              <button type="button" class="fm-info-chip${state.filedFilter === 'mapped' ? ' is-active' : ''}" data-filed-filter="mapped">Mapped</button>
              <button type="button" class="fm-info-chip${state.filedFilter === 'unmapped' ? ' is-active' : ''}" data-filed-filter="unmapped">Unmapped</button>
            </div>
          </div>
          <div class="fm-info-table-wrap">
            <table class="fm-info-table fm-info-filed-table">
              <thead><tr><th>Tag</th><th>Label</th><th>Value</th><th>End</th><th>Maps to</th><th></th></tr></thead>
              <tbody>${rows
                .map((row) => {
                  const concept = `${row.taxonomy}:${row.tag}`;
                  const mapped = row.mappedLabel || '—';
                  const userMapped = Object.entries(overrides).some(
                    ([, o]) => o.tag === row.tag && (o.taxonomy || 'us-gaap') === row.taxonomy
                  );
                  const mapBadge = userMapped ? '<span class="fm-info-badge is-override">You mapped this</span>' : '';
                  const select =
                    blankGroups.length || !row.mappedKey
                      ? `<label class="fm-info-use-for"><span class="visually-hidden">Use for</span>
                          <select data-use-tag="${escapeHtml(concept)}" aria-label="Use ${escapeHtml(row.tag)} for a blank metric">
                            <option value="">Use for…</option>
                            ${blankGroups
                              .map(
                                (g) =>
                                  `<optgroup label="${escapeHtml(g.label)}">${g.options}</optgroup>`
                              )
                              .join('')}
                          </select></label>`
                      : '';
                  return `<tr class="fm-info-filed-row${row.mappedKey ? ' is-mapped' : ' is-unmapped'}">
                    <td class="tag"><code>${escapeHtml(concept)}</code></td>
                    <td class="label">${escapeHtml(row.label)}${mapBadge}</td>
                    <td class="val">${escapeHtml(formatFiledVal(row))}</td>
                    <td class="end">${escapeHtml(formatPeriodEnd(row.end) || '—')}</td>
                    <td class="maps">${escapeHtml(mapped)}</td>
                    <td class="act">${select}</td>
                  </tr>`;
                })
                .join('')}</tbody>
            </table>
          </div>
          <p class="fm-info-filed-foot">${rows.length} row${rows.length === 1 ? '' : 's'} shown</p>`;

  return `<details class="fm-info-filed" id="all-filed-tags"${open ? ' open' : ''}>
    <summary><span>All filed tags (this 10-K)</span><span class="fm-info-filed-summary">${escapeHtml(summary)}</span></summary>
    <div class="fm-info-filed-body">${body}</div>
  </details>`;
}

function countTagged(headlines) {
  let tagged = 0;
  const total = ALL_FILED_METRICS.length;
  for (const def of ALL_FILED_METRICS) {
    if (def.key === 'long_term_debt') {
      if (debtStock(headlines?.metrics) != null) tagged += 1;
      continue;
    }
    const p = headlines?.metrics?.[def.key];
    if (p && typeof p.val === 'number' && Number.isFinite(p.val) && !p.derived) tagged += 1;
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

function mapSearchHtml(def) {
  const q = state.mapQuery[def.key] || '';
  const active = state.mapFocus === def.key;
  let body = '';
  if (state.filedError && active) {
    body = `<p class="fm-info-map-note">Couldn’t load tags. ${escapeHtml(state.filedError)}</p>`;
  } else if (state.filedLoading && active && q.length >= 2) {
    body = '<p class="fm-info-map-note">Loading this 10-K’s tags…</p>';
  } else if (active && q.length >= 2 && !state.filedPayload) {
    body = '<p class="fm-info-map-note">Loading this 10-K’s tags…</p>';
  } else if (active && q.length >= 2) {
    const hits = rankFiledTagMatches(state.filedPayload?.rows || [], q, { limit: 6 });
    body = hits.length
      ? `<ul class="fm-info-map-hits">${hits
          .map((row) => {
            const concept = `${row.taxonomy}:${row.tag}`;
            const val = formatFiledVal(row);
            return `<li>
              <button type="button" class="fm-info-map-hit" data-map-pick="${escapeHtml(concept)}" data-map-metric="${escapeHtml(def.key)}">
                <span class="fm-info-map-hit-label">${escapeHtml(row.label || row.tag)}</span>
                <span class="fm-info-map-hit-meta">${escapeHtml(val)} · ${escapeHtml(row.tag)}</span>
              </button>
            </li>`;
          })
          .join('')}</ul>`
      : '<p class="fm-info-map-note">No tags match.</p>';
  }
  return `<div class="fm-info-map">
    <label class="fm-info-map-label">
      <span class="visually-hidden">Search this 10-K for ${escapeHtml(def.label)}</span>
      <input
        type="search"
        class="fm-info-map-search"
        data-map-metric="${escapeHtml(def.key)}"
        placeholder="Search this 10-K…"
        value="${escapeHtml(q)}"
        autocomplete="off"
        aria-label="Search this 10-K for ${escapeHtml(def.label)}"
      />
    </label>
    ${body}
  </div>`;
}

function filedRow(def, headlines, groupId, cik) {
  let point = headlines?.metrics?.[def.key];
  let shown = formatMetric(def, point);
  if (def.key === 'long_term_debt') {
    const stockPoint = debtStockPoint(headlines?.metrics);
    if (stockPoint) {
      point = stockPoint;
      shown = formatUsd(stockPoint.val);
    }
  }
  const missing = shown == null;
  const extra = componentsEquation(headlines, def.key);
  const expandable = hasExpandableSeries(headlines, def.key);
  const id = expandId(groupId, def.key);
  const open = state.expanded.has(id);
  const seriesId = `series-${groupId}-${def.key}`;
  const toggle = expandable
    ? `<button type="button" class="fm-info-metric-btn" data-series-for="${escapeHtml(id)}" aria-expanded="${open}" aria-controls="${escapeHtml(seriesId)}">
        <span class="fm-info-metric-name">${escapeHtml(def.label)}</span>
        <span class="fm-info-expand-hint">${open ? 'Hide years' : 'Show years'}</span>
      </button>`
    : `<span class="fm-info-metric-name">${escapeHtml(def.label)}</span>`;
  const overrideHtml = overrideBadge(cik, def.key);
  const badge = missing
    ? '<span class="fm-info-badge is-missing">Not tagged</span>'
    : point?.override
      ? ''
      : point?.derived
        ? '<span class="fm-info-badge is-derived">Calculated</span>'
        : '<span class="fm-info-badge is-tagged">Tagged</span>';
  const row = `<tr class="fm-info-row${open ? ' is-open' : ''}${missing ? ' is-missing' : ''}${point?.override ? ' is-override' : ''}" data-metric="${escapeHtml(def.key)}">
    <td class="label">${toggle}${badge}${overrideHtml}</td>
    <td class="val${missing ? ' is-missing' : ''}">${escapeHtml(shown || '—')}</td>
    <td class="def">${escapeHtml(studentText(def))}${extra}</td>
    <td class="src">
      <p>${escapeHtml(sourceLine(point, def))}</p>
      ${missing ? mapSearchHtml(def) : sourceLinksHtml(point, def, { derived: Boolean(point?.derived || point?.tag === IMPLIED_LIABILITIES_TAG) })}
    </td>
  </tr>`;
  return row + (expandable ? seriesPanel(def, headlines, seriesId, open) : '');
}

function derivedRow(def, headlines) {
  const value = headlines?.ratios?.[def.key];
  const shown = formatDerived(def, value);
  const missing = shown == null;
  const badge = missing
    ? '<span class="fm-info-badge is-missing">Not computed</span>'
    : '<span class="fm-info-badge is-derived">Derived</span>';
  return `<tr class="fm-info-row${missing ? ' is-missing' : ''}" data-metric="${escapeHtml(def.key)}">
    <td class="label"><span class="fm-info-metric-name">${escapeHtml(def.label)}</span>${badge}</td>
    <td class="val${missing ? ' is-missing' : ''}">${escapeHtml(shown || '—')}</td>
    <td class="def">${escapeHtml(studentText(def))}</td>
    <td class="src">
      <p>${escapeHtml(derivedSource(def))}</p>
      ${sourceLinksHtml(null, def, { derived: true })}
    </td>
  </tr>`;
}

function groupTable(title, summary, rowsHtml, id, headers = ['Metric', 'Value', 'Definition', 'Where to find it'], tone = 'ratio') {
  if (!rowsHtml) return '';
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  return `<section class="fm-info-group is-${escapeHtml(tone)}" id="${id}">
    <h3>${escapeHtml(title)}</h3>
    <p class="fm-info-summary">${escapeHtml(summary)}</p>
    <div class="fm-info-table-wrap">
      <table class="fm-info-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </section>`;
}

function renderSegments(seg, query) {
  const def = SEGMENT_METRIC_DEFS[0];
  if (!seg || (seg.error && !(seg.axes || []).length)) {
    const hay = `segments ${seg?.error || ''} ${def?.student || ''}`;
    if (query && !hay.toLowerCase().includes(query)) return '';
    return groupTable(
      'Reportable segments',
      'Product, operating-segment, and geographic cuts from the 10-K’s dimensional XBRL (not Company Facts).',
      `<tr><td class="label"><span class="fm-info-metric-name">Segments</span><span class="fm-info-badge is-missing">Not tagged</span></td><td class="val is-missing">—</td>
        <td class="def">${escapeHtml(def?.student || '')}</td>
        <td class="src"><p>${escapeHtml(
          seg?.error
            ? `Not available: ${seg.error}.`
            : 'This filing did not yield at least two members on a product, operating, or geographic axis.'
        )}</p>${sourceLinksHtml(null, def, { derived: true })}</td></tr>`,
      'group-segments',
      ['Metric', 'Value', 'Definition', 'Where to find it'],
      'segment'
    );
  }
  const filing = seg.filing;
  const filingNote = filing?.form
    ? ` (${escapeHtml(filing.form)} filed ${escapeHtml(filing.filingDate || '')})`
    : '';
  const axisHtml = (seg.axes || [])
    .map((axis) => {
      const rows = axis.members
        .filter((m) =>
          metricMatchesQuery(query, { label: m.label, key: m.member, student: axis.label }, null, 'segment revenue')
        )
        .map((m) => {
          const bits = [
            m.revenue != null ? `Revenue ${formatUsd(m.revenue)}` : null,
            m.operating_income != null ? `Operating income ${formatUsd(m.operating_income)}` : null,
            m.assets != null ? `Assets ${formatUsd(m.assets)}` : null,
            m.depreciation_amortization != null ? `D&A ${formatUsd(m.depreciation_amortization)}` : null,
          ].filter(Boolean);
          const point = {
            form: filing?.form || '10-K',
            filed: filing?.filingDate,
            tag: m.member,
            taxonomy: 'us-gaap',
            val: m.revenue,
          };
          return `<tr class="fm-info-row" data-metric="${escapeHtml(m.member)}">
            <td class="label"><span class="fm-info-metric-name">${escapeHtml(m.label)}</span></td>
            <td class="val">${escapeHtml(formatUsd(m.revenue) || '—')}</td>
            <td class="def">${escapeHtml(bits.join(' · ') || 'No tagged amounts for this member.')}</td>
            <td class="src">
              <p>Inline XBRL member ${escapeHtml(m.member)} on the ${escapeHtml(axis.label)} axis of the latest annual report${filingNote}.</p>
              ${sourceLinksHtml(point, { tags: m.member })}
            </td>
          </tr>`;
        })
        .join('');
      if (!rows) return '';
      return `<div class="fm-info-axis"><h4>${escapeHtml(axis.label)}</h4>
        <div class="fm-info-table-wrap">
          <table class="fm-info-table">
            <thead><tr><th>Member</th><th>Revenue</th><th>Definition</th><th>Where to find it</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div></div>`;
    })
    .filter(Boolean)
    .join('');
  if (!axisHtml) return '';
  return `<section class="fm-info-group is-segment" id="group-segments">
    <h3>Reportable segments</h3>
    <p class="fm-info-summary">Dimensional facts from the annual report. Product and geography are alternative decompositions of consolidated revenue; do not add them together.</p>
    ${axisHtml}
  </section>`;
}

function renderCompany(company) {
  const headlines = headlinesForCompany(company);
  const cik = Number(company.cik);
  const root = $('info-company');
  const query = state.metricQuery;
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
  const filing = currentFiling();

  const filedHtml = FILED_PACK_GROUPS.map((g) => {
    const defs = g.keys.map((key) => filedDef(key)).filter(Boolean);
    const visible = defs.filter((def) => metricMatchesQuery(query, def, headlines?.metrics?.[def.key]));
    const rows = visible.map((def) => filedRow(def, headlines, g.id, cik)).join('');
    return groupTable(g.label, g.summary, rows, `group-${g.id}`, ['Metric', 'Value', 'Definition', 'Where to find it'], GROUP_TONE[g.id] || 'ratio');
  }).join('');

  const derivedHtml = DERIVED_PACK_GROUPS.map((g) => {
    const defs = g.keys.map((key) => derivedDef(key)).filter(Boolean);
    const visible = defs.filter((def) => metricMatchesQuery(query, def, { tag: def.formula }));
    const rows = visible.map((def) => derivedRow(def, headlines)).join('');
    return groupTable(g.label, g.summary, rows, `group-${g.id}`, ['Metric', 'Value', 'Definition', 'Where to find it'], GROUP_TONE[g.id] || 'ratio');
  }).join('');

  const seg = state.segments.get(Number(company.cik));
  const segHtml = renderSegments(seg, query);
  const hasAny = Boolean(filedHtml || derivedHtml || segHtml);

  const filingLinks = filingSourceLinks({
    company,
    point: headlines.metrics?.revenue,
    filing,
  });
  const filingBar = filingLinks.length
    ? `<p class="fm-info-filing-links">${filingLinks
        .map(
          (l) =>
            `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`
        )
        .join('')}</p>`
    : '';

  root.hidden = false;
  root.innerHTML = `<div class="fm-info-head">
      <div>
        <h2>${escapeHtml(company.company)}</h2>
        <p class="fm-info-meta">${escapeHtml(tickerOf(company))} · FY${headlines.asOfYear}${
          period ? ` ended ${escapeHtml(period)}` : ''
        } · ${escapeHtml(headlines.entityName || '')}</p>
        ${filingBar}
      </div>
      <div class="fm-info-counts"><strong>${tagged}</strong> of ${total} filed tags present<br />Dash = not tagged, not zero</div>
    </div>
    <div class="fm-info-toolbar">
      <label class="fm-info-search-label" for="metric-search">Metric</label>
      <input
        id="metric-search"
        class="fm-search"
        type="search"
        placeholder="Search metrics, tags, or definitions…"
        autocomplete="off"
        value="${escapeHtml(query)}"
        aria-label="Search metrics"
      />
    </div>
    ${renderFiledTagsPanel(company, headlines)}
    ${hasAny ? `${filedHtml}${derivedHtml}${segHtml}` : '<p class="fm-info-note">No metrics match that search.</p>'}`;

  const metricInput = $('metric-search');
  if (metricInput) {
    metricInput.addEventListener('input', () => {
      state.metricQuery = metricInput.value;
      const y = window.scrollY;
      renderCompany(state.company);
      const again = $('metric-search');
      if (again) {
        again.focus();
        const len = again.value.length;
        again.setSelectionRange(len, len);
      }
      window.scrollTo(0, y);
    });
  }
  bindFiledPanel(company, headlines);
  const mapInput = root.querySelector(`input[data-map-metric="${CSS.escape(state.mapFocus || '')}"]`);
  if (mapInput && state.mapFocus) {
    mapInput.focus();
    const len = mapInput.value.length;
    mapInput.setSelectionRange(len, len);
  }
}

function selectCompany(company) {
  state.company = company;
  state.metricQuery = '';
  state.expanded = new Set();
  state.filedOpen = false;
  state.filedLoading = false;
  state.filedError = null;
  state.filedPayload = null;
  state.filedFilter = 'all';
  state.filedQuery = '';
  state.mapFocus = null;
  state.mapQuery = {};
  const ticker = tickerOf(company);
  const url = new URL(window.location.href);
  url.searchParams.set('ticker', ticker);
  url.searchParams.set('cik', String(company.cik));
  history.replaceState({}, '', url);
  $('info-search').value = `${company.company} (${ticker})`;
  $('info-results').hidden = true;
  const headlines = headlinesForCompany(company);
  renderCompany(company);
  $('info-company').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (headlines?.asOfYear) {
    loadFiledTags(company, headlines).then(() => {
      if (state.company === company) renderCompany(company);
    });
  }
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

function toggleSeries(id) {
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  const y = window.scrollY;
  if (state.company) renderCompany(state.company);
  window.scrollTo(0, y);
}

function applyUseForTag(selectEl) {
  const metricKey = selectEl.value;
  if (!metricKey || !state.company) return;
  const concept = selectEl.dataset.useTag || '';
  const sep = concept.indexOf(':');
  if (sep < 0) return;
  const taxonomy = concept.slice(0, sep);
  const tag = concept.slice(sep + 1);
  const row = state.filedPayload?.rows?.find((r) => r.taxonomy === taxonomy && r.tag === tag);
  if (!row) return;
  const def = filedDef(metricKey);
  const cik = Number(state.company.cik);
  const base = state.snapshot.get(cik)?.metrics?.[metricKey];
  const hasTagged =
    base && typeof base.val === 'number' && Number.isFinite(base.val) && !base.override;
  if (hasTagged) {
    const label = def?.label || metricKey;
    if (!window.confirm(`Replace the tagged ${label} value with ${taxonomy}:${tag}?`)) {
      selectEl.value = '';
      return;
    }
  }
  saveOverride(cik, metricKey, row);
  selectEl.value = '';
  const y = window.scrollY;
  renderCompany(state.company);
  window.scrollTo(0, y);
}

function bindFiledPanel(company, headlines) {
  const details = $('all-filed-tags');
  if (!details) return;
  details.addEventListener('toggle', async () => {
    state.filedOpen = details.open;
    if (!details.open || state.filedPayload || state.filedLoading) return;
    await loadFiledTags(company, headlines);
    if (state.company === company) renderCompany(company);
  });
}

function applyMapPick(metricKey, concept) {
  if (!metricKey || !state.company || !concept) return;
  const sep = concept.indexOf(':');
  if (sep < 0) return;
  const taxonomy = concept.slice(0, sep);
  const tag = concept.slice(sep + 1);
  const row = state.filedPayload?.rows?.find((r) => r.taxonomy === taxonomy && r.tag === tag);
  if (!row) return;
  saveOverride(Number(state.company.cik), metricKey, row);
  state.mapFocus = null;
  state.mapQuery = { ...state.mapQuery, [metricKey]: '' };
  const y = window.scrollY;
  renderCompany(state.company);
  window.scrollTo(0, y);
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
  $('info-company').addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;
    if (ev.target.closest('.fm-info-map')) {
      const hit = ev.target.closest('[data-map-pick]');
      if (hit) {
        ev.preventDefault();
        applyMapPick(hit.dataset.mapMetric, hit.dataset.mapPick);
      }
      return;
    }
    const clearBtn = ev.target.closest('[data-clear-override]');
    if (clearBtn && state.company) {
      ev.preventDefault();
      clearOverride(Number(state.company.cik), clearBtn.dataset.clearOverride);
      const y = window.scrollY;
      renderCompany(state.company);
      window.scrollTo(0, y);
      return;
    }
    const chip = ev.target.closest('[data-filed-filter]');
    if (chip) {
      ev.preventDefault();
      state.filedFilter = chip.dataset.filedFilter || 'all';
      const y = window.scrollY;
      renderCompany(state.company);
      window.scrollTo(0, y);
      return;
    }
    const btn = ev.target.closest('[data-series-for]') || ev.target.closest('.fm-info-row')?.querySelector('[data-series-for]');
    if (!btn) return;
    ev.preventDefault();
    toggleSeries(btn.dataset.seriesFor);
  });
  $('info-company').addEventListener('change', (ev) => {
    const sel = ev.target.closest('select[data-use-tag]');
    if (sel) applyUseForTag(sel);
  });
  $('info-company').addEventListener('input', (ev) => {
    if (ev.target.id === 'filed-search') {
      state.filedQuery = ev.target.value;
      const y = window.scrollY;
      renderCompany(state.company);
      const again = $('filed-search');
      if (again) {
        again.focus();
        const len = again.value.length;
        again.setSelectionRange(len, len);
      }
      window.scrollTo(0, y);
      return;
    }
    const mapInput = ev.target.closest('[data-map-metric]');
    if (mapInput && state.company) {
      const key = mapInput.dataset.mapMetric;
      state.mapFocus = key;
      state.mapQuery = { ...state.mapQuery, [key]: mapInput.value };
      const headlines = headlinesForCompany(state.company);
      if (!state.filedPayload && !state.filedLoading && headlines?.asOfYear) {
        loadFiledTags(state.company, headlines).then(() => {
          if (state.company) renderCompany(state.company);
        });
      }
      const y = window.scrollY;
      renderCompany(state.company);
      window.scrollTo(0, y);
    }
  });
  $('info-company').addEventListener('focusin', (ev) => {
    const mapInput = ev.target.closest('[data-map-metric]');
    if (!mapInput || !state.company) return;
    state.mapFocus = mapInput.dataset.mapMetric;
    const headlines = headlinesForCompany(state.company);
    if (!state.filedPayload && !state.filedLoading && headlines?.asOfYear) {
      loadFiledTags(state.company, headlines).then(() => {
        if (state.company) renderCompany(state.company);
      });
    }
  });
  $('info-company').addEventListener(
    'toggle',
    async (ev) => {
      const details = ev.target;
      if (!details?.id || details.id !== 'all-filed-tags' || !state.company) return;
      state.filedOpen = details.open;
      if (details.open && !state.filedPayload && !state.filedLoading) {
        const headlines = headlinesForCompany(state.company);
        await loadFiledTags(state.company, headlines);
        renderCompany(state.company);
      }
    },
    true
  );
}

await loadData();
$('info-status').textContent = `${state.companies.length} public filers. Search a name to open its tagged metrics.`;
bind();
const initial = findByQuery();
if (initial) selectCompany(initial);
else renderResults(searchCompanies('apple'));
