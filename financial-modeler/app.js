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
import {
  assumptionCatalog,
  sourceBadge,
  validateAssumption,
  isOverride,
} from './assumptions.js';
import { dependencyPath, dependencyRowKeys } from './dependencies.js';
import { stepsForTab } from './build-steps.js';
import { renderChecklist, previewForStep } from './checklist.js';
import {
  UNIT_DIALS,
  UNIT_DIAL_GROUPS,
  defaultUnitAssumptions,
  applyUnitScenario,
  runUnitEcon,
} from './unit-econ.js';
import { buildWorkbook, buildUnitWorkbook, workbookFilename, downloadWorkbook } from './workbook.js';

const $ = (id) => document.getElementById(id);

const state = {
  exercise: 'filer',
  companies: [],
  snapshot: new Map(),
  prices: new Map(),
  company: null,
  headlines: null,
  models: ['three', 'dcf', 'comps'],
  activeTab: 'three',
  assumptions: null,
  scenario: 'base',
  peers: [],
  tourStep: 0,
  inspectorCollapsed: false,
  setupEdit: null,
  focusedAssumption: null,
  buildStep: { three: 'revenue', dcf: 'fcf', comps: 'peers' },
  sourceDefaults: null,
};

const TABS = [
  {
    id: 'three',
    label: '3 Statements',
    hint: 'Income statement, balance sheet, and cash flow wired together. DCF and comps build on this.',
    filer: true,
    unit: true,
  },
  {
    id: 'dcf',
    label: 'DCF',
    hint: 'Depends on unlevered free cash flow from the three-statement forecast.',
    filer: true,
    unit: false,
  },
  {
    id: 'comps',
    label: 'Comps',
    hint: 'Depends on your peer set and live market prices — not an auto-picked neighbour list.',
    filer: true,
    unit: false,
  },
  {
    id: 'scenarios',
    label: 'Scenarios',
    hint: 'Changes several assumptions together — unlike sensitivity, which isolates one or two drivers.',
    filer: true,
    unit: true,
  },
  {
    id: 'sensitivity',
    label: 'Sensitivity',
    hint: 'Holds other assumptions constant while two drivers move — a range of outcomes, not one answer.',
    filer: true,
    unit: false,
  },
  {
    id: 'checks',
    label: 'Checks & Download',
    hint: 'Balance-sheet tie, warnings, and Excel download. Workbook includes only the models you selected in setup.',
    filer: true,
    unit: true,
    always: true,
  },
];

const EXERCISES = [
  {
    id: 'filer',
    title: 'From a 10-K',
    blurb: 'Pick a public Fortune 500 company. Last year’s filing is year 0; you forecast the next five.',
  },
  {
    id: 'unit',
    title: 'From one sale',
    blurb: 'A lemonade stall: cups × price, cost per cup, a cart you depreciate. Same three statements, smaller numbers.',
  },
];

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
    title: 'Pick an exercise',
    body: 'From a 10-K reads a public company’s filing. From one sale is a lemonade stall built from cups × price. Same three statements either way.',
  },
  {
    title: 'Choose your models',
    body: 'Leave all three on. The DCF reads the cash flows the 3-statement produced, and comps sanity-check the answer against the market.',
  },
  {
    title: 'Pick the comps yourself',
    body: 'Trading comps are only as honest as the peer set. Choose companies that actually do similar work — we will not invent a neighbour list from Fortune rank.',
  },
  {
    title: 'Change the blue numbers',
    body: 'Each blue number starts from a 10-K formula written on the card — sales ÷ last year’s sales, receivables ÷ sales × 365, and so on. Change it if you think the next five years won’t look like last year.',
  },
];

/* ------------------------------ formatting ----------------------------- */

const fmtM = (n) =>
  n == null || !Number.isFinite(n)
    ? null
    : (n / SCALE).toLocaleString('en-US', { maximumFractionDigits: 0 });

