/**
 * Declarative dependency paths for assumption tracing. Rendering only — does
 * not alter calculation logic.
 */

export const DEPENDENCIES = {
  revenueGrowth: {
    path: ['Revenue', 'EBIT', 'Unlevered FCF', 'Implied share price'],
    rowKeys: ['revenue', 'ebit', 'netIncome', 'unleveredFcf'],
    tabs: { dcf: ['unleveredFcf', 'enterpriseValue', 'impliedPrice'], sensitivity: ['sensitivityGrid'] },
  },
  grossMargin: {
    path: ['Cost of sales', 'Gross profit', 'Inventory', 'EBIT'],
    rowKeys: ['cogs', 'grossProfit', 'inventory', 'ebit'],
  },
  ebitMargin: {
    path: ['Operating expenses', 'EBIT', 'Unlevered FCF', 'Implied share price'],
    rowKeys: ['opex', 'ebit', 'unleveredFcf'],
    tabs: { dcf: ['unleveredFcf', 'impliedPrice'] },
  },
  taxRate: {
    path: ['Taxes', 'Net income', 'Cash from operations', 'Unlevered FCF'],
    rowKeys: ['taxes', 'netIncome', 'cfo', 'unleveredFcf'],
    tabs: { dcf: ['unleveredFcf'] },
  },
  capexPct: {
    path: ['Capital expenditure', 'Other assets', 'Ending cash'],
    rowKeys: ['capex', 'otherAssets', 'cash'],
  },
  daPct: {
    path: ['Depreciation add-back', 'Net income', 'Cash from operations'],
    rowKeys: ['da', 'netIncome', 'cfo'],
  },
  dsoDays: {
    path: ['Receivables', 'Cash from operations', 'Ending cash'],
    rowKeys: ['receivables', 'cfo', 'cash'],
  },
  dioDays: {
    path: ['Inventory', 'Cash from operations', 'Ending cash'],
    rowKeys: ['inventory', 'cfo', 'cash'],
  },
  interestRate: {
    path: ['Interest expense', 'Net income', 'WACC', 'Implied share price'],
    rowKeys: ['interestExpense', 'netIncome'],
    tabs: { dcf: ['wacc', 'impliedPrice'] },
  },
  cashYield: {
    path: ['Interest income', 'Net income', 'Ending cash'],
    rowKeys: ['interestIncome', 'netIncome', 'cash'],
  },
  debtRepaymentPct: {
    path: ['Debt repayment', 'Debt balance', 'Interest expense'],
    rowKeys: ['debtRepayment', 'debt', 'interestExpense'],
  },
  payoutRatio: {
    path: ['Dividends', 'Equity', 'Ending cash'],
    rowKeys: ['dividends', 'equity', 'cash'],
  },
  beta: {
    path: ['Cost of equity', 'WACC', 'Implied share price'],
    rowKeys: [],
    tabs: { dcf: ['wacc', 'impliedPrice'], sensitivity: ['sensitivityGrid'] },
  },
  riskFreeRate: {
    path: ['Cost of equity', 'WACC', 'Implied share price'],
    rowKeys: [],
    tabs: { dcf: ['wacc', 'impliedPrice'], sensitivity: ['sensitivityGrid'] },
  },
  equityRiskPremium: {
    path: ['Cost of equity', 'WACC', 'Implied share price'],
    rowKeys: [],
    tabs: { dcf: ['wacc', 'impliedPrice'] },
  },
  terminalGrowth: {
    path: ['Terminal value', 'Enterprise value', 'Implied share price'],
    rowKeys: [],
    tabs: { dcf: ['terminalValue', 'enterpriseValue', 'impliedPrice'], sensitivity: ['sensitivityGrid'] },
  },
};

