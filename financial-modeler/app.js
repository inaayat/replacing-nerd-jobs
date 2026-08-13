/**
 * Financial modeler page. Loads the same Fortune 500 snapshot the ratios page
 * uses, runs the engine, and renders the three models with the guesses beside
 * them. No build step: plain ESM modules loaded by the browser.
 */
import { ensureRatios, formatUsd, formatPercent } from '../fortune-500/extract.js';
import { isPublic, PRIVATE_NOTES } from '../fortune-500/catalog.js';
import { priceTicker } from '../fortune-500/prices.js';
import {
  defaultAssumptions,
  applyScenario,
  runThreeStatement,
  runDcf,
  dcfSensitivity,
  runComps,
  modelReadiness,
  SCALE,
} from './engine.js';
import { DIALS, DIAL_GROUPS, dialsFor } from './dials.js';
import { buildWorkbook, workbookFilename, downloadWorkbook } from './workbook.js';

const $ = (id) => document.getElementById(id);

const state = {
  companies: [],
  snapshot: new Map(),
  prices: new Map(),
  company: null,
  headlines: null,
  models: ['three', 'dcf', 'comps'],
  assumptions: null,
  scenario: 'base',
  peers: [],
  tourStep: 0,
};

const MODEL_PICKS = [
  {
    id: 'three',
    title: '3-statement model',
    blurb: 'Income statement, balance sheet, and cash flow wired together. Everything else is built on this one.',
  },
  {
    id: 'dcf',
    title: 'Discounted cash flow',
    blurb: 'What the business is worth if you own all its future cash. Ends in a price per share.',
  },
  {
    id: 'comps',
    title: 'Trading comps',
    blurb: 'What the market pays for similar companies right now, applied to this one.',
  },
];

const TOUR = [
  {
    title: 'Pick a company',
    body: 'Start with Apple if you have no strong feelings. Any public Fortune 500 filer works — private ones have no 10-K, so there is nothing to model.',
  },
  {
    title: 'Choose your models',
    body: 'Leave all three on. The DCF reads the cash flows the 3-statement produced, and comps sanity-check the answer against the market.',
  },
  {
    title: 'Change the blue numbers',
    body: 'Blue means you typed it. Black means the model worked it out. Move a slider and watch every statement redraw — then download the same thing as a spreadsheet.',
  },
];

/* ------------------------------ formatting ----------------------------- */

const fmtM = (n) =>
  n == null || !Number.isFinite(n)
    ? null
    : (n / SCALE).toLocaleString('en-US', { maximumFractionDigits: 0 });

const fmtPrice = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : null);
const fmtX = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}×` : null);

function dialValueText(dial, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (dial.fmt === 'pct') return `${(value * 100).toFixed(1)}%`;
  if (dial.fmt === 'days') return `${Math.round(value)} days`;
  return value.toFixed(2);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/* --------------------------------- data -------------------------------- */

async function loadData() {
  const [mapRes, snapRes] = await Promise.all([
    fetch('/fortune-500/data/fortune500_edgar_mapping.json'),
    fetch('/fortune-500/data/headlines-snapshot.json'),
  ]);
  state.companies = await mapRes.json();
  const snap = await snapRes.json();
  for (const [cik, row] of Object.entries(snap.companies || {})) {
    state.snapshot.set(Number(cik), ensureRatios(row));
  }
}

/** Yahoo via the existing proxy. Absent under a plain static server — that is
 *  a "not reported", not a zero. */
async function loadPrice(company) {
  const ticker = priceTicker(company);
  if (!ticker || state.prices.has(ticker)) return state.prices.get(ticker) ?? null;
  try {
    const res = await fetch(`/api/f500-prices?ticker=${encodeURIComponent(ticker)}&range=1y`);
    if (!res.ok) throw new Error('no price');
    const data = await res.json();
    const last = data?.last?.close ?? data?.last ?? null;
    const price = Number.isFinite(last) ? last : null;
    state.prices.set(ticker, price);
    return price;
  } catch {
    state.prices.set(ticker, null);
    return null;
  }
}

function headlinesFor(company) {
  return state.snapshot.get(Number(company?.cik)) || null;
}

/** Peers: the other Fortune filers closest in rank that actually filed. */
function peerSet(company) {
  const ranked = state.companies
    .filter((c) => isPublic(c) && c.cik !== company.cik && state.snapshot.has(Number(c.cik)))
    .sort((a, b) => Math.abs(a.rank - company.rank) - Math.abs(b.rank - company.rank));
  return ranked.slice(0, 4);
}

/* -------------------------------- search ------------------------------- */

function renderQuick() {
  const picks = ['AAPL', 'MSFT', 'WMT', 'NVDA'];
  $('quick').innerHTML = picks
    .map((t) => `<button type="button" class="fm-chip" data-ticker="${t}">${t}</button>`)
    .join('');
  $('quick').onclick = (e) => {
    const t = e.target.closest('[data-ticker]');
    if (!t) return;
    const company = state.companies.find((c) => c.fortune_ticker === t.dataset.ticker);
    if (company) selectCompany(company);
  };
}

function renderResults(query) {
  const box = $('results');
  const q = query.trim().toLowerCase();
  if (!q) {
    box.hidden = true;
    return;
  }
  const hits = state.companies
    .filter((c) => c.company?.toLowerCase().includes(q) || c.fortune_ticker?.toLowerCase().includes(q))
    .slice(0, 40);
  box.hidden = false;
  if (!hits.length) {
    box.innerHTML = '<p class="fm-empty">Nothing by that name in the Fortune 500 list.</p>';
    return;
  }
  box.innerHTML = hits
    .map((c) => {
      const pub = isPublic(c);
      const has = pub && state.snapshot.has(Number(c.cik));
      const sub = !pub ? 'Private — no 10-K' : has ? `#${c.rank} · ${c.fortune_ticker}` : 'No filing in the snapshot';
      return `<button type="button" class="fm-result${has ? '' : ' is-private'}" data-cik="${c.cik}" ${has ? '' : 'disabled'}>
        <strong>${escapeHtml(c.company)}</strong><span>${escapeHtml(sub)}</span></button>`;
    })
    .join('');
  box.onclick = (e) => {
    const btn = e.target.closest('[data-cik]');
    if (!btn) return;
    const company = state.companies.find((c) => String(c.cik) === btn.dataset.cik);
    if (company) selectCompany(company);
  };
}

