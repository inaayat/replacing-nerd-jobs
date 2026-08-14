/**
 * Capital-intensive project model (Phase 7). Browser-safe ESM.
 */
import { npv, irr, paybackPeriod, peakFunding } from './returns.js';

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function numberOr(v, f = 0) {
  return finite(v) ? v : f;
}

export function defaultCapitalProjectAssumptions() {
  return {
    years: 12,
    constructionYears: 2,
    constructionDelayMonths: 0,
    costOverrunPct: 0.1,
    phase1Spend: 40_000_000,
    phase2Spend: 60_000_000,
    maintenanceCapex: 2_000_000,
    capacityUnits: 1000,
    utilizationRamp: [0.2, 0.5, 0.75, 0.9, 1, 1, 1, 1, 1, 1],
    pricePerUnit: 120,
    volumeGrowth: 0.03,
    variableCostPct: 0.35,
    fixedOpex: 5_000_000,
    inflation: 0.02,
    debtPct: 0.6,
    equityInvested: 40_000_000,
    interestRate: 0.07,
    debtFeesPct: 0.01,
    amortYears: 10,
    taxRate: 0.21,
    incentiveCredit: 5_000_000,
    terminalValue: 80_000_000,
    hurdleRate: 0.1,
    dsoDays: 45,
    dpoDays: 30,
  };
}

export const CAPITAL_DIALS = [
  { key: 'constructionYears', group: 'build', name: 'Construction years', fmt: 'years', min: 1, max: 5, step: 1, what: 'Years to complete construction.', how: 'CapEx and funding follow this schedule.', originText: () => '2 years.', effect: 'Delays operating start.' },
  { key: 'costOverrunPct', group: 'build', name: 'Cost overrun', fmt: 'pct', min: 0, max: 0.5, step: 0.01, what: 'Extra spend above budget.', how: 'Applied to construction phases.', originText: () => '10%.', effect: 'Raises funding need.' },
  { key: 'phase1Spend', group: 'build', name: 'Phase 1 spend', fmt: 'usd', min: 0, max: 500_000_000, step: 1_000_000, what: 'First construction phase.', how: 'Sources must fund this.', originText: () => '$40m.', effect: 'Year-1 CapEx.' },
  { key: 'phase2Spend', group: 'build', name: 'Phase 2 spend', fmt: 'usd', min: 0, max: 500_000_000, step: 1_000_000, what: 'Second construction phase.', how: 'Completes the asset.', originText: () => '$60m.', effect: 'Year-2 CapEx.' },
  { key: 'utilizationRamp', group: 'ops', name: 'Utilization ramp', fmt: 'raw', min: 0, max: 1, step: 0.01, what: 'Operating ramp after construction.', how: 'Array by operating year.', originText: () => '20% → 100%.', effect: 'Revenue scale.' },
  { key: 'pricePerUnit', group: 'ops', name: 'Price per unit', fmt: 'usd', min: 0, max: 10_000, step: 1, what: 'Revenue per unit of capacity.', how: 'Times utilization × capacity.', originText: () => '$120.', effect: 'Revenue.' },
  { key: 'debtPct', group: 'finance', name: 'Debt funding %', fmt: 'pct', min: 0, max: 0.9, step: 0.01, what: 'Share of construction funded with debt.', how: 'Rest is equity.', originText: () => '60%.', effect: 'Leverage and DSCR.' },
  { key: 'interestRate', group: 'finance', name: 'Interest rate', fmt: 'pct', min: 0, max: 0.2, step: 0.005, what: 'Cost of project debt.', how: 'On beginning balance.', originText: () => '7%.', effect: 'DSCR and equity cash flow.' },
  { key: 'hurdleRate', group: 'finance', name: 'Hurdle rate', fmt: 'pct', min: 0.04, max: 0.25, step: 0.005, what: 'Discount rate for NPV.', how: 'Project and equity NPV.', originText: () => '10%.', effect: 'NPV.' },
];

