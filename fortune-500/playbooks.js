/**
 * Industry modeling playbooks for Fortune 500.
 * Browser-safe ESM. Used to pick drivers and teach why industries model differently.
 */

export const GOLDEN_RULES = [
  'Build the unit first. One store, one subscriber, one loan — garbage units make garbage models.',
  'Separate volume from price. Don’t let mix hide in a single revenue line.',
  'COGS before gross margin. Overhead allocation kills more models than bad revenue.',
  'Sensitize anything that moves the answer 20%+.',
  'Cash is not earnings. Working capital and capex destroy more companies than losses.',
  'The model is a conversation starter, not a prophecy.',
  'Pat the dogs. The error you’ve been hunting is usually in the cell you’re sure about.',
];

/** Four questions to pick a starting model. Yes chips open that playbook. */
export const DECISION_TREE = [
  {
    n: 1,
    q: 'Does the business earn recurring revenue on a subscription or contract?',
    picks: [{ id: 'saas', label: 'Yes → SaaS / subscription' }],
    no: 'No → continue to Q2',
  },
  {
    n: 2,
    q: 'Is the primary asset physical inventory or a physical plant?',
    picks: [
      { id: 'retail', label: 'Yes, inventory → Retail' },
      { id: 'manufacturing', label: 'Yes, plant → Manufacturing' },
    ],
    no: 'No → continue to Q3',
  },
  {
    n: 3,
    q: 'Is revenue driven by transactions between two or more parties?',
    picks: [{ id: 'marketplace', label: 'Yes → Marketplace / platform' }],
    no: 'No → continue to Q4',
  },
  {
    n: 4,
    q: 'Is the business regulated, capital-intensive, or project-based?',
    picks: [
      { id: 'energy', label: 'Yes → Utility / infrastructure' },
      { id: 'professional', label: 'No → Professional services' },
    ],
    no: '',
  },
];

function T(list) {
  return new Set(list.map((t) => t.toUpperCase()));
}

/**
 * Industry extra. `label` is the English name on the guess card. `what` is one
 * sentence; `origin` is where the default came from (never a 10-K tag).
 */
function extra(key, label, fallback, what, origin) {
  return {
    key,
    name: label,
    label,
    fallback,
    help: what,
    what,
    origin,
    isExtra: true,
    effectMetric: 'revenue',
    effectName: 'revenue',
    effectLead: 'If this driver holds, with the others at their current rates',
  };
}

/**
 * Core practice-model guesses. Same card shape as industry extras: English
 * name, one-sentence what, origin from the 10-K (or blank), live year-5 effect.
 */
export const CORE_ASSUMPTIONS = [
  {
    key: 'revenueGrowth',
    name: 'Sales growth',
    label: 'Sales growth',
    what: 'How fast you think sales grow each year after the last 10-K.',
    filedRatio: 'revenue_yoy',
    originKind: 'growth',
    originNoun: 'sales',
    originMissing: 'The 10-K didn’t tag prior-year sales, so this is blank.',
    effectMetric: 'revenue',
    effectName: 'revenue',
    effectLead: 'If sales grow at this rate each year',
  },
  {
    key: 'netMargin',
    name: 'Net margin',
    label: 'Net margin',
    what: 'The share of each sales dollar left after every cost, interest, and tax.',
    filedRatio: 'net_margin',
    originKind: 'keep',
    originNoun: 'profit',
    originMissing: 'The 10-K didn’t tag net income against sales, so this is blank.',
    effectMetric: 'netIncome',
    effectName: 'net income',
    effectLead: 'If they keep this share of each sales dollar',
  },
  {
    key: 'fcfMargin',
    name: 'FCF margin',
    label: 'FCF margin',
    what: 'Free cash flow as a share of sales — cash from operations minus spending on plants and equipment.',
    filedRatio: 'fcf_margin',
    originKind: 'ofSales',
    originNoun: 'free cash flow',
    originMissing: 'The 10-K didn’t tag operating cash and CapEx together, so this is blank.',
    effectMetric: 'fcf',
    effectName: 'free cash flow',
    effectLead: 'If free cash flow stays this share of sales',
  },
  {
    key: 'grossMargin',
    name: 'Gross margin',
    label: 'Gross margin',
    what: 'Gross profit as a share of sales — what’s left after the cost of what they sold.',
    filedRatio: 'gross_margin',
    originKind: 'ofSales',
    originNoun: 'gross profit',
    originMissing: 'The 10-K didn’t tag gross profit, so this is blank.',
    effectMetric: 'grossProfit',
    effectName: 'gross profit',
    effectLead: 'If gross profit stays this share of sales',
  },
  {
    key: 'operatingMargin',
    name: 'Operating margin',
    label: 'Operating margin',
    what: 'Operating income as a share of sales — profit from the business before interest and tax.',
    filedRatio: 'operating_margin',
    originKind: 'ofSales',
    originNoun: 'operating income',
    originMissing: 'The 10-K didn’t tag operating income, so this is blank.',
    effectMetric: 'operatingIncome',
    effectName: 'operating income',
    effectLead: 'If operating income stays this share of sales',
  },
  {
    key: 'rdIntensity',
    name: 'R&D',
    label: 'R&D',
    what: 'Research and development spending as a share of sales.',
    filedRatio: 'rd_intensity',
    originKind: 'ofSales',
    originNoun: 'R&D',
    originMissing: 'The 10-K didn’t tag R&D, so this is blank.',
    effectMetric: 'rd',
    effectName: 'R&D',
    effectLead: 'If R&D stays this share of sales',
  },
  {
    key: 'capexIntensity',
    name: 'CapEx',
    label: 'CapEx',
    what: 'How much of each sales dollar goes back into plants, equipment, or similar assets.',
    filedRatio: 'capex_intensity',
    originKind: 'ofSales',
    originNoun: 'CapEx',
    originMissing: 'The 10-K didn’t tag CapEx, so this is blank.',
    effectMetric: 'capex',
    effectName: 'CapEx',
    effectLead: 'If CapEx stays this share of sales',
  },
];