/* ------------------------------ selection ------------------------------ */

async function selectCompany(company) {
  state.company = company;
  $('results').hidden = true;
  $('search').value = company.company;

  if (!isPublic(company)) {
    state.headlines = null;
    document.body.classList.remove('has-company');
    $('status').className = 'fm-status is-warn';
    $('status').textContent = `${company.company} is private. ${PRIVATE_NOTES?.[company.company] || 'No 10-K means no statements to model — we won’t invent them.'}`;
    $('step-models').hidden = true;
    $('step-build').hidden = true;
    $('dock').hidden = true;
    return;
  }

  const headlines = headlinesFor(company);
  if (!headlines) {
    document.body.classList.remove('has-company');
    $('status').className = 'fm-status is-warn';
    $('status').textContent = `${company.company} isn’t in the filing snapshot yet, so there’s nothing to build from.`;
    return;
  }
  state.headlines = headlines;
  const ready = modelReadiness(headlines);
  if (!ready.ok) {
    document.body.classList.remove('has-company');
    $('status').className = 'fm-status is-warn';
    $('status').textContent = `${company.company}’s filing is missing ${ready.missing.join(', ')} — a balance sheet can’t be built without those, and filling them with zero would be a lie.`;
    $('step-build').hidden = true;
    return;
  }

  $('status').className = 'fm-status';
  $('status').textContent = `Reading ${company.company}’s FY${headlines.asOfYear} 10-K.`;
  state.assumptions = defaultAssumptions(headlines);
  state.scenario = 'base';
  state.peers = peerSet(company);
  document.body.classList.add('has-company');
  $('step-models').hidden = false;
  $('step-build').hidden = false;
  $('dock').hidden = false;
  $('dock-ratios').href = `/fortune-500/#company=${company.cik}`;
  renderPicks();
  render();

  const prices = await Promise.all([company, ...state.peers].map((c) => loadPrice(c)));
  if (prices.some((p) => p != null)) render();
}

/* -------------------------------- dials -------------------------------- */

function originFor(dial, headlines) {
  const raw = dial.originKey ? headlines?.ratios?.[dial.originKey] : null;
  if (dial.key === 'dsoDays') {
    const d = state.assumptions?.dsoDays;
    return dial.originText(d == null ? null : `${Math.round(d)} days`);
  }
  if (dial.key === 'dioDays') {
    const d = state.assumptions?.dioDays;
    return dial.originText(d == null ? null : `${Math.round(d)} days`);
  }
  return dial.originText(Number.isFinite(raw) ? formatPercent(raw) : null);
}