const fmtPrice = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : null);
const fmtX = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}×` : null);

function isUnit() {
  return state.exercise === 'unit';
}

function dialValueText(dial, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (dial.fmt === 'pct') return `${(value * 100).toFixed(1)}%`;
  if (dial.fmt === 'days') return `${Math.round(value)} days`;
  if (dial.fmt === 'years') return `${Math.round(value)} years`;
  if (dial.fmt === 'qty') return Math.round(value).toLocaleString('en-US');
  if (dial.fmt === 'usd') {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
  }
  return value.toFixed(2);
}

function parseDialInput(dial, rawText) {
  const raw = Number(String(rawText).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(raw)) return null;
  if (dial.fmt === 'pct') return raw / 100;
  return raw;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/* --------------------------------- data -------------------------------- */

async function loadData() {
  const [mapRes, snapRes, extraRes, extraSnapRes] = await Promise.all([
    fetch('/fortune-500/data/fortune500_edgar_mapping.json'),
    fetch('/fortune-500/data/headlines-snapshot.json'),
    fetch('/financial-modeler/extras.json'),
    fetch('/financial-modeler/extras-headlines.json'),
  ]);
  const mapping = await mapRes.json();
  const extras = extraRes.ok ? await extraRes.json() : [];
  const extraSnap = extraSnapRes.ok ? await extraSnapRes.json() : { companies: {} };
  const seenCik = new Set(mapping.map((c) => c.cik).filter((cik) => cik != null));
  const seenTicker = new Set(mapping.map((c) => c.fortune_ticker).filter(Boolean));
  const extraOnly = extras.filter(
    (c) => (c.cik == null || !seenCik.has(c.cik)) && !seenTicker.has(c.fortune_ticker)
  );
  state.companies = [...mapping, ...extraOnly];
  const snap = await snapRes.json();
  for (const [cik, row] of Object.entries({ ...snap.companies, ...extraSnap.companies } || {})) {
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

function compsOn() {
  return !isUnit() && state.models.includes('comps');
}

function workspaceLive() {
  return isUnit() ? Boolean(state.assumptions) : Boolean(state.company && state.headlines);
}

function availableTabs() {
  return TABS.filter((t) => {
    if (t.always) return true;
    if (isUnit()) return t.unit;
    return t.filer;
  });
}

function tabEnabled(tabId) {
  if (tabId === 'three' || tabId === 'scenarios' || tabId === 'checks') return true;
  if (tabId === 'dcf') return state.models.includes('dcf');
  if (tabId === 'comps') return state.models.includes('comps');
  if (tabId === 'sensitivity') return state.models.includes('dcf');
  return true;
}

function ensureActiveTab() {
  const tabs = availableTabs().filter((t) => tabEnabled(t.id));
  if (!tabs.some((t) => t.id === state.activeTab)) {
    state.activeTab = tabs[0]?.id || 'three';
  }
}

function syncLayout() {
  const live = workspaceLive();
  document.body.classList.toggle('has-company', live);
  document.body.classList.toggle('is-unit', isUnit());
  $('setup-summary').hidden = !live || Boolean(state.setupEdit);
  $('setup').hidden = isUnit() || (live && !state.setupEdit);
  $('step-exercise').hidden = live && state.setupEdit !== 'exercise';
  if (isUnit()) {
    $('step-models').hidden = true;
    $('step-peers').hidden = true;
    $('step-build').hidden = !live;
    $('dock').hidden = !live;
    if (live) ensureActiveTab();
    return;
  }
  $('dock').hidden = !live;
  if (!state.company || !state.headlines) {
    $('step-models').hidden = true;
    $('step-peers').hidden = true;
    $('step-build').hidden = true;
    state.setupEdit = null;
    return;
  }
  if (state.setupEdit) {
    $('step-models').hidden = state.setupEdit !== 'models';
    $('step-peers').hidden = state.setupEdit !== 'peers';
    $('step-company').hidden = state.setupEdit !== 'company';
    $('step-build').hidden = true;
    return;
  }
  $('step-company').hidden = live;
  $('step-models').hidden = !live;
  $('step-peers').hidden = !compsOn();
  $('step-build').hidden = !live;
  if (live) {
    ensureActiveTab();
    renderSetupSummary();
  }
  $('dock-ratios').hidden = isUnit() || Boolean(state.company?.extra);
}

function renderSetupSummary() {
  const grid = $('summary-grid');
  if (!workspaceLive()) {
    grid.innerHTML = '';
    return;
  }
  const exercise = EXERCISES.find((e) => e.id === state.exercise)?.title || '—';
  const company = isUnit()
    ? 'Lemonade stall'
    : `${state.company?.company || '—'} · FY${state.headlines?.asOfYear || '—'}`;
  const modelLabels = MODEL_PICKS.filter((m) => state.models.includes(m.id)).map((m) => m.title);
  const models = isUnit() ? '3-statement only' : modelLabels.length ? modelLabels.join(', ') : 'None selected';
  const peers = isUnit() || !compsOn() ? '—' : `${state.peers.length} peer${state.peers.length === 1 ? '' : 's'}`;
  const filing = isUnit() ? 'Unit exercise' : state.headlines?.asOfYear ? `FY${state.headlines.asOfYear} 10-K` : '—';

  grid.innerHTML = `
    <dl class="fm-summary-item"><dt>Exercise</dt><dd>${escapeHtml(exercise)}</dd></dl>
    <dl class="fm-summary-item"><dt>${isUnit() ? 'Example' : 'Company'}</dt><dd>${escapeHtml(company)}</dd></dl>
    ${isUnit() ? '' : `<dl class="fm-summary-item"><dt>Models in workbook</dt><dd>${escapeHtml(models)}</dd></dl>`}
    ${isUnit() || !compsOn() ? '' : `<dl class="fm-summary-item"><dt>Peers</dt><dd>${escapeHtml(peers)}</dd></dl>`}
    <dl class="fm-summary-item"><dt>Filing</dt><dd>${escapeHtml(filing)}</dd></dl>
    <div class="fm-summary-actions">
      <button type="button" class="fm-summary-change" data-edit="exercise">Change exercise</button>
      ${isUnit() ? '' : '<button type="button" class="fm-summary-change" data-edit="company">Change company</button>'}
      ${isUnit() ? '' : '<button type="button" class="fm-summary-change" data-edit="models">Change models</button>'}
      ${isUnit() || !compsOn() ? '' : '<button type="button" class="fm-summary-change" data-edit="peers">Change peers</button>'}
    </div>`;

  grid.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => {
      const target = btn.dataset.edit;
      if (target === 'exercise') {
        state.setupEdit = 'exercise';
        $('setup-summary').hidden = true;
        $('setup').hidden = false;
        $('step-exercise').hidden = false;
        $('step-exercise').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      state.setupEdit = target;
      syncLayout();
      const el = target === 'peers' ? $('step-peers') : target === 'models' ? $('step-models') : $('step-company');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target === 'peers') renderPeerPicker();
    };
  });
}

function finishSetupEdit() {
  state.setupEdit = null;
  syncLayout();
  render();
}

function renderTabs() {
  const nav = $('model-tabs');
  const tabs = availableTabs();
  nav.innerHTML = tabs
    .map((t) => {
      const enabled = tabEnabled(t.id);
      const selected = state.activeTab === t.id;
      return `<button type="button" class="fm-tab" role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${selected}" ${enabled ? '' : 'disabled'}>${escapeHtml(t.label)}</button>`;
    })
    .join('');
  nav.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;
      state.activeTab = btn.dataset.tab;
      renderTabs();
      render();
    };
  });
}

function renderWorkspaceStatus(model, dcf) {
  const box = $('workspace-status');
  if (!model?.ok) {
    box.innerHTML = '';
    return;
  }
  const balance = model.checks.balances
    ? '<span class="fm-flag is-ok">Balance sheet ties</span>'
    : '<span class="fm-flag is-bad">Balance sheet does not tie</span>';
  const dcfWarn =
    dcf && !dcf.ok && state.models.includes('dcf')
      ? `<span class="fm-flag is-bad">${escapeHtml(dcf.reason || 'DCF incomplete')}</span>`
      : '';
  const waccWarn =
    dcf?.ok && state.assumptions?.terminalGrowth >= dcf.wacc?.wacc
      ? '<span class="fm-flag is-bad">Terminal growth ≥ WACC</span>'
      : '';
  box.innerHTML = `${balance}${dcfWarn}${waccWarn}`;
}

