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
  validateAssumption,
  sourceToken,
} from './assumptions.js';
import { dependencyPath, dependencyRowKeys } from './dependencies.js';
import { stepsForTab } from './build-steps.js';
import { renderChecklist, previewForStep } from './checklist.js';
import {
  SINGLE_UNIT_DIALS,
  SINGLE_UNIT_DIAL_GROUPS,
  UNIT_SCENARIO_DRIVERS,
  defaultSingleUnitAssumptions,
  runSingleUnitPortfolio,
} from './unit-portfolio.js';
import {
  CAPITAL_DIALS,
  defaultCapitalProjectAssumptions,
  runCapitalProject,
} from './capital-project.js';
import {
  defaultStrategicAssumptions,
  runStrategicAppraisal,
  STRATEGIC_DIALS,
} from './strategic-investment.js';
import {
  defaultMarketEntryAssumptions,
  runMarketEntry,
  MARKET_DIALS,
} from './market-entry.js';
import {
  createScenarioState,
  setActiveScenario,
  editScenarioValue,
  resetActiveScenario,
  resetAllScenarios,
  assumptionsFromScenarioState,
  ensureScenarioInitialized,
  SCENARIO_ORDER,
  SCENARIO_LABELS,
  SCENARIO_DRIVERS,
  legacyScenarioId,
} from './scenarios.js';
import {
  runSensitivityMatrix,
  checkMonotonicity,
  goalSeek,
  SENSITIVITY_PRESETS,
} from './sensitivity.js';
import {
  buildWorkbook,
  buildUnitWorkbook,
  buildCapitalWorkbook,
  buildStrategicWorkbook,
  buildMarketWorkbook,
  workbookFilename,
  exerciseWorkbookFilename,
  downloadWorkbook,
} from './workbook.js';

const $ = (id) => document.getElementById(id);

const state = {
  exercise: null,
  phase: 'landing',
  companies: [],
  snapshot: new Map(),
  prices: new Map(),
  company: null,
  headlines: null,
  models: ['three', 'dcf', 'comps'],
  activeTab: 'three',
  assumptions: null,
  scenarioState: null,
  peers: [],
  tourStep: 0,
  setupEdit: null,
  focusedAssumption: null,
  buildStep: { three: 'revenue', dcf: 'fcf', comps: 'peers' },
  sourceDefaults: null,
  sensitivityPreset: 'dcfWaccGrowth',
  goalSeekTarget: '',
  goalSeekInput: 'revenueGrowth',
  unitTemplate: 'lemonade',
};

const TABS = [
  {
    id: 'three',
    label: '3 Statements',
    what: 'Income statement, balance sheet, and cash flow wired together so they always tie.',
    hint: 'Income statement, balance sheet, and cash flow wired together so they always tie.',
    filer: true,
    unit: true,
    capital: true,
    strategic: true,
    market: true,
  },
  {
    id: 'dcf',
    label: 'DCF',
    what: 'What the company is worth if you discount the cash it can produce.',
    hint: 'What the company is worth if you discount the cash it can produce.',
    filer: true,
    unit: false,
    capital: false,
    strategic: false,
    market: false,
  },
  {
    id: 'comps',
    label: 'Comps',
    what: 'What similar public companies trade for, as a cross-check.',
    hint: 'What similar public companies trade for, as a cross-check.',
    filer: true,
    unit: false,
    capital: false,
    strategic: false,
    market: false,
  },
  {
    id: 'scenarios',
    label: 'Scenarios',
    what: 'Base, upside, and downside — several assumptions move together as one case.',
    hint: 'Base, upside, and downside — several assumptions move together as one case.',
    filer: true,
    unit: true,
    capital: false,
    strategic: false,
    market: false,
  },
  {
    id: 'sensitivity',
    label: 'Sensitivity',
    what: 'A range of outcomes when one or two drivers change and everything else stays put.',
    hint: 'A range of outcomes when one or two drivers change and everything else stays put.',
    filer: true,
    unit: true,
    capital: false,
    strategic: false,
    market: false,
  },
  {
    id: 'checks',
    label: 'Checks & Download',
    what: 'Balance-sheet tie, warnings, and Excel download for the models you picked.',
    hint: 'Balance-sheet tie, warnings, and Excel download for the models you picked.',
    filer: true,
    unit: true,
    capital: true,
    strategic: true,
    market: true,
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
    title: 'Single-unit economics',
    blurb: 'Unit P&L, optional portfolio rollout, and returns — start from the lemonade example or a blank template.',
  },
  {
    id: 'capital',
    title: 'Capital project',
    blurb: 'Construction, funding, operations, and project vs equity returns for a long-lived asset.',
  },
  {
    id: 'strategic',
    title: 'Strategic investment',
    blurb: 'Compare build, buy, partner, license, lease, delay, and do-nothing with incremental NPV.',
  },
  {
    id: 'market',
    title: 'Market entry',
    blurb: 'Regional market sizing, entry structures, FX, and risk-adjusted returns.',
  },
];

const MODEL_PICKS = [
  {
    id: 'three',
    title: '3-statement model',
    blurb: 'Income statement, balance sheet, and cash flow wired together so they always tie. DCF and comps build on this.',
  },
  {
    id: 'dcf',
    title: 'Discounted cash flow',
    blurb: 'What the company is worth if you discount the cash it can produce. Ends in a price per share.',
  },
  {
    id: 'comps',
    title: 'Trading comps',
    blurb: 'What similar public companies trade for, as a cross-check against the DCF.',
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

function isFiler() {
  return state.exercise === 'filer';
}

function isUnit() {
  return state.exercise === 'unit';
}

function isCapital() {
  return state.exercise === 'capital';
}

function isStrategic() {
  return state.exercise === 'strategic';
}

function isMarket() {
  return state.exercise === 'market';
}

function isStandaloneExercise() {
  return isUnit() || isCapital() || isStrategic() || isMarket();
}

function syncAssumptionsFromScenarios() {
  if (state.scenarioState) {
    state.assumptions = assumptionsFromScenarioState(state.scenarioState);
    state.scenario = state.scenarioState.activeScenario;
  }
}

function initScenarioState(defaults) {
  const drivers = isUnit() ? UNIT_SCENARIO_DRIVERS : SCENARIO_DRIVERS;
  state.scenarioState = createScenarioState(defaults, drivers);
  syncAssumptionsFromScenarios();
}

function scenarioDrivers() {
  return state.scenarioState?.drivers || SCENARIO_DRIVERS;
}

function dialValueText(dial, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (dial.fmt === 'bool') return value ? 'On' : 'Off';
  if (dial.fmt === 'pct') return `${(value * 100).toFixed(1)}%`;
  if (dial.fmt === 'days') return `${Math.round(value)} days`;
  if (dial.fmt === 'months') return `${Math.round(value)} mo`;
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
  if (state.phase !== 'workspace') return false;
  if (isFiler()) return Boolean(state.company && state.headlines);
  if (isStandaloneExercise()) return Boolean(state.assumptions);
  return false;
}

function filerReady() {
  return isFiler() && Boolean(state.company && state.headlines);
}

function availableTabs() {
  return TABS.filter((t) => {
    if (t.always) return true;
    if (isFiler()) return t.filer;
    if (isUnit()) return t.unit;
    if (isCapital()) return t.capital;
    if (isStrategic()) return t.strategic;
    if (isMarket()) return t.market;
    return false;
  });
}

function tabEnabled(tabId) {
  if (tabId === 'three' || tabId === 'scenarios' || tabId === 'checks') return true;
  if (tabId === 'dcf') return state.models.includes('dcf');
  if (tabId === 'comps') return state.models.includes('comps');
  if (tabId === 'sensitivity') return isUnit() || state.models.includes('dcf');
  return true;
}

function unitDialList() {
  const a = state.assumptions || {};
  return SINGLE_UNIT_DIALS.filter((d) => {
    if (d.key === 'membershipRevenue' || d.key === 'advertisingRevenue') return a.secondaryEnabled;
    return true;
  });
}

function unitDefaults() {
  return defaultSingleUnitAssumptions(state.unitTemplate || 'lemonade');
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
  document.body.classList.toggle('is-unit', isStandaloneExercise() && live);
  document.body.classList.toggle('is-editing-setup', false);

  $('setup-summary').hidden = true;
  const setupEl = $('setup');
  if (setupEl) setupEl.hidden = true;

  $('step-exercise').hidden = live;
  const landing = $('landing');
  const filerCol = $('landing-filer');
  const showFiler = !live && isFiler();
  landing?.classList.toggle('is-filer', showFiler);
  if (filerCol) {
    filerCol.ariaHidden = showFiler ? 'false' : 'true';
    filerCol.inert = !showFiler;
  }
  if (showFiler) renderLandingModels();

  $('step-build').hidden = !live;
  $('dock').hidden = !live;

  const setupBar = $('workspace-setup');
  if (setupBar) setupBar.hidden = !live;

  updateLandingNext();
  if (isFiler() && !live) renderPeerPicker();

  if (live) {
    ensureActiveTab();
    renderWorkspaceAdjust();
  }

  const ratios = $('dock-ratios');
  if (ratios) ratios.hidden = !isFiler() || Boolean(state.company?.extra);
}

function updateLandingNext() {
  const btn = $('landing-next');
  if (!btn) return;
  const ready = filerReady();
  btn.disabled = !ready;
  btn.textContent = ready
    ? `Next — open ${state.company.fortune_ticker || state.company.company}`
    : 'Next — open the model';
}

function modelToggleHtml(prefix) {
  const dcfOn = state.models.includes('dcf');
  const comps = state.models.includes('comps');
  return `<button type="button" data-${prefix}-model="three" aria-pressed="true" disabled title="The 3-statement is the base — it stays on">3-statement</button>
    <button type="button" data-${prefix}-model="dcf" aria-pressed="${dcfOn}">DCF</button>
    <button type="button" data-${prefix}-model="comps" aria-pressed="${comps}">Trading comps</button>`;
}

function toggleModel(id) {
  if (id === 'three') return;
  state.models = state.models.includes(id)
    ? state.models.filter((m) => m !== id)
    : [...state.models, id];
  if (!state.models.includes('three')) state.models.unshift('three');
  renderLandingModels();
  if (workspaceLive()) {
    ensureActiveTab();
    render();
    renderWorkspaceAdjust();
  }
}

function renderLandingModels() {
  const wrap = $('landing-models');
  if (!wrap) return;
  wrap.querySelectorAll('[data-landing-model]').forEach((btn) => {
    const id = btn.dataset.landingModel;
    const on = state.models.includes(id);
    btn.setAttribute('aria-pressed', String(on));
  });
}

function bindLandingModels() {
  $('landing-models')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-landing-model]');
    if (btn && !btn.disabled) toggleModel(btn.dataset.landingModel);
  });
}