/** The copy the workbook prints next to the same cell. */
function assumptionCards() {
  return DIALS.map((d) => ({ key: d.key, name: d.name, what: d.what, origin: originFor(d, state.headlines) }));
}

function renderDials(model) {
  const wrap = $('dials');
  const active = dialsFor(state.models);
  const scenarios = ['bear', 'base', 'bull']
    .map(
      (s) =>
        `<button type="button" data-scenario="${s}" aria-pressed="${state.scenario === s}">${s[0].toUpperCase()}${s.slice(1)}</button>`
    )
    .join('');

  const groups = DIAL_GROUPS.filter((g) => active.some((d) => d.group === g.id))
    .map((g) => {
      const cards = active
        .filter((d) => d.group === g.id)
        .map((d) => {
          const value = state.assumptions[d.key];
          const disabled = value == null;
          return `<div class="fm-dial">
            <div class="fm-dial-top">
              <span class="fm-dial-name">${escapeHtml(d.name)}</span>
              <input class="fm-dial-value" type="text" inputmode="decimal" data-key="${d.key}" value="${escapeHtml(dialValueText(d, value))}" ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(d.name)} value" />
            </div>
            ${disabled ? '' : `<input type="range" data-range="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${value}" aria-label="${escapeHtml(d.name)} slider" />`}
            <p class="fm-dial-what">${escapeHtml(d.what)}</p>
            <p class="fm-dial-origin">${escapeHtml(originFor(d, state.headlines))}</p>
            <p class="fm-dial-effect">${escapeHtml(d.effect)}</p>
          </div>`;
        })
        .join('');
      return `<h3 style="font-size:13px;margin-top:6px">${escapeHtml(g.label)}</h3>${cards}`;
    })
    .join('');

  wrap.innerHTML = `<div class="fm-scenarios" role="group" aria-label="Scenario">${scenarios}</div>${groups}`;

  wrap.querySelectorAll('[data-range]').forEach((el) => {
    el.addEventListener('input', () => {
      state.assumptions = { ...state.assumptions, [el.dataset.range]: Number(el.value) };
      render();
    });
  });
  wrap.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('change', () => {
      const dial = DIALS.find((d) => d.key === el.dataset.key);
      const raw = Number(String(el.value).replace(/[^0-9.\-]/g, ''));
      if (!Number.isFinite(raw)) return render();
      const value = dial.fmt === 'pct' ? raw / 100 : raw;
      state.assumptions = { ...state.assumptions, [dial.key]: value };
      render();
    });
  });
  wrap.querySelectorAll('[data-scenario]').forEach((el) => {
    el.addEventListener('click', () => {
      state.scenario = el.dataset.scenario;
      state.assumptions = applyScenario(defaultAssumptions(state.headlines), state.scenario);
      render();
    });
  });
  void model;
}

/* ------------------------------- rendering ----------------------------- */

function table(columns, sections) {
  const head = `<thead><tr><th>US$ millions</th>${columns
    .map((c) => `<th class="${c.filed ? 'fm-col-actual' : ''}">FY${c.year}${c.filed ? 'A' : 'E'}</th>`)
    .join('')}</tr></thead>`;
  const body = sections
    .map((section) => {
      const title = section.title ? `<tr class="fm-section"><td colspan="${columns.length + 1}">${escapeHtml(section.title)}</td></tr>` : '';
      const lines = section.lines
        .map((line) => {
          const cells = columns
            .map((c, i) => {
              const v = line.values[i];
              const text = line.fmt === 'raw' ? v : fmtM(v);
              return `<td class="${text == null ? 'fm-blank' : c.filed ? 'fm-actual' : 'fm-forecast'}">${text == null ? '—' : escapeHtml(String(text))}</td>`;
            })
            .join('');
          return `<tr class="${line.total ? 'fm-total' : ''}"><td>${escapeHtml(line.label)}</td>${cells}</tr>`;
        })
        .join('');
      return title + lines;
    })
    .join('');
  return `<div class="fm-scroll"><table class="fm-table">${head}<tbody>${body}</tbody></table></div>`;
}

function lineOf(rows, label, key, { total = false } = {}) {
  return { label, total, values: rows.map((r) => r[key]) };
}

