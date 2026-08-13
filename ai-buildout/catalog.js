/**
 * Who we watch and what the tags mean. Browser-safe ESM — no Node APIs.
 *
 * Seven names, not the Fortune 500: the five hyperscalers the AI-financing
 * story is actually about, plus Nvidia (the supplier quote) and Apple (the
 * other household name in big-tech IG debt). Roles keep the spend / GDP math
 * on the builders, not the overlay.
 */

export const SNAPSHOT_SCHEMA = 1;
export const SERIES_YEARS = 10;

export const COMPANIES = [
  {
    id: 'amzn',
    name: 'Amazon',
    ticker: 'AMZN',
    cik: 1018724,
    cikPadded: '0001018724',
    role: 'hyperscaler',
    color: '#ffb750',
    fyNote: 'Calendar year.',
  },
  {
    id: 'msft',
    name: 'Microsoft',
    ticker: 'MSFT',
    cik: 789019,
    cikPadded: '0000789019',
    role: 'hyperscaler',
    color: '#36cedc',
    fyNote: 'Fiscal year ends in June.',
  },
  {
    id: 'googl',
    name: 'Alphabet',
    ticker: 'GOOGL',
    cik: 1652044,
    cikPadded: '0001652044',
    role: 'hyperscaler',
    color: '#ffea56',
    fyNote: 'Calendar year.',
  },
  {
    id: 'meta',
    name: 'Meta',
    ticker: 'META',
    cik: 1326801,
    cikPadded: '0001326801',
    role: 'hyperscaler',
    color: '#a587ca',
    fyNote: 'Calendar year.',
  },
  {
    id: 'orcl',
    name: 'Oracle',
    ticker: 'ORCL',
    cik: 1341439,
    cikPadded: '0001341439',
    role: 'hyperscaler',
    color: '#fe797b',
    fyNote: 'Fiscal year ends in May.',
  },
  {
    id: 'nvda',
    name: 'Nvidia',
    ticker: 'NVDA',
    cik: 1045810,
    cikPadded: '0001045810',
    role: 'supplier',
    color: '#8fe968',
    fyNote: 'Fiscal year ends in late January.',
  },
  {
    id: 'aapl',
    name: 'Apple',
    ticker: 'AAPL',
    cik: 320193,
    cikPadded: '0000320193',
    role: 'overlay',
    color: '#1c1c1c',
    fyNote: 'Fiscal year ends in September.',
  },
];

export const COMPANY_BY_CIK = Object.fromEntries(COMPANIES.map((c) => [String(c.cik), c]));

export function companyByCik(cik) {
  return COMPANY_BY_CIK[String(cik)] || null;
}

export function hyperscalers() {
  return COMPANIES.filter((c) => c.role === 'hyperscaler');
}

export const ROLES = {
  hyperscaler: 'Builds and rents the campuses.',
  supplier: 'Sells the chips the campuses eat.',
  overlay: 'Same credit neighborhood, not a hyperscaler tenant.',
};