function enterWorkspace() {
  if (isFiler() && !filerReady()) return;
  if (isStandaloneExercise() && !state.assumptions) return;
  state.phase = 'workspace';
  state.setupEdit = null;
  syncLayout();
  render();
}

function switchToLanding() {
  state.phase = 'landing';
  state.setupEdit = null;
  syncLayout();
  $('step-exercise')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function currentCompanyLabel() {
  const companyName = state.company?.company || 'Pick a company';
  const ticker = state.company?.fortune_ticker || '';
  return ticker ? `${companyName} (${ticker})` : companyName;
}

function exerciseShortLabel() {
  return (
    {
      filer: '10-K',
      unit: 'Unit',
      capital: 'Capital',
      strategic: 'Strategic',
      market: 'Market',
    }[state.exercise] || 'Exercise'
  );
}

function renderWorkspaceAdjust() {
  const bar = $('workspace-setup');
  if (!bar) return;
  if (!workspaceLive()) {
    bar.innerHTML = '';
    return;
  }

  const switchEx = `<button type="button" class="fm-ws-text-link" data-switch-exercise="1">Switch</button>`;

  if (!isFiler()) {
    bar.innerHTML = `<div class="fm-ws-adjust">
      <span class="fm-ws-ex-label">${escapeHtml(exerciseShortLabel())}</span>
      <span class="fm-ws-switch">${switchEx}</span>
    </div>`;
    bar.querySelector('[data-switch-exercise]')?.addEventListener('click', switchToLanding);
    return;
  }

  const companyLabel = currentCompanyLabel();
  bar.innerHTML = `<div class="fm-ws-adjust">
    <div class="fm-ws-field" id="ws-company-block">
      <input id="ws-company-search" class="fm-ws-input fm-ws-field-input" type="search" value="${escapeHtml(companyLabel)}" placeholder="Search company…" autocomplete="off" aria-label="Company you’re modeling" />
      <div class="fm-ws-pop" id="ws-company-pop" hidden>
        <div class="fm-results" id="ws-company-results" hidden></div>
      </div>
    </div>
    <div class="fm-ws-peers" id="ws-peers-block">
      <div class="fm-peer-chips" id="ws-peer-chips"></div>
      <div class="fm-ws-field">
        <input id="ws-peer-search" class="fm-ws-input fm-ws-field-input" type="search" placeholder="Add peer…" autocomplete="off" aria-label="Add a peer" />
        <div class="fm-ws-pop" id="ws-peer-pop" hidden>
          <div class="fm-results" id="ws-peer-results" hidden></div>
        </div>
      </div>
    </div>
    <span class="fm-ws-switch">${switchEx}</span>
  </div>`;

  bindWorkspaceAdjust(bar);
  renderPeerPicker();
}

function bindWorkspaceAdjust(bar) {
  bar.querySelector('[data-switch-exercise]')?.addEventListener('click', switchToLanding);

  const search = $('ws-company-search');
  const companyPop = $('ws-company-pop');
  companyPop?.addEventListener('mousedown', (e) => e.preventDefault());
  search?.addEventListener('focus', () => search.select());
  search?.addEventListener('input', (e) => renderWsCompanyResults(e.target.value));
  search?.addEventListener('blur', () => {
    setTimeout(() => {
      if (search) search.value = currentCompanyLabel();
      hideWsPop('ws-company-pop', 'ws-company-results');
    }, 150);
  });

  const peerSearch = $('ws-peer-search');
  const peerPop = $('ws-peer-pop');
  peerPop?.addEventListener('mousedown', (e) => e.preventDefault());
  peerSearch?.addEventListener('input', (e) => renderWsPeerResults(e.target.value));
  peerSearch?.addEventListener('blur', () => {
    setTimeout(() => hideWsPop('ws-peer-pop', 'ws-peer-results'), 150);
  });
}

function hideWsPop(popId, boxId) {
  const pop = $(popId);
  const box = $(boxId);
  if (pop) pop.hidden = true;
  if (box) box.hidden = true;
}

function showWsPop(popId) {
  const pop = $(popId);
  if (pop) pop.hidden = false;
}

function renderWsCompanyResults(query) {
  const box = $('ws-company-results');
  if (!box) return;
  const q = query.trim().toLowerCase();
  if (!q || q === currentCompanyLabel().toLowerCase()) {
    hideWsPop('ws-company-pop', 'ws-company-results');
    return;
  }
  showWsPop('ws-company-pop');
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

function renderWsPeerResults(query) {
  const box = $('ws-peer-results');
  if (!box) return;
  const q = query.trim().toLowerCase();
  if (!q) {
    hideWsPop('ws-peer-pop', 'ws-peer-results');
    return;
  }
  showWsPop('ws-peer-pop');
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
      return `<button type="button" class="fm-result${blocked ? ' is-private' : ''}" data-peer-cik="${c.cik ?? ''}" ${picked ? 'aria-selected="true"' : ''} ${blocked ? 'disabled' : ''}>
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

function renderTabs() {
  const nav = $('model-tabs');
  const tabs = availableTabs();
  nav.innerHTML = tabs
    .map((t) => {
      const enabled = tabEnabled(t.id);
      const selected = state.activeTab === t.id;
      const hint = t.what || t.hint || '';
      const title = hint ? ` title="${escapeHtml(hint)}"` : '';
      return `<button type="button" class="fm-tab" role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${selected}" ${enabled ? '' : 'disabled'}${title}>${escapeHtml(t.label)}</button>`;
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
  let flags = '';
  if (model.kind === 'strategic') {
    flags = model.checks.probabilitiesSum
      ? '<span class="fm-flag is-ok">Probabilities sum to 100%</span>'
      : '<span class="fm-flag is-bad">Probabilities do not sum to 100%</span>';
  } else if (model.kind === 'capital-project') {
    flags = model.checks.sourcesUses
      ? '<span class="fm-flag is-ok">Sources equal uses</span>'
      : '<span class="fm-flag is-bad">Sources/uses mismatch</span>';
  } else if (model.kind === 'market-entry') {
    flags = `<span class="fm-flag is-ok">Preferred: ${escapeHtml(model.preferredStructure || '—')}</span>`;
  } else {
    flags = model.checks?.balances
      ? '<span class="fm-flag is-ok">Balance sheet ties</span>'
      : '<span class="fm-flag is-bad">Balance sheet does not tie</span>';
  }
  const dcfWarn =
    dcf && !dcf.ok && state.models.includes('dcf')
      ? `<span class="fm-flag is-bad">${escapeHtml(dcf.reason || 'DCF incomplete')}</span>`
      : '';
  const waccWarn =
    dcf?.ok && state.assumptions?.terminalGrowth >= dcf.wacc?.wacc
      ? '<span class="fm-flag is-bad">Terminal growth ≥ WACC</span>'
      : '';
  box.innerHTML = `${flags}${dcfWarn}${waccWarn}`;
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
  const status = $('peer-status');
  if (state.peers.length >= MAX_PEERS) {
    if (status) {
      status.className = 'fm-status is-warn';
      status.textContent = 'Eight peers is plenty — drop one before adding another.';
    }
    return;
  }
  state.peers = [...state.peers, company];
  const landSearch = $('peer-search');
  if (landSearch) landSearch.value = '';
  const landResults = $('peer-results');
  if (landResults) landResults.hidden = true;
  const wsSearch = $('ws-peer-search');
  if (wsSearch) wsSearch.value = '';
  const wsResults = $('ws-peer-results');
  if (wsResults) wsResults.hidden = true;
  renderPeerPicker();
  if (workspaceLive()) render();
  const price = await loadPrice(company);
  if (price != null && workspaceLive()) render();
}

function removePeer(cik) {
  state.peers = state.peers.filter((c) => String(c.cik) !== String(cik));
  renderPeerPicker();
  const q = $('peer-search')?.value || $('ws-peer-search')?.value || '';
  if (q.trim()) {
    renderPeerResults(q);
    renderWsPeerResults(q);
  }
  if (workspaceLive()) render();
}

function fillPeerChips(chips) {
  if (!chips) return;
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
}

function renderPeerPicker() {
  fillPeerChips($('peer-chips'));
  fillPeerChips($('ws-peer-chips'));

  const status = $('peer-status');
  if (!status) return;
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
  initScenarioState(state.assumptions);
  state.sourceDefaults = { ...state.assumptions };
  state.peers = state.peers.filter((c) => c.cik !== company.cik);
  $('dock-ratios').href = `/fortune-500/#company=${company.cik}`;
  state.setupEdit = null;
  syncLayout();
  if (workspaceLive()) render();
  else updateLandingNext();

  const price = await loadPrice(company);
  if (price != null && workspaceLive()) render();
}

function selectExercise(id) {
  if (!EXERCISES.some((e) => e.id === id)) return;
  state.exercise = id;
  state.activeTab = 'three';
  state.setupEdit = null;
  if (id === 'filer') {
    state.phase = 'landing';
    renderExercises();
    syncLayout();
    return;
  }
  state.phase = 'workspace';
  if (id === 'unit') {
    const defaults = defaultSingleUnitAssumptions(state.unitTemplate || 'lemonade');
    initScenarioState(defaults);
    state.sourceDefaults = { ...defaults };
  } else if (id === 'capital') {
    state.assumptions = defaultCapitalProjectAssumptions();
    state.scenarioState = null;
    state.sourceDefaults = { ...state.assumptions };
  } else if (id === 'strategic') {
    state.assumptions = defaultStrategicAssumptions();
    state.scenarioState = null;
    state.sourceDefaults = { ...state.assumptions };
  } else if (id === 'market') {
    state.assumptions = defaultMarketEntryAssumptions();
    state.scenarioState = null;
    state.sourceDefaults = { ...state.assumptions };
  }
  renderExercises();
  syncLayout();
  render();
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

function dialRawValue(dial) {
  if (dial.altKey && dial.altField) return state.assumptions?.[dial.altKey]?.[dial.altField];
  return state.assumptions?.[dial.key];
}

function setDialValue(dial, value) {
  if (dial.altKey && dial.altField) {
    state.assumptions = {
      ...state.assumptions,
      [dial.altKey]: { ...state.assumptions[dial.altKey], [dial.altField]: value },
    };
    return;
  }
  state.assumptions = { ...state.assumptions, [dial.key]: value };
}

function originFor(dial, headlines) {
  if (isUnit() || isCapital() || isStrategic() || isMarket()) return dial.originText?.() || '';
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
  const list = isStandaloneExercise() ? exerciseDialList() : assumptionCatalog(state.models);
  return list.map((d) => ({
    key: d.key,
    name: d.name,
    what: d.shortDefinition || d.what,
    how: d.formulaText || d.how,
    origin: originFor(d, state.headlines),
  }));
}

function exerciseDialList() {
  if (isUnit()) return unitDialList();
  if (isCapital()) return CAPITAL_DIALS.filter((d) => d.fmt !== 'raw');
  if (isStrategic()) return STRATEGIC_DIALS;
  if (isMarket()) return MARKET_DIALS;
  return assumptionCatalog(state.models);
}

function activeDials() {
  return isUnit() ? unitDialList() : dialsFor(state.models);
}

function activeDialGroups() {
  return isUnit() ? SINGLE_UNIT_DIAL_GROUPS : DIAL_GROUPS;
}

function applyBuildStepHighlight() {
  const guideTabs = { three: 'three', dcf: 'dcf', comps: 'comps' };
  const guideTab = guideTabs[state.activeTab];
  if (!guideTab) return;
  const steps = stepsForTab(guideTab);
  const activeId = state.buildStep[guideTab] || steps[0]?.id;
  const step = steps.find((s) => s.id === activeId);
  const keys = new Set(step?.rowKeys || []);
  document.querySelectorAll('[data-row-key]').forEach((tr) => {
    tr.classList.toggle('fm-trace-highlight', keys.has(tr.dataset.rowKey));
  });
}

function applyTraceHighlight(key) {
  const keys = new Set(key ? dependencyRowKeys(key, state.exercise || 'filer', state.activeTab) : []);
  document.querySelectorAll('[data-row-key]').forEach((tr) => {
    tr.classList.toggle('fm-trace-highlight', keys.has(tr.dataset.rowKey));
  });
  document.querySelectorAll('[data-trace-key]').forEach((el) => {
    el.classList.toggle('fm-trace-highlight', keys.has(el.dataset.traceKey));
  });
}

function syncRowHighlights() {
  if (state.focusedAssumption) {
    applyTraceHighlight(state.focusedAssumption);
    return;
  }
  applyBuildStepHighlight();
}

function renderDependencyTrace(key) {
  if (!key) return '';
  const path = dependencyPath(key, state.exercise || 'filer');
  if (!path.length) return '';
  return `<p class="fm-trace-path fm-trace-inline" aria-live="polite"><strong>Affects.</strong> ${path.map((p) => escapeHtml(p)).join(' → ')}</p>`;
}

const BUILD_GUIDE = {
  three: {
    title: 'How this model is built',
    subtitle:
      'Build order for the tables below — not a second model. Each step is one piece of the 3-statement (revenue → costs → cash → balance sheet).',
  },
  dcf: {
    title: 'How this model is built',
    subtitle: 'Build order for the DCF output below — not a second model. Each step adds one piece of the valuation.',
  },
  comps: {
    title: 'How this model is built',
    subtitle: 'Build order for the comps tables below — not a second model. Each step adds one piece of the peer comparison.',
  },
};

function threeStatementConceptCards(model) {
  const unitKind = model?.kind === 'unit' || model?.kind === 'single-unit';
  const isText = unitKind
    ? 'Cups × price is sales. Cost per cup is COGS. Depreciation spreads the kit cost. Net income is the handoff to cash flow and equity.'
    : 'Sales grow by your rate. Margins turn sales into operating profit. Interest uses last year’s debt and cash — nothing circular. Net income is the handoff.';
  return `<div class="fm-concept-cards" aria-label="How the three statements connect">
    <article class="fm-concept-card">
      <h4>Income statement</h4>
      <p>${isText}</p>
    </article>
    <article class="fm-concept-card">
      <h4>Cash flow</h4>
      <p>Starts with net income. Add back depreciation. Working capital, CapEx, debt paydown, and dividends are cash movements. What remains is the change in cash.</p>
    </article>
    <article class="fm-concept-card">
      <h4>Balance sheet</h4>
      <p>Cash is the plug from cash flow. Receivables and inventory size off this year’s sales. Equity rolls forward from net income minus dividends. The check row must read zero.</p>
    </article>
  </div>`;
}

function wrapChecklist(tabId, context) {
  const steps = stepsForTab(tabId);
  if (!steps.length) return { html: '', bind: () => {} };
  const activeId = state.buildStep[tabId] || steps[0].id;
  const active = steps.find((s) => s.id === activeId) || steps[0];
  const preview = previewForStep(active, context);
  const meta = BUILD_GUIDE[tabId] || {};
  return renderChecklist(steps, activeId, {
    subtitle: meta.subtitle,
    onSelect: (id) => {
      state.buildStep[tabId] = id;
      render();
    },
    preview,
  });
}

function dialCatalogEntry(key) {
  const list = isStandaloneExercise() ? exerciseDialList() : assumptionCatalog(state.models);
  return list.find((d) => d.key === key) || null;
}

function ensureFocusedAssumption() {
  const active = isStandaloneExercise() ? exerciseDialList() : assumptionCatalog(state.models);
  if (state.focusedAssumption && active.some((d) => d.key === state.focusedAssumption)) return;
  state.focusedAssumption = active[0]?.key ?? null;
}

function focusAssumption(key, { rerenderModel = false } = {}) {
  state.focusedAssumption = key;
  renderAssumptionDetail();
  document.querySelectorAll('.fm-assump-row').forEach((row) => {
    row.classList.toggle('is-active', row.dataset.dialKey === key);
  });
  applyTraceHighlight(key);
  if (!key) syncRowHighlights();
  if (rerenderModel) render();
}

function renderAssumptionDetailHtml(key) {
  const d = dialCatalogEntry(key);
  if (!d) return '';
  const value = dialRawValue(d);
  const disabled = value == null;
  const validation = disabled ? { valid: true } : validateAssumption(d, value);
  const err = !validation.valid
    ? `<p class="fm-assump-pop-error">${escapeHtml(validation.message)}</p>`
    : validation.warn && validation.message
      ? `<p class="fm-assump-pop-warn">${escapeHtml(validation.message)}</p>`
      : '';
  const what = d.shortDefinition || d.what || '';
  const effect = d.effect && d.effect !== what ? d.effect : '';
  const sentences = [what, effect].filter(Boolean).slice(0, 2);

  return `<p class="fm-assump-pop-text"><strong>${escapeHtml(d.name)}.</strong> ${sentences
    .map((s) => escapeHtml(s))
    .join(' ')}</p>${err}`;
}

function renderAssumptionDetail() {
  ensureFocusedAssumption();
  const key = state.focusedAssumption;
  const html = key
    ? renderAssumptionDetailHtml(key)
    : '<p class="fm-assump-placeholder">Click a name or start typing a value — every row is editable.</p>';
  const el = $('assumption-detail');
  if (el) el.innerHTML = html;
}

function renderAssumptionListHtml() {
  const active = isStandaloneExercise() ? exerciseDialList() : assumptionCatalog(state.models);
  ensureFocusedAssumption();

  const scenarios = state.scenarioState
    ? SCENARIO_ORDER.map(
        (s) =>
          `<button type="button" data-scenario="${s}" aria-pressed="${state.scenarioState?.activeScenario === s}">${SCENARIO_LABELS[s]}</button>`
      ).join('')
    : '';

  const chips = active
    .map((d) => {
      const value = dialRawValue(d);
      const disabled = value == null && d.fmt !== 'bool';
      const isActive = state.focusedAssumption === d.key;
      const token = sourceToken(d, value, state.sourceDefaults);
      const input = disabled
        ? `<span class="fm-chip-input is-missing" aria-hidden="true">—</span>`
        : `<input class="fm-chip-input" type="text" inputmode="decimal" data-key="${d.key}" value="${escapeHtml(dialValueText(d, value))}" aria-label="${escapeHtml(d.name)} value" />`;
      return `<div class="fm-assump-row${isActive ? ' is-active' : ''}${disabled ? ' is-missing' : ''}" data-dial-key="${d.key}">
        <button type="button" class="fm-chip-name" data-select-dial="${d.key}">${escapeHtml(d.name)}</button>
        ${input}
        <span class="fm-chip-source">${escapeHtml(token)}</span>
      </div>`;
    })
    .join('');

  return {
    chrome: `${isUnit() ? `<div class="fm-unit-template" role="group" aria-label="Unit template">
      <button type="button" data-unit-template="lemonade" aria-pressed="${state.unitTemplate === 'lemonade'}">Lemonade example</button>
      <button type="button" data-unit-template="blank" aria-pressed="${state.unitTemplate === 'blank'}">Blank template</button>
    </div>` : ''}${
      scenarios
        ? `<div class="fm-assump-scenarios" role="group" aria-label="Scenario">${scenarios}</div>`
        : ''
    }`,
    list: `<div class="fm-assump-grid">${chips}</div>`,
  };
}

function bindAssumptionList(wrap) {
  const active = isStandaloneExercise() ? exerciseDialList() : assumptionCatalog(state.models);

  wrap.querySelectorAll('[data-unit-template]').forEach((btn) => {
    btn.onclick = () => {
      const tpl = btn.dataset.unitTemplate;
      if (tpl === state.unitTemplate) return;
      state.unitTemplate = tpl;
      const defaults = defaultSingleUnitAssumptions(tpl);
      initScenarioState(defaults);
      state.sourceDefaults = { ...defaults };
      render();
    };
  });

  wrap.querySelectorAll('.fm-assump-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-key]')) return;
      focusAssumption(row.dataset.dialKey);
    });
  });

  wrap.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('focus', () => focusAssumption(el.dataset.key, { rerenderModel: false }));
    el.addEventListener('change', () => {
      const dial = active.find((d) => d.key === el.dataset.key);
      const value = parseDialInput(dial, el.value);
      if (value == null) return render();
      const drivers = scenarioDrivers();
      if (state.scenarioState && drivers.includes(dial.key)) {
        state.scenarioState = editScenarioValue(state.scenarioState, dial.key, value);
        syncAssumptionsFromScenarios();
      } else {
        setDialValue(dial, value);
      }
      render();
    });
  });

  wrap.querySelectorAll('[data-scenario]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!state.scenarioState) return;
      state.scenarioState = setActiveScenario(state.scenarioState, el.dataset.scenario);
      syncAssumptionsFromScenarios();
      render();
    });
  });
}

