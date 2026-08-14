/**
 * Shared assumption catalog — browser cards and workbook notes use the same
 * metadata. Evolves dial definitions with source types and affected outputs.
 */
import { DIALS, DIAL_GROUPS, dialsFor } from './dials.js';

const ENRICHMENT = {
  revenueGrowth: {
    sourceType: 'historical-calculation',
    affects: ['revenue', 'ebit', 'unleveredFcf', 'impliedPrice'],
    formulaText: 'Current-year revenue ÷ prior-year revenue − 1',
    models: ['three', 'dcf'],
  },
  grossMargin: {
    sourceType: 'historical-calculation',
    affects: ['cogs', 'grossProfit', 'inventory'],
    formulaText: 'Gross profit ÷ revenue',
    models: ['three'],
  },
  ebitMargin: {
    sourceType: 'historical-calculation',
    affects: ['opex', 'ebit', 'unleveredFcf', 'impliedPrice'],
    formulaText: 'Operating income ÷ revenue',
    models: ['three', 'dcf'],
  },
  taxRate: {
    sourceType: 'user-assumption',
    affects: ['taxes', 'netIncome', 'unleveredFcf'],
    formulaText: 'Tax expense ÷ pre-tax income (or statutory rate)',
    models: ['three', 'dcf'],
  },
  capexPct: {
    sourceType: 'historical-calculation',
    affects: ['capex', 'otherAssets', 'cash'],
    formulaText: 'Capital expenditure ÷ revenue',
    models: ['three'],
  },
  daPct: {
    sourceType: 'user-assumption',
    affects: ['da', 'cfo', 'netIncome'],
    formulaText: 'Depreciation ÷ revenue (defaults to CapEx %)',
    models: ['three'],
  },
  dsoDays: {
    sourceType: 'historical-calculation',
    affects: ['receivables', 'cfo', 'cash'],
    formulaText: 'Receivables ÷ revenue × 365',
    models: ['three'],
  },
  dioDays: {
    sourceType: 'historical-calculation',
    affects: ['inventory', 'cfo', 'cash'],
    formulaText: 'Inventory ÷ cost of sales × 365',
    models: ['three'],
  },
  interestRate: {
    sourceType: 'user-assumption',
    affects: ['interestExpense', 'wacc', 'impliedPrice'],
    formulaText: 'Interest expense ÷ beginning debt',
    models: ['three', 'dcf'],
  },
  debtRepaymentPct: {
    sourceType: 'user-assumption',
    affects: ['debtRepayment', 'debt', 'interestExpense'],
    formulaText: 'Debt repaid ÷ beginning debt',
    models: ['three'],
  },
  payoutRatio: {
    sourceType: 'user-assumption',
    affects: ['dividends', 'equity', 'cash'],
    formulaText: 'Dividends ÷ net income',
    models: ['three'],
  },
  beta: {
    sourceType: 'market-data',
    affects: ['wacc', 'impliedPrice'],
    formulaText: 'Cost of equity = risk-free + beta × ERP',
    models: ['dcf'],
  },
  riskFreeRate: {
    sourceType: 'market-data',
    affects: ['wacc', 'impliedPrice'],
    formulaText: '10-year US Treasury yield',
    models: ['dcf'],
  },
  equityRiskPremium: {
    sourceType: 'user-assumption',
    affects: ['wacc', 'impliedPrice'],
    formulaText: 'Expected equity return minus risk-free rate',
    models: ['dcf'],
  },
  terminalGrowth: {
    sourceType: 'user-assumption',
    affects: ['terminalValue', 'impliedPrice'],
    formulaText: 'Gordon growth: TV = FCF × (1 + g) ÷ (WACC − g)',
    models: ['dcf'],
  },
};

const SOURCE_LABELS = {
  'historical-calculation': 'From filing',
  'user-assumption': 'Assumption',
  'market-data': 'Market data',
  filing: 'Filing',
};

export function assumptionCatalog(models) {
  const dials = models ? dialsFor(models) : DIALS;
  return dials.map((d) => {
    const extra = ENRICHMENT[d.key] || {};
    return {
      ...d,
      ...extra,
      shortDefinition: d.what,
      formulaText: extra.formulaText || d.how,
      sourceLabel: SOURCE_LABELS[extra.sourceType] || 'Assumption',
    };
  });
}

export { DIAL_GROUPS, dialsFor, DIALS };

export function sourceBadge(meta, { isOverride = false, isMissing = false } = {}) {
  if (isMissing) return '<span class="fm-source-badge is-missing">Missing</span>';
  if (isOverride) return '<span class="fm-source-badge is-override">Your override</span>';
  return `<span class="fm-source-badge is-${meta.sourceType || 'user-assumption'}">${meta.sourceLabel || 'Assumption'}</span>`;
}

export function validateAssumption(meta, value) {
  if (value == null) return { valid: true, message: null };
  if (!Number.isFinite(value)) return { valid: false, message: 'Enter a number.' };
  if (value < meta.min) return { valid: false, message: `Minimum is ${meta.min}.` };
  if (value > meta.max) return { valid: false, message: `Maximum is ${meta.max}.` };
  if (meta.fmt === 'pct' && value > 0.3 && meta.key === 'revenueGrowth') {
    return { valid: true, message: 'Aggressive — above 30% growth rarely sustains five years.', warn: true };
  }
  if (meta.key === 'terminalGrowth' && meta.fmt === 'pct') {
    return { valid: true, message: null };
  }
  return { valid: true, message: null };
}

export function isOverride(key, current, sourceDefaults) {
  if (!sourceDefaults || current == null || sourceDefaults[key] == null) return false;
  const a = Number(current);
  const b = Number(sourceDefaults[key]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const tol = Math.max(Math.abs(b) * 1e-6, 1e-9);
  return Math.abs(a - b) > tol;
}

/** Quiet row token: filing | assumption | override. */
export function sourceToken(meta, current, sourceDefaults) {
  if (isOverride(meta?.key, current, sourceDefaults)) return 'override';
  if (meta?.sourceType === 'historical-calculation') return 'filing';
  return 'assumption';
}