/* -------------------------------- search ------------------------------- */

function resultSub(c, { has, pub, self = false, picked = false } = {}) {
  if (self) return 'That’s the company you’re modeling';
  if (!pub) return c.note || 'Private — no 10-K';
  if (!has) return 'No filing in the snapshot';
  const extra = c.extra ? c.blurb || 'Watchlist filer' : `#${c.rank}`;
  const ticker = c.fortune_ticker || '';
  return `${extra}${ticker ? ` · ${ticker}` : ''}${picked ? ' · in the set' : ''}`;
}

function renderQuick() {
  const picks = ['AAPL', 'MSFT', 'WMT', 'NVDA'];
  const extras = ['GDDY', 'WIX', 'NET', 'HOOD', 'DUOL'];
  const chip = (t) => `<button type="button" class="fm-chip" data-ticker="${t}">${t}</button>`;
  $('quick').innerHTML = picks.map(chip).join('');
  const extraBox = $('quick-extra');
  if (extraBox) extraBox.innerHTML = extras.map(chip).join('');
  const onChip = (e) => {
    const t = e.target.closest('[data-ticker]');
    if (!t) return;
    const company = state.companies.find((c) => c.fortune_ticker === t.dataset.ticker);
    if (company) selectCompany(company);
  };
  $('quick').onclick = onChip;
  if (extraBox) extraBox.onclick = onChip;
}

function renderResults(query) {
  const box = $('results');
  const q = query.trim().toLowerCase();
  if (!q) {
    box.hidden = true;
    return;
  }
  const hits = state.companies
    .filter(
      (c) =>
        c.company?.toLowerCase().includes(q) ||
        c.fortune_ticker?.toLowerCase().includes(q) ||
        c.sec_ticker?.toLowerCase().includes(q) ||
        c.blurb?.toLowerCase().includes(q)
    )
    .slice(0, 40);
  box.hidden = false;
  if (!hits.length) {
    box.innerHTML = '<p class="fm-empty">Nothing by that name in the company list.</p>';
    return;
  }
  box.innerHTML = hits
    .map((c) => {
      const pub = isPublic(c);
      const has = pub && state.snapshot.has(Number(c.cik));
      const sub = resultSub(c, { has, pub });
      return `<button type="button" class="fm-result${has ? '' : ' is-private'}" data-cik="${c.cik ?? ''}" data-ticker="${escapeHtml(c.fortune_ticker || '')}" ${has ? '' : 'disabled'}>
        <strong>${escapeHtml(c.company)}</strong><span>${escapeHtml(sub)}</span></button>`;
    })
    .join('');
  box.onclick = (e) => {
    const btn = e.target.closest('[data-cik]');
    if (!btn) return;
    const company = state.companies.find(
      (c) => String(c.cik) === btn.dataset.cik || (btn.dataset.ticker && c.fortune_ticker === btn.dataset.ticker)
    );
    if (company) selectCompany(company);
  };
}

const MAX_PEERS = 8;

function isPeer(company) {
  return state.peers.some((c) => c.cik === company.cik);
}

async function addPeer(company) {
  if (!company || company.cik === state.company?.cik || isPeer(company)) return;
  if (state.peers.length >= MAX_PEERS) {
    $('peer-status').className = 'fm-status is-warn';
    $('peer-status').textContent = 'Eight peers is plenty — drop one before adding another.';
    return;
  }
  state.peers = [...state.peers, company];
  $('peer-search').value = '';
  $('peer-results').hidden = true;
  renderPeerPicker();
  render();
  const price = await loadPrice(company);
  if (price != null) render();
}

function removePeer(cik) {
  state.peers = state.peers.filter((c) => String(c.cik) !== String(cik));
  renderPeerPicker();
  const q = $('peer-search').value;
  if (q.trim()) renderPeerResults(q);
  render();
}

function renderPeerPicker() {
  const chips = $('peer-chips');
  if (!state.peers.length) {
    chips.innerHTML = '';
  } else {
    chips.innerHTML = state.peers
      .map(
        (c) =>
          `<button type="button" class="fm-chip fm-peer-chip" data-remove-cik="${c.cik}" aria-label="Remove ${escapeHtml(c.company)}">
            ${escapeHtml(c.fortune_ticker || c.company)} <span aria-hidden="true">×</span>
          </button>`
      )
      .join('');
  }
  chips.onclick = (e) => {
    const btn = e.target.closest('[data-remove-cik]');
    if (btn) removePeer(btn.dataset.removeCik);
  };

  const status = $('peer-status');
  status.className = 'fm-status';
  if (!state.peers.length) {
    status.textContent =
      'No peers yet. Search and add companies that do similar work — that choice is the comps exercise.';
  } else {
    status.textContent = `${state.peers.length} peer${state.peers.length === 1 ? '' : 's'} in the set. The table uses only this list.`;
  }
}

function renderPeerResults(query) {
  const box = $('peer-results');
  const q = query.trim().toLowerCase();
  if (!q) {
    box.hidden = true;
    return;
  }
  const hits = state.companies
    .filter(
      (c) =>
        c.company?.toLowerCase().includes(q) ||
        c.fortune_ticker?.toLowerCase().includes(q) ||
        c.sec_ticker?.toLowerCase().includes(q) ||
        c.blurb?.toLowerCase().includes(q)
    )
    .slice(0, 40);
  box.hidden = false;
  if (!hits.length) {
    box.innerHTML = '<p class="fm-empty">Nothing by that name in the company list.</p>';
    return;
  }
  box.innerHTML = hits
    .map((c) => {
      const pub = isPublic(c);
      const has = pub && state.snapshot.has(Number(c.cik));
      const self = c.cik === state.company?.cik;
      const picked = isPeer(c);
      const blocked = !has || self;
      const sub = resultSub(c, { has, pub, self, picked });
      const cls = `fm-result${blocked ? ' is-private' : ''}`;
      const selected = picked ? ' aria-selected="true"' : '';
      return `<button type="button" class="${cls}" data-peer-cik="${c.cik ?? ''}"${selected} ${blocked ? 'disabled' : ''}>
        <strong>${escapeHtml(c.company)}</strong><span>${escapeHtml(sub)}</span></button>`;
    })
    .join('');
  box.onclick = (e) => {
    const btn = e.target.closest('[data-peer-cik]');
    if (!btn) return;
    const company = state.companies.find((c) => String(c.cik) === btn.dataset.peerCik);
    if (!company) return;
    if (isPeer(company)) removePeer(company.cik);
    else addPeer(company);
  };
}

