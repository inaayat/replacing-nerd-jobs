/**
 * Guided build sequences for each model tab. Browser-safe ESM.
 */

export const THREE_STATEMENT_STEPS = [
  {
    id: 'revenue',
    title: 'Forecast revenue',
    instruction: 'Decide how fast sales grow each year. Start from last year’s filing pace unless you expect something different.',
    formula: 'Revenue = prior revenue × (1 + sales growth)',
    assumptionKeys: ['revenueGrowth'],
    rowKeys: ['revenue'],
    previewKey: 'revenue',
  },
  {
    id: 'margins',
    title: 'Operating margins',
    instruction: 'Set gross and operating margins. These turn sales into profit before interest and tax.',
    formula: 'EBIT = revenue × operating margin',
    assumptionKeys: ['grossMargin', 'ebitMargin', 'taxRate'],
    rowKeys: ['cogs', 'grossProfit', 'opex', 'ebit', 'taxes', 'netIncome'],
    previewKey: 'ebit',
  },
  {
    id: 'working-capital',
    title: 'Working capital',
    instruction: 'Size receivables and inventory from days assumptions. Longer days tie up cash without changing profit.',
    formula: 'Receivables = revenue × DSO ÷ 365',
    assumptionKeys: ['dsoDays', 'dioDays'],
    rowKeys: ['receivables', 'inventory', 'cfo'],
    previewKey: 'receivables',
  },
  {
    id: 'capex-da',
    title: 'CapEx and depreciation',
    instruction: 'Capital spending is cash out; depreciation is the non-cash mirror. D&A starts equal to CapEx when the filing has no tag.',
    formula: 'CapEx = revenue × CapEx %; D&A = revenue × D&A %',
    assumptionKeys: ['capexPct', 'daPct'],
    rowKeys: ['capex', 'da', 'otherAssets'],
    previewKey: 'capex',
  },
  {
    id: 'financing',
    title: 'Financing',
    instruction: 'Interest uses beginning balances — no circular references. Debt paydown and dividends use cash.',
    formula: 'Interest expense = beginning debt × rate',
    assumptionKeys: ['interestRate', 'debtRepaymentPct', 'payoutRatio'],
    rowKeys: ['interestExpense', 'interestIncome', 'debtRepayment', 'dividends', 'debt'],
    previewKey: 'interestExpense',
  },
  {
    id: 'cash-roll',
    title: 'Cash and equity roll-forwards',
    instruction: 'Net income feeds equity; cash flow changes feed the cash plug. Gold, green, and blue handoffs link the statements.',
    formula: 'Cash = prior cash + net change in cash (the plug)',
    assumptionKeys: [],
    rowKeys: ['netIncome', 'netChangeCash', 'cash', 'equity'],
    previewKey: 'cash',
  },
  {
    id: 'balance-check',
    title: 'Balance check',
    instruction: 'Assets must equal liabilities plus equity in every period. If the check is not zero, do not trust the model.',
    formula: 'Check = total assets − total liabilities & equity',
    assumptionKeys: [],
    rowKeys: ['balanceCheck'],
    previewKey: 'balanceCheck',
  },
];

export const DCF_STEPS = [
  {
    id: 'fcf',
    title: 'Forecast unlevered free cash flow',
    instruction: 'Pull unlevered FCF from the three-statement forecast — EBIT after tax plus D&A minus CapEx and working capital.',
    formula: 'Unlevered FCF = EBIT × (1 − tax) + D&A − CapEx − Δ working capital',
    assumptionKeys: ['ebitMargin', 'taxRate', 'capexPct', 'daPct'],
    rowKeys: ['unleveredFcf'],
    previewKey: 'unleveredFcf',
  },
  {
    id: 'wacc',
    title: 'Cost of equity and WACC',
    instruction: 'CAPM builds cost of equity; WACC blends equity and debt costs by their weights.',
    formula: 'Cost of equity = risk-free + beta × ERP; WACC = weighted average',
    assumptionKeys: ['riskFreeRate', 'equityRiskPremium', 'beta', 'interestRate'],
    rowKeys: [],
    previewKey: 'wacc',
  },
  {
    id: 'terminal',
    title: 'Terminal value',
    instruction: 'Gordon growth values cash flows after year five. Terminal growth must stay below WACC.',
    formula: 'Terminal value = FCF × (1 + g) ÷ (WACC − g)',
    assumptionKeys: ['terminalGrowth'],
    rowKeys: [],
    previewKey: 'terminalValue',
  },
  {
    id: 'discount',
    title: 'Discount forecast and terminal cash flow',
    instruction: 'Discount each year’s FCF and the terminal lump sum back to today at WACC.',
    formula: 'PV = FCF ÷ (1 + WACC)^year',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'enterpriseValue',
  },
  {
    id: 'bridge',
    title: 'Enterprise value to implied share price',
    instruction: 'Subtract debt, add cash, divide by shares outstanding.',
    formula: 'Equity value = EV − debt + cash; price = equity ÷ shares',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'impliedPrice',
  },
];

export const COMPS_STEPS = [
  {
    id: 'peers',
    title: 'Choose appropriate peers',
    instruction: 'Pick companies that do similar work. Comps are only as honest as this list.',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'peerCount',
  },
  {
    id: 'missing',
    title: 'Inspect missing data',
    instruction: 'Missing multiples stay out of the median — never counted as zero.',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'missingMultiples',
  },
  {
    id: 'multiples',
    title: 'Review relevant multiples',
    instruction: 'EV/Revenue, EV/EBITDA, and P/E show what the market pays today.',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'evRevenue',
  },
  {
    id: 'stats',
    title: 'Calculate mean and median',
    instruction: 'The middle peer multiple is the usual anchor — outliers are visible in the table.',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'medianMultiple',
  },
  {
    id: 'apply',
    title: 'Apply selected multiples',
    instruction: 'Multiply this company’s metric by the peer median to get an implied enterprise or equity value.',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'impliedCompsPrice',
  },
  {
    id: 'compare-dcf',
    title: 'Compare implied values with DCF',
    instruction: 'Comps answer “what would a buyer pay today”; DCF answers “what is it worth forever”. Both can be right and still differ.',
    assumptionKeys: [],
    rowKeys: [],
    previewKey: 'dcfVsComps',
  },
];

export function stepsForTab(tabId) {
  if (tabId === 'three') return THREE_STATEMENT_STEPS;
  if (tabId === 'dcf') return DCF_STEPS;
  if (tabId === 'comps') return COMPS_STEPS;
  return [];
}