export const METRICS = [
  {
    key: 'revenue',
    label: 'Revenue',
    unit: 'USD',
    kind: 'duration',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'RevenueFromContractWithCustomerExcludingAssessedTax' },
      { taxonomy: 'us-gaap', tag: 'Revenues' },
      { taxonomy: 'us-gaap', tag: 'SalesRevenueNet' },
    ],
  },
  {
    key: 'operating_income',
    label: 'Operating income',
    unit: 'USD',
    kind: 'duration',
    candidates: [{ taxonomy: 'us-gaap', tag: 'OperatingIncomeLoss' }],
  },
  {
    key: 'net_income',
    label: 'Net income',
    unit: 'USD',
    kind: 'duration',
    candidates: [{ taxonomy: 'us-gaap', tag: 'NetIncomeLoss' }],
  },
  {
    key: 'assets',
    label: 'Assets',
    unit: 'USD',
    kind: 'instant',
    candidates: [{ taxonomy: 'us-gaap', tag: 'Assets' }],
  },
  {
    key: 'equity',
    label: 'Equity',
    unit: 'USD',
    kind: 'instant',
    candidates: [{ taxonomy: 'us-gaap', tag: 'StockholdersEquity' }],
  },
  {
    key: 'cash',
    label: 'Cash',
    unit: 'USD',
    kind: 'instant',
    candidates: [{ taxonomy: 'us-gaap', tag: 'CashAndCashEquivalentsAtCarryingValue' }],
  },
  {
    key: 'cfo',
    label: 'Operating cash flow',
    unit: 'USD',
    kind: 'duration',
    candidates: [{ taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInOperatingActivities' }],
  },
  {
    key: 'cff',
    label: 'Financing cash flow',
    unit: 'USD',
    kind: 'duration',
    candidates: [{ taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInFinancingActivities' }],
  },
  {
    key: 'capex',
    label: 'CapEx',
    unit: 'USD',
    kind: 'duration',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'PaymentsToAcquirePropertyPlantAndEquipment' },
      { taxonomy: 'us-gaap', tag: 'PaymentsToAcquireProductiveAssets' },
    ],
  },
  {
    key: 'long_term_debt',
    label: 'Long-term debt',
    unit: 'USD',
    kind: 'instant',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'LongTermDebt' },
      { taxonomy: 'us-gaap', tag: 'LongTermDebtNoncurrent' },
      { taxonomy: 'us-gaap', tag: 'LongTermDebtAndCapitalLeaseObligations' },
    ],
  },
  {
    key: 'operating_lease_liability',
    label: 'Operating lease liability',
    unit: 'USD',
    kind: 'instant',
    candidates: [{ taxonomy: 'us-gaap', tag: 'OperatingLeaseLiability' }],
  },
  {
    key: 'finance_lease_liability',
    label: 'Finance lease liability',
    unit: 'USD',
    kind: 'instant',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'FinanceLeaseLiability' },
      { taxonomy: 'us-gaap', tag: 'CapitalLeaseObligations' },
    ],
  },
  {
    key: 'remaining_lease_payments',
    label: 'Undiscounted remaining lease payments',
    unit: 'USD',
    kind: 'instant',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'LesseeOperatingLeaseLiabilityPaymentsDue' },
      { taxonomy: 'us-gaap', tag: 'LesseeOperatingLeaseLiabilityUndiscounted' },
    ],
  },
  {
    key: 'debt_proceeds',
    label: 'Proceeds from long-term debt',
    unit: 'USD',
    kind: 'duration',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'ProceedsFromIssuanceOfLongTermDebt' },
      { taxonomy: 'us-gaap', tag: 'ProceedsFromIssuanceOfDebt' },
      { taxonomy: 'us-gaap', tag: 'ProceedsFromNotesPayable' },
      { taxonomy: 'us-gaap', tag: 'ProceedsFromIssuanceOfSeniorLongTermDebt' },
    ],
  },
  {
    key: 'purchase_obligation',
    label: 'Purchase obligations',
    unit: 'USD',
    kind: 'instant',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'PurchaseObligation' },
      { taxonomy: 'us-gaap', tag: 'UnrecordedUnconditionalPurchaseObligationBalanceToBePaid' },
      { taxonomy: 'us-gaap', tag: 'UnrecordedUnconditionalPurchaseObligation' },
    ],
  },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

/** Forms that can mark a new bond / material financing on a filing day. */
export const OFFERING_FORMS = new Set(['424B2', '424B3', '424B4', '424B5', '424B7', 'FWP']);
export const EIGHT_K_FORMS = new Set(['8-K', '8-K/A']);

const ISSUANCE_DESC_RE =
  /debt|note|bond|lease|credit agreement|indenture|offering|senior notes|debenture|borrow|facility|term loan/i;

export function isWatchFiling(form, description) {
  const f = String(form || '')
    .trim()
    .toUpperCase();
  if (f.startsWith('424B') || OFFERING_FORMS.has(f)) return true;
  if (EIGHT_K_FORMS.has(f) && ISSUANCE_DESC_RE.test(description || '')) return true;
  return false;
}

/**
 * Curated SPV / project-finance cards. These issuers are often not the
 * parent's CIK. Do not pretend a daily job reconstructed the 80/20 split.
 */