/** Single-unit / portfolio unit economics (unit-portfolio dials). */
export const UNIT_DEPENDENCIES = {
  capacity: {
    path: ['Transactions', 'Revenue', 'EBIT', 'Unit NPV'],
    rowKeys: ['units', 'transactions', 'revenue', 'ebit', 'ebitda'],
    tabs: { sensitivity: ['sensitivityGrid'] },
  },
  utilization: {
    path: ['Transactions', 'Revenue', 'Contribution', 'EBITDA'],
    rowKeys: ['units', 'transactions', 'revenue', 'contribution', 'ebitda', 'ebit'],
    tabs: { sensitivity: ['sensitivityGrid'] },
  },
  corePrice: {
    path: ['Revenue', 'Labor', 'EBIT', 'Unit NPV'],
    rowKeys: ['revenue', 'labor', 'ebit', 'netIncome'],
    tabs: { sensitivity: ['sensitivityGrid'] },
  },
  discountRate: {
    path: ['Revenue', 'Gross profit', 'Net income'],
    rowKeys: ['revenue', 'grossProfit', 'netIncome'],
  },
  volumeGrowth: {
    path: ['Transactions', 'Revenue', 'EBIT'],
    rowKeys: ['units', 'transactions', 'revenue', 'ebit'],
  },
  variableCostPerTxn: {
    path: ['Cost of sales', 'Gross profit', 'EBIT'],
    rowKeys: ['cogs', 'grossProfit', 'contribution', 'ebit'],
  },
  laborVariablePct: {
    path: ['Labor', 'EBIT', 'Net income'],
    rowKeys: ['labor', 'opex', 'ebit', 'netIncome'],
  },
  rent: {
    path: ['Other operating costs', 'EBIT', 'Net income'],
    rowKeys: ['otherOpex', 'opex', 'ebit', 'netIncome'],
  },
  openingCosts: {
    path: ['CapEx', 'Depreciation', 'Equipment (net)', 'Unit IRR'],
    rowKeys: ['capex', 'da', 'otherAssets', 'ppe'],
  },
  taxRate: {
    path: ['Taxes', 'Net income', 'Cash from operations'],
    rowKeys: ['taxes', 'netIncome', 'cfo'],
  },
  usefulLife: {
    path: ['Depreciation', 'EBIT', 'Net income'],
    rowKeys: ['da', 'ebit', 'netIncome', 'cfo'],
  },
  openingCash: { path: ['Cash (the plug)', 'Interest income'], rowKeys: ['cash', 'interestIncome'] },
  openingDebt: { path: ['Debt', 'Interest expense'], rowKeys: ['debt', 'interestExpense'] },
  dsoDays: { path: ['Receivables', 'Cash from operations'], rowKeys: ['receivables', 'cfo'] },
  dioDays: { path: ['Inventory', 'Cash from operations'], rowKeys: ['inventory', 'cfo'] },
  dpoDays: { path: ['Payables', 'Cash from operations'], rowKeys: ['otherLiabilities', 'cfo'] },
  interestRate: { path: ['Interest expense', 'Net income'], rowKeys: ['interestExpense', 'netIncome'] },
  cashYield: { path: ['Interest income', 'Net income'], rowKeys: ['interestIncome', 'netIncome'] },
  debtRepaymentPct: { path: ['Debt repayment', 'Debt'], rowKeys: ['debtRepayment', 'debt'] },
  payoutRatio: { path: ['Dividends', 'Equity'], rowKeys: ['dividends', 'equity'] },
  hurdleRate: {
    path: ['Unit NPV', 'Portfolio NPV'],
    rowKeys: [],
    tabs: { three: ['unitNpv', 'portfolioNpv'] },
  },
  rampMonths: {
    path: ['Transactions', 'Revenue'],
    rowKeys: ['units', 'transactions', 'revenue'],
  },
  laborFixed: { path: ['Labor', 'EBIT'], rowKeys: ['labor', 'opex', 'ebit'] },
  localMarketing: { path: ['Other operating costs', 'EBIT'], rowKeys: ['otherOpex', 'opex', 'ebit'] },
  centralMarketing: { path: ['Other operating costs', 'EBIT'], rowKeys: ['otherOpex', 'opex', 'ebit'] },
  allocatedOverhead: { path: ['Other operating costs', 'EBIT'], rowKeys: ['otherOpex', 'opex', 'ebit'] },
  maintenanceCapex: { path: ['Capital expenditure', 'Cash from investing'], rowKeys: ['capex', 'cfi'] },
  membershipRevenue: { path: ['Revenue', 'EBIT'], rowKeys: ['revenue', 'ebit'] },
  advertisingRevenue: { path: ['Revenue', 'EBIT'], rowKeys: ['revenue', 'ebit'] },
};

