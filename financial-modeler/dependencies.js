/**
 * Declarative dependency paths for assumption tracing. Rendering only — does
 * not alter calculation logic.
 */

export const DEPENDENCIES = {
  revenueGrowth: {
    path: ['Revenue', 'EBIT', 'Unlevered FCF', 'Implied share price'],
    rowKeys: ['revenue', 'ebit', 'netIncome', 'unleveredFcf'],
  },
  grossMargin: {
    path: ['Cost of sales', 'Gross profit', 'Inventory', 'EBIT'],
    rowKeys: ['cogs', 'grossProfit', 'inventory', 'ebit'],
  },
  ebitMargin: {
    path: ['Operating expenses', 'EBIT', 'Unlevered FCF', 'Implied share price'],
    rowKeys: ['opex', 'ebit', 'unleveredFcf'],
  },
  taxRate: {
    path: ['Taxes', 'Net income', 'Cash from operations', 'Unlevered FCF'],
    rowKeys: ['taxes', 'netIncome', 'cfo', 'unleveredFcf'],
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
    outputKeys: ['impliedPrice'],
  },
  riskFreeRate: {
    path: ['Cost of equity', 'WACC', 'Implied share price'],
    rowKeys: [],
    outputKeys: ['impliedPrice'],
  },
  equityRiskPremium: {
    path: ['Cost of equity', 'WACC', 'Implied share price'],
    rowKeys: [],
    outputKeys: ['impliedPrice'],
  },
  terminalGrowth: {
    path: ['Terminal value', 'Enterprise value', 'Implied share price'],
    rowKeys: [],
    outputKeys: ['impliedPrice'],
  },
};

export function dependencyPath(key) {
  return DEPENDENCIES[key]?.path ?? [];
}

export function dependencyRowKeys(key) {
  return DEPENDENCIES[key]?.rowKeys ?? [];
}