/* ------------------------------ selection ------------------------------ */

async function selectCompany(company) {
  state.company = company;
  $('results').hidden = true;
  $('search').value = company.company;

  if (!isPublic(company)) {
    state.headlines = null;
    $('status').className = 'fm-status is-warn';
    $('status').textContent = `${company.company} is private. ${
      company.note || PRIVATE_NOTES?.[company.company] || PRIVATE_NOTES?.[company.rank] || 'No 10-K means no statements to model — we won’t invent them.'
    }`;
    syncLayout();
    return;
  }

  const headlines = headlinesFor(company);
  if (!headlines) {
    state.headlines = null;
    $('status').className = 'fm-status is-warn';
    $('status').textContent = `${company.company} isn’t in the filing snapshot yet, so there’s nothing to build from.`;
    syncLayout();
    return;
  }
  state.headlines = headlines;
  const ready = modelReadiness(headlines);
  if (!ready.ok) {
    $('status').className = 'fm-status is-warn';
    $('status').textContent = `${company.company}’s filing is missing ${ready.missing.join(', ')} — a balance sheet can’t be built without those, and filling them with zero would be a lie.`;
    state.headlines = null;
    syncLayout();
    return;
  }

  $('status').className = 'fm-status';
  $('status').textContent = `Reading ${company.company}’s FY${headlines.asOfYear} 10-K.`;
  state.assumptions = defaultAssumptions(headlines);
  state.sourceDefaults = { ...state.assumptions };
  state.scenario = 'base';
  state.peers = [];
  $('dock-ratios').href = `/fortune-500/#company=${company.cik}`;
  renderPicks();
  state.setupEdit = null;
  syncLayout();
  render();

  const price = await loadPrice(company);
  if (price != null) render();
}

function selectExercise(id) {
  if (id !== 'filer' && id !== 'unit') return;
  state.exercise = id;
  state.scenario = 'base';
  state.activeTab = 'three';
  state.setupEdit = null;
  if (id === 'unit') {
    state.assumptions = defaultUnitAssumptions();
    state.sourceDefaults = { ...state.assumptions };
  } else if (state.company && state.headlines) {
    state.assumptions = defaultAssumptions(state.headlines);
    state.sourceDefaults = { ...state.assumptions };
  } else {
    state.assumptions = null;
  }
  renderExercises();
  syncLayout();
  if (state.assumptions) render();
}

function renderExercises() {
  $('exercise-picks').innerHTML = EXERCISES.map((ex) => {
    const on = state.exercise === ex.id;
    return `<button type="button" class="fm-exercise-pick" data-exercise="${ex.id}" aria-pressed="${on}">
      <h3>${escapeHtml(ex.title)}</h3><p>${escapeHtml(ex.blurb)}</p></button>`;
  }).join('');
  $('exercise-picks').onclick = (e) => {
    const btn = e.target.closest('[data-exercise]');
    if (btn) selectExercise(btn.dataset.exercise);
  };
}

/* -------------------------------- dials -------------------------------- */

function originFor(dial, headlines) {
  if (isUnit()) return dial.originText();
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
  const list = isUnit() ? UNIT_DIALS : assumptionCatalog(state.models);
  return list.map((d) => ({
    key: d.key,
    name: d.name,
    what: d.shortDefinition || d.what,
    how: d.formulaText || d.how,
    origin: originFor(d, state.headlines),
  }));
}

function activeDials() {
  return isUnit() ? UNIT_DIALS : dialsFor(state.models);
}

function activeDialGroups() {
  return isUnit() ? UNIT_DIAL_GROUPS : DIAL_GROUPS;
}

function applyTraceHighlight(key) {
  const keys = new Set(key ? dependencyRowKeys(key) : []);
  document.querySelectorAll('[data-row-key]').forEach((tr) => {
    tr.classList.toggle('fm-trace-highlight', keys.has(tr.dataset.rowKey));
  });
}

function renderDependencyTrace(key) {
  if (!key) return '';
  const path = dependencyPath(key);
  if (!path.length) return '';
  return `<p class="fm-trace-path fm-trace-inline" aria-live="polite"><strong>Affects.</strong> ${path.map((p) => escapeHtml(p)).join(' → ')}</p>`;
}

function wrapChecklist(tabId, context) {
  const steps = stepsForTab(tabId);
  if (!steps.length) return { html: '', bind: () => {} };
  const activeId = state.buildStep[tabId] || steps[0].id;
  const active = steps.find((s) => s.id === activeId) || steps[0];
  const preview = previewForStep(active, context);
  return renderChecklist(steps, activeId, {
    onSelect: (id) => {
      state.buildStep[tabId] = id;
      render();
    },
    preview,
  });
}