export function assumptionFields(playbook) {
  return [...CORE_ASSUMPTIONS, ...(playbook?.extras || [])];
}

export const PLAYBOOKS = [
  {
    id: 'generic',
    label: 'Generic P&L',
    subtitle: 'Revenue growth × margins — when no industry template fits',
    intro: 'Year 0 is the 10-K. You choose growth and keep-the-dollar rates. Missing tags stay blank.',
    formula: 'Rev_t = Rev_0 × (1+g)^t\nNI_t = Rev_t × net margin\nFCF_t = Rev_t × FCF margin',
    quote: 'Start simple. Add industry drivers only when they change the answer.',
    growthKind: 'plain',
    extras: [],
    inputs: ['Revenue growth', 'Gross / net / FCF margin', 'Anything that moves the answer 20%+'],
    metrics: ['Growth', 'Margins', 'Cash conversion'],
    subs: [],
    tickers: T([]),
    names: [],
  },
  {
    id: 'retail',
    label: 'Retail & e-commerce',
    subtitle: 'Volume × margin — same-store sales, inventory turns, shrink',
    intro: 'Retail lives on traffic × conversion × basket. Split growth into comparable sales vs new space so a 10% jump from new stores does not look like productivity.',
    formula: 'Revenue = Stores × Avg Revenue/Store\nSame-store growth = (Rev_t − Rev_t-1) / Rev_t-1  [same cohort]\nGross margin = Revenue − COGS (incl. shrink + inbound freight)\nEBITDA = Gross margin − Opex (occupancy + labor + marketing)',
    quote: 'Same-store sales is the number that actually matters — everything else is noise.',
    growthKind: 'comp_unit',
    extras: [
      extra(
        'compGrowth',
        'Same-store sales',
        0.03,
        'Sales growth at stores that were already open last year, not from opening new ones.',
        'The 10-K doesn’t tag same-store sales, so the retail model starts at 3%.'
      ),
      extra(
        'unitGrowth',
        'New stores',
        0.02,
        'How fast the store base grows after openings and closures.',
        'The 10-K doesn’t tag store count, so the retail model starts at 2%.'
      ),
    ],
    inputs: [
      'Store count (opens, closures)',
      'Traffic / footfall per store',
      'Conversion rate',
      'Average order value (AOV)',
      'Inventory turnover ratio',
      'Shrink rate (theft + damage)',
      'Occupancy as % of sales',
    ],
    metrics: [
      'Comparable store sales growth',
      'Gross margin %',
      'Inventory days on hand',
      'Sales per square foot',
      'EBITDAR (before rent)',
      'Return on net assets (RONA)',
      'E-comm penetration %',
    ],
    subs: ['grocery & supermarket', 'apparel & specialty', 'direct-to-consumer (DTC)', 'big box / warehouse club', 'marketplaces (Amazon, eBay)'],
    tickers: T(['WMT', 'COST', 'TGT', 'HD', 'LOW', 'KR', 'DG', 'DLTR', 'TJX', 'ROST', 'BBY', 'DGX', 'WBA', 'CVS', 'SYY', 'ACI', 'CASY', 'TSCO', 'ORLY', 'AZO', 'AAP']),
    names: ['walmart', 'costco', 'target', 'home depot', 'lowe', 'kroger', 'dollar', 'tjx', 'ross', 'best buy', 'grocery', 'supermarket'],
  },
  {
    id: 'hospitality',
    label: 'Hospitality & hotels',
    subtitle: 'RevPAR × rooms — ADR, occupancy, GOP margin',
    intro: 'Once the building is paid for, the extra cost of filling a room is tiny. Occupancy and rate (ADR) swing profit hard. We proxy RevPAR growth as occupancy × ADR.',
    formula: 'RevPAR = Occupancy × Average Daily Rate (ADR)\nRevenue = Available rooms × RevPAR × 365\nGOP margin = (Revenue − Dept. expenses) / Revenue\nNOI = GOP − Fixed charges (mgmt fees, insurance, taxes)',
    quote: 'If RevPAR is growing, everything else can be fixed. If it is declining, no cost cut saves you.',
    growthKind: 'comp_unit',
    extras: [
      extra(
        'compGrowth',
        'Occupancy change',
        0.01,
        'How much more or less of the hotel is filled versus last year — not the occupancy level itself.',
        'The 10-K doesn’t tag occupancy, so the hotel model starts at 1%.'
      ),
      extra(
        'unitGrowth',
        'Room rate (ADR)',
        0.03,
        'How fast the average daily room rate rises.',
        'The 10-K doesn’t tag average daily rate, so the hotel model starts at 3%.'
      ),
    ],
    inputs: [
      'Occupancy rate by segment',
      'Average daily rate (ADR)',
      'F&B and ancillary revenue per key',
      'Labor hours per occupied room',
      'Seasonality curves',
      'Capital reserves (FF&E)',
    ],
    metrics: [
      'RevPAR & RevPAR index vs. comp set',
      'GOP margin',
      'TRevPAR (total revenue per available room)',
      'Cost per occupied room (CPOR)',
      'NOI',
      'Channel mix (OTA vs. direct)',
    ],
    subs: ['full-service hotels', 'limited-service / extended stay', 'resorts & casinos', 'serviced apartments'],
    tickers: T(['MAR', 'HLT', 'H', 'WH', 'CHH', 'IHG']),
    names: ['marriott', 'hilton', 'hyatt', 'hotel', 'hospitality'],
  },
  {
    id: 'restaurants',
    label: 'Restaurants',
    subtitle: 'Unit economics × store count — prime cost, AUV, 4-wall EBITDA',
    intro: 'Build one four-wall P&L, then layer openings. Prime costs (food + labor) need to stay below ~65% to leave room for occupancy and overhead. Comp sales vs new units is the same split as retail.',
    formula: 'AUV = Covers × Average check × Operating days\nPrime cost % = (Food + Labor) / Revenue\n4-wall EBITDA = Revenue − Food − Labor − Occupancy − Other OpEx\nSystem revenue = AUV × Units',
    quote: 'Four-wall EBITDA is the real signal — strip corporate overhead and see if the restaurant makes money.',
    growthKind: 'comp_unit',
    extras: [
      extra(
        'compGrowth',
        'Same-restaurant sales',
        0.03,
        'Sales growth at restaurants that were already open, not from new locations.',
        'The 10-K doesn’t tag comparable restaurant sales, so this model starts at 3%.'
      ),
      extra(
        'unitGrowth',
        'New restaurants',
        0.04,
        'How fast the restaurant count grows after openings and closures.',
        'The 10-K doesn’t tag unit count, so this model starts at 4%.'
      ),
    ],
    inputs: [
      'Average unit volume (AUV) by vintage',
      'Food cost as % of revenue',
      'Labor cost % (front / back of house)',
      'New unit opening schedule',
      'Franchise vs. company-owned mix',
      'Delivery / takeout % of sales',
    ],
    metrics: [
      'Comparable restaurant sales growth',
      'Prime cost %',
      '4-wall EBITDA margin',
      'Restaurant-level operating margin',
      'Payback period per new unit',
      'Royalty revenue (franchised)',
    ],
    subs: ['QSR / fast food', 'fast casual', 'full-service dining', 'food manufacturing / CPG', 'ghost kitchens'],
    tickers: T(['MCD', 'SBUX', 'CMG', 'YUM', 'DRI', 'QSR', 'DPZ', 'WING', 'TXRH', 'CAVA', 'WEN']),
    names: ['mcdonald', 'starbucks', 'chipotle', 'restaurant', 'pizza', 'diner'],
  },
  {
    id: 'saas',
    label: 'SaaS & subscription',
    subtitle: 'ARR waterfall — churn cohorts, NRR, CAC payback, Rule of 40',
    intro: 'Treat last 10-K revenue as a stand-in for ARR (EDGAR does not tag ARR). Ending ≈ beginning × NRR + new bookings. Unit economics (LTV / CAC) decide whether growth spend is worth it.',
    formula: 'Net new ARR = New + Expansion − Contraction − Churn\nNRR = (Beginning + Expansion − Contraction − Churn) / Beginning\nCAC payback = CAC / (ACV × Gross margin %)\nRule of 40 = Revenue growth % + FCF margin %',
    quote: 'New ARR − churned ARR = net new ARR. Simple until cohorts mature and retention is terrible.',
    growthKind: 'nrr',
    extras: [
      extra(
        'nrr',
        'Net revenue retention',
        1.1,
        'How much existing customers spend this year versus last year. Above 100% means they expanded; below 100% means the base is shrinking.',
        'The 10-K doesn’t tag retention, so the SaaS model starts at 110%.'
      ),
      extra(
        'newArrRate',
        'New bookings',
        0.08,
        'Brand-new sales this year, as a share of last year’s revenue.',
        'The 10-K doesn’t tag new bookings, so the SaaS model starts at 8%.'
      ),
    ],
    inputs: [
      'Opening ARR by customer cohort',
      'Gross churn rate (logo & dollar)',
      'Expansion rate (upsell / cross-sell)',
      'New logo bookings pipeline',
      'Sales capacity (quota-carrying reps)',
      'Sales cycle length',
    ],
    metrics: [
      'Annual Recurring Revenue (ARR)',
      'Net Revenue Retention (NRR)',
      'CAC payback period',
      'LTV:CAC ratio',
      'Rule of 40',
      'Gross margin %',
      'Magic Number (sales efficiency)',
    ],
    subs: ['B2B enterprise SaaS', 'PLG / product-led growth', 'usage-based pricing', 'consumer subscriptions', 'vertical SaaS'],
    tickers: T(['MSFT', 'ORCL', 'CRM', 'ADBE', 'NOW', 'INTU', 'IBM', 'SNPS', 'CDNS', 'WDAY', 'ADSK', 'FTNT', 'PANW', 'CRWD', 'DDOG', 'SNOW', 'TEAM', 'SPLK']),
    names: ['microsoft', 'oracle', 'salesforce', 'adobe', 'servicenow', 'intuit', 'software'],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing & industrial',
    subtitle: 'Volume × overhead absorption — utilization, capex intensity, ROCE',
    intro: 'Fixed overhead means volume swings move margin more than price sometimes does. A 10% volume drop can cut gross margin in half even if prices hold. Split growth into volume vs price and watch capex intensity.',
    formula: 'Revenue = Volume × Average selling price\nCOGS = Variable cost/unit × Volume + Fixed overhead\nOH absorption variance = (Actual vol − Budget vol) × Std OH rate/unit\nROCE = EBIT / Capital employed',
    quote: 'A plant at 60% utilization burns cash. The same plant at 85% prints money.',
    growthKind: 'volume_price',
    extras: [
      extra(
        'volumeGrowth',
        'Volume growth',
        0.03,
        'Growth in units produced or shipped, not in the selling price.',
        'The 10-K doesn’t tag unit volume, so this model starts at 3%.'
      ),
      extra(
        'priceGrowth',
        'Price and mix',
        0.02,
        'Growth from a higher average selling price or a richer mix of products.',
        'The 10-K doesn’t tag price/mix, so this model starts at 2%.'
      ),
    ],
    inputs: [
      'Production volume by SKU / product line',
      'Capacity utilization rate',
      'Raw material prices (commodity exposure)',
      'Direct labor hours & wage rates',
      'Maintenance vs. growth capex schedule',
      'Inventory build / drawdown cycles',
    ],
    metrics: [
      'Capacity utilization %',
      'Gross margin by product line',
      'OEE (Overall Equipment Effectiveness)',
      'Inventory days on hand',
      'Capex as % of revenue',
      'EBITDA / CapEx coverage',
      'ROCE',
    ],
    subs: ['automotive OEM & tier 1', 'aerospace & defense', 'chemicals & materials', 'industrial equipment'],
    tickers: T(['CAT', 'DE', 'GE', 'HON', 'MMM', 'BA', 'LMT', 'RTX', 'GD', 'NOC', 'EMR', 'ETN', 'ITW', 'PH', 'ROK', 'CMI', 'PCAR', 'F', 'GM', 'TSLA']),
    names: ['caterpillar', 'boeing', 'lockheed', 'general motors', 'ford', 'industrial', 'aerospace', 'automotive'],
  },
  {
    id: 'banking',
    label: 'Banks',
    subtitle: 'Balance sheet first — loan growth, NIM, credit losses, CET1',
    intro: 'Banks are not a normal P&L. Assets earn a spread; deposits fund them. We grow assets (loan book proxy) and apply last 10-K ROA. Revenue still grows with the book. Every assumption has a regulatory constraint attached.',
    formula: 'NII = Interest income (loans × yield) − Interest expense (deposits × cost)\nNIM = NII / Average earning assets\nPPNR = NII + Fees − Non-interest expense\nNI = PPNR − Provision − Tax\nCET1 = Common Equity Tier 1 / Risk-weighted assets',
    quote: 'Get the balance sheet right first. Revenue is a spread, not a product sale.',
    growthKind: 'loan',
    niMode: 'roa',
    extras: [
      extra(
        'loanGrowth',
        'Loan growth',
        0.04,
        'How fast the loan book (and with it, the balance sheet) grows.',
        'The 10-K doesn’t tag a single loan-growth figure, so the bank model starts at 4%.'
      ),
    ],
    inputs: [
      'Loan growth by portfolio (commercial, consumer, mortgage)',
      'Deposit mix & beta (rate sensitivity)',
      'Yield curve assumptions',
      'Net charge-off rate by vintage',
      'Allowance for loan losses (ACL)',
      'Fee income drivers (cards, wealth mgmt)',
    ],
    metrics: [
      'Net Interest Margin (NIM)',
      'Efficiency ratio (Opex / Revenue)',
      'Return on Assets (ROA)',
      'Return on Equity (ROE)',
      'CET1 capital ratio',
      'Non-performing loan (NPL) ratio',
    ],
    subs: ['commercial banking', 'investment banking', 'asset management', 'credit unions / community banks', 'fintech lending'],
    tickers: T(['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'USB', 'PNC', 'TFC', 'COF', 'SCHW', 'BK', 'STT', 'FITB', 'KEY', 'CFG', 'RF', 'HBAN', 'MTB', 'NTRS', 'DFS']),
    names: ['bank', 'goldman', 'morgan stanley', 'wells fargo', 'citigroup', 'capital one', 'discover'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare & hospitals',
    subtitle: 'Payor mix × volume — contractual adjustments, CMI, labor intensity',
    intro: 'Net patient revenue is volume × mix × rate. Gross charges are fiction — Medicare, Medicaid, and commercial pay very different cents on the dollar. Always model net patient revenue, never gross.',
    formula: 'Gross revenue = Discharges × CMI × Gross charge/CMI-adj case\nNet patient revenue = Gross × (1 − Contractual adj %) × (1 − Bad debt %)\nOperating margin = (NPR + Other − OpEx) / Total revenue\nDays cash on hand = Cash / (Operating expenses / 365)',
    quote: 'Who’s in the waiting room determines the margin more than how busy you are.',
    growthKind: 'volume_price',
    extras: [
      extra(
        'volumeGrowth',
        'Patient volume',
        0.02,
        'Growth in discharges, members, or visits — how many people you serve.',
        'The 10-K doesn’t tag volume, so this model starts at 2%.'
      ),
      extra(
        'priceGrowth',
        'Price and payor mix',
        0.03,
        'Growth from reimbursement rates and which insurers you bill, not the sticker charge.',
        'The 10-K doesn’t tag payor mix, so this model starts at 3%.'
      ),
    ],
    inputs: [
      'Discharges / patient days by service line',
      'Payor mix (Medicare, Medicaid, commercial, self-pay)',
      'Case mix index (CMI)',
      'Reimbursement rates by payor',
      'Bad debt & charity care %',
      'Employed physician headcount',
    ],
    metrics: [
      'Operating margin',
      'Days cash on hand',
      'Case mix index (CMI)',
      'Labor as % of net revenue',
      'Adjusted discharges YoY',
      'EBITDA / operating EBITDA',
    ],
    subs: ['acute care hospitals', 'physician practices', 'post-acute / skilled nursing', 'ambulatory surgery centers'],
    tickers: T(['UNH', 'ELV', 'CI', 'HUM', 'CNC', 'MOH', 'HCA', 'UHS', 'THC', 'DVA', 'HIMS']),
    names: ['unitedhealth', 'elevance', 'cigna', 'humana', 'hospital', 'health'],
  },
  {
    id: 'energy',
    label: 'Energy & utilities',
    subtitle: 'Rate base × allowed ROE, or volume × commodity',
    intro: 'Regulated utilities earn on rate base — the regulator is a silent partner. Merchant names swing with volume and price. Capex intensity is the cash tell either way.',
    formula: 'Rate base = Net utility plant + WC + Other allowed assets\nAllowed revenue = Rate base × (Equity% × ROE + Debt% × Rate) + O&M recovery\nMerchant revenue = MWh × Power price − (Heat rate × Gas price)\nSpark spread = Power price − (Heat rate × Gas price)\nFFO/Debt = (NI + D&A + Deferred tax) / Total debt',
    quote: 'The regulator is a silent partner. Capex is the other one.',
    growthKind: 'loan',
    extras: [
      extra(
        'loanGrowth',
        'Rate base / volume',
        0.04,
        'Allowed growth in the regulated capital base, or produced volume for merchant names.',
        'The 10-K doesn’t tag rate-base growth as one number, so this model starts at 4%.'
      ),
    ],
    inputs: [
      'Rate base growth (capital additions)',
      'Allowed return on equity (ROE)',
      'Volume (MWh, therms, gallons)',
      'Commodity prices (gas, coal, power)',
      'O&M cost escalation rate',
      'Rate case outcomes & timing',
    ],
    metrics: [
      'Rate base growth %',
      'EPS growth',
      'FFO / Debt ratio',
      'CapEx as % of rate base',
      'Dividend payout ratio',
      'Spark spread / dark spread',
    ],
    subs: ['electric utilities', 'gas distribution', 'renewable energy (wind / solar)', 'water utilities'],
    tickers: T(['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'OXY', 'WMB', 'KMI', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'PEG', 'ED', 'XEL', 'WEC']),
    names: ['exxon', 'chevron', 'utility', 'electric', 'energy', 'oil', 'gas'],
  },
  {
    id: 'pharma',
    label: 'Pharma & biotech',
    subtitle: 'Volume × net price — patent cliffs, gross-to-net, R&D',
    intro: 'Cash cows plus a binary pipeline. Probability-weight pipeline assets and watch patent cliffs. Gross-to-net (rebates, chargebacks) can cut sticker price 30–50%. We split growth into volume vs net price and keep R&D / sales in the sheet.',
    formula: 'Product revenue = Patients × Treatment rate × Price × Gross-to-net\nPipeline NPV = Σ [Peak sales × PoS × Patent-life NPV]\nR&D = % of revenue or budget-driven\nEPS = (Rev − COGS − SG&A − R&D ± Other) × (1 − tax) / Shares',
    quote: 'Pipeline value is probability-weighted. The rest is details.',
    growthKind: 'volume_price',
    extras: [
      extra(
        'volumeGrowth',
        'Patient volume',
        0.04,
        'Growth in treated patients or units sold.',
        'The 10-K didn’t tag patient volume, so this model starts at 4%.'
      ),
      extra(
        'priceGrowth',
        'Net price',
        0.02,
        'Growth in price after rebates and discounts (gross-to-net).',
        'The 10-K didn’t tag net price, so this model starts at 2%.'
      ),
    ],
    inputs: [
      'Patient population & penetration rate',
      'Net price (after rebates / gross-to-net)',
      'Patent cliff dates by product',
      'Generic erosion curve',
      'Pipeline PoS (probability of success)',
      'R&D budget & pipeline spend',
    ],
    metrics: [
      'Revenue by product & geography',
      'Gross-to-net adjustment %',
      'R&D spend as % of revenue',
      'EBITDA margin (ex-R&D)',
      'Pipeline probability-weighted NPV',
      'Days sales outstanding (DSO)',
    ],
    subs: ['large-cap pharma', 'biotech (pre-revenue)', 'specialty pharma', 'CROs / CDMOs'],
    tickers: T(['JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'ABT', 'TMO', 'DHR', 'SYK', 'MDT', 'ISRG', 'REGN', 'VRTX', 'BIIB']),
    names: ['johnson', 'pfizer', 'merck', 'abbvie', 'lilly', 'pharma', 'biotech', 'therapeutics'],
  },
  {
    id: 'telecom',
    label: 'Telecom',
    subtitle: 'Subscribers × ARPU — churn, capex intensity, net debt / EBITDA',
    intro: 'Service revenue is subs × ARPU. Capex (spectrum, fiber, towers) can eat FCF for years even when EBITDA looks fine. The question is whether ARPU grows faster than churn.',
    formula: 'Revenue = Subscribers × ARPU\nService revenue = Post-paid + Pre-paid + Enterprise + Wholesale\nEBITDA = Revenue − Network costs − SG&A (excl. D&A)\nFCF proxy = EBITDA − CapEx\nChurn = Churned subs / Opening subs',
    quote: 'Is ARPU growing faster than churn? If no, you are a declining annuity.',
    growthKind: 'volume_price',
    extras: [
      extra(
        'volumeGrowth',
        'Subscriber growth',
        0.01,
        'Change in the subscriber base after adds and disconnects.',
        'The 10-K didn’t tag net adds as a growth rate, so this model starts at 1%.'
      ),
      extra(
        'priceGrowth',
        'ARPU growth',
        0.02,
        'How fast average revenue per user (what each subscriber pays) rises.',
        'The 10-K didn’t tag ARPU, so this model starts at 2%.'
      ),
    ],
    inputs: [
      'Subscriber net adds by tier',
      'ARPU by plan mix',
      'Monthly churn rate',
      'Handset subsidy & device financing',
      'Network capex schedule',
      'Spectrum auction costs',
    ],
    metrics: [
      'Revenue generating units (RGUs)',
      'ARPU & ARPA',
      'Monthly churn %',
      'EBITDA margin',
      'CapEx intensity (CapEx / Revenue)',
      'Net debt / EBITDA',
    ],
    subs: ['wireless carriers', 'broadband / cable', 'tower companies / REITs', 'enterprise telecom / UCaaS'],
    tickers: T(['T', 'VZ', 'TMUS', 'CHTR', 'CMCSA', 'LUMN', 'FYBR']),
    names: ['at&t', 'verizon', 't-mobile', 'charter', 'comcast', 'telecom', 'wireless'],
  },
  {
    id: 'marketplace',
    label: 'Marketplaces & platforms',
    subtitle: 'GMV × take rate — liquidity, buyer LTV, contribution margin',
    intro: 'GMV is the merchandise; take rate is what the platform keeps. Take rate often compresses as you scale. EDGAR only has the kept revenue. Growing GMV (low prices / subsidies) fights improving take rate (more value-add).',
    formula: 'GMV = Active buyers × Orders/buyer × AOV\nRevenue = GMV × Take rate\nContribution margin = Revenue − Variable COGS − S&M − Incentives\nLiquidity = Supply × Demand conversion',
    quote: 'Model take rate as something that can fall while GMV rises.',
    growthKind: 'comp_unit',
    extras: [
      extra(
        'compGrowth',
        'GMV growth',
        0.12,
        'Growth in gross merchandise value — the total goods that flow through the platform.',
        'The 10-K doesn’t tag GMV, so the marketplace model starts at 12%.'
      ),
      extra(
        'unitGrowth',
        'Take-rate change',
        -0.01,
        'How the platform’s cut of GMV changes. Negative means you keep a smaller share.',
        'The 10-K doesn’t tag take rate, so this model starts at −1%.'
      ),
    ],
    inputs: [
      'Active buyer & seller counts',
      'Orders per buyer',
      'Average order value (AOV)',
      'Take rate by category',
      'Buyer & seller acquisition cost',
      'Incentive spend (promos, subsidies)',
    ],
    metrics: [
      'GMV growth %',
      'Take rate %',
      'Active buyer & seller counts',
      'Contribution margin per transaction',
      'Buyer LTV',
      'Liquidity score (fill rate)',
    ],
    subs: ['gig economy / rides', 'B2B procurement marketplaces', 'real estate platforms', 'financial marketplaces'],
    tickers: T(['AMZN', 'EBAY', 'ETSY', 'UBER', 'LYFT', 'ABNB', 'BKNG', 'EXPE', 'DASH']),
    names: ['amazon', 'uber', 'airbnb', 'booking', 'marketplace', 'platform'],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    subtitle: 'Combined ratio + float — loss ratio, expense ratio, investment income',
    intro: 'Premiums now, claims later. Combined ratio > 100% means underwriting loses money and float has to work. Below 100% means you get paid to hold other people’s money. We grow premiums and keep net margin as the 10-K stand-in for underwriting + investment.',
    formula: 'NPW = Gross − Ceded (to reinsurers)\nCombined ratio = (Losses + LAE + Underwriting expenses) / Earned premiums\nNI = Underwriting income + Net investment income + Realized gains − Tax\nInvestment income = Float × Yield',
    quote: 'Float is the other P&L. Combined ratio says whether you get paid to hold it.',
    growthKind: 'loan',
    extras: [
      extra(
        'loanGrowth',
        'Premium growth',
        0.05,
        'Growth in premiums from policies and rates, not from investment income.',
        'The 10-K doesn’t tag a single premium-growth driver, so this model starts at 5%.'
      ),
    ],
    inputs: [
      'Policy count & retention rate',
      'Average premium per policy',
      'Loss ratio by line of business',
      'Expense ratio',
      'Investment portfolio yield',
      'Reinsurance structure & cost',
    ],
    metrics: [
      'Combined ratio',
      'Loss ratio',
      'Expense ratio',
      'Return on equity (ROE)',
      'Premium growth %',
      'Solvency II / RBC ratio',
    ],
    subs: ['P&C (property & casualty)', 'life & annuities', 'reinsurance', 'insurtech'],
    tickers: T(['PGR', 'ALL', 'AIG', 'MET', 'PRU', 'AFL', 'TRV', 'CB', 'HIG', 'CINF', 'WRB', 'L', 'AON', 'MMC', 'AJG']),
    names: ['insurance', 'progressive', 'allstate', 'metlife', 'prudential', 'aetna'],
  },
  {
    id: 'media',
    label: 'Media & advertising',
    subtitle: 'Audience × monetization — CPM, subscriber ARPU, content cost',
    intro: 'Audience first, then price. Streaming is subs × ARPU; ads are impressions × CPM. Content cost is the swing that can wreck an otherwise-healthy margin. We split growth into audience vs rate.',
    formula: 'Ad revenue = Impressions (000s) × CPM / 1000\nDigital ads = Sessions × Pages/session × Fill rate × CPM\nSub revenue = Subscribers × ARPU\nLicensing = Content hours × License rate per hour',
    quote: 'Audiences are the hard forecast. Monetization is the second one.',
    growthKind: 'volume_price',
    extras: [
      extra(
        'volumeGrowth',
        'Audience growth',
        0.04,
        'Growth in users, subscribers, or impressions.',
        'The 10-K doesn’t tag audience as one rate, so this model starts at 4%.'
      ),
      extra(
        'priceGrowth',
        'ARPU / CPM growth',
        0.02,
        'Growth in how much you earn per user or per thousand ads.',
        'The 10-K doesn’t tag ARPU or CPM, so this model starts at 2%.'
      ),
    ],
    inputs: [
      'Monthly active users / unique visitors',
      'Engagement (time spent, pages per visit)',
      'CPM / CPC by channel',
      'Subscriber count & churn',
      'Content spend budget',
      'Upfront vs. scatter advertising mix',
    ],
    metrics: [
      'ARPU (ad + subscription combined)',
      'CPM trends by format',
      'Subscriber count & NRR',
      'Content cost per hour',
      'Audience retention & engagement',
      'EBITDA (content amortization excluded)',
    ],
    subs: ['streaming (SVOD / AVOD)', 'social media platforms', 'digital publishing', 'traditional broadcast & print'],
    tickers: T(['DIS', 'NFLX', 'WBD', 'PARA', 'FOX', 'NWSA', 'NYT', 'LYV', 'SPOT', 'ROKU']),
    names: ['disney', 'netflix', 'paramount', 'warner', 'media', 'news'],
  },
  {
    id: 'professional',
    label: 'Professional services',
    subtitle: 'Headcount × utilization × bill rate — pyramid leverage, DSO',
    intro: 'People model. Below ~70% utilization you burn cash; above ~85% you burn people. The pyramid (partners leverage juniors) is the margin. Attrition is an operating risk, not just HR.',
    formula: 'Revenue = Billable headcount × Avg bill rate × Utilization × Working days\nUtilization = Billable hours / Total available hours\nGross margin = Revenue − Direct staff cost (incl. benefits)\nEBITDA = Gross margin − Overhead (facilities, G&A, BD)',
    quote: 'If utilization drops below 70%, you are burning cash.',
    growthKind: 'services',
    extras: [
      extra(
        'headcountGrowth',
        'Headcount growth',
        0.05,
        'How many more billable people you add, which is the main volume driver in a people business.',
        'The 10-K doesn’t tag billable headcount, so this model starts at 5%.'
      ),
      extra(
        'utilDelta',
        'Utilization change',
        0,
        'How much more or less of people’s time is billed — the change, not the utilization level.',
        'The 10-K doesn’t tag utilization, so this starts at no change.'
      ),
      extra(
        'rateGrowth',
        'Bill-rate growth',
        0.03,
        'Growth in the average rate you actually collect per hour.',
        'The 10-K doesn’t tag realized bill rate, so this model starts at 3%.'
      ),
    ],
    inputs: [
      'Headcount by level (partner, manager, analyst)',
      'Bill rate by level & market',
      'Target utilization by level',
      'Revenue per partner',
      'Pipeline win rate',
      'Attrition rate by level',
    ],
    metrics: [
      'Utilization rate %',
      'Revenue per FTE',
      'Bill rate realization',
      'Partner leverage ratio',
      'Revenue per partner',
      'Days sales outstanding (DSO)',
    ],
    subs: ['management consulting', 'IT services & outsourcing', 'legal services', 'accounting & audit firms'],
    tickers: T(['ACN', 'IBM', 'CTSH', 'IT', 'EPAM', 'BR', 'PAYX', 'ADP']),
    names: ['accenture', 'cognizant', 'consult', 'staffing'],
  },
  {
    id: 'edtech',
    label: 'EdTech & education',
    subtitle: 'Learners × ARPU — completion rate, CAC, B2B ARR',
    intro: 'Looks like SaaS, but content has high upfront cost and needs refresh. CAC is high (education is a grudge purchase). Completion rates tell you if word-of-mouth will show up. We reuse NRR + new bookings.',
    formula: 'Revenue = (B2C subs × ARPU) + (Enterprise seats × License) + Course sales\nContent COGS = Instructor rev share + Content amortization\nCAC = Marketing / New enrollments\nLTV = ARPU × Avg duration × Gross margin %',
    quote: 'CAC is high. Completion rates tell you if word-of-mouth will show up.',
    growthKind: 'nrr',
    extras: [
      extra(
        'nrr',
        'Net retention',
        1.05,
        'How much existing learners spend this year versus last year.',
        'The 10-K doesn’t tag learner retention, so this model starts at 105%.'
      ),
      extra(
        'newArrRate',
        'New enrollments',
        0.1,
        'New learners or seats this year, as a share of last year’s revenue.',
        'The 10-K doesn’t tag new enrollments, so this model starts at 10%.'
      ),
    ],
    inputs: [
      'New enrollments / subscriber adds',
      'Monthly churn rate',
      'ARPU by plan',
      'Enterprise seat count & ASP',
      'Content production budget',
      'Completion rates by course type',
    ],
    metrics: [
      'Monthly active learners',
      'Course completion rate',
      'Subscriber count & churn',
      'CAC by channel',
      'LTV:CAC ratio',
      'B2B ARR & NRR',
    ],
    subs: ['MOOCs / course marketplaces', 'corporate L&D platforms', 'K-12 ed platforms', 'test prep & certifications'],
    tickers: T(['CHGG', 'COUR', 'DUOL', 'LRN', 'STRA', 'ATGE']),
    names: ['education', 'chegg', 'coursera', 'duolingo'],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    subtitle: 'DAU × ARPDAU — retention curves, payer conversion, LTV:CPI',
    intro: 'Live-service is DAU × ARPDAU. Whales generate most IAP, so whale retention is existential. A 1% improvement in D30 retention can double LTV. We split growth into users vs spend per user.',
    formula: 'Mobile revenue = DAU × ARPDAU\nARPDAU = Paying user % × ARPPU\nPremium revenue = Units sold × ASP\nLTV = D1 × D30 cohort model × ARPDAU\nPayback = CPI / D30 LTV',
    quote: 'How many DAUs pay, and how much? Whales are existential.',
    growthKind: 'volume_price',
    extras: [
      extra(
        'volumeGrowth',
        'Player growth',
        0.05,
        'Growth in daily active users or players.',
        'The 10-K doesn’t tag DAU, so this model starts at 5%.'
      ),
      extra(
        'priceGrowth',
        'Spend per player',
        0.03,
        'Growth in average revenue per daily active user.',
        'The 10-K doesn’t tag ARPDAU, so this model starts at 3%.'
      ),
    ],
    inputs: [
      'Daily active users (DAU) by title',
      'D1 / D7 / D30 retention curves',
      'Conversion rate (free to paying)',
      'ARPPU by spender segment',
      'UA spend & cost per install (CPI)',
      'New title launch schedule',
    ],
    metrics: [
      'DAU / MAU ratio (stickiness)',
      'ARPDAU & ARPPU',
      'Retention curves (D1, D7, D30)',
      'Conversion rate (payers)',
      'LTV:CPI ratio',
      'Revenue by title / franchise',
    ],
    subs: ['mobile free-to-play', 'PC / console (premium)', 'game subscriptions (Game Pass)', 'e-sports & tournament operators'],
    tickers: T(['EA', 'TTWO', 'RBLX', 'NTDOY', 'SONY']),
    names: ['electronic arts', 'take-two', 'roblox', 'activision', 'gaming'],
  },
  {
    id: 'realestate',
    label: 'Real estate & REITs',
    subtitle: 'NOI / cap rate — occupancy × rent; cap rates live outside EDGAR',
    intro: 'NOI is occupancy × rent minus opex. Cap rates (value) are not in EDGAR. If cap rates expand 50 bps and NOI is flat, you just lost a chunk of value. We grow the operating line from occupancy and rent.',
    formula: 'NOI = Gross potential rent − Vacancy & credit loss − Operating expenses\nCap rate = NOI / Value  →  Value = NOI / Cap rate\nCash-on-cash = Annual pre-tax cash flow / Cash invested\nEquity multiple = Total distributions / Equity invested',
    quote: 'If cap rates expand 50 bps and NOI is flat, you just lost a chunk of value.',
    growthKind: 'comp_unit',
    extras: [
      extra(
        'compGrowth',
        'Occupancy change',
        0.01,
        'How much more or less of the property is leased versus last year.',
        'The 10-K doesn’t tag occupancy as a growth rate, so this model starts at 1%.'
      ),
      extra(
        'unitGrowth',
        'Rent growth',
        0.03,
        'Growth in market rent or in the spread between in-place leases and new leases.',
        'The 10-K doesn’t tag rent growth as one driver, so this model starts at 3%.'
      ),
    ],
    inputs: [
      'Occupancy rate & market rent growth',
      'Lease expiration schedule',
      'Cap rate assumption (entry & exit)',
      'Debt terms (LTV, rate, maturity)',
      'Development cost schedule',
      'Tenant credit quality',
    ],
    metrics: [
      'NOI & NOI margin',
      'Cap rate (entry vs. exit)',
      'Debt service coverage ratio (DSCR)',
      'IRR & equity multiple',
      'LTV ratio',
      'FFO / AFFO (for REITs)',
    ],
    subs: ['multifamily / residential', 'office & commercial', 'industrial / logistics', 'retail real estate', 'data centers'],
    tickers: T(['PLD', 'AMT', 'EQIX', 'SPG', 'O', 'PSA', 'WELL', 'DLR', 'CCI', 'EQR', 'AVB', 'VTR', 'ARE', 'BXP']),
    names: ['realty', 'reit', 'properties', 'prologis', 'welltower'],
  },
  {
    id: 'startup',
    label: 'Startups & early-stage',
    subtitle: 'Burn × runway — headcount-driven, scenario planning, unit economics',
    intro: 'A Fortune 500 10-K is not a seed round, but the same skeleton shows up in new divisions: honest bottoms-up cost (headcount is 60–80%), then revenue scenarios. The deliverable is runway — when cash runs out under each case.',
    formula: 'Monthly burn = Operating expenses − Revenue\nRunway = Cash / Monthly burn\nGross burn = Total operating costs\nNet burn = Gross burn − Revenue\nLTV = (ARPU × Gross margin %) / Monthly churn\nCAC payback = CAC / (ARPU × Gross margin %)',
    quote: 'Show how long until you die, and what it takes to not die. Everything else is fiction dressed up as planning.',
    growthKind: 'plain',
    extras: [],
    inputs: [
      'Headcount plan by department & month',
      'Average loaded cost per hire (salary × 1.25)',
      'Revenue pipeline conversion rate',
      'Pilot → paid conversion %',
      'Infrastructure costs (cloud, tools)',
      'Fundraise timing assumptions',
    ],
    metrics: [
      'Monthly burn rate',
      'Cash runway (months)',
      'MoM revenue growth %',
      'CAC payback period',
      'Headcount efficiency (Rev / FTE)',
      'Gross margin % (unit economics)',
    ],
    subs: ['pre-seed / seed', 'Series A (post-PMF)', 'deep tech / hardware', 'consumer apps'],
    tickers: T([]),
    names: [],
  },
];

export function playbookById(id) {
  return PLAYBOOKS.find((p) => p.id === id) || PLAYBOOKS[0];
}

export function industryPlaybooks() {
  return PLAYBOOKS.filter((p) => p.id !== 'generic');
}

export function guessPlaybook(company) {
  const ticker = String(company?.fortune_ticker || company?.sec_ticker || '').toUpperCase();
  const name = `${company?.company || ''} ${company?.sec_name || ''}`.toLowerCase();
  for (const p of PLAYBOOKS) {
    if (p.id === 'generic' || p.id === 'startup') continue;
    if (ticker && p.tickers.has(ticker)) return p;
  }
  for (const p of PLAYBOOKS) {
    if (p.id === 'generic' || p.id === 'startup') continue;
    if (p.names.some((n) => name.includes(n))) return p;
  }
  return playbookById('generic');
}

export function extraDefaults(playbook) {
  const out = {};
  for (const field of playbook?.extras || []) out[field.key] = field.fallback;
  return out;
}

export function playbookDog(playbook) {
  const i = Math.max(0, PLAYBOOKS.findIndex((p) => p.id === playbook?.id));
  return `/ugly-dog-images/dog-${(i % 6) + 1}.png`;
}