function threeStatementPanel(model) {
  const rows = model.rows;
  const columns = rows.map((r) => ({ year: r.year, filed: r.filed }));
  const balances = model.checks.balances;
  const hasGross = model.assumptions.grossMargin != null;

  const is = table(columns, [
    {
      title: 'Income statement',
      lines: [
        lineOf(rows, 'Revenue', 'revenue'),
        ...(hasGross
          ? [lineOf(rows, 'Cost of sales', 'cogs'), lineOf(rows, 'Gross profit', 'grossProfit', { total: true })]
          : []),
        lineOf(rows, 'Operating expenses', 'opex'),
        lineOf(rows, 'Operating income (EBIT)', 'ebit', { total: true }),
        lineOf(rows, 'Interest expense', 'interestExpense'),
        lineOf(rows, 'Interest income', 'interestIncome'),
        lineOf(rows, 'Taxes', 'taxes'),
        lineOf(rows, 'Net income', 'netIncome', { total: true }),
      ],
    },
  ]);

  const bs = table(columns, [
    {
      title: 'Balance sheet',
      lines: [
        lineOf(rows, 'Cash (the plug)', 'cash'),
        lineOf(rows, 'Accounts receivable', 'receivables'),
        lineOf(rows, 'Inventory', 'inventory'),
        lineOf(rows, 'Other assets (PP&E, goodwill, untagged)', 'otherAssets'),
        lineOf(rows, 'Total assets', 'totalAssets', { total: true }),
        lineOf(rows, 'Long-term debt', 'debt'),
        lineOf(rows, 'Other liabilities', 'otherLiabilities'),
        lineOf(rows, 'Shareholders’ equity', 'equity'),
        lineOf(rows, 'Total liabilities & equity', 'totalLiabEquity', { total: true }),
        { label: 'Check — should be zero', total: true, values: rows.map((r) => r.balanceCheck) },
      ],
    },
  ]);

  const cfs = table(columns, [
    {
      title: 'Cash flow',
      lines: [
        lineOf(rows, 'Net income', 'netIncome'),
        lineOf(rows, 'Add back depreciation', 'da'),
        lineOf(rows, 'Cash from operations', 'cfo', { total: true }),
        lineOf(rows, 'Capital expenditure', 'capex'),
        lineOf(rows, 'Debt repayment', 'debtRepayment'),
        lineOf(rows, 'Dividends', 'dividends'),
        lineOf(rows, 'Net change in cash', 'netChangeCash', { total: true }),
      ],
    },
  ]);

  return `<section class="fm-panel">
    <h3>The three statements</h3>
    <p class="fm-aside"><strong>How this is built:</strong> revenue grows by your rate, margins turn it into profit, and profit flows into equity. Cash is whatever is left over after the other two statements have had their say — so if the balance check below reads zero, the model is internally honest.</p>
    <p class="${balances ? 'fm-flag is-ok' : 'fm-flag is-bad'}">${balances ? 'Balance sheet ties in every year' : 'Balance sheet does not tie — do not trust this'}</p>
    <div class="fm-statements">
      <div class="fm-statement">${is}</div>
      <div class="fm-statement">${bs}</div>
      <div class="fm-statement">${cfs}</div>
    </div>
    <p class="fm-aside">${escapeHtml(model.residualNote)}</p>
    <div class="fm-legend"><span class="is-blue">Blue — your input</span><span class="is-black">Black — calculated</span><span class="is-green">Green — link between sheets (in the Excel)</span></div>
  </section>`;
}