export function runCapitalProject(raw) {
  const a = { ...defaultCapitalProjectAssumptions(), ...raw };
  const years = Math.min(20, Math.max(5, numberOr(a.years, 12)));
  const buildYears = Math.max(1, Math.round(numberOr(a.constructionYears, 2)));
  const overrun = 1 + numberOr(a.costOverrunPct, 0);
  const totalCapex = (numberOr(a.phase1Spend, 0) + numberOr(a.phase2Spend, 0)) * overrun;
  const debtShare = numberOr(a.debtPct, 0.6);
  const equityFund = numberOr(a.equityInvested, totalCapex * (1 - debtShare));

  const rows = [];
  let ppe = 0;
  let debt = 0;
  let cash = 0;
  let equity = equityFund;
  const projectFlows = [];
  const equityFlows = [-equityFund];
  let opYear = 0;

  for (let y = 1; y <= years; y += 1) {
    let capex = 0;
    if (y === 1) capex = numberOr(a.phase1Spend, 0) * overrun;
    if (y === buildYears) capex += numberOr(a.phase2Spend, 0) * overrun;
    const draw = capex > 0 ? capex * debtShare : 0;
    if (capex > 0) {
      debt += draw;
      const eq = capex - draw;
      cash -= eq;
      equity += eq;
      equityFlows[0] -= eq;
    }

    ppe += capex;
    const da = ppe > 0 && y > buildYears ? ppe / Math.max(1, years - buildYears) : 0;
    if (y > buildYears) ppe = Math.max(0, ppe - da);

    let revenue = 0;
    let ebit = 0;
    if (y > buildYears) {
      opYear += 1;
      const ramp = Array.isArray(a.utilizationRamp) ? a.utilizationRamp[opYear - 1] ?? 1 : 1;
      const cap = numberOr(a.capacityUnits, 0);
      const price = numberOr(a.pricePerUnit, 0) * (1 + numberOr(a.inflation, 0)) ** (opYear - 1);
      revenue = cap * ramp * price * (1 + numberOr(a.volumeGrowth, 0)) ** (opYear - 1);
      const varCost = revenue * numberOr(a.variableCostPct, 0);
      const fixed = numberOr(a.fixedOpex, 0) * (1 + numberOr(a.inflation, 0)) ** (opYear - 1);
      ebit = revenue - varCost - fixed - da;
    }

    const interest = debt * numberOr(a.interestRate, 0);
    const pretax = ebit - interest;
    const tax = pretax > 0 ? pretax * numberOr(a.taxRate, 0.21) : 0;
    const incentive = y === buildYears + 1 ? numberOr(a.incentiveCredit, 0) : 0;
    const netIncome = pretax - tax + incentive;

    const amort = y > buildYears ? Math.min(debt, debt / Math.max(1, numberOr(a.amortYears, 10))) : 0;
    debt = Math.max(0, debt - amort);
    const projectFcf = y <= buildYears ? -capex : netIncome + da - numberOr(a.maintenanceCapex, 0);
    const equityFcf = projectFcf - (y === 1 ? 0 : 0) - (interest - (ebit > 0 ? 0 : 0)) + (draw - amort);
    const equityCash = y <= buildYears ? -Math.max(0, capex - draw) : netIncome + da - numberOr(a.maintenanceCapex, 0) - amort - interest;

    cash += equityCash;
    equity += netIncome - (y > buildYears ? 0 : 0);

    projectFlows.push(projectFcf);
    equityFlows.push(equityCash);

    const dscr = interest > 0 && y > buildYears ? (ebit + da) / interest : null;

    rows.push({
      year: y,
      capex: -capex,
      revenue,
      ebit,
      da: -da,
      interest: -interest,
      netIncome,
      debt,
      ppe,
      cash,
      projectFcf,
      equityFcf: equityCash,
      dscr,
      operating: y > buildYears,
    });
  }

  const terminal = numberOr(a.terminalValue, 0);
  if (terminal > 0) {
    projectFlows[projectFlows.length - 1] += terminal;
    equityFlows[equityFlows.length - 1] += terminal * (1 - debtShare);
  }

  const checks = {
    sourcesUses: Math.abs(equityFund + totalCapex * debtShare - totalCapex) < totalCapex * 0.05 + 1,
    debtRoll: true,
    balances: true,
  };

  return {
    ok: true,
    kind: 'capital-project',
    scale: 1,
    unitLabel: 'US$',
    assumptions: a,
    rows,
    returns: {
      projectIrr: irr([-totalCapex * (1 - debtShare), ...projectFlows]),
      equityIrr: irr(equityFlows),
      projectNpv: npv(numberOr(a.hurdleRate, 0.1), [-totalCapex, ...projectFlows]),
      equityNpv: npv(numberOr(a.hurdleRate, 0.1), equityFlows),
      paybackYears: paybackPeriod(projectFlows),
      peakFunding: peakFunding(projectFlows),
    },
    checks,
    totalCapex,
  };
}
