/** Copy and lookup tables for the Fortune 500 × EDGAR explainer. No Node APIs. */
import { STATEMENT_KEYS } from './statement.js';

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

/**
 * One-click peer sets. Ranks match fortune500_edgar_mapping.json.
 * Keep each list ≤ MAX_COMPARE. `story` cards lead the home compare strip.
 */
export const PRESETS = [
  {
    id: 'volume-margin',
    label: 'Sales vs profit',
    story: true,
    ranks: [2, 1, 4, 15],
    blurb: 'Walmart and Amazon ring up the most sales. Apple and Nvidia keep more of each dollar.',
  },
  {
    id: 'rd',
    label: 'Who funds research',
    story: true,
    ranks: [16, 70, 91, 4],
    blurb: 'R&D only shows up when a company tags it. Meta, Merck, Intel, and Apple do; grocers usually don’t.',
  },
  {
    id: 'cash',
    label: 'Cash vs profit',
    story: true,
    ranks: [1, 11, 16, 4],
    blurb: 'Profit is an accounting story. Operating cash is what actually hit the bank. Tech giants often have more cash than profit.',
  },
  {
    id: 'tech',
    label: 'Big tech',
    story: false,
    ranks: [4, 11, 6, 1, 15],
    blurb: 'Apple, Microsoft, Alphabet, Amazon, Nvidia — same neighborhood, very different margins.',
  },
  {
    id: 'auto',
    label: 'Detroit + Tesla',
    story: false,
    ranks: [20, 21, 40],
    blurb: 'Ford, GM, and Tesla. Same product-ish, different balance sheets.',
  },
  {
    id: 'banks',
    label: 'Big banks',
    story: false,
    ranks: [22, 38, 52, 54],
    blurb: 'Banks skip retail tags like inventory and gross profit. Compare what they actually file — assets, equity, net income.',
  },
  {
    id: 'health',
    label: 'Health',
    story: false,
    ranks: [3, 43, 69, 70],
    blurb: 'An insurer, a drugstore-cabinet giant, and two drug makers. R&D and margins tell you who’s who.',
  },
  {
    id: 'retail',
    label: 'Retail',
    story: false,
    ranks: [2, 12, 39, 23],
    blurb: 'Walmart, Costco, Target, Home Depot. Huge sales, thin keep-the-dollar margins.',
  },
];

/** Default table: key ratios, not raw dollars. */
export const SCREENER_COLUMNS = [
  { key: 'rank', label: '#', type: 'rank' },
  { key: 'name', label: 'Company', type: 'name' },
  { key: 'net_margin', label: 'Net margin', type: 'pct', source: 'ratio' },
  { key: 'roe', label: 'ROE', type: 'pct', source: 'ratio' },
  { key: 'asset_turnover', label: 'Asset turns', type: 'ratio', source: 'ratio' },
  { key: 'fcf_margin', label: 'FCF margin', type: 'pct', source: 'ratio' },
  { key: 'debt_equity', label: 'Debt/eq', type: 'ratio', source: 'ratio' },
  { key: 'revenue_yoy', label: 'Rev YoY', type: 'pct', source: 'ratio', signed: true },
];

export const CHART_METRICS = [
  { key: 'net_margin', label: 'Net margin', source: 'ratio' },
  { key: 'roe', label: 'ROE', source: 'ratio' },
  { key: 'asset_turnover', label: 'Asset turns', source: 'ratio' },
  { key: 'fcf_margin', label: 'FCF margin', source: 'ratio' },
  { key: 'cash_conversion', label: 'Cash conv.', source: 'ratio' },
  { key: 'debt_equity', label: 'Debt/equity', source: 'ratio' },
  { key: 'revenue_yoy', label: 'Revenue YoY', source: 'ratio', signed: true },
];

/** Same line items, same order as the filed statement — companies as columns. */
export const COMPARE_SCALE_KEYS = [...STATEMENT_KEYS];

export const COMPARE_SCALE_GROUP = {
  id: 'scale',
  label: 'Statement (latest 10-K $)',
  kid: 'Dollars first, in filing order — a comps table needs size, not only ratios.',
  keys: COMPARE_SCALE_KEYS,
};

/** Industrial cash metrics that mislead on banks / broker-dealers. */
export const BANK_CASH_KEYS = new Set(['fcf', 'fcf_margin', 'cash_conversion', 'capex_intensity']);

export const FEATURED = [
  { key: 'net_margin', source: 'ratio' },
  { key: 'roe', source: 'ratio' },
  { key: 'asset_turnover', source: 'ratio' },
  { key: 'fcf_margin', source: 'ratio' },
  { key: 'cash_conversion', source: 'ratio' },
  { key: 'debt_equity', source: 'ratio' },
];