function renderDialsHtml() {
  const active = isUnit() ? UNIT_DIALS : assumptionCatalog(state.models);
  const groupsDef = isUnit() ? UNIT_DIAL_GROUPS : DIAL_GROUPS;
  const scenarios = ['bear', 'base', 'bull']
    .map(
      (s) =>
        `<button type="button" data-scenario="${s}" aria-pressed="${state.scenario === s}">${s[0].toUpperCase()}${s.slice(1)}</button>`
    )
    .join('');

  const groups = groupsDef
    .filter((g) => active.some((d) => d.group === g.id))
    .map((g) => {
      const cards = active
        .filter((d) => d.group === g.id)
        .map((d) => {
          const value = state.assumptions[d.key];
          const disabled = value == null;
          const meta = d;
          const validation = disabled ? { valid: true } : validateAssumption(meta, value);
          const override = !isUnit() && isOverride(d.key, value, state.sourceDefaults);
          const errId = `dial-err-${d.key}`;
          return `<div class="fm-dial" data-dial-key="${d.key}">
            <div class="fm-dial-top">
              <span class="fm-dial-name">${escapeHtml(d.name)}</span>
              ${isUnit() ? '' : sourceBadge(meta, { isOverride: override, isMissing: disabled })}
              <input class="fm-dial-value" type="text" inputmode="decimal" data-key="${d.key}" value="${escapeHtml(dialValueText(d, value))}" ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(d.name)} value" aria-describedby="${validation.valid ? '' : errId}" aria-invalid="${validation.valid ? 'false' : 'true'}" />
            </div>
            ${disabled ? '' : `<input type="range" data-range="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${value}" aria-label="${escapeHtml(d.name)} slider" />`}
            ${validation.valid ? '' : `<p class="fm-dial-error" id="${errId}">${escapeHtml(validation.message)}</p>`}
            ${validation.warn && validation.message ? `<p class="fm-dial-warn">${escapeHtml(validation.message)}</p>` : ''}
            <p class="fm-dial-what">${escapeHtml(d.shortDefinition || d.what)}</p>
            <p class="fm-dial-how"><strong>Formula.</strong> ${escapeHtml(d.formulaText || d.how)}</p>
            <p class="fm-dial-origin"><strong>${isUnit() ? 'This stall.' : 'This filing.'}</strong> ${escapeHtml(originFor(d, state.headlines))}</p>
            <p class="fm-dial-effect">${escapeHtml(d.effect)}</p>
            ${isUnit() ? '' : renderDependencyTrace(d.key)}
          </div>`;
        })
        .join('');
      return `<h3 style="font-size:13px;margin-top:6px">${escapeHtml(g.label)}</h3>${cards}`;
    })
    .join('');

  const lede = isUnit()
    ? 'Every blue number is a guess about the stall. Change cups or the price and watch it hit all three statements.'
    : 'Last year’s 10-K gives you the arithmetic. The text field is your call on whether the next five years look like that.';

  return `<div class="fm-scenarios" role="group" aria-label="Scenario">${scenarios}</div>
    <p class="fm-dials-lede">${lede}</p>
    ${groups}`;
}

function bindDials(wrap) {
  const active = isUnit() ? UNIT_DIALS : assumptionCatalog(state.models);
  wrap.querySelectorAll('[data-range]').forEach((el) => {
    el.addEventListener('input', () => {
      state.assumptions = { ...state.assumptions, [el.dataset.range]: Number(el.value) };
      render();
    });
  });
  wrap.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('focus', () => applyTraceHighlight(el.dataset.key));
    el.addEventListener('blur', () => applyTraceHighlight(null));
    el.addEventListener('change', () => {
      const dial = active.find((d) => d.key === el.dataset.key);
      const value = parseDialInput(dial, el.value);
      if (value == null) return render();
      state.assumptions = { ...state.assumptions, [dial.key]: value };
      render();
    });
  });
  wrap.querySelectorAll('[data-scenario]').forEach((el) => {
    el.addEventListener('click', () => {
      state.scenario = el.dataset.scenario;
      state.assumptions = isUnit()
        ? applyUnitScenario(defaultUnitAssumptions(), state.scenario)
        : applyScenario(defaultAssumptions(state.headlines), state.scenario);
      if (!isUnit()) state.sourceDefaults = { ...defaultAssumptions(state.headlines), ...state.assumptions };
      render();
    });
  });
}

function renderDials() {
  const html = renderDialsHtml();
  const desktop = $('dials');
  const sheet = $('dials-sheet');
  if (desktop) {
    desktop.innerHTML = html;
    bindDials(desktop);
  }
  if (sheet) {
    sheet.innerHTML = html;
    bindDials(sheet);
  }
}

/* ------------------------------- rendering ----------------------------- */

