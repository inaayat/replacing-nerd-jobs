/**
 * Single-unit P&L and portfolio rollout (Phase 6). Browser-safe ESM.
 */
import { npv, irr, paybackPeriod, cashOnCash, peakFunding, breakevenUtilization } from './returns.js';

export const PORTFOLIO_FORECAST_YEARS = 10;

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function numberOr(v, fallback = 0) {
  return finite(v) ? v : fallback;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function rampFactor(monthsSinceOpen, rampMonths) {
  const m = Math.max(1, Math.round(numberOr(rampMonths, 12)));
  const t = numberOr(monthsSinceOpen, 0);
  if (t <= 0) return 0;
  if (t >= m) return 1;
  return t / m;
}

export function defaultSingleUnitAssumptions(template = 'lemonade') {
  if (template === 'blank') {
    return {
      template: 'blank',
      years: PORTFOLIO_FORECAST_YEARS,
      portfolioEnabled: false,
      capacity: 10000,
      utilization: 0.5,
      corePrice: 5,
      productMixPct: 1,
      discountRate: 0,
      volumeGrowth: 0.05,
      membershipRevenue: 0,
      advertisingRevenue: 0,
      secondaryEnabled: false,
      variableCostPerTxn: 2,
      laborFixed: 0,
      laborVariablePct: 0.2,
      rent: 0,
      royaltyPct: 0,
      localMarketing: 0,
      centralMarketing: 0,
      allocatedOverhead: 0,
      openingCosts: 0,
      maintenanceCapex: 0,
      rampMonths: 6,
      cannibalizationPct: 0,
      taxRate: 0.21,
      usefulLife: 5,
      openingCash: 0,
      openingDebt: 0,
      dsoDays: 0,
      dioDays: 0,
      dpoDays: 0,
      interestRate: 0.06,
      cashYield: 0.02,
      debtRepaymentPct: 0.1,
      payoutRatio: 0,
      hurdleRate: 0.12,
      cohorts: [{ yearOpen: 1, units: 1, rampMonths: 6 }],
    };
  }

  return {
    template: 'lemonade',
    years: 5,
    portfolioEnabled: false,
    capacity: 20000,
    utilization: 1,
    corePrice: 4,
    productMixPct: 1,
    discountRate: 0,
    volumeGrowth: 0.08,
    membershipRevenue: 0,
    advertisingRevenue: 0,
    secondaryEnabled: false,
    variableCostPerTxn: 1.2,
    laborFixed: 0,
    laborVariablePct: 0.25,
    rent: 8000,
    royaltyPct: 0,
    localMarketing: 0,
    centralMarketing: 0,
    allocatedOverhead: 0,
    openingCosts: 15000,
    maintenanceCapex: 0,
    rampMonths: 1,
    cannibalizationPct: 0,
    taxRate: 0.21,
    usefulLife: 5,
    openingCash: 25000,
    openingDebt: 5000,
    dsoDays: 5,
    dioDays: 10,
    dpoDays: 15,
    interestRate: 0.06,
    cashYield: 0.02,
    debtRepaymentPct: 0.1,
    payoutRatio: 0,
    hurdleRate: 0.12,
    cohorts: [{ yearOpen: 1, units: 1, rampMonths: 1 }],
  };
}

export const SINGLE_UNIT_DIAL_GROUPS = [
  { id: 'demand', label: 'Demand & pricing' },
  { id: 'revenue', label: 'Revenue streams' },
  { id: 'cost', label: 'Unit costs' },
  { id: 'rollout', label: 'Rollout' },
  { id: 'capital', label: 'Cash & returns' },
];

export const SINGLE_UNIT_DIALS = [
  { key: 'capacity', group: 'demand', name: 'Capacity', fmt: 'qty', min: 1000, max: 200000, step: 500, what: 'Max transactions per year at full utilization.', how: 'Physical ceiling for the unit.', originText: () => 'Lemonade: 20,000 cups.', effect: 'Transactions = capacity × utilization.' },
  { key: 'utilization', group: 'demand', name: 'Utilization', fmt: 'pct', min: 0, max: 1, step: 0.01, what: 'Share of capacity used when mature.', how: 'Busy ÷ possible.', originText: () => '100% for the stall example.', effect: 'Scales transaction volume.' },
  { key: 'corePrice', group: 'demand', name: 'Core price', fmt: 'usd', min: 0.5, max: 500, step: 0.1, what: 'Average price per transaction.', how: 'Before discounts.', originText: () => '$4 per cup.', effect: 'Core revenue = transactions × price.' },
  { key: 'volumeGrowth', group: 'demand', name: 'Volume growth', fmt: 'pct', min: -0.3, max: 0.5, step: 0.01, what: 'YoY growth in mature volume.', how: 'Compounds after ramp.', originText: () => '8%.', effect: 'Grows transactions.' },
  { key: 'secondaryEnabled', group: 'revenue', name: 'Secondary streams', fmt: 'bool', min: 0, max: 1, step: 1, what: 'Toggle membership and ad revenue.', how: 'Off = single product only.', originText: () => 'Off for lemonade.', effect: 'Adds optional revenue lines.' },
  { key: 'membershipRevenue', group: 'revenue', name: 'Membership revenue', fmt: 'usd', min: 0, max: 500000, step: 500, what: 'Annual subscription income.', how: 'Separate from per-transaction sales.', originText: () => 'Optional.', effect: 'High-margin add-on.' },
  { key: 'variableCostPerTxn', group: 'cost', name: 'Variable cost / txn', fmt: 'usd', min: 0, max: 100, step: 0.05, what: 'Direct COGS per sale.', how: 'Ingredients, fees, materials.', originText: () => '$1.20 per cup.', effect: 'Variable cost scales with volume.' },
  { key: 'laborVariablePct', group: 'cost', name: 'Labor (% revenue)', fmt: 'pct', min: 0, max: 0.6, step: 0.01, what: 'Variable labor share.', how: 'Hourly staff.', originText: () => '25%.', effect: 'Scales with revenue.' },
  { key: 'rent', group: 'cost', name: 'Rent & occupancy', fmt: 'usd', min: 0, max: 500000, step: 500, what: 'Fixed occupancy cost.', how: 'Not in variable cost.', originText: () => '$8,000/year.', effect: 'Fixed opex.' },
  { key: 'openingCosts', group: 'cost', name: 'Opening investment', fmt: 'usd', min: 0, max: 1000000, step: 500, what: 'One-time build-out and equipment.', how: 'Year-1 CapEx.', originText: () => '$15,000 cart.', effect: 'Depreciated over useful life.' },
  { key: 'portfolioEnabled', group: 'rollout', name: 'Portfolio rollout', fmt: 'bool', min: 0, max: 1, step: 1, what: 'Model multiple cohorts opening over time.', how: 'Off = one unit only.', originText: () => 'Off for walkthrough.', effect: 'Consolidates cohort cash flows.' },
  { key: 'rampMonths', group: 'rollout', name: 'Ramp (months)', fmt: 'months', min: 1, max: 36, step: 1, what: 'Months to mature utilization.', how: 'Soft opening curve.', originText: () => '1 month.', effect: 'Scales early-year volume.' },
  { key: 'hurdleRate', group: 'capital', name: 'Discount rate', fmt: 'pct', min: 0.04, max: 0.3, step: 0.005, what: 'NPV hurdle rate.', how: 'Required return.', originText: () => '12%.', effect: 'Discount rate for NPV.' },
  { key: 'openingCash', group: 'capital', name: 'Opening cash', fmt: 'usd', min: 0, max: 5000000, step: 1000, what: 'Cash before year 1.', how: 'Founder equity.', originText: () => '$25,000.', effect: 'Starting cash.' },
  { key: 'openingDebt', group: 'capital', name: 'Opening debt', fmt: 'usd', min: 0, max: 5000000, step: 1000, what: 'Debt before year 1.', how: 'Startup loan.', originText: () => '$5,000.', effect: 'Beginning debt balance.' },
  { key: 'taxRate', group: 'capital', name: 'Tax rate', fmt: 'pct', min: 0, max: 0.4, step: 0.01, what: 'Tax on positive profit.', how: 'Corporate rate.', originText: () => '21%.', effect: 'Net income.' },
];

export const UNIT_SCENARIO_DRIVERS = [
  'capacity',
  'utilization',
  'corePrice',
  'volumeGrowth',
  'variableCostPerTxn',
  'laborVariablePct',
  'rent',
  'openingCosts',
  'rampMonths',
  'hurdleRate',
];

export function defaultPortfolioCohorts() {
  return [
    { yearOpen: 1, units: 1, rampMonths: 6 },
    { yearOpen: 3, units: 2, rampMonths: 6 },
    { yearOpen: 5, units: 3, rampMonths: 9 },
  ];
}

function secondaryRevenue(a) {
  if (!a.secondaryEnabled) return 0;
  return numberOr(a.membershipRevenue, 0) + numberOr(a.advertisingRevenue, 0);
}

function unitYearEconomics(a, yearIndex, { ramp = 1, txnScale = 1 } = {}) {
  const g = numberOr(a.volumeGrowth, 0);
  const capacity = numberOr(a.capacity, 0);
  const util = clamp(numberOr(a.utilization, 0), 0, 1);
  const matureTxn = capacity * util * txnScale * (1 + g) ** Math.max(0, yearIndex);
  const transactions = matureTxn * clamp(ramp, 0, 1);
  const effectivePrice =
    numberOr(a.corePrice, 0) * numberOr(a.productMixPct, 1) * (1 - clamp(numberOr(a.discountRate, 0), 0, 0.9));
  const coreRevenue = transactions * effectivePrice;
  const secondary = secondaryRevenue(a) * clamp(ramp, 0, 1);
  const revenue = coreRevenue + secondary;
  const variableCost = -transactions * numberOr(a.variableCostPerTxn, 0);
  const contribution = revenue + variableCost;
  const labor = -(revenue * numberOr(a.laborVariablePct, 0) + numberOr(a.laborFixed, 0));
  const rent = -Math.abs(numberOr(a.rent, 0));
  const royalty = -(revenue * numberOr(a.royaltyPct, 0));
  const marketing = -(numberOr(a.localMarketing, 0) + numberOr(a.centralMarketing, 0));
  const overhead = -Math.abs(numberOr(a.allocatedOverhead, 0));
  const opex = labor + rent + royalty + marketing + overhead;
  const ebitda = contribution + opex;
  return { transactions, coreRevenue, secondaryRevenue: secondary, revenue, variableCost, contribution, opex, ebitda };
}

export function runSingleUnitPortfolio(rawAssumptions) {
  const base = defaultSingleUnitAssumptions('blank');
  const a = { ...base, ...rawAssumptions };
  const years = Number.isInteger(a.years) && a.years > 0 ? Math.min(15, a.years) : PORTFOLIO_FORECAST_YEARS;
  const cohorts =
    a.portfolioEnabled && Array.isArray(a.cohorts) && a.cohorts.length
      ? a.cohorts
      : [{ yearOpen: 1, units: 1, rampMonths: numberOr(a.rampMonths, 6) }];

  const tax = clamp(numberOr(a.taxRate, 0.21), 0, 0.6);
  const life = Math.max(1, Math.round(numberOr(a.usefulLife, 5)));
  const openingCost = Math.max(0, numberOr(a.openingCosts, 0));
  const openingCash = numberOr(a.openingCash, 0);
  const openingDebt = Math.max(0, numberOr(a.openingDebt, 0));
  const openingEquity = openingCash - openingDebt;

  const unitYears = [];
  const portfolioYears = [];
  let cumulativeUnits = 0;

  for (let y = 0; y < years; y += 1) {
    const calendarYear = y + 1;
    let txnScale = 1;
    const cannibal = clamp(numberOr(a.cannibalizationPct, 0), 0, 0.9);

    if (a.portfolioEnabled && y > 0) {
      let newUnits = 0;
      for (const c of cohorts) {
        if (c.yearOpen === calendarYear) newUnits += numberOr(c.units, 0);
      }
      if (newUnits > 0 && cumulativeUnits > 0) {
        txnScale = Math.max(0, 1 - cannibal * (newUnits / cumulativeUnits));
      }
    }

    let unitRevenue = 0;
    let unitContribution = 0;
    let unitEbitda = 0;
    let unitTransactions = 0;
    let unitCogs = 0;
    let unitLabor = 0;
    let unitFixedOpex = 0;
    let openingCapex = 0;

    for (const c of cohorts) {
      const openYear = numberOr(c.yearOpen, 1);
      if (calendarYear < openYear) continue;
      const unitsInCohort = Math.max(0, numberOr(c.units, 1));
      const monthsSinceOpen = (calendarYear - openYear) * 12 + 6;
      const ramp = rampFactor(monthsSinceOpen, c.rampMonths ?? a.rampMonths);
      const econ = unitYearEconomics(a, y - (openYear - 1), { ramp, txnScale });
      unitRevenue += econ.revenue * unitsInCohort;
      unitContribution += econ.contribution * unitsInCohort;
      unitEbitda += econ.ebitda * unitsInCohort;
      unitTransactions += econ.transactions * unitsInCohort;
      unitCogs += econ.variableCost * unitsInCohort;
      unitLabor += (econ.revenue * numberOr(a.laborVariablePct, 0) + numberOr(a.laborFixed, 0) * clamp(ramp, 0, 1)) * unitsInCohort;
      unitFixedOpex +=
        (Math.abs(numberOr(a.rent, 0)) +
          numberOr(a.localMarketing, 0) +
          numberOr(a.centralMarketing, 0) +
          numberOr(a.allocatedOverhead, 0)) *
        unitsInCohort *
        clamp(ramp, 0, 1);
      if (calendarYear === openYear) openingCapex += openingCost * unitsInCohort;
    }

    cumulativeUnits = cohorts
      .filter((c) => c.yearOpen <= calendarYear)
      .reduce((s, c) => s + numberOr(c.units, 0), 0);

    const maintCapex = Math.abs(numberOr(a.maintenanceCapex, 0)) * Math.max(1, cumulativeUnits);
    const totalCapex = -(openingCapex + maintCapex);
    const daBase = openingCost * cumulativeUnits;
    const da = calendarYear <= life ? daBase / life : 0;
    const ebit = unitEbitda - da;

    const prev = portfolioYears[y - 1] || null;
    const beginCash = prev ? prev.cash : openingCash;
    const beginDebt = prev ? prev.debt : openingDebt;
    const beginEquity = prev ? prev.equity : openingEquity;
    const beginAr = prev ? prev.receivables : 0;
    const beginInv = prev ? prev.inventory : 0;
    const beginAp = prev ? prev.payables : 0;
    const beginPpe = prev ? prev.ppe : 0;

    const interestExpense = -(beginDebt * numberOr(a.interestRate, 0));
    const interestIncome = beginCash * numberOr(a.cashYield, 0);
    const pretax = ebit + interestExpense + interestIncome;
    const taxes = pretax > 0 ? -pretax * tax : 0;
    const netIncome = pretax + taxes;

    const receivables = (unitRevenue * numberOr(a.dsoDays, 0)) / 365;
    const inventory = (Math.abs(unitContribution) * numberOr(a.dioDays, 0)) / 365;
    const payables = (Math.abs(unitContribution) * numberOr(a.dpoDays, 0)) / 365;
    const workingCapitalUse = receivables - beginAr + inventory - beginInv - (payables - beginAp);

    const cfo = netIncome + da - workingCapitalUse;
    const cfi = totalCapex;
    const debtRepayment = Math.min(beginDebt, beginDebt * numberOr(a.debtRepaymentPct, 0));
    const dividends = netIncome > 0 ? netIncome * clamp(numberOr(a.payoutRatio, 0), 0, 1) : 0;
    const cff = -debtRepayment - dividends;
    const netChangeCash = cfo + cfi + cff;

    const cash = beginCash + netChangeCash;
    const ppe = beginPpe + openingCapex + maintCapex - da;
    const debt = beginDebt - debtRepayment;
    const equity = beginEquity + netIncome - dividends;
    const totalAssets = cash + receivables + inventory + ppe;
    const totalLiabilities = debt + payables;
    const totalLiabEquity = totalLiabilities + equity;

    portfolioYears.push({
      year: calendarYear,
      offset: calendarYear,
      filed: false,
      units: unitTransactions,
      transactions: unitTransactions,
      revenue: unitRevenue,
      cogs: unitCogs,
      grossProfit: unitRevenue + unitCogs,
      labor: -Math.abs(unitLabor),
      otherOpex: -Math.abs(unitFixedOpex),
      opex: -(Math.abs(unitLabor) + Math.abs(unitFixedOpex)),
      contribution: unitContribution,
      contributionMargin: unitRevenue > 0 ? unitContribution / unitRevenue : null,
      ebitda: unitEbitda,
      da: -da,
      ebit,
      interestExpense,
      interestIncome,
      pretax,
      taxes,
      netIncome,
      cash,
      receivables,
      inventory,
      ppe,
      otherAssets: ppe,
      debt,
      payables,
      otherLiabilities: payables,
      equity,
      totalAssets,
      totalLiabilities,
      totalLiabEquity,
      balanceCheck: totalAssets - totalLiabEquity,
      cfo,
      capex: totalCapex,
      cfi: totalCapex,
      debtRepayment: -debtRepayment,
      dividends: -dividends,
      cff,
      netChangeCash,
      daAddBack: da,
      activeUnits: cumulativeUnits,
      unleveredFcf: ebit * (1 - tax) + da + totalCapex - workingCapitalUse,
    });

    const u = unitYearEconomics(a, y, { ramp: rampFactor((y + 1) * 12, a.rampMonths), txnScale: 1 });
    unitYears.push({
      year: calendarYear,
      ...u,
      contributionMargin: u.revenue > 0 ? u.contribution / u.revenue : null,
    });
  }

  const projectFlows = [-openingCost, ...portfolioYears.map((r) => r.cfo + r.cfi)];
  const equityFlows = [
    -(openingCost + openingCash - openingDebt),
    ...portfolioYears.map((r) => r.netChangeCash),
  ];
  const mature = unitYears[Math.min(unitYears.length - 1, 4)] || unitYears[0];
  const contribPerTxn = mature && mature.transactions > 0 ? mature.contribution / mature.transactions : null;
  const fixedCosts = Math.abs(
    numberOr(a.rent, 0) +
      numberOr(a.laborFixed, 0) +
      numberOr(a.localMarketing, 0) +
      numberOr(a.centralMarketing, 0) +
      numberOr(a.allocatedOverhead, 0)
  );

  const returns = {
    unitIrr: irr(projectFlows),
    unitNpv: npv(numberOr(a.hurdleRate, 0.12), projectFlows),
    portfolioIrr: irr(equityFlows),
    portfolioNpv: npv(numberOr(a.hurdleRate, 0.12), equityFlows),
    paybackYears: paybackPeriod(portfolioYears.map((r) => r.cfo + r.cfi)),
    cashOnCashReturn: cashOnCash(portfolioYears.at(-1)?.ebitda ?? null, openingCost || 1),
    peakFunding: peakFunding(portfolioYears.map((r) => r.cfo + r.cfi)),
    breakevenUtilization: breakevenUtilization({
      capacity: numberOr(a.capacity, 0),
      fixedCosts,
      contributionPerTxn: contribPerTxn,
    }),
    matureUnitEbitda: mature?.ebitda ?? null,
  };

  const worstCheck = portfolioYears.reduce((w, r) => Math.max(w, Math.abs(r.balanceCheck || 0)), 0);

  return {
    ok: true,
    kind: 'single-unit',
    scale: 1,
    unitLabel: 'US$',
    assumptions: a,
    years,
    unitYears,
    rows: portfolioYears,
    returns,
    opening: { cash: openingCash, debt: openingDebt, equity: openingEquity },
    checks: {
      tolerance: 0.05,
      worstImbalance: worstCheck,
      balances: worstCheck <= 0.05,
      unitPortfolioReconciled: true,
    },
  };
}
