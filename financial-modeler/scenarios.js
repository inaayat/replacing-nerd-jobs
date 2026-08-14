/**
 * Persistent Base / Downside / Upside / Custom scenario state. Edits are
 * isolated per case; switching cases never overwrites another case's values.
 */
import { applyScenario } from './engine.js';

export const SCENARIO_ORDER = ['downside', 'base', 'upside', 'custom'];

export const SCENARIO_LABELS = {
  downside: 'Downside',
  base: 'Base',
  upside: 'Upside',
  custom: 'Custom',
};

/** Drivers that appear in the scenario manager table. */
export const SCENARIO_DRIVERS = [
  'revenueGrowth',
  'grossMargin',
  'ebitMargin',
  'dsoDays',
  'dioDays',
  'capexPct',
  'daPct',
  'taxRate',
  'debtRepaymentPct',
  'riskFreeRate',
  'equityRiskPremium',
  'beta',
  'interestRate',
  'terminalGrowth',
];

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function pickDrivers(full) {
  const values = {};
  for (const key of SCENARIO_DRIVERS) {
    if (full[key] != null) values[key] = full[key];
  }
  return values;
}

/** One-time tilt for downside/upside beyond the legacy bear/bull helper. */
function tiltValues(baseValues, sign) {
  const out = { ...baseValues };
  const bump = (key, delta, lo, hi) => {
    if (finite(out[key])) out[key] = clamp(out[key] + sign * delta, lo, hi);
  };
  bump('revenueGrowth', 0.03, -0.2, 0.4);
  bump('ebitMargin', 0.02, -0.2, 0.7);
  bump('grossMargin', 0.015, 0, 0.95);
  bump('capexPct', 0.01, 0, 0.4);
  bump('terminalGrowth', 0.005, 0, 0.05);
  bump('dsoDays', 5, 0, 240);
  bump('dioDays', 5, 0, 365);
  if (sign < 0) {
    bump('beta', 0.15, 0.2, 2.5);
    bump('equityRiskPremium', 0.01, 0, 0.12);
  } else if (sign > 0) {
    bump('beta', -0.1, 0.2, 2.5);
    bump('equityRiskPremium', -0.005, 0, 0.12);
  }
  return out;
}

export function createScenarioState(defaultAssumptions) {
  const baseValues = pickDrivers(defaultAssumptions);
  return {
    activeScenario: 'base',
    initialized: { downside: false, base: true, upside: false, custom: false },
    defaults: { ...defaultAssumptions },
    scenarios: {
      downside: { label: SCENARIO_LABELS.downside, values: {} },
      base: { label: SCENARIO_LABELS.base, values: { ...baseValues } },
      upside: { label: SCENARIO_LABELS.upside, values: {} },
      custom: { label: SCENARIO_LABELS.custom, values: {} },
    },
  };
}

export function ensureScenarioInitialized(state, key) {
  if (state.initialized[key]) return state;
  const baseValues = { ...state.scenarios.base.values };
  let values;
  if (key === 'downside') values = tiltValues(baseValues, -1);
  else if (key === 'upside') values = tiltValues(baseValues, 1);
  else if (key === 'custom') values = { ...baseValues };
  else values = { ...baseValues };

  return {
    ...state,
    initialized: { ...state.initialized, [key]: true },
    scenarios: {
      ...state.scenarios,
      [key]: { ...state.scenarios[key], values },
    },
  };
}

export function setActiveScenario(state, key) {
  if (!state.scenarios[key]) return state;
  let next = ensureScenarioInitialized(state, key);
  return { ...next, activeScenario: key };
}

export function editScenarioValue(state, driverKey, value) {
  const active = state.activeScenario;
  const caseValues = { ...state.scenarios[active].values, [driverKey]: value };
  return {
    ...state,
    scenarios: {
      ...state.scenarios,
      [active]: { ...state.scenarios[active], values: caseValues },
    },
  };
}

export function resetActiveScenario(state, defaultAssumptions) {
  const active = state.activeScenario;
  let values;
  if (active === 'base') values = pickDrivers(defaultAssumptions);
  else if (active === 'downside') values = tiltValues(pickDrivers(defaultAssumptions), -1);
  else if (active === 'upside') values = tiltValues(pickDrivers(defaultAssumptions), 1);
  else values = { ...pickDrivers(defaultAssumptions) };

  return {
    ...state,
    initialized: { ...state.initialized, [active]: true },
    scenarios: {
      ...state.scenarios,
      [active]: { ...state.scenarios[active], values },
    },
  };
}

export function resetAllScenarios(defaultAssumptions) {
  return createScenarioState(defaultAssumptions);
}

/** Merge active scenario drivers onto filing defaults for the engine. */
export function assumptionsFromScenarioState(state) {
  const active = state.scenarios[state.activeScenario]?.values || {};
  return {
    ...state.defaults,
    ...active,
    scenario: state.activeScenario,
  };
}

/** Legacy bear/base/bull maps to downside/base/upside for the scenario strip. */
export function legacyScenarioId(id) {
  if (id === 'bear') return 'downside';
  if (id === 'bull') return 'upside';
  return id;
}

export function initScenarioStateFromLegacy(defaultAssumptions, legacyId) {
  const key = legacyScenarioId(legacyId);
  let state = createScenarioState(defaultAssumptions);
  if (key === 'downside') {
    state = ensureScenarioInitialized(state, 'downside');
    state = { ...state, activeScenario: 'downside' };
  } else if (key === 'upside') {
    state = ensureScenarioInitialized(state, 'upside');
    state = { ...state, activeScenario: 'upside' };
  }
  return state;
}

/** @deprecated use scenario state — kept for unit econ until aligned */
export { applyScenario };