/** Capital project dials. */
export const CAPITAL_DEPENDENCIES = {
  constructionYears: { path: ['CapEx timing', 'Operating start'], rowKeys: ['capex', 'revenue', 'ebit'] },
  costOverrunPct: { path: ['CapEx', 'Peak funding'], rowKeys: ['capex', 'projectFcf'] },
  phase1Spend: { path: ['Year-1 CapEx', 'Peak funding'], rowKeys: ['capex', 'projectFcf'] },
  phase2Spend: { path: ['Construction CapEx', 'Peak funding'], rowKeys: ['capex', 'projectFcf'] },
  pricePerUnit: { path: ['Revenue', 'EBIT', 'Project FCF'], rowKeys: ['revenue', 'ebit', 'projectFcf'] },
  debtPct: { path: ['Debt balance', 'Equity IRR'], rowKeys: ['debt', 'equityFcf'] },
  interestRate: { path: ['Interest', 'DSCR', 'Equity cash flow'], rowKeys: ['interest', 'dscr', 'equityFcf'] },
  hurdleRate: { path: ['Project NPV', 'Equity NPV'], rowKeys: ['projectNpv', 'equityNpv'] },
  capacityUnits: { path: ['Revenue', 'EBIT'], rowKeys: ['revenue', 'ebit'] },
  variableCostPct: { path: ['EBIT', 'Project FCF'], rowKeys: ['ebit', 'projectFcf'] },
  fixedOpex: { path: ['EBIT', 'Project FCF'], rowKeys: ['ebit', 'projectFcf'] },
  maintenanceCapex: { path: ['Project FCF'], rowKeys: ['projectFcf'] },
  equityInvested: { path: ['Equity IRR', 'Peak funding'], rowKeys: ['equityNpv', 'equityIrr'] },
  terminalValue: { path: ['Project NPV'], rowKeys: ['projectNpv'] },
  taxRate: { path: ['Net income', 'Project FCF'], rowKeys: ['netIncome', 'projectFcf'] },
};

/** Strategic investment dials. */
export const STRATEGIC_DEPENDENCIES = {
  hurdleRate: {
    path: ['Alternative NPV', 'Expected NPV'],
    rowKeys: ['altNpv', 'incrementalNpv', 'expectedNpv'],
  },
  probabilityBuild: { path: ['Expected NPV'], rowKeys: ['expectedNpv'] },
  probabilityBuy: { path: ['Expected NPV'], rowKeys: ['expectedNpv'] },
  probabilityPartner: { path: ['Expected NPV'], rowKeys: ['expectedNpv'] },
  probabilityLicense: { path: ['Expected NPV'], rowKeys: ['expectedNpv'] },
  probabilityLease: { path: ['Expected NPV'], rowKeys: ['expectedNpv'] },
  probabilityDelay: { path: ['Expected NPV'], rowKeys: ['expectedNpv'] },
  probabilityNothing: { path: ['Expected NPV'], rowKeys: ['expectedNpv'] },
  buildCapex: { path: ['Build NPV'], rowKeys: ['altNpv_build', 'incrementalNpv_build'] },
  buildOpex: { path: ['Build NPV'], rowKeys: ['altNpv_build'] },
  buildRevenue: { path: ['Build NPV'], rowKeys: ['altNpv_build'] },
  buildGrowth: { path: ['Build NPV'], rowKeys: ['altNpv_build'] },
  buyCapex: { path: ['Buy NPV'], rowKeys: ['altNpv_buy'] },
  partnerCapex: { path: ['Partner NPV'], rowKeys: ['altNpv_partner'] },
};

/** Market entry dials. */
export const MARKET_DEPENDENCIES = {
  hurdleRate: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
  addressableMarket: { path: ['Revenue', 'Structure NPV'], rowKeys: ['structureNpv'] },
  marketGrowth: { path: ['Revenue', 'Structure NPV'], rowKeys: ['structureNpv'] },
  pricePremium: { path: ['Revenue', 'Structure NPV'], rowKeys: ['structureNpv'] },
  laborCost: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
  rentCost: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
  logisticsCost: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
  taxRate: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
  fxRate: { path: ['USD cash flows', 'Structure NPV'], rowKeys: ['structureNpv'] },
  localizationCost: { path: ['Upfront cost', 'Structure NPV'], rowKeys: ['structureNpv'] },
  partnerShare: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
  countryRiskPremium: { path: ['Discount rate', 'Structure NPV'], rowKeys: ['structureNpv'] },
  withholdingPct: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
  tariffPct: { path: ['Structure NPV'], rowKeys: ['structureNpv'] },
};

const EXERCISE_MAP = {
  filer: DEPENDENCIES,
  unit: UNIT_DEPENDENCIES,
  capital: CAPITAL_DEPENDENCIES,
  strategic: STRATEGIC_DEPENDENCIES,
  market: MARKET_DEPENDENCIES,
};

export function dependencyMapForExercise(exercise) {
  return EXERCISE_MAP[exercise] || DEPENDENCIES;
}

export function dependencyPath(key, exercise = 'filer') {
  return dependencyMapForExercise(exercise)[key]?.path ?? DEPENDENCIES[key]?.path ?? [];
}

export function dependencyRowKeys(key, exercise = 'filer', tab = 'three') {
  const entry = dependencyMapForExercise(exercise)[key] ?? DEPENDENCIES[key];
  if (!entry) return [];
  const base = entry.rowKeys ?? [];
  const tabKeys = entry.tabs?.[tab] ?? [];
  return [...new Set([...base, ...tabKeys])];
}
