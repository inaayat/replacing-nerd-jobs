/**
 * Strategic investment appraisal (Phase 8). Browser-safe ESM.
 */
import { npv, irr } from './returns.js';

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function numberOr(v, f = 0) {
  return finite(v) ? v : f;
}

export const STRATEGIC_ALTERNATIVES = ['build', 'buy', 'partner', 'license', 'lease', 'delay', 'nothing'];

export function defaultStrategicAssumptions() {
  return {
    years: 5,
    hurdleRate: 0.12,
    selectedAlternative: 'build',
    probabilityBuild: 0.25,
    probabilityBuy: 0.15,
    probabilityPartner: 0.2,
    probabilityLicense: 0.1,
    probabilityLease: 0.1,
    probabilityDelay: 0.1,
    probabilityNothing: 0.1,
    build: { capex: 50_000_000, opex: 8_000_000, revenue: 25_000_000, growth: 0.08 },
    buy: { capex: 80_000_000, opex: 5_000_000, revenue: 30_000_000, growth: 0.05 },
    partner: { capex: 15_000_000, opex: 6_000_000, revenue: 18_000_000, growth: 0.1 },
    license: { capex: 2_000_000, opex: 3_000_000, revenue: 12_000_000, growth: 0.06 },
    lease: { capex: 1_000_000, opex: 7_000_000, revenue: 14_000_000, growth: 0.04 },
    delay: { capex: 0, opex: 1_000_000, revenue: 0, growth: 0 },
    nothing: { capex: 0, opex: 0, revenue: 0, growth: 0 },
    qualitativeScore: { build: 4, buy: 3, partner: 4, license: 2, lease: 2, delay: 1, nothing: 0 },
  };
}

function cashFlowsForAlt(alt, years, hurdle) {
  const c = alt;
  const flows = [-numberOr(c.capex, 0)];
  let rev = numberOr(c.revenue, 0);
  for (let i = 1; i <= years; i += 1) {
    flows.push(rev - numberOr(c.opex, 0));
    rev *= 1 + numberOr(c.growth, 0);
  }
  return { flows, npv: npv(hurdle, flows), irr: irr(flows) };
}

export function runStrategicAppraisal(raw) {
  const a = { ...defaultStrategicAssumptions(), ...raw };
  const years = numberOr(a.years, 5);
  const hurdle = numberOr(a.hurdleRate, 0.12);
  const baseline = cashFlowsForAlt(a.nothing, years, hurdle);

  const alternatives = STRATEGIC_ALTERNATIVES.map((key) => {
    const alt = a[key] || {};
    const { flows, npv: altNpv, irr: altIrr } = cashFlowsForAlt(alt, years, hurdle);
    const incrementalNpv = finite(altNpv) && finite(baseline.npv) ? altNpv - baseline.npv : altNpv;
    const probKey = `probability${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    return {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      capex: numberOr(alt.capex, 0),
      npv: altNpv,
      irr: altIrr,
      incrementalNpv,
      capitalAtRisk: numberOr(alt.capex, 0),
      breakevenYear: flows.findIndex((f, i) => i > 0 && flows.slice(0, i + 1).reduce((s, x) => s + x, 0) >= 0) || null,
      probability: numberOr(a[probKey], 0),
      qualitativeScore: a.qualitativeScore?.[key] ?? 0,
      flows,
    };
  });

  const probSum = alternatives.reduce((s, x) => s + x.probability, 0);
  const expectedNpv = probSum > 0.99 && probSum < 1.01
    ? alternatives.reduce((s, x) => s + x.probability * (finite(x.npv) ? x.npv : 0), 0)
    : null;

  const selected = alternatives.find((x) => x.key === a.selectedAlternative) || alternatives[0];

  return {
    ok: true,
    kind: 'strategic',
    scale: 1,
    unitLabel: 'US$',
    assumptions: a,
    alternatives,
    selected,
    baseline,
    expectedNpv,
    checks: {
      probabilitiesSum: Math.abs(probSum - 1) < 0.01,
      probSum,
    },
  };
}