/** The product: computed ratios from EDGAR tags. */
export const RATIO_GROUPS = [
  {
    id: 'profit',
    label: 'Profitability',
    kid: 'How many cents of each sales dollar survive?',
    keys: ['gross_margin', 'operating_margin', 'net_margin', 'fcf_margin'],
  },
  {
    id: 'returns',
    label: 'Returns & productivity',
    kid: 'How hard is the capital working? ROE ≈ margin × turnover × leverage.',
    keys: ['roa', 'roe', 'asset_turnover', 'leverage'],
  },
  {
    id: 'leverage',
    label: 'Leverage',
    kid: 'How borrowed is the company?',
    keys: ['debt_equity', 'debt_assets'],
  },
  {
    id: 'cash',
    label: 'Cash quality',
    kid: 'Does profit show up as cash, and what gets reinvested?',
    keys: ['fcf', 'cash_conversion', 'capex_intensity', 'rd_intensity'],
  },
  {
    id: 'growth',
    label: 'Growth & operations',
    kid: 'Are sales growing, and how long to collect from customers?',
    keys: ['revenue_yoy', 'receivables_days', 'book_value_ps'],
  },
];

/** Raw 10-K tags the ratios are built from. */
export const FILED_GROUPS = [
  {
    id: 'income',
    label: 'Income statement',
    kid: 'Dollars in the annual P&L.',
    keys: ['revenue', 'gross_profit', 'operating_income', 'net_income', 'rd'],
  },
  {
    id: 'per_share',
    label: 'Per share',
    kid: 'Not a stock price — EDGAR has no market cap.',
    keys: ['eps_diluted', 'eps_basic', 'shares_out'],
  },
  {
    id: 'balance',
    label: 'Balance sheet',
    kid: 'A snapshot on one day.',
    keys: ['assets', 'liabilities', 'equity', 'cash', 'long_term_debt', 'inventory', 'receivables'],
  },
  {
    id: 'cashflow',
    label: 'Cash flow',
    kid: 'Cash that actually moved.',
    keys: ['cfo', 'cfi', 'cff', 'capex'],
  },
];

/** @deprecated use RATIO_GROUPS + FILED_GROUPS; kept so older callers still iterate everything. */
export const METRIC_GROUPS = [
  ...RATIO_GROUPS,
  ...FILED_GROUPS,
];

export const NOT_IN_EDGAR = [
  'Stock price or market cap — not in EDGAR; the company page loads a delayed Yahoo last price on demand.',
  'Fortune magazine’s published revenue ranking dollars (we are not licensed to copy that table).',
  'Employee count — not in this tag list.',
  'The story in the 10-K’s words (MD&A, risk factors). Open the filing browser for that.',
];

/** Rank of the suggested first company (Apple). */
export const SUGGESTED_RANK = 4;

export const PURPOSE =
  'Open a 10-K, read the filed statement, then change a few guesses. Year 0 is filed. Everything after is yours. Dash = not tagged, not zero.';

/** First-load overlay. Three steps; the 4-step course lives in COURSE_STEPS. */
export const HOW_TO = [
  {
    n: '1',
    title: 'Open a company',
    body: 'Click a name on the left. Apple is a fine first 10-K. A dash is “not tagged,” not zero.',
  },
  {
    n: '2',
    title: 'Change a guess',
    body: 'The company opens on Practice model. Each guess is a card: what it is, where the default came from, and what moving it does. Year 0 is filed.',
  },
  {
    n: '3',
    title: 'Read one ratio',
    body: 'Key ratios has the tiles; tap one — start with net margin. The dock is the lesson: kid version plus the 10-K math.',
  },
];

/**
 * 4-step path stored in localStorage `f500-course`. Never gates the rest of the
 * UI. Order follows the panes: a company opens on the practice model, so
 * changing a guess comes before reading a ratio.
 */
export const COURSE_STEPS = [
  {
    id: 'open',
    n: '1',
    title: 'Open a company',
    short: 'Open a company',
    prompt: 'Click Apple in the list on the left.',
    body: 'Click a name on the left. Apple is a good first 10-K.',
  },
  {
    id: 'model',
    n: '2',
    title: 'Change a guess',
    short: 'Change a guess',
    prompt: 'Drag Sales growth and watch year 5 move.',
    body: 'Every card says what the guess is, where the default came from, and what moving it does.',
  },
  {
    id: 'ratio',
    n: '3',
    title: 'Read one ratio',
    short: 'Read one ratio',
    prompt: 'Open Key ratios and tap Net margin.',
    body: 'Tap net margin (or any tile). The dock is the lesson: kid version plus the 10-K math.',
  },
  {
    id: 'compare',
    n: '4',
    title: 'Compare two 10-Ks',
    short: 'Compare two',
    prompt: 'Add a second company, then Compare.',
    body: 'Add a second public company. A dash is not tagged, not zero. Fiscal years may not line up.',
  },
];