function renderDials() {
  const { chrome, list } = renderAssumptionListHtml();
  const chromeEl = $('dials-chrome');
  const bar = $('dials');
  const rail = $('assumptions-bar');
  if (chromeEl) chromeEl.innerHTML = chrome;
  if (bar) bar.innerHTML = list;
  if (rail) bindAssumptionList(rail);
  renderAssumptionDetail();
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

function threeStatementPanel(model) {
  const rows = model.rows;
  const unitKind = model.kind === 'unit' || model.kind === 'single-unit';
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
    ...(unitKind ? [lineOf(rows, 'Transactions', 'transactions', { fmt: 'qty' })] : []),
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

  const ret = unitKind ? model.returns || {} : null;
  const returnsBlock = unitKind
    ? `<div class="fm-verdict">
      <div data-trace-key="unitNpv"><dt>Unit IRR</dt><dd>${ret?.unitIrr != null ? `${(ret.unitIrr * 100).toFixed(1)}%` : '—'}</dd></div>
      <div data-trace-key="unitNpv"><dt>Unit NPV</dt><dd>${ret?.unitNpv != null ? formatUsd(ret.unitNpv) : '—'}</dd></div>
      <div data-trace-key="portfolioNpv"><dt>Portfolio NPV</dt><dd>${ret?.portfolioNpv != null ? formatUsd(ret.portfolioNpv) : '—'}</dd></div>
      <div><dt>Payback</dt><dd>${ret?.paybackYears ?? '—'} yrs</dd></div>
      <div><dt>Breakeven util.</dt><dd>${ret?.breakevenUtilization != null ? `${(ret.breakevenUtilization * 100).toFixed(0)}%` : '—'}</dd></div>
    </div>`
    : '';

  return `<section class="fm-panel fm-panel-model">
    <p class="fm-panel-status ${balances ? 'fm-flag is-ok' : 'fm-flag is-bad'}">${balances ? 'Balance sheet ties' : 'Balance sheet does not tie'}</p>
    ${returnsBlock}
    <div class="fm-statements">
      <div class="fm-statement">${is}</div>
      ${handoff('ni', '↓', 'Net income → cash flow & equity')}
      <div class="fm-statement">${cfs}</div>
      ${handoff('cash', '↓', 'Net change in cash → cash plug')}
      <div class="fm-statement">${bs}</div>
      ${handoff('interest', '↑', 'Cash & debt → next year interest')}
    </div>
    <div class="fm-legend fm-legend-compact">
      <span class="is-ni">Gold — net income</span>
      <span class="is-cash-link">Green — cash plug</span>
      <span class="is-int">Blue — interest on prior balances</span>
    </div>
  </section>`;
}

function dcfPanel(model, dcf) {
  if (!state.models.includes('dcf')) {
    return `<section class="fm-panel"><div class="fm-empty"><h3>DCF not selected</h3><p>Turn on Discounted cash flow in setup to include it in the workbook.</p></div></section>`;
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

  return `<section class="fm-panel fm-panel-model">
    <div class="fm-verdict">
      <div data-trace-key="wacc"><dt>Discount rate (WACC)</dt><dd>${formatPercent(dcf.wacc.wacc)}</dd></div>
      <div data-trace-key="enterpriseValue"><dt>Enterprise value</dt><dd>${formatUsd(dcf.enterpriseValue) || '—'}</dd></div>
      <div data-trace-key="impliedPrice"><dt>Implied share price</dt><dd>${fmtPrice(dcf.impliedPrice) || 'not reported'}</dd></div>
      <div><dt>Last market price</dt><dd>${fmtPrice(dcf.marketPrice) || 'not reported'}</dd></div>
      <div data-trace-key="impliedPrice"><dt>Upside</dt><dd class="${upClass}">${dcf.upside == null ? 'not reported' : formatPercent(dcf.upside, true)}</dd></div>
    </div>
    ${flows}
  </section>`;
}

function sensitivityPanel(model, dcf, sens) {
  if (isUnit()) {
    state.sensitivityPreset = 'unitPriceUtil';
  } else if (!state.models.includes('dcf') && state.sensitivityPreset === 'dcfWaccGrowth') {
    state.sensitivityPreset = 'opsGrowthMargin';
  }

  const ctx = {
    headlines: state.headlines,
    assumptions: state.assumptions,
    model,
    dcf,
    sens,
    shares: state.headlines?.metrics?.shares_out?.val ?? null,
    price: state.prices.get(priceTicker(state.company)) ?? null,
    peers: state.peers,
  };

  const unitRunner = (patch) => ({ model: runSingleUnitPortfolio(patch), dcf: null, comps: null });
  const matrix = runSensitivityMatrix(state.sensitivityPreset, ctx, {
    runModel: isUnit() ? unitRunner : undefined,
  });
  const mono = matrix ? checkMonotonicity(matrix) : { ok: true, warnings: [] };

  const presetOptions = Object.values(SENSITIVITY_PRESETS)
    .filter((p) => isUnit() === (p.id === 'unitPriceUtil'))
    .map((p) => `<option value="${p.id}" ${p.id === state.sensitivityPreset ? 'selected' : ''}>${escapeHtml(p.label)}</option>`)
    .join('');

  let grid = '<p class="fm-empty">Select a working model to run sensitivity.</p>';
  if (matrix?.rows?.length) {
    const fmtCell = (v) => {
      if (v == null || !Number.isFinite(v)) return '—';
      if (matrix.unit === 'price') return fmtPrice(v) || '—';
      if (isUnit() || matrix.output === 'unitEbitda') {
        return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      }
      return fmtM(v) || '—';
    };
    const fmtRow = (v) => (matrix.rowLabel === 'WACC' ? `${(v * 100).toFixed(2)}%` : dialValueText({ fmt: matrix.rowLabel?.includes('Days') ? 'days' : 'pct', key: matrix.rowInput }, v));
    const fmtCol = (v) => (matrix.colLabel === 'Terminal growth' || matrix.colLabel === 'terminalGrowth' ? `${(v * 100).toFixed(2)}%` : dialValueText({ fmt: matrix.colLabel?.includes('Days') ? 'days' : 'pct', key: matrix.columnInput }, v));

    grid = `<div class="fm-scroll" data-trace-key="sensitivityGrid"><table class="fm-table fm-sensitivity-grid"><thead><tr><th>${escapeHtml(matrix.colLabel || 'Column')} ╲ ${escapeHtml(matrix.rowLabel || 'Row')}</th>${matrix.colValues
      .map((g, i) => `<th class="${i === matrix.baseColIndex ? 'fm-col-actual' : ''}">${escapeHtml(fmtCol(g))}</th>`)
      .join('')}</tr></thead><tbody>${matrix.rows
      .map(
        (r, ri) =>
          `<tr><td>${escapeHtml(fmtRow(r.rowValue))}</td>${r.cells
            .map((c, ci) => {
              const isCenter = ri === matrix.baseRowIndex && ci === matrix.baseColIndex;
              const heat = finiteHeat(c, matrix);
              return `<td class="${isCenter ? 'fm-sens-center' : ''}" style="background:${heat}">${escapeHtml(fmtCell(c))}</td>`;
            })
            .join('')}</tr>`
      )
      .join('')}</tbody></table></div>`;
  }

  const interpret = matrix?.interpret ? `<p class="fm-aside">${escapeHtml(matrix.interpret)}</p>` : '';
  const monoWarn = mono.warnings?.length
    ? `<p class="fm-status is-warn">${escapeHtml(mono.warnings.join(' '))}</p>`
    : '';

  const gs = runGoalSeekUi(ctx);

  return `<section class="fm-panel">
    <h3>Two-variable sensitivity</h3>
    <p class="fm-aside">Holds other assumptions at the active scenario while two drivers move. This does not change your Base/Upside/Downside cases.</p>
    <label class="fm-sens-pick">Preset
      <select id="sensitivity-preset" class="fm-search">${presetOptions}</select>
    </label>
    ${interpret}
    ${grid}
    ${monoWarn}
    <h4 style="margin-top:18px;font-size:14px">One-variable goal seek</h4>
    ${gs.html}
  </section>`;
}

function finiteHeat(value, matrix) {
  if (value == null || !Number.isFinite(value)) return 'transparent';
  const flat = matrix.rows.flatMap((r) => r.cells).filter((c) => Number.isFinite(c));
  if (!flat.length) return 'transparent';
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  if (max === min) return 'rgba(242, 193, 78, 0.15)';
  const t = (value - min) / (max - min);
  const alpha = 0.12 + t * 0.35;
  return `rgba(26, 73, 196, ${alpha.toFixed(3)})`;
}

function runGoalSeekUi(ctx) {
  const targetRaw = state.goalSeekTarget;
  const targetValue = Number(String(targetRaw).replace(/[^0-9.\-]/g, ''));
  const inputKey = state.goalSeekInput;
  const meta = assumptionCatalog(state.models).find((d) => d.key === inputKey) || { min: -0.2, max: 0.4 };
  let result = null;
  if (Number.isFinite(targetValue)) {
    result = goalSeek({
      targetValue,
      inputKey,
      assumptions: ctx.assumptions,
      min: meta.min,
      max: meta.max,
      evaluate: (patch) => {
        const m = runThreeStatement(ctx.headlines, patch);
        if (!m.ok) return null;
        if (state.models.includes('dcf')) {
          const d = runDcf(m, { price: ctx.price, shares: ctx.shares });
          return d.impliedPrice;
        }
        return m.rows.find((r) => r.offset === 1)?.netIncome ?? null;
      },
    });
  }
  const inputs = ['revenueGrowth', 'ebitMargin', 'terminalGrowth', 'riskFreeRate']
    .map((k) => `<option value="${k}" ${k === inputKey ? 'selected' : ''}>${k}</option>`)
    .join('');

  const outcome = !Number.isFinite(targetValue)
    ? '<p class="fm-status">Enter a target value to solve.</p>'
    : result?.ok
      ? `<p class="fm-flag is-ok">Solved ${escapeHtml(inputKey)} = ${escapeHtml(dialValueText(meta, result.solved))}${result.approximate ? ' (approximate)' : ''}</p>`
      : `<p class="fm-flag is-bad">${escapeHtml(result?.reason || 'Could not solve')}</p>`;

  return {
    html: `<div class="fm-goal-seek">
      <label>Target output value
        <input id="goal-seek-target" class="fm-search" type="text" inputmode="decimal" value="${escapeHtml(targetRaw)}" placeholder="${state.models.includes('dcf') ? 'Implied share price' : 'Net income'}" />
      </label>
      <label>Input to adjust
        <select id="goal-seek-input" class="fm-search">${inputs}</select>
      </label>
      ${outcome}
    </div>`,
  };
}

function scenarioAssumptionsFor(key) {
  if (!state.scenarioState) return state.assumptions;
  const st = ensureScenarioInitialized(state.scenarioState, key);
  return { ...st.defaults, ...st.scenarios[key].values, scenario: key };
}

function runScenarioColumn(key) {
  const assumptions = scenarioAssumptionsFor(key);
  if (isUnit()) {
    const model = runSingleUnitPortfolio(assumptions);
    return { model, dcf: null, ok: model.ok };
  }
  const model = runThreeStatement(state.headlines, assumptions);
  if (!model.ok) return { model, dcf: null, ok: false };
  const shares = state.headlines?.metrics?.shares_out?.val ?? null;
  const price = state.prices.get(priceTicker(state.company)) ?? null;
  const dcf = state.models.includes('dcf') ? runDcf(model, { price, shares }) : null;
  return { model, dcf, ok: true };
}

function scenariosPanel() {
  if (!state.scenarioState) {
    return `<section class="fm-panel"><div class="fm-empty"><h3>Select a company first</h3></div></section>`;
  }

  const active = state.scenarioState.activeScenario;
  const drivers = scenarioDrivers();
  const catalog = isUnit() ? unitDialList() : assumptionCatalog(state.models);
  const driverMeta = new Map(catalog.filter((d) => drivers.includes(d.key)).map((d) => [d.key, d]));

  const header = SCENARIO_ORDER.map(
    (k) => `<th class="${k === active ? 'fm-col-actual' : ''}">${SCENARIO_LABELS[k]}</th>`
  ).join('');

  const rows = drivers
    .filter((key) => driverMeta.has(key) || state.scenarioState.scenarios.base.values[key] != null)
    .map((key) => {
      const meta = driverMeta.get(key) || { key, name: key, fmt: 'num' };
      const cells = SCENARIO_ORDER.map((k) => {
        const st = ensureScenarioInitialized(state.scenarioState, k);
        const v = st.scenarios[k].values[key];
        const isActive = k === active;
        return `<td class="${isActive ? 'fm-forecast' : ''}">${escapeHtml(dialValueText(meta, v))}</td>`;
      }).join('');
      return `<tr><td>${escapeHtml(meta.name || key)}</td>${cells}</tr>`;
    })
    .join('');

  const outputs = SCENARIO_ORDER.map((k) => {
    const run = runScenarioColumn(k);
    const row = run.model?.rows?.find((r) => r.offset === 1) || run.model?.rows?.[0];
    const rev = row ? fmtM(row.revenue) : '—';
    const ebit = row ? (isUnit() ? `$${Math.round(row.ebit).toLocaleString('en-US')}` : fmtM(row.ebit)) : '—';
    const ni = row ? (isUnit() ? `$${Math.round(row.netIncome).toLocaleString('en-US')}` : fmtM(row.netIncome)) : '—';
    const cash = row ? (isUnit() ? `$${Math.round(row.cash).toLocaleString('en-US')}` : fmtM(row.cash)) : '—';
    const debt = row ? (isUnit() ? `$${Math.round(row.debt).toLocaleString('en-US')}` : fmtM(row.debt)) : '—';
    const fcf = row ? fmtM(row.unleveredFcf) : '—';
    const price = run.dcf?.impliedPrice != null ? fmtPrice(run.dcf.impliedPrice) : '—';
    const tie = run.model?.checks?.balances ? 'Ties' : 'Fails';
    return { k, row, model: run.model, rev, ebit, ni, cash, debt, fcf, price, tie, ok: run.ok };
  });

  const outputRows = (isUnit()
    ? [
        ['Unit EBITDA (Y1)', outputs.map((o) => (o.row ? `$${Math.round(o.row.ebitda).toLocaleString('en-US')}` : '—'))],
        ['Net income (Y1)', outputs.map((o) => o.ni)],
        ['Unit NPV', outputs.map((o) => (o.model?.returns?.unitNpv != null ? formatUsd(o.model.returns.unitNpv) : '—'))],
        ['Payback (years)', outputs.map((o) => (o.model?.returns?.paybackYears ?? '—'))],
        ['Balance check', outputs.map((o) => o.tie)],
      ]
    : [
        ['Revenue (Y1)', outputs.map((o) => o.rev)],
        ['EBIT (Y1)', outputs.map((o) => o.ebit)],
        ['Net income (Y1)', outputs.map((o) => o.ni)],
        ['Ending cash (Y1)', outputs.map((o) => o.cash)],
        ['Debt (Y1)', outputs.map((o) => o.debt)],
        ['Unlevered FCF (Y1)', outputs.map((o) => o.fcf)],
        ['Implied share price', outputs.map((o) => o.price)],
        ['Balance check', outputs.map((o) => o.tie)],
      ])
    .map(
      ([label, vals]) =>
        `<tr><td>${escapeHtml(label)}</td>${vals.map((v, i) => `<td class="${SCENARIO_ORDER[i] === active ? 'fm-forecast' : ''}">${escapeHtml(String(v))}</td>`).join('')}</tr>`
    )
    .join('');

  const casePills = SCENARIO_ORDER.map(
    (k) =>
      `<button type="button" class="fm-chip" data-scenario-select="${k}" aria-pressed="${k === active}">${SCENARIO_LABELS[k]}</button>`
  ).join('');

  return `<section class="fm-panel">
    <h3>Scenario manager</h3>
    <p class="fm-aside"><strong>Scenarios vs sensitivity:</strong> each column is a coherent case — several drivers move together. Sensitivity (another tab) isolates one or two variables. Edits in the Assumptions panel change only the active case (<strong>${escapeHtml(SCENARIO_LABELS[active])}</strong>).</p>
    <div class="fm-scenarios" role="group" aria-label="Active scenario">${casePills}</div>
    <h4 style="margin:16px 0 8px;font-size:14px">Drivers by scenario</h4>
    <div class="fm-scroll"><table class="fm-table">
      <thead><tr><th>Driver</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <h4 style="margin:16px 0 8px;font-size:14px">Outputs by scenario</h4>
    <div class="fm-scroll"><table class="fm-table">
      <thead><tr><th>Output</th>${header}</tr></thead>
      <tbody>${outputRows}</tbody>
    </table></div>
    <div class="fm-dock-actions" style="margin-top:14px">
      <button type="button" class="fm-btn fm-btn-ghost" id="scenario-reset-active">Reset active case</button>
      <button type="button" class="fm-btn fm-btn-ghost" id="scenario-reset-all">Reset all cases</button>
    </div>
  </section>`;
}

function checksPanel(model, dcf, comps) {
  const checks = [];
  if (model.kind === 'strategic') {
    checks.push(model.checks.probabilitiesSum ? 'Scenario probabilities sum to 100%' : 'Probabilities do not sum to 100% — expected value is not trusted');
    checks.push(`Selected alternative: ${model.selected?.label || '—'}`);
    if (model.expectedNpv != null) checks.push(`Probability-weighted NPV: ${formatUsd(model.expectedNpv)}`);
  } else if (model.kind === 'market-entry') {
    checks.push(`Preferred structure: ${model.preferredStructure || '—'}`);
    checks.push('Regional rankings separate financial and qualitative components');
  } else if (model.kind === 'capital-project') {
    checks.push(model.checks.sourcesUses ? 'Sources equal uses (within tolerance)' : 'Sources and uses do not balance');
    checks.push(model.checks.debtRoll ? 'Debt schedule rolls forward' : 'Debt schedule issue');
    if (model.returns?.peakFunding != null) checks.push(`Peak funding: ${formatUsd(model.returns.peakFunding)}`);
  } else {
    checks.push(model.checks?.balances ? 'Balance sheet ties in every projected year' : 'Balance sheet does NOT tie — do not trust outputs');
    if (model.checks?.cashWarning) checks.push(model.checks.cashWarning);
    if (isUnit() && model.checks?.unitPortfolioReconciled) checks.push('Unit and portfolio cash flows reconcile');
  }
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
  const workbookModels = isStandaloneExercise()
    ? `${EXERCISES.find((e) => e.id === state.exercise)?.title || 'Exercise'} model`
    : [
        state.models.includes('three') && '3-statement',
        state.models.includes('dcf') && 'DCF',
        state.models.includes('comps') && 'comps',
      ]
        .filter(Boolean)
        .join(', ') || 'nothing selected';

  const list = checks.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  const ready =
    model.kind === 'strategic'
      ? model.checks?.probabilitiesSum
      : model.kind === 'capital-project'
        ? model.checks?.sourcesUses
        : model.kind === 'market-entry'
          ? model.ok
          : model.checks?.balances;

  return `<section class="fm-panel">
    <h3>Integrity checks</h3>
    <ul class="fm-flow" style="grid-template-columns:1fr">${list}</ul>
    <p class="fm-aside"><strong>Workbook will include:</strong> ${escapeHtml(workbookModels)}. Tab visibility does not change this — only your setup model picks do.</p>
    <div class="fm-dock-actions" style="margin-top:16px">
      ${isStandaloneExercise() ? '' : `<a class="fm-btn fm-btn-ghost" href="/fortune-500/#company=${state.company?.cik || ''}">Open the 10-K ratios</a>`}
      <button type="button" class="fm-btn" id="checks-download" ${ready || isStandaloneExercise() ? '' : 'disabled'}>Download Excel</button>
    </div>
    ${ready ? '' : '<p class="fm-status is-warn">Fix the balance sheet before downloading — the workbook will still generate, but the numbers are not trustworthy.</p>'}
  </section>`;
}

function compsPanel(comps) {
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

  return `<section class="fm-panel fm-panel-model">
    <div class="fm-scroll"><table class="fm-table">
      <thead><tr><th>Company</th><th>Price</th><th>EV ($m)</th><th>EV/Revenue</th><th>EV/EBITDA</th><th>P/E</th></tr></thead>
      <tbody>${body}${stats}</tbody></table></div>
    <h4 style="margin-top:14px;font-size:14px">Implied for ${escapeHtml(comps.self.name)}</h4>
    <div class="fm-scroll"><table class="fm-table">
      <thead><tr><th>Multiple</th><th>Peer median</th><th>Implied share price</th></tr></thead>
      <tbody>${implied}</tbody></table></div>
  </section>`;
}

function currentRun() {
  if (isUnit()) {
    if (!state.assumptions) return null;
    const model = runSingleUnitPortfolio(state.assumptions);
    model.companyName = 'Single-unit model';
    return { model, dcf: null, sens: null, comps: null };
  }
  if (isCapital()) {
    if (!state.assumptions) return null;
    const model = runCapitalProject(state.assumptions);
    return { model, dcf: null, sens: null, comps: null };
  }
  if (isStrategic()) {
    if (!state.assumptions) return null;
    const model = runStrategicAppraisal(state.assumptions);
    return { model, dcf: null, sens: null, comps: null };
  }
  if (isMarket()) {
    if (!state.assumptions) return null;
    const model = runMarketEntry(state.assumptions);
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

function renderInspectorChecklist(context) {
  const tabId = state.activeTab;
  const guideTabs = { three: 'three', dcf: 'dcf', comps: 'comps' };
  const guideTab = guideTabs[tabId];
  const desktop = $('inspector-checklist');
  const sheet = $('inspector-checklist-sheet');
  const inspector = $('inspector');
  const targets = [desktop, sheet].filter(Boolean);

  if (!guideTab) {
    targets.forEach((el) => {
      el.innerHTML = '';
    });
    if (inspector) inspector.hidden = true;
    return;
  }

  const cl = wrapChecklist(guideTab, context);
  const concepts = guideTab === 'three' ? threeStatementConceptCards(context.model) : '';
  const html = cl.html + concepts;
  if (inspector) inspector.hidden = !html;
  targets.forEach((el) => {
    el.innerHTML = html;
    if (cl.html) cl.bind(el);
  });
}

function capitalProjectPanel(model) {
  const cols = model.rows.map((r) => ({ year: r.year, filed: false }));
  const lines = [
    lineOf(model.rows, 'CapEx', 'capex'),
    lineOf(model.rows, 'Revenue', 'revenue'),
    lineOf(model.rows, 'EBIT', 'ebit'),
    lineOf(model.rows, 'Project FCF', 'projectFcf'),
    lineOf(model.rows, 'DSCR', 'dscr', { fmt: 'raw' }),
  ];
  const ret = model.returns || {};
  return `<section class="fm-panel fm-panel-model">
    <div class="fm-verdict">
      <div data-trace-key="projectNpv"><dt>Project IRR</dt><dd>${ret.projectIrr != null ? `${(ret.projectIrr * 100).toFixed(1)}%` : '—'}</dd></div>
      <div data-trace-key="equityNpv"><dt>Equity IRR</dt><dd>${ret.equityIrr != null ? `${(ret.equityIrr * 100).toFixed(1)}%` : '—'}</dd></div>
      <div data-trace-key="projectNpv"><dt>Peak funding</dt><dd>${ret.peakFunding != null ? formatUsd(ret.peakFunding) : '—'}</dd></div>
    </div>
    ${table(cols, [{ title: 'Project schedule', lines }], { scale: 1, unitLabel: 'US$' })}
  </section>`;
}

function strategicPanel(model) {
  const rows = model.alternatives
    .map(
      (a) =>
        `<tr data-row-key="altNpv_${a.key}"><td>${escapeHtml(a.label)}</td><td data-row-key="altNpv_${a.key}">${formatUsd(a.npv) || '—'}</td><td data-row-key="incrementalNpv_${a.key}">${formatUsd(a.incrementalNpv) || '—'}</td><td>${a.qualitativeScore}/5</td></tr>`
    )
    .join('');
  return `<section class="fm-panel fm-panel-model">
    <p class="fm-panel-status">Selected: ${escapeHtml(model.selected?.label || '—')}${model.checks.probabilitiesSum ? '' : ' · probabilities do not sum to 100%'}</p>
    <div class="fm-scroll"><table class="fm-table"><thead><tr><th>Alternative</th><th>NPV</th><th>Incremental NPV</th><th>Qualitative</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="fm-aside" data-trace-key="expectedNpv"><strong>Expected NPV:</strong> ${model.expectedNpv != null ? formatUsd(model.expectedNpv) : '—'}</p>
  </section>`;
}

function marketPanel(model) {
  const rows = model.structures
    .map(
      (s) =>
        `<tr data-row-key="structureNpv"><td>${escapeHtml(s.label)}</td><td>${formatUsd(s.npv) || '—'}</td><td>${s.breakevenYear ?? '—'}</td></tr>`
    )
    .join('');
  return `<section class="fm-panel fm-panel-model">
    <p class="fm-panel-status">Preferred structure: ${escapeHtml(model.preferredStructure || '—')} · ${escapeHtml(model.assumptions.localCurrency)} → ${escapeHtml(model.assumptions.reportingCurrency)} @ ${model.assumptions.fxRate}</p>
    <div class="fm-scroll"><table class="fm-table"><thead><tr><th>Structure</th><th>NPV</th><th>Breakeven year</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
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

  let html;
  switch (state.activeTab) {
    case 'three':
      if (model.kind === 'capital-project') html = capitalProjectPanel(model);
      else if (model.kind === 'strategic') html = strategicPanel(model);
      else if (model.kind === 'market-entry') html = marketPanel(model);
      else html = threeStatementPanel(model);
      break;
    case 'dcf':
      html = dcfPanel(model, dcf);
      break;
    case 'comps':
      html = compsPanel(comps);
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
      html = threeStatementPanel(model);
  }
  return { html, context };
}

function render() {
  if (!workspaceLive()) return;
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
  $('output').innerHTML = panel.html;
  renderInspectorChecklist(panel.context);

  syncRowHighlights();

  $('sensitivity-preset')?.addEventListener('change', (e) => {
    state.sensitivityPreset = e.target.value;
    render();
  });
  $('goal-seek-target')?.addEventListener('change', (e) => {
    state.goalSeekTarget = e.target.value;
    render();
  });
  $('goal-seek-input')?.addEventListener('change', (e) => {
    state.goalSeekInput = e.target.value;
    render();
  });

  $('output').querySelectorAll('[data-scenario-select]').forEach((el) => {
    el.onclick = () => {
      if (!state.scenarioState) return;
      state.scenarioState = setActiveScenario(state.scenarioState, el.dataset.scenarioSelect);
      syncAssumptionsFromScenarios();
      render();
    };
  });

  const resetActive = $('scenario-reset-active');
  if (resetActive) {
    resetActive.onclick = () => {
      if (!state.scenarioState) return;
      if (!confirm(`Reset ${SCENARIO_LABELS[state.scenarioState.activeScenario]} to its filing defaults?`)) return;
      const defaults = isUnit() ? unitDefaults() : defaultAssumptions(state.headlines);
      state.scenarioState = resetActiveScenario(state.scenarioState, defaults);
      syncAssumptionsFromScenarios();
      render();
    };
  }
  const resetAll = $('scenario-reset-all');
  if (resetAll) {
    resetAll.onclick = () => {
      if (!state.scenarioState) return;
      if (!confirm('Reset all scenarios to filing defaults? This clears every case edit.')) return;
      const defaults = isUnit() ? unitDefaults() : defaultAssumptions(state.headlines);
      state.scenarioState = resetAllScenarios(defaults);
      syncAssumptionsFromScenarios();
      render();
    };
  }

  const dl = $('checks-download');
  if (dl) dl.onclick = download;

  const mobileInspector = $('inspector-mobile');
  if (mobileInspector) mobileInspector.hidden = true;

  if (isUnit()) {
    $('dock-name').textContent = state.unitTemplate === 'blank' ? 'Single-unit model' : 'Lemonade stall';
  } else if (isCapital()) {
    $('dock-name').textContent = 'Capital project';
  } else if (isStrategic()) {
    $('dock-name').textContent = 'Strategic investment';
  } else if (isMarket()) {
    $('dock-name').textContent = 'Market entry';
  } else {
    $('dock-name').textContent = `${state.company.company} · FY${state.headlines.asOfYear}`;
  }
  $('dock-check').textContent = (() => {
    if (model.kind === 'strategic') return model.checks.probabilitiesSum ? 'Probabilities OK' : 'Fix probability weights';
    if (model.kind === 'capital-project') return model.checks.sourcesUses ? 'Project checks pass' : 'Sources/uses issue';
    if (model.kind === 'market-entry') return `Preferred: ${model.preferredStructure || '—'}`;
    return model.checks?.balances ? 'Balance sheet ties · ready to download' : 'Balance sheet does not tie';
  })();
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
    else if (workspaceLive()) render();
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
  const cards = assumptionCards();
  if (isUnit()) {
    const bytes = buildUnitWorkbook({ model: run.model, cards });
    downloadWorkbook(exerciseWorkbookFilename('unit', state.unitTemplate), bytes);
    return;
  }
  if (isCapital()) {
    const bytes = buildCapitalWorkbook({ model: run.model, cards });
    downloadWorkbook(exerciseWorkbookFilename('capital'), bytes);
    return;
  }
  if (isStrategic()) {
    const bytes = buildStrategicWorkbook({ model: run.model, cards });
    downloadWorkbook(exerciseWorkbookFilename('strategic'), bytes);
    return;
  }
  if (isMarket()) {
    const bytes = buildMarketWorkbook({ model: run.model, cards });
    downloadWorkbook(exerciseWorkbookFilename('market'), bytes);
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
    scenarioState: state.scenarioState,
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
  const inspectorToggle = $('inspector-toggle');
  inspectorToggle?.addEventListener('click', () => {
    const open = !inspector.classList.contains('is-open');
    inspector.classList.toggle('is-open', open);
    inspectorToggle.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (e) => {
    const companyBlock = $('ws-company-block');
    const peersBlock = $('ws-peers-block');
    if (!companyBlock?.contains(e.target)) hideWsPop('ws-company-pop', 'ws-company-results');
    if (!peersBlock?.contains(e.target)) hideWsPop('ws-peer-pop', 'ws-peer-results');
  });

  $('landing-next')?.addEventListener('click', () => enterWorkspace());
  bindLandingModels();
  $('tour-next').onclick = () => {
    state.tourStep += 1;
    if (state.tourStep >= TOUR.length) endTour();
    else renderTour();
  };
  $('tour-skip').onclick = endTour;
  $('dock-download').onclick = download;
  $('search')?.addEventListener('input', (e) => renderResults(e.target.value));
  $('peer-search')?.addEventListener('input', (e) => renderPeerResults(e.target.value));

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