export const DEALS = [
  {
    id: 'beignet',
    name: 'Project Beignet',
    vehicle: 'Beignet Investor',
    campus: 'Hyperion',
    where: 'Richland Parish, Louisiana',
    parent: 'Meta',
    parentCik: 1326801,
    sizeUsd: 27.3e9,
    sizeLabel: '$27.3B investment-grade bonds',
    equitySplit: 'Blue Owl ~80% / Meta ~20%',
    bondMaturity: '2049',
    leaseStart: '2029',
    leaseRenewal: '4-year chunks',
    residualGuarantee: '~$28B residual-value guarantee in Meta’s 10-K footnotes',
    why: 'Meta designs, builds, operates, and is the only tenant. At 20% equity it is not the “primary beneficiary,” so the vehicle’s debt stays off Meta’s balance sheet. The residual-value guarantee is a second story sold to the bond holders.',
    mismatch: 'A 24-year loan sitting on a lease that has not started and renews in 4-year pieces, for a campus built around Meta’s own hardware in rural Louisiana.',
    filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001326801&type=10-K',
  },
  {
    id: 'soapia',
    name: 'Project Soapia',
    vehicle: 'Soapia (BlackRock sequel)',
    campus: 'El Paso AI campus',
    where: 'El Paso, Texas',
    parent: 'Meta',
    parentCik: 1326801,
    sizeUsd: 12e9,
    sizeLabel: '$12B+ bonds (marketed)',
    equitySplit: 'Same 80/20 template as Beignet',
    bondMaturity: null,
    leaseStart: null,
    leaseRenewal: null,
    residualGuarantee: null,
    why: 'The Beignet structure copied onto a 1 GW campus. JPMorgan and Morgan Stanley ran the sale. Two deals do not prove a system; the 80/20 lease-plus-SPV template repeating does.',
    mismatch: null,
    filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001326801&type=8-K',
  },
];

/**
 * Sell-side / legal reconstructions. Show with as-of dates. Never refresh
 * these from an API — they are not in Company Facts.
 */
export const RESEARCH_CLAIMS = [
  {
    id: 'hidden-vs-book',
    claim: 'One study put off-balance-sheet obligations at five tech companies around $1.65T, versus about $1.35T of debt on the books.',
    asOf: '2026',
    source: 'Cited in industry commentary; not an SEC tag',
  },
  {
    id: 'moodys-leases',
    claim: 'Moody’s: big tech pledged nearly $1T for future AI data-center leases, with over $660B not on main balance sheets today.',
    asOf: '2026',
    source: 'Moody’s research (not an API)',
  },
  {
    id: 'ms-offbook',
    claim: 'Morgan Stanley: industry off-balance-sheet exposure around $1.8T; buildout ~$2.9T through 2028, of which cash flow covers ~$1.4T.',
    asOf: '2026',
    source: 'Morgan Stanley research (not an API)',
  },
  {
    id: 'quinn',
    claim: 'Quinn Emanuel counted more than $120B moved off balance sheets in under two years.',
    asOf: '2026',
    source: 'Quinn Emanuel commentary (not an API)',
  },
];

export const PARLAY_LEGS = [
  {
    id: 'revenue',
    title: 'Revenue has to multiply',
    honest: 'We show tagged company revenue next to tagged CapEx — not “AI revenue,” which is not a us-gaap tag.',
  },
  {
    id: 'returns',
    title: 'Returns have to stop shrinking',
    honest: 'Operating margin and asset turnover from the 10-K. We do not invent cloud ROIC.',
  },
  {
    id: 'borrowing',
    title: 'The borrowing window has to stay open',
    honest: 'Tagged debt proceeds plus the 424B / FWP / debt-flavored 8-K ticker. Not TRACE prints.',
  },
  {
    id: 'grid',
    title: 'The grid has to absorb it',
    honest: 'Not on this page. Power is a different feed (EIA / ISOs).',
  },
];

export const GDP_FALLBACK = {
  series: 'GDP',
  value: 30507040000000,
  date: '2026-04-01',
  source: 'FRED GDP (nominal, SAAR) — cached fallback if the live CSV miss',
};

export function edgarFactsUrl(cikPadded) {
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`;
}

export function edgarSubmissionsUrl(cikPadded) {
  return `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
}

export function edgarBrowseUrl(cikPadded) {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikPadded}&owner=include&count=40`;
}

export function filingArchiveUrl(cik, accession, primaryDocument) {
  const accn = String(accession || '').replace(/-/g, '');
  const cikNum = Number(cik);
  const doc = primaryDocument || '';
  if (!accn || !cikNum) return null;
  if (!doc) return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accn}/`;
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accn}/${doc}`;
}
