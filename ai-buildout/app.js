import {
  COMPANIES,
  DEALS,
  RESEARCH_CLAIMS,
  PARLAY_LEGS,
  ROLES,
  hyperscalers,
} from './catalog.js';
import {
  formatUsd,
  formatPercent,
  formatCentsPerDollar,
  formatPeriodEnd,
  gdpShare,
  numberOr,
  absCapex,
  groupOfferingEvents,
  offeringHeadline,
} from './extract.js';

const snap = await fetch('./data/snapshot.json').then((r) => {
  if (!r.ok) throw new Error(`snapshot ${r.status}`);
  return r.json();
});

const byId = Object.fromEntries((snap.companies || []).map((c) => [c.id, c]));
const catalog = COMPANIES.map((c) => {
  const row = byId[c.id] || {};
  return { ...c, extracted: row.extracted, error: row.error };
});

let view = 'hyperscalers';

function visibleCompanies() {
  return view === 'all' ? catalog : catalog.filter((c) => c.role === 'hyperscaler');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dash(v) {
  return v == null || v === '' ? '<span class="miss">—</span>' : v;
}

function latestVal(co, key) {
  return numberOr(co.extracted?.latest?.[key]?.val);
}

function hyperscalerCapex() {
  let sum = 0;
  let n = 0;
  for (const co of hyperscalers()) {
    const row = byId[co.id];
    const v = absCapex(latestVal(row || {}, 'capex'));
    if (v == null) continue;
    sum += v;
    n += 1;
  }
  return n ? sum : null;
}

function renderChips() {
  const capex = hyperscalerCapex();
  const gdp = numberOr(snap.gdp?.value);
  const share = gdpShare(capex, gdp);
  const amazon = byId.amzn;
  const amznEat = amazon?.extracted?.derived?.capex_to_cfo;
  const grouped = groupOfferingEvents(snap.events || []);
  const events = grouped.length;
  const el = document.getElementById('stat-chips');
  el.innerHTML = [
    {
      val: formatCentsPerDollar(share) || '—',
      label: `of US GDP · five builders’ tagged CapEx`,
    },
    {
      val: formatUsd(capex) || '—',
      label: 'latest 10-K CapEx, five builders',
    },
    {
      val: formatPercent(amznEat, { digits: 0 }) || '—',
      label: 'Amazon CapEx / operating cash',
    },
    {
      val: String(events),
      label: 'takedown days (424B / FWP grouped)',
    },
  ]
    .map(
      (c) =>
        `<div class="ab-chip"><div class="ab-chip-val">${c.val}</div><div class="ab-chip-label">${c.label}</div></div>`
    )
    .join('');

  const pulled = snap.pulled_at ? formatPeriodEnd(snap.pulled_at.slice(0, 10)) : '';
  const gdpDate = snap.gdp?.date ? formatPeriodEnd(snap.gdp.date) : '';
  document.getElementById('pulled-note').textContent =
    `Snapshot ${pulled}. GDP ${dashText(formatUsd(gdp))} as of ${gdpDate} (${snap.gdp?.source || 'FRED'}). Headlines quoting ~$700B are this year’s spend guidance, not this trailing tag.`;
}

function dashText(v) {
  return v == null ? '—' : v;
}

function renderEat() {
  const rows = visibleCompanies();
  document.getElementById('eat-bars').innerHTML = rows
    .map((co) => {
      const ratio = co.extracted?.derived?.capex_to_cfo;
      const pct = ratio == null ? null : Math.min(ratio, 1);
      const over = ratio != null && ratio > 1;
      const width = pct == null ? 0 : pct * 100;
      const label = ratio == null ? '—' : formatPercent(ratio, { digits: 0 });
      return `<div class="ab-eat-row">
        <div class="ab-eat-name">${escapeHtml(co.ticker)}</div>
        <div class="ab-eat-track" title="${escapeHtml(co.name)}">
          <div class="ab-eat-fill" style="width:${width}%;background:${co.color}"></div>
          ${over ? '<div class="ab-eat-over"></div>' : ''}
        </div>
        <div class="ab-eat-pct">${label}</div>
      </div>`;
    })
    .join('');
}

function renderStackTable() {
  const rows = visibleCompanies();
  const head = `<thead><tr>
    <th>Company</th><th>Role</th>
    <th class="num">CFO</th><th class="num">CapEx</th>
    <th class="num">CapEx/CFO</th><th class="num">FCF</th>
    <th class="num">Debt proceeds</th>
    <th>As of</th>
  </tr></thead>`;
  const body = rows
    .map((co) => {
      const x = co.extracted;
      const end = x?.latest?.cfo?.end || x?.latest?.capex?.end;
      return `<tr>
        <td><strong>${escapeHtml(co.name)}</strong> ${escapeHtml(co.ticker)}</td>
        <td title="${escapeHtml(co.fyNote || '')}">${escapeHtml(ROLES[co.role] || co.role)}</td>
        <td class="num">${dash(formatUsd(latestVal(co, 'cfo')))}</td>
        <td class="num">${dash(formatUsd(absCapex(latestVal(co, 'capex'))))}</td>
        <td class="num">${dash(formatPercent(x?.derived?.capex_to_cfo, { digits: 0 }))}</td>
        <td class="num">${dash(formatUsd(x?.derived?.fcf))}</td>
        <td class="num">${dash(formatUsd(x?.funding?.debt_proceeds))}</td>
        <td>${dash(end ? `FY${x.asOfYear} · ${formatPeriodEnd(end)}` : null)}</td>
      </tr>`;
    })
    .join('');
  document.getElementById('stack-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderIceberg() {
  const rows = visibleCompanies();
  const max = Math.max(
    1,
    ...rows.flatMap((co) => [
      numberOr(co.extracted?.iceberg?.long_term_debt) || 0,
      numberOr(co.extracted?.iceberg?.lease_liability) || 0,
      numberOr(co.extracted?.iceberg?.remaining_lease_payments) || 0,
    ])
  );
  const metricRows = [
    ['long_term_debt', 'Long-term debt', 1],
    ['lease_liability', 'Lease liabilities', 0.55],
    ['remaining_lease_payments', 'Remaining lease payments', 0.28],
  ];
  document.getElementById('iceberg-chart').innerHTML = rows
    .map((co) => {
      const ice = co.extracted?.iceberg || {};
      const bars = metricRows
        .map(([key, label, opacity]) => {
          const v = numberOr(ice[key]);
          const width = v == null ? 0 : (v / max) * 100;
          return `<div class="ab-ice-row">
            <span class="ab-ice-label">${label}</span>
            <div class="ab-eat-track">
              <div class="ab-eat-fill" style="width:${width}%;background:${co.color};opacity:${opacity}"></div>
            </div>
            <span class="ab-eat-pct">${dash(formatUsd(v))}</span>
          </div>`;
        })
        .join('');
      return `<div class="ab-ice-co">
        <div class="ab-ice-name">${escapeHtml(co.name)}</div>
        ${bars}
      </div>`;
    })
    .join('');

  const head = `<thead><tr>
    <th>Company</th>
    <th class="num">Long-term debt</th>
    <th class="num">Lease liabilities</th>
    <th class="num">Remaining lease payments</th>
    <th class="num">Purchase obligations</th>
  </tr></thead>`;
  const body = rows
    .map((co) => {
      const ice = co.extracted?.iceberg || {};
      return `<tr>
        <td><strong>${escapeHtml(co.name)}</strong></td>
        <td class="num">${dash(formatUsd(ice.long_term_debt))}</td>
        <td class="num">${dash(formatUsd(ice.lease_liability))}</td>
        <td class="num">${dash(formatUsd(ice.remaining_lease_payments))}</td>
        <td class="num">${dash(formatUsd(ice.purchase_obligation))}</td>
      </tr>`;
    })
    .join('');
  document.getElementById('iceberg-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderCfoChart() {
  const rows = visibleCompanies();
  const points = [];
  for (const co of rows) {
    for (const d of co.extracted?.derivedSeries || []) {
      if (d.capex_to_cfo == null || !Number.isFinite(d.capex_to_cfo)) continue;
      points.push({ id: co.id, year: d.year, y: d.capex_to_cfo, color: co.color });
    }
  }
  const years = [...new Set(points.map((p) => p.year))].sort((a, b) => a - b);
  if (!years.length) {
    document.getElementById('cfo-chart').innerHTML = '<p class="ab-foot">No CapEx/CFO series tagged.</p>';
    return;
  }
  const ymin = 0;
  const ymax = Math.max(1.2, ...points.map((p) => p.y));
  const w = 760;
  const h = 280;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const x = (year) => pad.l + ((year - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * innerW;
  const y = (v) => pad.t + innerH - ((v - ymin) / (ymax - ymin)) * innerH;
  const bandTop = y(0.5);
  const bandBot = y(0.4);
  const band = `<rect x="${pad.l}" y="${bandTop}" width="${innerW}" height="${Math.max(0, bandBot - bandTop)}" fill="rgba(255,234,86,0.35)"/>`;
  const grid = [0, 0.5, 1]
    .filter((v) => v <= ymax)
    .map(
      (v) =>
        `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(28,28,28,0.12)"/>
         <text x="0" y="${y(v) + 4}" font-size="11" font-family="DM Mono, monospace" fill="#6b5f5e">${Math.round(v * 100)}%</text>`
    )
    .join('');
  const ticks = years
    .filter((_, i) => i === 0 || i === years.length - 1 || years[i] % 2 === 0)
    .map(
      (yr) =>
        `<text x="${x(yr)}" y="${h - 6}" font-size="11" text-anchor="middle" font-family="DM Mono, monospace" fill="#6b5f5e">${yr}</text>`
    )
    .join('');
  const lines = rows
    .map((co) => {
      const pts = (co.extracted?.derivedSeries || []).filter(
        (d) => d.capex_to_cfo != null && Number.isFinite(d.capex_to_cfo)
      );
      if (pts.length < 2) return '';
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.capex_to_cfo)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${co.color}" stroke-width="2.2"/>`;
    })
    .join('');
  const legend = rows
    .map((co) => `<span><i style="background:${co.color}"></i>${co.ticker}</span>`)
    .join('');
  document.getElementById('cfo-chart').innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="CapEx as a share of operating cash over ten years">
      ${band}${grid}${ticks}${lines}
    </svg>
    <div class="ab-legend">${legend}<span>Cream band = 40–50%</span></div>`;
}

function renderEvents() {
  const allowed = new Set(visibleCompanies().map((c) => c.cik));
  const items = groupOfferingEvents((snap.events || []).filter((e) => allowed.has(e.cik))).slice(0, 24);
  document.getElementById('event-list').innerHTML = items
    .map((e) => {
      const href = e.url || '#';
      return `<a class="ab-event" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        <span class="when">${escapeHtml(e.filed || '—')}</span>
        <span>${escapeHtml(e.ticker || '')}</span>
        <span class="form">${escapeHtml(offeringHeadline(e))}</span>
      </a>`;
    })
    .join('');
}

function renderFootnotes() {
  const el = document.getElementById('footnote-hits');
  if (!el) return;
  const allowed = new Set(visibleCompanies().map((c) => c.cik));
  const hits = (snap.footnoteHits || []).filter((h) => allowed.has(h.cik)).slice(0, 20);
  if (!hits.length) {
    el.innerHTML = '<p class="ab-foot">No residual-value-guarantee / Beignet / Soapia hits in the latest EDGAR full-text pull for these names.</p>';
    return;
  }
  el.innerHTML = hits
    .map((h) => {
      const href = h.url || '#';
      return `<a class="ab-event" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        <span class="when">${escapeHtml(h.filed || '—')}</span>
        <span>${escapeHtml(h.ticker || '')}</span>
        <span class="form">${escapeHtml(h.form || '')}</span>
        <span>${escapeHtml(h.phrase || '')}</span>
      </a>`;
    })
    .join('');
}

function renderDeals() {
  document.getElementById('deal-cards').innerHTML = DEALS.map((d) => {
    const rows = [
      ['Campus', `${d.campus} · ${d.where}`],
      ['Vehicle', d.vehicle],
      ['Size', d.sizeLabel],
      ['Equity', d.equitySplit],
      ['Bonds', d.bondMaturity ? `Run to ${d.bondMaturity}` : '—'],
      ['Lease', [d.leaseStart && `starts ${d.leaseStart}`, d.leaseRenewal].filter(Boolean).join(' · ') || '—'],
      ['Guarantee', d.residualGuarantee || '—'],
    ]
      .map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`)
      .join('');
    return `<article class="ab-deal">
      <h3>${d.name}</h3>
      <div class="meta">${d.parent} · curated card, not an XBRL tag</div>
      <dl>${rows}</dl>
      <p>${d.why}</p>
      ${d.mismatch ? `<p>${d.mismatch}</p>` : ''}
      <p><a href="${d.filingUrl}" target="_blank" rel="noopener noreferrer">Meta filings on EDGAR</a></p>
    </article>`;
  }).join('');
}

function renderParlay() {
  const capex = hyperscalerCapex();
  const rev = hyperscalers().reduce((sum, co) => {
    const v = latestVal(byId[co.id] || {}, 'revenue');
    return v == null ? sum : sum + v;
  }, 0);
  const events = (snap.events || []).filter((e) => hyperscalers().some((h) => h.cik === e.cik)).length;
  const stats = {
    revenue: `${formatUsd(rev) || '—'} revenue vs ${formatUsd(capex) || '—'} CapEx (company totals, not AI segment)`,
    returns: 'Operating margin and asset turnover from the same 10-Ks — see the table above.',
    borrowing: `${events} recent offering filings across the five builders in this snapshot.`,
    grid: 'Not in this page.',
  };
  document.getElementById('parlay-cards').innerHTML = PARLAY_LEGS.map(
    (leg) => `<article>
      <h3>${leg.title}</h3>
      <div class="stat">${stats[leg.id] || ''}</div>
      <p>${leg.honest}</p>
    </article>`
  ).join('');
}

function renderClaims() {
  document.getElementById('claim-list').innerHTML = RESEARCH_CLAIMS.map(
    (c) => `<li>${c.claim}<span class="src">${c.source} · as of ${c.asOf}</span></li>`
  ).join('');
}

function renderAll() {
  renderEat();
  renderStackTable();
  renderCfoChart();
  renderIceberg();
  renderEvents();
  renderFootnotes();
}

for (const btn of document.querySelectorAll('[data-view]')) {
  btn.addEventListener('click', () => {
    view = btn.getAttribute('data-view');
    for (const other of document.querySelectorAll('[data-view]')) {
      other.setAttribute('aria-pressed', String(other === btn));
    }
    renderAll();
  });
}

renderChips();
renderAll();
renderDeals();
renderParlay();
renderClaims();