function formatCell(line, v, scale) {
  if (v == null || !Number.isFinite(v)) return null;
  if (line.fmt === 'qty') return Math.round(v).toLocaleString('en-US');
  const n = v / scale;
  const digits = scale === 1 && Math.abs(n) < 100 ? 2 : 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function table(columns, sections, { scale = SCALE, unitLabel = 'US$ millions', rowKeyFor } = {}) {
  const head = `<thead><tr><th>${escapeHtml(unitLabel)}</th>${columns
    .map((c) => {
      const label = c.label || `FY${c.year}${c.filed ? 'A' : 'E'}`;
      return `<th class="${c.filed ? 'fm-col-actual' : ''}">${escapeHtml(label)}</th>`;
    })
    .join('')}</tr></thead>`;
  const body = sections
    .map((section) => {
      const title = section.title ? `<tr class="fm-section"><td colspan="${columns.length + 1}">${escapeHtml(section.title)}</td></tr>` : '';
      const lines = section.lines
        .map((line) => {
          const cells = columns
            .map((c, i) => {
              const v = line.values[i];
              const text = line.fmt === 'raw' ? v : formatCell(line, v, scale);
              return `<td class="${text == null ? 'fm-blank' : c.filed ? 'fm-actual' : 'fm-forecast'}">${text == null ? '—' : escapeHtml(String(text))}</td>`;
            })
            .join('');
          const cls = [line.total ? 'fm-total' : '', line.cls || ''].filter(Boolean).join(' ');
          const rowKey = line.rowKey || (rowKeyFor ? rowKeyFor(line) : null);
          const dataKey = rowKey ? ` data-row-key="${rowKey}"` : '';
          return `<tr class="${cls}"${dataKey}><td>${escapeHtml(line.label)}</td>${cells}</tr>`;
        })
        .join('');
      return title + lines;
    })
    .join('');
  return `<div class="fm-scroll"><table class="fm-table">${head}<tbody>${body}</tbody></table></div>`;
}

function lineOf(rows, label, key, { total = false, cls = '', fmt } = {}) {
  return { label, total, cls, fmt, rowKey: key, values: rows.map((r) => r[key]) };
}

function handoff(kind, arrow, text) {
  return `<div class="fm-handoff is-${kind}">
    <span class="fm-handoff-arrow" aria-hidden="true">${arrow}</span>
    <p>${text}</p>
  </div>`;
}

function threeStatementPanel(model, checklistHtml = '') {
  const rows = model.rows;
  const unitKind = model.kind === 'unit';
  const scale = model.scale ?? SCALE;
  const unitLabel = model.unitLabel ?? 'US$ millions';
  const columns = rows.map((r) => ({
    year: r.year,
    filed: r.filed,
    label: unitKind ? `Y${r.year}` : `FY${r.year}${r.filed ? 'A' : 'E'}`,
  }));
  const balances = model.checks.balances;
  const hasGross = model.assumptions.grossMargin != null || unitKind;
  const opts = { scale, unitLabel };

  const isLines = [
    ...(unitKind ? [lineOf(rows, 'Cups sold', 'units', { fmt: 'qty' })] : []),
    lineOf(rows, 'Revenue', 'revenue'),
    ...(hasGross
      ? [lineOf(rows, 'Cost of sales', 'cogs'), lineOf(rows, 'Gross profit', 'grossProfit', { total: true })]
      : []),
    ...(unitKind
      ? [lineOf(rows, 'Labor', 'labor'), lineOf(rows, 'Other operating costs', 'otherOpex')]
      : [lineOf(rows, 'Operating expenses', 'opex')]),
    lineOf(rows, 'Operating income (EBIT)', 'ebit', { total: true }),
    lineOf(rows, 'Interest expense', 'interestExpense', { cls: 'fm-link-interest' }),
    lineOf(rows, 'Interest income', 'interestIncome', { cls: 'fm-link-interest' }),
    lineOf(rows, 'Taxes', 'taxes'),
    lineOf(rows, 'Net income', 'netIncome', { total: true, cls: 'fm-link-ni' }),
  ];

  const is = table(columns, [{ title: 'Income statement', lines: isLines }], opts);

  const cfsLines = [
    lineOf(rows, 'Net income', 'netIncome', { cls: 'fm-link-ni' }),
    unitKind
      ? { label: 'Add back depreciation', cls: '', rowKey: 'da', values: rows.map((r) => r.daAddBack) }
      : lineOf(rows, 'Add back depreciation', 'da'),
    ...(unitKind
      ? [
          lineOf(rows, 'Receivables (use) / source', 'deltaAr'),
          lineOf(rows, 'Inventory (use) / source', 'deltaInv'),
          lineOf(rows, 'Payables source / (use)', 'deltaAp'),
        ]
      : []),
    lineOf(rows, 'Cash from operations', 'cfo', { total: true }),
    lineOf(rows, 'Capital expenditure', 'capex'),
    lineOf(rows, 'Debt repayment', 'debtRepayment'),
    lineOf(rows, 'Dividends', 'dividends'),
    lineOf(rows, 'Net change in cash', 'netChangeCash', { total: true, cls: 'fm-link-cash' }),
  ];

  const cfs = table(columns, [{ title: 'Cash flow', lines: cfsLines }], opts);

  const bs = table(
    columns,
    [
      {
        title: 'Balance sheet',
        lines: [
          lineOf(rows, 'Cash (the plug)', 'cash', { cls: 'fm-link-cash' }),
          lineOf(rows, 'Accounts receivable', 'receivables'),
          lineOf(rows, 'Inventory', 'inventory'),
          lineOf(rows, unitKind ? 'Equipment (net)' : 'Other assets (PP&E, goodwill, untagged)', 'otherAssets'),
          lineOf(rows, 'Total assets', 'totalAssets', { total: true }),
          lineOf(rows, 'Debt', 'debt', { cls: 'fm-link-interest' }),
          lineOf(rows, unitKind ? 'Payables (the grocer)' : 'Other liabilities', 'otherLiabilities'),
          lineOf(rows, 'Shareholders’ equity', 'equity', { cls: 'fm-link-ni' }),
          lineOf(rows, 'Total liabilities & equity', 'totalLiabEquity', { total: true }),
          { label: 'Check — should be zero', total: true, rowKey: 'balanceCheck', values: rows.map((r) => r.balanceCheck) },
        ],
      },
    ],
    opts
  );

  return `<section class="fm-panel">
    <h3>The three statements</h3>
    ${checklistHtml ? `<div class="fm-checklist-wrap" data-checklist="three">${checklistHtml}</div>` : ''}
    <ol class="fm-flow">
      <li>
        <strong>Income statement</strong>
        <p>${
          unitKind
            ? 'Cups × price is sales. Cost per cup is COGS. The cart’s depreciation is a non-cash charge. What’s left after tax is net income — that number is the handoff.'
            : 'Sales grow by your rate. Margins turn sales into operating profit. Interest is charged on <em>last year’s</em> debt and cash, so nothing is circular. What’s left after tax is net income — that number is the handoff.'
        }</p>
      </li>
      <li>
        <strong>Cash flow</strong>
        <p>Starts with that net income. Depreciation is added back (it wasn’t cash). Then cash goes out for working capital, CapEx, debt paydown, and dividends. Whatever remains is the change in cash.</p>
      </li>
      <li>
        <strong>Balance sheet</strong>
        <p>Cash is that leftover — the plug. Receivables and inventory are sized off this year’s sales. Equity = last year + net income − dividends. If assets minus liabilities and equity is zero, the three statements agree.</p>
      </li>
    </ol>
    <p class="${balances ? 'fm-flag is-ok' : 'fm-flag is-bad'}">${balances ? 'Balance sheet ties in every year' : 'Balance sheet does not tie — do not trust this'}</p>
    <div class="fm-statements">
      <div class="fm-statement">
        <p class="fm-statement-note"><strong>Handoff.</strong> Net income goes two places: the top of cash flow, and into equity.</p>
        ${is}
      </div>
      ${handoff('ni', '↓', 'Net income (gold) walks to the top of cash flow, and into equity on the balance sheet.')}
      <div class="fm-statement">
        <p class="fm-statement-note"><strong>Handoff.</strong> Ending cash is whatever this statement leaves behind. That number is the plug on the balance sheet.</p>
        ${cfs}
      </div>
      ${handoff('cash', '↓', 'Net change in cash (green) plus last year’s till is the cash plug on the balance sheet.')}
      <div class="fm-statement">
        <p class="fm-statement-note"><strong>Handoff.</strong> This year’s cash and debt come back next year as interest on the income statement.</p>
        ${bs}
      </div>
      ${handoff('interest', '↑', 'Next year’s interest (blue) is charged on this year’s cash and debt — never on this year’s plug, so nothing is circular.')}
    </div>
    <p class="fm-aside">${escapeHtml(model.residualNote)}</p>
    <div class="fm-legend">
      <span class="is-blue">Blue — your input</span>
      <span class="is-black">Black — calculated</span>
      <span class="is-ni">Gold — net income handoff</span>
      <span class="is-cash-link">Green — cash plug</span>
      <span class="is-int">Blue row — interest on last year’s balances</span>
    </div>
  </section>`;
}

function dcfPanel(model, dcf, checklistHtml = '') {
  if (!state.models.includes('dcf')) {
    return `<section class="fm-panel"><div class="fm-empty"><h3>DCF not selected</h3><p>Turn on Discounted cash flow in setup to include it in the workbook, or switch to this tab to preview it.</p></div></section>`;
  }
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

  return `<section class="fm-panel">
    <h3>What it’s worth (DCF)</h3>
    ${checklistHtml ? `<div class="fm-checklist-wrap" data-checklist="dcf">${checklistHtml}</div>` : ''}
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
    <p class="fm-aside">${escapeHtml(`${formatPercent(dcf.terminalShare)} of this value is the terminal lump sum — the part you are least sure about. That is normal, and it is why the Sensitivity tab exists.`)}</p>
  </section>`;
}

function sensitivityPanel(model, dcf, sens) {
  if (!state.models.includes('dcf')) {
    return `<section class="fm-panel"><div class="fm-empty"><h3>DCF not selected</h3><p>Enable Discounted cash flow in setup to run WACC × terminal-growth sensitivity.</p></div></section>`;
  }
  if (!dcf?.ok) {
    return `<section class="fm-panel"><h3>Sensitivity</h3><div class="fm-empty"><h3>Need a working DCF first</h3><p>${escapeHtml(dcf?.reason || 'Fix the three-statement model before stressing the valuation.')}</p></div></section>`;
  }
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
    : '<p class="fm-empty">Sensitivity grid unavailable.</p>';

  return `<section class="fm-panel">
    <h3>Two-variable sensitivity</h3>
    <p class="fm-aside"><strong>What this shows:</strong> implied share price if WACC and terminal growth move while everything else stays at your active assumptions. Higher WACC lowers value; higher terminal growth raises it — if results run the other way, something is wrong.</p>
    <h4 style="margin-top:14px;font-size:14px">WACC × terminal growth → implied share price</h4>
    ${grid}
  </section>`;
}

function scenariosPanel() {
  const scenarioCopy = {
    bear: 'Lower sales growth and operating margin — a cautious case.',
    base: 'Defaults from the filing — last year repeated unless you changed them.',
    bull: 'Higher sales growth and operating margin — an optimistic case.',
  };
  const cards = ['bear', 'base', 'bull']
    .map(
      (s) =>
        `<div class="fm-dial" style="margin-bottom:10px">
          <div class="fm-dial-top">
            <span class="fm-dial-name">${s[0].toUpperCase()}${s.slice(1)}</span>
            <button type="button" class="fm-chip" data-scenario-apply="${s}" ${state.scenario === s ? 'disabled' : ''}>${state.scenario === s ? 'Active' : 'Apply'}</button>
          </div>
          <p class="fm-dial-what">${escapeHtml(scenarioCopy[s])}</p>
        </div>`
    )
    .join('');

  return `<section class="fm-panel">
    <h3>Operating scenarios</h3>
    <p class="fm-aside"><strong>Scenarios vs sensitivity:</strong> a scenario moves several assumptions together (growth and margin). Sensitivity isolates one or two drivers. Full Base/Upside/Downside/Custom editing arrives in a later update — for now, Bear/Base/Bull preset tilts are in the Assumptions panel too.</p>
    ${cards}
    <p class="fm-aside">Applying a scenario resets assumptions from filing defaults with a tilt. Edit individual drivers in the Assumptions panel on the right (or the Assumptions button on mobile).</p>
  </section>`;
}

function checksPanel(model, dcf, comps) {
  const checks = [];
  checks.push(model.checks.balances ? 'Balance sheet ties in every projected year' : 'Balance sheet does NOT tie — do not trust outputs');
  if (model.checks.cashWarning) checks.push(model.checks.cashWarning);
  if (dcf && state.models.includes('dcf')) {
    if (!dcf.ok) checks.push(`DCF: ${dcf.reason || 'incomplete'}`);
    else if (state.assumptions?.terminalGrowth >= dcf.wacc?.wacc) {
      checks.push('Terminal growth is ≥ WACC — the DCF math is not meaningful');
    } else checks.push('DCF relationships look valid');
  }
  if (state.models.includes('comps')) {
    if (!state.peers.length) checks.push('Comps: no peer set chosen');
    else if (!comps?.ok) checks.push(`Comps: ${comps.reason || 'incomplete'}`);
    else checks.push(`Comps: ${state.peers.length} peers with usable data`);
  }
  const workbookModels = isUnit()
    ? '3-statement lemonade model'
    : [
        state.models.includes('three') && '3-statement',
        state.models.includes('dcf') && 'DCF',
        state.models.includes('comps') && 'comps',
      ]
        .filter(Boolean)
        .join(', ') || 'nothing selected';

  const list = checks.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  const ready = model.checks.balances;

  return `<section class="fm-panel">
    <h3>Integrity checks</h3>
    <ul class="fm-flow" style="grid-template-columns:1fr">${list}</ul>
    <p class="fm-aside"><strong>Workbook will include:</strong> ${escapeHtml(workbookModels)}. Tab visibility does not change this — only your setup model picks do.</p>
    <div class="fm-dock-actions" style="margin-top:16px">
      ${isUnit() ? '' : `<a class="fm-btn fm-btn-ghost" href="/fortune-500/#company=${state.company?.cik || ''}">Open the 10-K ratios</a>`}
      <button type="button" class="fm-btn" id="checks-download" ${ready ? '' : 'disabled'}>Download Excel</button>
    </div>
    ${ready ? '' : '<p class="fm-status is-warn">Fix the balance sheet before downloading — the workbook will still generate, but the numbers are not trustworthy.</p>'}
  </section>`;
}

function compsPanel(comps, checklistHtml = '') {
  if (!state.peers.length) {
    return `<section class="fm-panel"><h3>What the market pays for the neighbours</h3>
      <div class="fm-empty"><h3>Choose the peer set</h3>
      <p>Trading comps start with a judgment call: who actually belongs in the same set. Search in step 3 and add companies that do similar work — we won’t invent a list from Fortune rank.</p></div></section>`;
  }
  if (!comps?.ok) {
    return `<section class="fm-panel"><h3>Trading comps</h3><div class="fm-empty"><h3>No usable peers yet</h3><p>${escapeHtml(comps?.reason || 'Add a public peer with a share price.')}</p></div></section>`;
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
    ${checklistHtml ? `<div class="fm-checklist-wrap" data-checklist="comps">${checklistHtml}</div>` : ''}
    <p class="fm-aside"><strong>How this is built:</strong> you picked the peer set. We work out what multiple of their sales or profit the market pays, then apply the middle one to this company. It answers "what would a buyer pay today", not "what is it worth forever".</p>
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
  if (isUnit()) {
    if (!state.assumptions) return null;
    const model = runUnitEcon(state.assumptions);
    model.companyName = 'Lemonade stall';
    return { model, dcf: null, sens: null, comps: null };
  }
  const headlines = state.headlines;
  if (!headlines) return null;
  const model = runThreeStatement(headlines, state.assumptions);
  if (!model.ok) return { model };
  const ccy = headlines?.metrics?.revenue?.unit;
  if (ccy && ccy !== 'USD') model.unitLabel = `${ccy} millions`;
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

function tabHint() {
  const tab = TABS.find((t) => t.id === state.activeTab);
  return tab?.hint ? `<p class="fm-tab-hint">${escapeHtml(tab.hint)}</p>` : '';
}

function renderActivePanel(run) {
  const { model, dcf, sens, comps } = run;
  const context = {
    model,
    dcf,
    comps,
    assumptions: state.assumptions,
    peers: state.peers,
  };
  const threeCl = wrapChecklist('three', context);
  const dcfCl = wrapChecklist('dcf', context);
  const compsCl = wrapChecklist('comps', context);

  let html;
  switch (state.activeTab) {
    case 'three':
      html = threeStatementPanel(model, threeCl.html);
      break;
    case 'dcf':
      html = dcfPanel(model, dcf, dcfCl.html);
      break;
    case 'comps':
      html = compsPanel(comps, compsCl.html);
      break;
    case 'scenarios':
      html = scenariosPanel();
      break;
    case 'sensitivity':
      html = sensitivityPanel(model, dcf, sens);
      break;
    case 'checks':
      html = checksPanel(model, dcf, comps);
      break;
    default:
      html = threeStatementPanel(model, threeCl.html);
  }
  return { html, bindChecklists: [threeCl, dcfCl, compsCl] };
}

function render() {
  const run = currentRun();
  if (!run) return;
  const { model, dcf, sens, comps } = run;
  if (!model.ok) {
    $('output').innerHTML = `<section class="fm-panel"><div class="fm-empty"><h3>Not enough filed data</h3><p>${escapeHtml(model.reason)}</p></div></section>`;
    renderWorkspaceStatus(model, dcf);
    return;
  }
  renderTabs();
  renderDials();
  renderWorkspaceStatus(model, dcf);
  const panel = renderActivePanel(run);
  $('output').innerHTML = tabHint() + panel.html;

  $('output').querySelectorAll('.fm-checklist-wrap').forEach((wrap, i) => {
    const cl = panel.bindChecklists[i];
    if (cl?.bind) cl.bind(wrap);
  });

  applyTraceHighlight(document.activeElement?.dataset?.key || null);

  $('output').querySelectorAll('[data-scenario-apply]').forEach((el) => {
    el.onclick = () => {
      state.scenario = el.dataset.scenarioApply;
      state.assumptions = isUnit()
        ? applyUnitScenario(defaultUnitAssumptions(), state.scenario)
        : applyScenario(defaultAssumptions(state.headlines), state.scenario);
      render();
    };
  });

  const dl = $('checks-download');
  if (dl) dl.onclick = download;

  $('inspector-mobile').hidden = !workspaceLive();

  if (isUnit()) {
    $('dock-name').textContent = 'Lemonade stall';
  } else {
    $('dock-name').textContent = `${state.company.company} · FY${state.headlines.asOfYear}`;
  }
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
    ensureActiveTab();
    syncLayout();
    if (state.company && state.headlines) render();
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
  if (isUnit()) {
    const bytes = buildUnitWorkbook({ model: run.model, cards: assumptionCards() });
    downloadWorkbook('lemonade-stall-model.xlsx', bytes);
    return;
  }
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
  renderExercises();
  syncLayout();

  const inspector = $('inspector');
  const openMobileInspector = () => {
    $('inspector-sheet').hidden = false;
    renderDials();
  };
  $('inspector-mobile')?.addEventListener('click', openMobileInspector);
  $('inspector-toggle')?.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 900px)').matches) openMobileInspector();
    else {
      state.inspectorCollapsed = !state.inspectorCollapsed;
      inspector?.classList.toggle('is-collapsed', state.inspectorCollapsed);
      $('inspector-toggle')?.setAttribute('aria-expanded', String(!state.inspectorCollapsed));
    }
  });
  $('inspector-sheet-close')?.addEventListener('click', () => {
    $('inspector-sheet').hidden = true;
  });

  $('tour-next').onclick = () => {
    state.tourStep += 1;
    if (state.tourStep >= TOUR.length) endTour();
    else renderTour();
  };
  $('tour-skip').onclick = endTour;
  $('dock-download').onclick = download;
  $('search').addEventListener('input', (e) => renderResults(e.target.value));
  $('peer-search').addEventListener('input', (e) => renderPeerResults(e.target.value));

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