export function courseProgress(done = {}) {
  const total = COURSE_STEPS.length;
  const completed = COURSE_STEPS.filter((s) => done[s.id]).length;
  const next = COURSE_STEPS.find((s) => !done[s.id]) || null;
  return { total, completed, next, complete: completed === total };
}

export const METRICS = [
  {
    key: 'revenue',
    label: 'Revenue',
    plain: 'How much customers paid this year.',
    eli5: 'This is the lemonade-stand jar: every dollar customers paid for stuff or services this year, before subtracting lemons, cups, or rent. Bigger is not automatically better — a grocery chain can ring up more sales than a chip maker and keep far less.',
    whyMissing: 'A few filers use an industry-specific sales tag we don’t pick up, so we leave it blank instead of guessing.',
    tags: 'Revenues, RevenueFromContractWithCustomer…, RegulatedAndUnregulatedOperatingRevenue, or RevenuesNetOfInterestExpense',
    unit: 'USD',
    kind: 'duration',
    better: 'higher',
    // Order is "first hit wins" within a year, so the industry-specific tags sit
    // last: only utilities, retailers and banks file them, and each is the top
    // line that industry actually reports. Without them Goldman, Morgan Stanley,
    // Wells Fargo, Duke, NextEra, TJX, Valero and Kraft Heinz had no revenue at
    // all, which blanked every margin, turnover and growth figure on their pages.
    // The utility total comes before the contract-revenue subset (NextEra tags
    // both: $27.4B of operating revenues vs $25.8B of contract revenue).
    candidates: [
      { taxonomy: 'us-gaap', tag: 'Revenues' },
      { taxonomy: 'us-gaap', tag: 'RevenueFromContractWithCustomerExcludingAssessedTax' },
      { taxonomy: 'us-gaap', tag: 'SalesRevenueNet' },
      { taxonomy: 'us-gaap', tag: 'RegulatedAndUnregulatedOperatingRevenue' },
      { taxonomy: 'us-gaap', tag: 'RevenueFromContractWithCustomerIncludingAssessedTax' },
      { taxonomy: 'us-gaap', tag: 'RevenuesNetOfInterestExpense' },
      { taxonomy: 'ifrs-full', tag: 'RevenueFromContractsWithCustomers' },
      { taxonomy: 'ifrs-full', tag: 'Revenue' },
    ],
  },
  {
    key: 'net_income',
    label: 'Net income',
    plain: 'What’s left after paying for everything.',
    eli5: 'After paying for products, people, buildings, interest, and taxes, this is what’s left. If it’s negative, they spent more than they took in — a loss, not a tiny profit. This is the usual meaning of “did they make money?”',
    whyMissing: 'Rare. If it’s missing, the 10-K used a tag we don’t read (or the period doesn’t line up with revenue).',
    tags: 'NetIncomeLoss',
    unit: 'USD',
    kind: 'duration',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'NetIncomeLoss' },
      { taxonomy: 'ifrs-full', tag: 'ProfitLossAttributableToOwnersOfParent' },
      { taxonomy: 'ifrs-full', tag: 'ProfitLoss' },
    ],
  },
  {
    key: 'gross_profit',
    label: 'Gross profit',
    plain: 'Sales minus the cost of the stuff sold.',
    eli5: 'Take revenue, subtract what it cost to make or buy the actual product (ingredients, merchandise). Don’t subtract ads, engineers, or rent yet. A bakery’s flour is here; the baker’s salary usually isn’t. Banks and insurers often skip this because they don’t sell things off a shelf.',
    whyMissing: 'Banks, insurers, and many service companies never tag this. Some retailers have only a stale old number — we treat that as missing, not as this year’s figure.',
    tags: 'GrossProfit',
    unit: 'USD',
    kind: 'duration',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'GrossProfit' },
      { taxonomy: 'ifrs-full', tag: 'GrossProfit' },
    ],
  },
  {
    key: 'operating_income',
    label: 'Operating income',
    plain: 'Profit from the regular business, before interest and tax.',
    eli5: 'Imagine the company as a shop: this is profit from running the shop, before loan interest and taxes. It ignores one-off finance stuff. If this is healthy but net income isn’t, interest or taxes (or a one-time hit) ate the difference.',
    whyMissing: 'Some filers jump from revenue to net income without tagging operating profit — common in financials.',
    tags: 'OperatingIncomeLoss',
    unit: 'USD',
    kind: 'duration',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'OperatingIncomeLoss' },
      { taxonomy: 'ifrs-full', tag: 'ProfitLossFromOperatingActivities' },
    ],
  },
  {
    key: 'assets',
    label: 'Total assets',
    plain: 'Everything the company owns on that day.',
    eli5: 'The whole toy box on one day: cash, buildings, patents, inventory, and money customers still owe. It is not “how much the company is worth on the stock market.” A bank’s toy box is mostly loans; a retailer’s is stores and stuff on shelves.',
    whyMissing: 'Almost every 10-K tags this. If it’s blank, the period didn’t match the latest revenue year.',
    tags: 'Assets',
    unit: 'USD',
    kind: 'instant',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'Assets' },
      { taxonomy: 'ifrs-full', tag: 'Assets' },
    ],
  },
  {
    key: 'liabilities',
    label: 'Total liabilities',
    plain: 'Everything it owes on that day.',
    eli5: 'All the IOUs: bills, loans, pensions, gift cards people haven’t used. More liabilities isn’t automatically “bad” — a bank is in the business of owing depositors — but it is the other side of the toy box.',
    whyMissing: 'Lots of companies list individual debts but skip the roll-up Liabilities tag. Blank means we didn’t find that roll-up, not that they owe nothing.',
    tags: 'Liabilities',
    unit: 'USD',
    kind: 'instant',
    better: null,
    candidates: [
      { taxonomy: 'us-gaap', tag: 'Liabilities' },
      { taxonomy: 'ifrs-full', tag: 'Liabilities' },
    ],
  },
  {
    key: 'equity',
    label: 'Shareholders’ equity',
    plain: 'What’s left for owners after debts (book value).',
    eli5: 'If they sold the whole toy box and paid every IOU, this is roughly what’s left for the owners. People call it book value. It is not the stock-market price, which is what buyers will pay today.',
    whyMissing: 'Usually tagged. Missing can mean a different equity tag (especially at banks or companies with a deficit).',
    tags: 'StockholdersEquity',
    unit: 'USD',
    kind: 'instant',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'StockholdersEquity' },
      { taxonomy: 'us-gaap', tag: 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest' },
      { taxonomy: 'ifrs-full', tag: 'Equity' },
      { taxonomy: 'ifrs-full', tag: 'EquityAttributableToOwnersOfParent' },
    ],
  },
  {
    key: 'cash',
    label: 'Cash and cash equivalents',
    plain: 'Dollars in the bank on that day.',
    eli5: 'Actual money — and things almost as good as money — sitting there on the balance-sheet day. Not the same as profit (you can be profitable and still short on cash) and not the same as operating cash flow (that’s movement over a year).',
    whyMissing:
      'Not tagged as cash and cash equivalents for this year. After 2018 some filers only tag the combined cash + restricted-cash line; we read that as a fallback, and leave the cell blank if neither tag is present.',
    tags: 'CashAndCashEquivalentsAtCarryingValue, CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    unit: 'USD',
    kind: 'instant',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'CashAndCashEquivalentsAtCarryingValue' },
      { taxonomy: 'us-gaap', tag: 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents' },
      { taxonomy: 'ifrs-full', tag: 'CashAndCashEquivalents' },
    ],
  },
  {
    key: 'cfo',
    label: 'Operating cash flow',
    plain: 'Cash the business generated (or used) this year.',
    eli5: 'Profit is a report card. This is cash that actually moved from running the everyday business — collecting from customers, paying suppliers and workers. A company can show a profit and still burn cash, or the reverse. Banks often look wild here because loans are their product.',
    whyMissing: 'Uncommon. If it’s blank, the cash-flow statement used a tag we don’t read.',
    tags: 'NetCashProvidedByUsedInOperatingActivities',
    unit: 'USD',
    kind: 'duration',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInOperatingActivities' },
      { taxonomy: 'ifrs-full', tag: 'NetCashFlowsFromUsedInOperatingActivities' },
    ],
  },
  {
    key: 'cfi',
    label: 'Investing cash flow',
    plain: 'Cash spent on (or received from) long-term stuff.',
    eli5: 'Money spent buying factories, other companies, or investments — or money received from selling them. Growing companies often show a negative number, which can mean “we bought things,” not “we’re failing.” There isn’t a simple higher-is-better rule.',
    whyMissing: 'Rare. Blank means we didn’t find the investing-activities tag for this year.',
    tags: 'NetCashProvidedByUsedInInvestingActivities',
    unit: 'USD',
    kind: 'duration',
    better: null,
    candidates: [{ taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInInvestingActivities' }],
  },
  {
    key: 'cff',
    label: 'Financing cash flow',
    plain: 'Cash from borrowing, stock, buybacks, or dividends.',
    eli5: 'How they fund the company or pay owners: borrow, repay loans, sell new shares, buy shares back, or pay dividends. Negative often means “we returned cash to lenders or shareholders.” Not a grade by itself.',
    whyMissing: 'Rare. Blank means we didn’t find the financing-activities tag for this year.',
    tags: 'NetCashProvidedByUsedInFinancingActivities',
    unit: 'USD',
    kind: 'duration',
    better: null,
    candidates: [{ taxonomy: 'us-gaap', tag: 'NetCashProvidedByUsedInFinancingActivities' }],
  },
  {
    key: 'eps_diluted',
    label: 'Diluted EPS',
    plain: 'Profit per share, counting extra promised shares.',
    eli5: 'If profit is a cookie jar, this is cookies per slice after counting slices they promised (options, convertibles) that don’t exist yet. Useful for comparing profit across companies of different sizes. It is not the stock price.',
    whyMissing: 'A few filers report only basic EPS, or don’t tag per-share figures.',
    tags: 'EarningsPerShareDiluted',
    unit: 'USD/shares',
    kind: 'duration',
    better: 'higher',
    candidates: [{ taxonomy: 'us-gaap', tag: 'EarningsPerShareDiluted' }],
  },
  {
    key: 'eps_basic',
    label: 'Basic EPS',
    plain: 'Profit per share that already exists.',
    eli5: 'Same cookie-jar idea as diluted EPS, but only counting slices that already exist. Diluted is the stricter (usually smaller) number. Still not a stock price.',
    whyMissing: 'Same as diluted EPS — some 10-Ks skip per-share tags.',
    tags: 'EarningsPerShareBasic',
    unit: 'USD/shares',
    kind: 'duration',
    better: 'higher',
    candidates: [{ taxonomy: 'us-gaap', tag: 'EarningsPerShareBasic' }],
  },
  {
    key: 'shares_out',
    label: 'Shares outstanding',
    plain: 'How many slices the company is cut into.',
    eli5: 'The number of slices. More slices doesn’t mean a bigger pizza — it just means each slice is smaller. EDGAR has no stock price, so we cannot turn this into market cap.',
    whyMissing: 'Sometimes only tagged in a different DEI field we missed, or only in a 10-Q.',
    tags: 'CommonStockSharesOutstanding',
    unit: 'shares',
    kind: 'instant',
    better: null,
    candidates: [
      { taxonomy: 'us-gaap', tag: 'CommonStockSharesOutstanding' },
      { taxonomy: 'dei', tag: 'EntityCommonStockSharesOutstanding' },
    ],
  },
  {
    key: 'long_term_debt',
    label: 'Long-term debt',
    plain: 'Loans they don’t have to pay back this year.',
    eli5: 'Borrowed money due after this year — the slow IOUs. A factory-heavy company often has more than a software company. More debt can mean leverage (amplifies wins and losses), not automatically trouble.',
    whyMissing: 'Coverage is patchy. Many companies put debt in a different tag, or have none. Blank is not $0 of debt.',
    tags: 'LongTermDebt',
    unit: 'USD',
    kind: 'instant',
    better: null,
    candidates: [{ taxonomy: 'us-gaap', tag: 'LongTermDebt' }],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    plain: 'Stuff sitting around waiting to be sold.',
    eli5: 'Goods in warehouses and on shelves. A grocer has lots; a bank or a pure software firm usually has none to report. Lots of inventory can mean a well-stocked store or stuff that isn’t selling — the tag alone can’t tell you which.',
    whyMissing: 'Normal for banks, insurers, and many software/service companies. They don’t stock products.',
    tags: 'InventoryNet',
    unit: 'USD',
    kind: 'instant',
    better: null,
    candidates: [
      { taxonomy: 'us-gaap', tag: 'InventoryNet' },
      { taxonomy: 'ifrs-full', tag: 'Inventories' },
      { taxonomy: 'ifrs-full', tag: 'InventoriesTotal' },
    ],
  },
  {
    key: 'receivables',
    label: 'Receivables',
    plain: 'Money customers owe but haven’t paid yet.',
    eli5: 'IOUs from customers: we already counted the sale in revenue, but the cash hasn’t arrived. Big receivables can mean “we trust customers to pay later” (normal for drug makers and industrial firms). A checkout-only retailer may have little.',
    whyMissing: 'Retailers paid at the register, and some banks, use other tags. Blank isn’t “nobody owes us.”',
    tags: 'AccountsReceivableNetCurrent',
    unit: 'USD',
    kind: 'instant',
    better: null,
    candidates: [
      { taxonomy: 'us-gaap', tag: 'AccountsReceivableNetCurrent' },
      { taxonomy: 'ifrs-full', tag: 'TradeAndOtherCurrentReceivables' },
    ],
  },
  {
    key: 'rd',
    label: 'R&D expense',
    plain: 'Money spent inventing new stuff.',
    eli5: 'What they spent trying to invent the next drug, chip, or feature. A grocery chain may spend almost nothing on this and never tag it. High R&D is a bet on the future, not a grade — it can be brilliant or a money pit.',
    whyMissing: 'Most companies don’t tag it. Typical for retailers, insurers, and restaurants. Tech and pharma usually do.',
    tags: 'ResearchAndDevelopmentExpense',
    unit: 'USD',
    kind: 'duration',
    better: null,
    candidates: [{ taxonomy: 'us-gaap', tag: 'ResearchAndDevelopmentExpense' }],
  },
  {
    key: 'capex',
    label: 'CapEx',
    plain: 'Cash spent on buildings, machines, and equipment.',
    eli5: 'Cash spent on things that last years: a new oven for the bakery, a factory, fiber cable. That’s different from buying flour (that’s the cost of goods). Asset-light software firms often spend little and may not tag it.',
    whyMissing: 'Asset-light companies may not tag equipment purchases. Blank is not proof they spent $0.',
    tags: 'PaymentsToAcquirePropertyPlantAndEquipment',
    unit: 'USD',
    kind: 'duration',
    better: null,
    candidates: [
      { taxonomy: 'us-gaap', tag: 'PaymentsToAcquirePropertyPlantAndEquipment' },
      { taxonomy: 'ifrs-full', tag: 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities' },
    ],
  },
];

export const DERIVED = [
  {
    key: 'gross_margin',
    label: 'Gross margin',
    plain: 'Cents left from each sales dollar after paying for the product.',
    eli5: 'Of every $1 of sales, how many cents remain after paying for the product itself? A software company often keeps a lot; a grocer keeps a little and makes it up on volume. We hide this if gross profit isn’t tagged — never 0%.',
    whyMissing: 'Needs current-year gross profit and revenue. Banks almost never have it; some retailers have a stale gross-profit tag we refuse to use.',
    formula: 'Gross profit ÷ revenue',
    format: 'percent',
    better: 'higher',
    needs: ['gross_profit', 'revenue'],
  },
  {
    key: 'operating_margin',
    label: 'Operating margin',
    plain: 'Cents left from each sales dollar after running the business.',
    eli5: 'Of every $1 of sales, how many cents are left after running the shop, but before interest and tax? This is “how juicy is the regular business?”',
    whyMissing: 'Needs operating income and revenue. Financial companies often skip operating income.',
    formula: 'Operating income ÷ revenue',
    format: 'percent',
    better: 'higher',
    needs: ['operating_income', 'revenue'],
  },
  {
    key: 'net_margin',
    label: 'Net margin',
    plain: 'Cents of actual profit from each sales dollar.',
    eli5: 'Of every $1 customers paid, how many cents are real profit? A huge company can have a tiny margin and still make a pile of money (Walmart). A smaller one can keep 40¢ on the dollar (some software). That’s why we compare both size and margin.',
    whyMissing: 'Needs net income and revenue. If either tag is missing, we don’t invent a percent.',
    formula: 'Net income ÷ revenue',
    format: 'percent',
    better: 'higher',
    needs: ['net_income', 'revenue'],
  },
  {
    key: 'roa',
    label: 'ROA',
    plain: 'Profit compared with everything they own.',
    eli5: 'How much profit they squeezed out of the whole toy box. $8 of profit on $100 of assets is 8% ROA. Asset-heavy businesses (utilities, banks) often look lower than asset-light software even when both are healthy.',
    whyMissing: 'Needs net income and assets.',
    formula: 'Net income ÷ assets',
    format: 'percent',
    better: 'higher',
    needs: ['net_income', 'assets'],
  },
  {
    key: 'roe',
    label: 'ROE',
    plain: 'Profit compared with the owners’ slice.',
    eli5: 'How much profit the owners earned compared with their book-value slice. High ROE can mean a great business — or a company that’s very borrowed, so the owners’ slice is small. Peek at debt too.',
    whyMissing: 'Needs net income and equity. Negative equity makes this unhelpful, so we may skip it.',
    formula: 'Net income ÷ equity',
    format: 'percent',
    better: 'higher',
    needs: ['net_income', 'equity'],
  },
  {
    key: 'debt_equity',
    label: 'Debt / equity',
    plain: 'Borrowed dollars per owner dollar.',
    eli5: 'For each $1 that belongs to owners (on paper), how many dollars are long-term loans? 0.3× is a light backpack; 3× is a heavy one. Lower isn’t always better — some businesses borrow cheaply on purpose — but higher means more leverage.',
    whyMissing: 'Needs long-term debt and equity. About half of filers don’t tag long-term debt the way we look for it.',
    formula: 'Long-term debt ÷ equity',
    format: 'ratio',
    better: 'lower',
    needs: ['long_term_debt', 'equity'],
  },
  {
    key: 'rd_intensity',
    label: 'R&D / sales',
    plain: 'Share of sales spent on research.',
    eli5: 'What fraction of the lemonade money went into inventing new recipes? Drug and chip companies can spend 20–40¢ per dollar. A retailer that doesn’t tag R&D isn’t “0% research” in our table — it’s unknown.',
    whyMissing: 'Needs R&D and revenue. Most Fortune 500 companies never tag R&D.',
    formula: 'R&D ÷ revenue',
    format: 'percent',
    better: null,
    needs: ['rd', 'revenue'],
  },
  {
    key: 'fcf',
    label: 'Free cash flow (approx.)',
    plain: 'Operating cash minus cash spent on equipment.',
    eli5: 'Cash from running the shop, minus cash spent on ovens and factories. Roughly “cash they could return to owners or keep without starving the machines.” It’s approximate: we subtract CapEx as tagged, and we skip it if either piece is missing.',
    whyMissing: 'Needs operating cash flow and CapEx for the same year.',
    formula: 'Operating cash flow − CapEx',
    format: 'usd',
    better: 'higher',
    needs: ['cfo', 'capex'],
  },
  {
    key: 'revenue_yoy',
    label: 'Revenue YoY',
    plain: 'This year’s sales vs last year’s.',
    eli5: 'Did the jar fill up more than last year? +10% means sales grew; −5% means they shrank. A giant growing 5% added more dollars than a small company growing 30%. We need two years of revenue to say this.',
    whyMissing: 'Needs this year’s and last year’s revenue. A first-year or messy restatement can leave a gap.',
    formula: 'This year’s revenue ÷ last year’s − 1',
    format: 'percent',
    signed: true,
    better: 'higher',
    needs: ['revenue'],
  },
  {
    key: 'fcf_margin',
    label: 'FCF margin',
    plain: 'Free cash flow as a share of sales.',
    eli5: 'Of every $1 of sales, how many cents are leftover cash after running the shop and buying the ovens? High means the business throws off cash; negative means operations plus equipment spending used more cash than sales brought in.',
    whyMissing: 'Needs free cash flow (operating cash and CapEx) and revenue.',
    formula: 'FCF ÷ revenue',
    format: 'percent',
    better: 'higher',
    needs: ['cfo', 'capex', 'revenue'],
  },
  {
    key: 'cash_conversion',
    label: 'Cash conversion',
    plain: 'Operating cash per dollar of accounting profit.',
    eli5: 'Profit is a report card; this asks whether that grade showed up in the bank. 1.2× means $1.20 of operating cash per $1 of profit. Well below 1× can mean profit is “on paper.” Banks often look wild here because loans are their product.',
    whyMissing: 'Needs operating cash flow and net income (and net income can’t be zero).',
    formula: 'Operating cash flow ÷ net income',
    format: 'ratio',
    better: 'higher',
    needs: ['cfo', 'net_income'],
  },
  {
    key: 'capex_intensity',
    label: 'CapEx / sales',
    plain: 'Share of sales spent on equipment and buildings.',
    eli5: 'How much of the lemonade money went into new ovens and factories? A railroad spends a lot; a software firm often spends little. Not a grade — it’s a business-model tell.',
    whyMissing: 'Needs CapEx and revenue.',
    formula: '|CapEx| ÷ revenue',
    format: 'percent',
    better: null,
    needs: ['capex', 'revenue'],
  },
  {
    key: 'asset_turnover',
    label: 'Asset turnover',
    plain: 'Sales generated per dollar of assets.',
    eli5: 'If the toy box is everything they own, how many dollars of sales did it produce? A grocer turns assets fast (lots of sales, relatively few assets). A utility is slow (huge plants, slower sales). This is the “productivity” piece of ROE.',
    whyMissing: 'Needs revenue and assets.',
    formula: 'Revenue ÷ assets',
    format: 'ratio',
    better: 'higher',
    needs: ['revenue', 'assets'],
  },
  {
    key: 'leverage',
    label: 'Assets / equity',
    plain: 'How many dollars of assets sit on each owner dollar (DuPont leverage).',
    eli5: 'If owners put in $1, how big is the whole toy box? 2× means half the box is funded by others (debt, deposits, payables). This isn’t “good” or “bad” by itself — it’s the third piece of ROE: margin × turnover × leverage.',
    whyMissing: 'Needs assets and equity. Skip when equity is zero or negative.',
    formula: 'Assets ÷ equity',
    format: 'ratio',
    better: null,
    needs: ['assets', 'equity'],
  },
  {
    key: 'debt_assets',
    label: 'Debt / assets',
    plain: 'Long-term debt as a share of everything owned.',
    eli5: 'What fraction of the toy box is funded by long-term loans? Different from debt/equity, which compares loans to the owners’ slice. Blank if they didn’t tag long-term debt — not proof they owe $0.',
    whyMissing: 'Needs long-term debt and assets. About half of filers skip the long-term-debt tag we look for.',
    formula: 'Long-term debt ÷ assets',
    format: 'percent',
    better: 'lower',
    needs: ['long_term_debt', 'assets'],
  },
  {
    key: 'book_value_ps',
    label: 'Book value / share',
    plain: 'Owners’ equity split across shares.',
    eli5: 'If they sold the toy box, paid the IOUs, and split what was left across every slice, this is one slice. It is not the stock price. Useful next to EPS; useless as a “cheap/expensive” call without a market price (which EDGAR doesn’t have).',
    whyMissing: 'Needs equity and shares outstanding.',
    formula: 'Equity ÷ shares outstanding',
    format: 'per_share',
    better: null,
    needs: ['equity', 'shares_out'],
  },
  {
    key: 'receivables_days',
    label: 'Receivables days',
    plain: 'How many days of sales sit in unpaid customer bills.',
    eli5: 'If customers pay later, sales sit as IOUs. 30 days is “about a month to collect.” A checkout retailer may have almost none; a drug maker may wait longer. Lower usually means cash arrives faster. We skip this if receivables aren’t tagged.',
    whyMissing: 'Needs receivables and revenue. Checkout retailers and some banks use other tags.',
    formula: '365 × receivables ÷ revenue',
    format: 'days',
    better: 'lower',
    needs: ['receivables', 'revenue'],
  },
];

/** Metrics where a smaller number is better (used for compare coloring / percentiles). */
export const LOWER_BETTER = new Set(
  [...METRICS, ...DERIVED].filter((m) => m.better === 'lower').map((m) => m.key)
);

export const GLOSSARY = [
  { term: 'EDGAR', def: 'The SEC’s filing cabinet. Public companies drop annual (10-K) and quarterly (10-Q) reports here. We read the numbered tags, not the PDF prose.' },
  { term: '10-K', def: 'The annual report. Audited numbers plus a long write-up of the business and its risks. Our headline figures come from here.' },
  { term: '10-Q', def: 'The quarterly report. Lighter than a 10-K, still has financial statements. We don’t put 10-Q numbers in this snapshot.' },
  { term: 'Tag / XBRL', def: 'A name glued to a number so a computer can find “Revenue” without reading English. Different industries use different names; that’s why some cards say “not tagged.”' },
  { term: 'CIK', def: 'The SEC’s ID for a company. URLs use a 10-digit padded form (Amazon is 0001018724).' },
  { term: 'Not tagged', def: 'We looked for a current-year number and didn’t find one we trust. It is not a zero. A bank with no inventory tag does not have $0 of soup cans.' },
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
  236: 'Private (Space Exploration Technologies)',
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

export function allDefs() {
  return [...METRICS, ...DERIVED];
}

export function defFor(key) {
  return METRICS.find((m) => m.key === key) || DERIVED.find((d) => d.key === key) || null;
}

export function sourceFor(key) {
  if (METRICS.some((m) => m.key === key)) return 'metric';
  if (DERIVED.some((d) => d.key === key)) return 'ratio';
  return null;
}
