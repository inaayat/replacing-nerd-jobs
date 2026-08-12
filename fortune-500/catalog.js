/** Copy and lookup tables for the Fortune 500 × EDGAR explainer. No Node APIs. */

export const SOURCES = [
  {
    id: 'submissions',
    urlKey: 'edgar_submissions_api',
    title: 'Company profile & filing history',
    api: 'Submissions',
    cadence: 'Updates whenever they file anything',
    format: 'JSON',
    summary:
      'Who the SEC thinks this company is, plus an index of every recent filing. This is the table of contents, not the financial statements.',
    youGet: [
      'Legal name, former names, tickers, and exchanges',
      'SIC industry code, state of incorporation, fiscal year end',
      'Addresses, phone, website',
      'A list of 10-Ks, 10-Qs, 8-Ks, proxies, Form 4s… with dates and accession numbers',
    ],
  },
  {
    id: 'facts',
    urlKey: 'edgar_companyfacts_api',
    title: 'Structured financials (XBRL)',
    api: 'Company Facts',
    cadence: 'A few times a year (10-K + 10-Qs)',
    format: 'JSON',
    summary:
      'The actual numbers from the filings, tagged so a computer can read them. Revenue, profit, assets, cash flow — as a time series, not a PDF.',
    youGet: [
      'Hundreds of us-gaap tags (banks and insurers use extra industry tags)',
      'Each point has a value, period, form (10-K vs 10-Q), and filing date',
      'This is the feed we extract headline numbers from',
    ],
  },
  {
    id: 'concept',
    urlKey: 'edgar_companyconcept_revenues_api',
    title: 'One metric over time',
    api: 'Company Concept',
    cadence: 'Same as Company Facts',
    format: 'JSON',
    summary:
      'A slice of Company Facts for a single tag. The mapping pre-builds Revenues. Skip this if you already have Company Facts.',
    youGet: [
      'Revenue history for this CIK (tag availability varies by industry)',
      'Same period / form / filed metadata as Facts',
    ],
  },
  {
    id: 'browse',
    urlKey: 'edgar_filings_browse',
    title: 'Human filing browser',
    api: 'EDGAR search',
    cadence: 'Live on sec.gov',
    format: 'HTML',
    summary:
      'The classic SEC company page. Open a 10-K in a browser, read MD&A, click exhibits. Not for automation — documents are immutable once posted.',
    youGet: [
      'Clickable list of filings',
      'Full 10-K / 10-Q HTML and exhibits',
      'Useful when you want the story, not just the tags',
    ],
  },
];

/** How many public filers can sit in one compare (API + UI). */
export const MAX_COMPARE = 5;

/** Metrics where a smaller number is better (used for compare coloring). */
export const LOWER_BETTER = new Set(['debt_equity']);

/**
 * One-click peer sets. Ranks match fortune500_edgar_mapping.json.
 * Keep each list ≤ MAX_COMPARE.
 */
export const PRESETS = [
  { id: 'tech', label: 'Big tech', ranks: [4, 11, 6, 1, 15] },
  { id: 'auto', label: 'Detroit + Tesla', ranks: [20, 21, 40] },
  { id: 'banks', label: 'Big banks', ranks: [22, 38, 52, 54] },
  { id: 'health', label: 'Health', ranks: [3, 43, 69, 70] },
  { id: 'retail', label: 'Retail', ranks: [2, 12, 39, 23] },
];

/** Default table on the right when nothing is selected. */
export const SCREENER_COLUMNS = [
  { key: 'rank', label: '#', type: 'rank' },
  { key: 'name', label: 'Company', type: 'name' },
  { key: 'asOfYear', label: 'FY', type: 'year' },
  { key: 'revenue', label: 'Revenue', type: 'usd', source: 'metric' },
  { key: 'net_income', label: 'Net income', type: 'usd', source: 'metric' },
  { key: 'net_margin', label: 'Net margin', type: 'pct', source: 'ratio' },
  { key: 'revenue_yoy', label: 'Rev YoY', type: 'pct', source: 'ratio', signed: true },
];

export const CHART_METRICS = [
  { key: 'net_margin', label: 'Net margin', source: 'ratio' },
  { key: 'operating_margin', label: 'Op. margin', source: 'ratio' },
  { key: 'gross_margin', label: 'Gross margin', source: 'ratio' },
  { key: 'revenue_yoy', label: 'Revenue YoY', source: 'ratio', signed: true },
  { key: 'roe', label: 'ROE', source: 'ratio' },
  { key: 'roa', label: 'ROA', source: 'ratio' },
  { key: 'revenue', label: 'Revenue', source: 'metric' },
  { key: 'net_income', label: 'Net income', source: 'metric' },
];

export const FEATURED = [
  { key: 'revenue', source: 'metric' },
  { key: 'net_income', source: 'metric' },
  { key: 'net_margin', source: 'ratio' },
  { key: 'revenue_yoy', source: 'ratio' },
];