function dcfPanel(model, dcf, sens) {
  if (!dcf?.ok) {
    return `<section class="fm-panel"><h3>Discounted cash flow</h3><div class="fm-empty"><h3>Can’t value this yet</h3><p>${escapeHtml(dcf?.reason || 'No cash flows to discount.')}</p></div></section>`;
  }
  const rows = model.rows.filter((r) => r.offset > 0);
  const columns = rows.map((r) => ({ year: r.year, filed: false }));
  const flows = table(columns, [
    {
      title: 'Cash the business throws off',
      lines: [
        lineOf(rows, 'Operating income (EBIT)', 'ebit'),
        lineOf(rows, 'Unlevered free cash flow', 'unleveredFcf', { total: true }),
      ],
    },
  ]);

  const upClass = dcf.upside == null ? '' : dcf.upside >= 0 ? 'is-up' : 'is-down';
  const grid = sens
    ? `<div class="fm-scroll"><table class="fm-table"><thead><tr><th>WACC ╲ growth forever</th>${sens.growths
        .map((g) => `<th>${(g * 100).toFixed(2)}%</th>`)
        .join('')}</tr></thead><tbody>${sens.rows
        .map(
          (r) =>
            `<tr><td>${(r.wacc * 100).toFixed(2)}%</td>${r.cells
              .map((c) => `<td>${c == null ? '—' : escapeHtml(sens.unit === 'price' ? fmtPrice(c) : fmtM(c))}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody></table></div>`
    : '';

  return `<section class="fm-panel">
    <h3>What it’s worth (DCF)</h3>
    <p class="fm-aside"><strong>How this is built:</strong> add up the cash of the next five years, plus a lump sum for every year after that, then discount it all back to today at a rate that reflects the risk. Subtract debt, add cash, divide by shares — that’s a price.</p>
    <div class="fm-verdict">
      <div><dt>Discount rate (WACC)</dt><dd>${formatPercent(dcf.wacc.wacc)}</dd></div>
      <div><dt>Enterprise value</dt><dd>${formatUsd(dcf.enterpriseValue) || '—'}</dd></div>
      <div><dt>Implied share price</dt><dd>${fmtPrice(dcf.impliedPrice) || 'not reported'}</dd></div>
      <div><dt>Last market price</dt><dd>${fmtPrice(dcf.marketPrice) || 'not reported'}</dd></div>
      <div><dt>Upside</dt><dd class="${upClass}">${dcf.upside == null ? 'not reported' : formatPercent(dcf.upside, true)}</dd></div>
    </div>
    ${dcf.marketPrice == null ? '<p class="fm-aside">No live share price right now, so there is nothing to compare the implied price against. That stays blank rather than defaulting to zero.</p>' : ''}
    ${flows}
    <p class="fm-aside">${escapeHtml(`${formatPercent(dcf.terminalShare)} of this value is the terminal lump sum — the part you are least sure about. That is normal, and it is why the table below exists.`)}</p>
    <h4 style="margin-top:14px;font-size:14px">If you are wrong about the discount rate</h4>
    ${grid}
  </section>`;
}

function compsPanel(comps) {
  if (!comps?.ok) {
    return `<section class="fm-panel"><h3>Trading comps</h3><div class="fm-empty"><h3>No peers to compare against</h3><p>${escapeHtml(comps?.reason || 'Pick a company with public peers.')}</p></div></section>`;
  }
  const rows = [...comps.rows, comps.self];
  const body = rows
    .map(
      (r) => `<tr class="${r === comps.self ? 'fm-total' : ''}"><td>${escapeHtml(r.name)}${r === comps.self ? ' (you)' : ''}</td>
      <td>${fmtPrice(r.price) || 'nr'}</td>
      <td>${fmtM(r.enterpriseValue) || 'nr'}</td>
      <td>${fmtX(r.evRevenue) || 'nr'}</td>
      <td>${fmtX(r.evEbitda) || 'nr'}</td>
      <td>${fmtX(r.pe) || 'nr'}</td></tr>`
    )
    .join('');
  const stats = ['mean', 'median']
    .map(
      (k) =>
        `<tr class="fm-total"><td>Peer ${k}</td><td></td><td></td>
        <td>${fmtX(comps.stats.evRevenue[k]) || 'nr'}</td>
        <td>${fmtX(comps.stats.evEbitda[k]) || 'nr'}</td>
        <td>${fmtX(comps.stats.pe[k]) || 'nr'}</td></tr>`
    )
    .join('');
  const implied = comps.implied
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.label)}</td><td>${fmtX(i.multiple) || 'nr'}</td><td>${
          i.pricePerShare == null ? 'not reported' : fmtPrice(i.pricePerShare)
        }</td></tr>`
    )
    .join('');

  return `<section class="fm-panel">
    <h3>What the market pays for the neighbours</h3>
    <p class="fm-aside"><strong>How this is built:</strong> take similar companies, work out what multiple of their sales or profit the market pays, then apply the middle one to this company. It answers "what would a buyer pay today", not "what is it worth forever".</p>
    <div class="fm-scroll"><table class="fm-table">
      <thead><tr><th>Company</th><th>Price</th><th>EV ($m)</th><th>EV/Revenue</th><th>EV/EBITDA</th><th>P/E</th></tr></thead>
      <tbody>${body}${stats}</tbody></table></div>
    <p class="fm-aside">“nr” means that ingredient isn’t reported for that filer — it is left out of the median entirely rather than counted as zero, which would drag the answer down.</p>
    <h4 style="margin-top:14px;font-size:14px">What the peer median implies for ${escapeHtml(comps.self.name)}</h4>
    <div class="fm-scroll"><table class="fm-table">
      <thead><tr><th>Multiple</th><th>Peer median</th><th>Implied share price</th></tr></thead>
      <tbody>${implied}</tbody></table></div>
  </section>`;
}

function currentRun() {
  const headlines = state.headlines;
  if (!headlines) return null;
  const model = runThreeStatement(headlines, state.assumptions);
  if (!model.ok) return { model };
  const shares = headlines?.metrics?.shares_out?.val ?? null;
  model.shares = shares;
  model.companyName = state.company?.company || '';
  const price = state.prices.get(priceTicker(state.company)) ?? null;
  const dcf = runDcf(model, { price, shares });
  const sens = dcf.ok ? dcfSensitivity(model, dcf, { shares }) : null;
  const comps = runComps(
    { company: state.company, headlines, price },
    state.peers.map((c) => ({ company: c, headlines: headlinesFor(c), price: state.prices.get(priceTicker(c)) ?? null }))
  );
  return { model, dcf, sens, comps, price, shares };
}

function render() {
  const run = currentRun();
  if (!run) return;
  const { model, dcf, sens, comps } = run;
  if (!model.ok) {
    $('output').innerHTML = `<section class="fm-panel"><div class="fm-empty"><h3>Not enough filed data</h3><p>${escapeHtml(model.reason)}</p></div></section>`;
    return;
  }
  renderDials(model);
  const parts = [];
  if (state.models.includes('three')) parts.push(threeStatementPanel(model));
  if (state.models.includes('dcf')) parts.push(dcfPanel(model, dcf, sens));
  if (state.models.includes('comps')) parts.push(compsPanel(comps));
  $('output').innerHTML = parts.join('') || '<section class="fm-panel"><div class="fm-empty"><h3>Pick at least one model</h3><p>Step 2 above.</p></div></section>';

  $('dock-name').textContent = `${state.company.company} · FY${state.headlines.asOfYear}`;
  $('dock-check').textContent = model.checks.balances
    ? 'Balance sheet ties · ready to download'
    : 'Balance sheet does not tie';
}

function renderPicks() {
  $('model-picks').innerHTML = MODEL_PICKS.map((m) => {
    const on = state.models.includes(m.id);
    return `<button type="button" class="fm-pick" data-model="${m.id}" aria-pressed="${on}">
      <span class="fm-tick">${on ? '✓' : '+'}</span>
      <h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.blurb)}</p></button>`;
  }).join('');
  $('model-picks').onclick = (e) => {
    const btn = e.target.closest('[data-model]');
    if (!btn) return;
    const id = btn.dataset.model;
    state.models = state.models.includes(id) ? state.models.filter((m) => m !== id) : [...state.models, id];
    renderPicks();
    render();
  };
}

/* --------------------------------- tour -------------------------------- */

function renderTour() {
  if (localStorage.getItem('fm-tour-done') === '1') {
    $('tour').hidden = true;
    return;
  }
  $('tour').hidden = false;
  const step = TOUR[state.tourStep];
  $('tour-step').textContent = `Step ${state.tourStep + 1} of ${TOUR.length}`;
  $('tour-title').textContent = step.title;
  $('tour-body').textContent = step.body;
  $('tour-next').textContent = state.tourStep === TOUR.length - 1 ? 'Start building' : 'Got it';
}

function endTour() {
  localStorage.setItem('fm-tour-done', '1');
  $('tour').hidden = true;
}

/* ------------------------------- download ------------------------------ */

function download() {
  const run = currentRun();
  if (!run?.model?.ok) return;
  const bytes = buildWorkbook({
    company: state.company,
    headlines: state.headlines,
    model: run.model,
    dcf: run.dcf,
    sensitivity: run.sens,
    comps: run.comps,
    cards: assumptionCards(),
    include: { dcf: state.models.includes('dcf'), comps: state.models.includes('comps') },
  });
  downloadWorkbook(workbookFilename(state.company), bytes);
}

/* --------------------------------- boot -------------------------------- */

async function boot() {
  renderTour();
  $('tour-next').onclick = () => {
    state.tourStep += 1;
    if (state.tourStep >= TOUR.length) endTour();
    else renderTour();
  };
  $('tour-skip').onclick = endTour;
  $('dock-download').onclick = download;
  $('search').addEventListener('input', (e) => renderResults(e.target.value));

  try {
    await loadData();
  } catch {
    $('status').className = 'fm-status is-warn';
    $('status').textContent = 'Couldn’t load the filing snapshot. Reload the page?';
    return;
  }
  renderQuick();
  $('status').textContent = `${state.companies.length} companies loaded. ${state.snapshot.size} have a filing we can model.`;
}

boot();