export const METRIC_GROUPS = [
  {
    id: 'income',
    label: 'Income statement',
    keys: ['revenue', 'gross_profit', 'operating_income', 'net_income', 'rd'],
  },
  {
    id: 'balance',
    label: 'Balance sheet',
    keys: ['assets', 'liabilities', 'equity', 'cash', 'long_term_debt'],
  },
  {
    id: 'cash',
    label: 'Cash flow',
    keys: ['cfo', 'cfi', 'cff', 'capex'],
  },
  {
    id: 'ratios',
    label: 'Ratios',
    keys: ['gross_margin', 'operating_margin', 'net_margin', 'roa', 'roe', 'debt_equity', 'revenue_yoy'],
  },
];

export const METRICS = [
  { key: 'revenue', label: 'Revenue', plain: 'Sales / top line for the period.', tags: 'Revenues, or RevenueFromContractWithCustomerExcludingAssessedTax', unit: 'USD', kind: 'duration', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'Revenues' }, { taxonomy: 'us-gaap', tag: 'RevenueFromContractWithCustomerExcludingAssessedTax' }, { taxonomy: 'us-gaap', tag: 'SalesRevenueNet' }] },
  { key: 'net_income', label: 'Net income', plain: 'Profit after everything. Can be negative.', tags: 'NetIncomeLoss', unit: 'USD', kind: 'duration', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'NetIncomeLoss' }] },
  { key: 'gross_profit', label: 'Gross profit', plain: 'Revenue minus cost of goods. Often missing for banks.', tags: 'GrossProfit', unit: 'USD', kind: 'duration', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'GrossProfit' }] },
  { key: 'operating_income', label: 'Operating income', plain: 'Profit from the core business, before interest and tax.', tags: 'OperatingIncomeLoss', unit: 'USD', kind: 'duration', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'OperatingIncomeLoss' }] },
  { key: 'assets', label: 'Total assets', plain: 'What the company owns (balance sheet, a point in time).', tags: 'Assets', unit: 'USD', kind: 'instant', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'Assets' }] },
  { key: 'liabilities', label: 'Total liabilities', plain: 'What it owes.', tags: 'Liabilities', unit: 'USD', kind: 'instant', better: 'lower', candidates: [{ taxonomy: 'us-gaap', tag: 'Liabilities' }] },
  { key: 'equity', label: 'Shareholders’ equity', plain: 'Assets minus liabilities, roughly “book value”.', tags: 'StockholdersEquity', unit: 'USD', kind: 'instant', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'StockholdersEquity' }] },
  { key: 'cash', label: 'Cash', plain: 'Cash and cash equivalents on the balance sheet.', tags: 'CashAndCashEquivalentsAtCarryingValue', unit: 'USD', kind: 'instant', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'CashAndCashEquivalentsAtCarryingValue' }] },
  { key: 'cfo', label: 'Operating cash flow', plain: 'Cash generated (or used) by operations.', tags: 'NetCashProvidedByUsedInOperatingActivities', unit: 'USD', kind: 'duration', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInOperatingActivities' }] },
  { key: 'cfi', label: 'Investing cash flow', plain: 'Capex, acquisitions, investments. Often negative.', tags: 'NetCashProvidedByUsedInInvestingActivities', unit: 'USD', kind: 'duration', better: null, candidates: [{ taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInInvestingActivities' }] },
  { key: 'cff', label: 'Financing cash flow', plain: 'Debt, buybacks, dividends, equity issuance.', tags: 'NetCashProvidedByUsedInFinancingActivities', unit: 'USD', kind: 'duration', better: null, candidates: [{ taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInFinancingActivities' }] },
  { key: 'eps_diluted', label: 'Diluted EPS', plain: 'Earnings per share, counting dilutive securities.', tags: 'EarningsPerShareDiluted', unit: 'USD/shares', kind: 'duration', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'EarningsPerShareDiluted' }] },
  { key: 'eps_basic', label: 'Basic EPS', plain: 'Earnings per share on basic shares.', tags: 'EarningsPerShareBasic', unit: 'USD/shares', kind: 'duration', better: 'higher', candidates: [{ taxonomy: 'us-gaap', tag: 'EarningsPerShareBasic' }] },
  { key: 'shares_out', label: 'Shares outstanding', plain: 'Share count. Not a stock price — EDGAR has no market cap.', tags: 'CommonStockSharesOutstanding', unit: 'shares', kind: 'instant', better: null, candidates: [{ taxonomy: 'us-gaap', tag: 'CommonStockSharesOutstanding' }, { taxonomy: 'dei', tag: 'EntityCommonStockSharesOutstanding' }] },
  { key: 'long_term_debt', label: 'Long-term debt', plain: 'Debt due beyond a year. Tag coverage varies.', tags: 'LongTermDebt', unit: 'USD', kind: 'instant', better: 'lower', candidates: [{ taxonomy: 'us-gaap', tag: 'LongTermDebt' }] },
  { key: 'inventory', label: 'Inventory', plain: 'Goods on hand. Retail/manufacturing; rarely banks.', tags: 'InventoryNet', unit: 'USD', kind: 'instant', better: null, candidates: [{ taxonomy: 'us-gaap', tag: 'InventoryNet' }] },
  { key: 'receivables', label: 'Receivables', plain: 'Money customers owe.', tags: 'AccountsReceivableNetCurrent', unit: 'USD', kind: 'instant', better: null, candidates: [{ taxonomy: 'us-gaap', tag: 'AccountsReceivableNetCurrent' }] },
  { key: 'rd', label: 'R&D expense', plain: 'Research and development. Common in tech and pharma.', tags: 'ResearchAndDevelopmentExpense', unit: 'USD', kind: 'duration', better: null, candidates: [{ taxonomy: 'us-gaap', tag: 'ResearchAndDevelopmentExpense' }] },
  { key: 'capex', label: 'CapEx', plain: 'Cash spent on property, plant, and equipment.', tags: 'PaymentsToAcquirePropertyPlantAndEquipment', unit: 'USD', kind: 'duration', better: null, candidates: [{ taxonomy: 'us-gaap', tag: 'PaymentsToAcquirePropertyPlantAndEquipment' }] },
];

export const DERIVED = [
  { key: 'gross_margin', label: 'Gross margin', plain: 'Gross profit ÷ revenue. Hidden if a tag is missing — never shown as 0%.', format: 'percent', better: 'higher', needs: ['gross_profit', 'revenue'] },
  { key: 'operating_margin', label: 'Operating margin', plain: 'Operating income ÷ revenue.', format: 'percent', better: 'higher', needs: ['operating_income', 'revenue'] },
  { key: 'net_margin', label: 'Net margin', plain: 'Net income ÷ revenue.', format: 'percent', better: 'higher', needs: ['net_income', 'revenue'] },
  { key: 'roa', label: 'ROA', plain: 'Net income ÷ assets.', format: 'percent', better: 'higher', needs: ['net_income', 'assets'] },
  { key: 'roe', label: 'ROE', plain: 'Net income ÷ equity.', format: 'percent', better: 'higher', needs: ['net_income', 'equity'] },
  { key: 'debt_equity', label: 'Debt / equity', plain: 'Long-term debt ÷ equity.', format: 'ratio', better: 'lower', needs: ['long_term_debt', 'equity'] },
  { key: 'revenue_yoy', label: 'Revenue YoY', plain: 'This year’s revenue vs last year’s.', format: 'percent', signed: true, better: 'higher', needs: ['revenue'] },
];

export const GLOSSARY = [
  { term: 'EDGAR', def: 'The SEC’s filing system. Public companies drop 10-Ks, 10-Qs, and more here. The JSON APIs are a machine-readable layer on top.' },
  { term: 'CIK', def: 'Central Index Key — the SEC’s ID for a company. URLs use a 10-digit zero-padded form (Amazon is 0001018724).' },
  { term: '10-K', def: 'Annual report. Audited financials, business description, risk factors, MD&A.' },
  { term: '10-Q', def: 'Quarterly report. Lighter than a 10-K, still has financial statements.' },
  { term: '8-K', def: '“Something happened” filing — earnings, CEO change, merger. Not a full financial restatement.' },
  { term: 'XBRL', def: 'Tags inside the filing so each number has a name (Revenues, Assets, …). Company Facts is XBRL as JSON.' },
  { term: 'us-gaap', def: 'The main accounting taxonomy. Banks, insurers, and REITs add extra tags; some “retail” tags will be blank for them.' },
  { term: 'Accession', def: 'The unique ID of one filing. Raw documents never change once published — fetch once, don’t re-download.' },
];

export const PRIVATE_NOTES = {
  34: 'Mutual insurer',
  74: 'Mutual insurer',
  80: 'Employee-owned, private',
  83: 'Mutual insurer',
  96: 'Private / mutual',
  98: 'Private membership org',
  101: 'Private nonprofit financial services',
  112: 'Mutual insurer',
  117: 'Mutual insurer',
  142: 'Mutual holding company',
  157: 'Private',
  215: 'Mutual insurer',
  273: 'Private (construction)',
  276: 'Mutual insurer',
  280: 'Private (Jones Financial)',
  282: 'Cooperative',
  289: 'Mutual insurer',
  290: 'Private',
  301: 'Mutual insurer',
  318: 'Mutual insurer',
  335: 'Mutual insurer',
  389: 'Employee-owned, private',
  405: 'Fraternal benefit society',
  417: 'Private insurer (Factory Mutual)',
  440: 'Retail cooperative',
  480: 'Private (Liberty Media subsidiary)',
  485: 'Private',
};

export const MATCH_LABELS = {
  company_tickers_json: 'Matched from the SEC ticker list',
  manual_cik_lookup: 'CIK looked up by hand (not in the SEC ticker file)',
};

export function isPublic(company) {
  return company.status === 'matched' && company.cik != null;
}

export function tickerLabel(company) {
  if (!isPublic(company)) return '—';
  const a = company.fortune_ticker;
  const b = company.sec_ticker;
  if (a && b && a !== b) return `${a} → ${b}`;
  return a || b || '—';
}
