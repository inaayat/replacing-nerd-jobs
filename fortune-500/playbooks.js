/**
 * FP&A industry playbooks, adapted from /archive/fpa-crash-course/.
 * Browser-safe ESM. Used to pick drivers and teach why industries model differently.
 */

export const CRASH_COURSE_URL = '/archive/fpa-crash-course/';

export const GOLDEN_RULES = [
  'Build the unit first. One store, one subscriber, one loan — garbage units make garbage models.',
  'Separate volume from price. Don’t let mix hide in a single revenue line.',
  'COGS before gross margin. Overhead allocation kills more models than bad revenue.',
  'Sensitize anything that moves the answer 20%+.',
  'Cash is not earnings. Working capital and capex destroy more companies than losses.',
  'The model is a conversation starter, not a prophecy.',
];

function T(list) {
  return new Set(list.map((t) => t.toUpperCase()));
}

function extra(key, label, fallback, help) {
  return { key, label, fallback, help };
}

export const PLAYBOOKS = [
  {
    id: 'generic',
    label: 'Generic P&L',
    hash: '',
    subtitle: 'Revenue growth × margins — when no industry template fits',
    intro: 'Year 0 is the 10-K. You choose growth and keep-the-dollar rates. Missing tags stay blank.',
    formula: 'Rev_t = Rev_0 × (1+g)^t\nNI_t = Rev_t × net margin\nFCF_t = Rev_t × FCF margin',
    quote: 'Start simple. Add industry drivers only when they change the answer.',
    growthKind: 'plain',
    extras: [],
    tickers: T([]),
    names: [],
  },
  {
    id: 'retail',
    label: 'Retail & e-commerce',
    hash: '#mod-1',
    subtitle: 'Same-store × new space — volume × margin',
    intro: 'Retail lives on traffic × conversion × basket. Split growth into comparable sales vs new space so a 10% jump from new stores does not look like productivity.',
    formula: 'Revenue ≈ last year × (1 + SSS) × (1 + net new space)\nGross profit = Revenue × gross margin',
    quote: 'Same-store sales is the number that actually matters — everything else is noise.',
    growthKind: 'comp_unit',
    extras: [
      extra('compGrowth', 'Same-store / comp sales %', 0.03, 'Existing cohort, not new stores.'),
      extra('unitGrowth', 'Net new space / stores %', 0.02, 'Opens minus closures, as a % of the base.'),
    ],
    tickers: T(['WMT', 'COST', 'TGT', 'HD', 'LOW', 'KR', 'DG', 'DLTR', 'TJX', 'ROST', 'BBY', 'DGX', 'WBA', 'CVS', 'SYY', 'ACI', 'CASY', 'TSCO', 'ORLY', 'AZO', 'AAP']),
    names: ['walmart', 'costco', 'target', 'home depot', 'lowe', 'kroger', 'dollar', 'tjx', 'ross', 'best buy', 'grocery', 'supermarket'],
  },
  {
    id: 'hospitality',
    label: 'Hospitality & hotels',
    hash: '#mod-2',
    subtitle: 'RevPAR × rooms — occupancy × ADR',
    intro: 'Once the building is paid for, the extra cost of filling a room is tiny. Occupancy and rate (ADR) swing profit hard. We proxy RevPAR growth as occupancy × ADR.',
    formula: 'RevPAR = occupancy × ADR\nRevenue growth ≈ (1 + Δ occupancy) × (1 + ADR growth) − 1',
    quote: 'If RevPAR is growing, everything else can be fixed.',
    growthKind: 'comp_unit',
    extras: [
      extra('compGrowth', 'Occupancy change %', 0.01, 'Change in occupancy rate, not the occupancy level.'),
      extra('unitGrowth', 'ADR growth %', 0.03, 'Average daily rate.'),
    ],
    tickers: T(['MAR', 'HLT', 'H', 'WH', 'CHH', 'IHG']),
    names: ['marriott', 'hilton', 'hyatt', 'hotel', 'hospitality'],
  },
  {
    id: 'restaurants',
    label: 'Restaurants',
    hash: '#mod-3',
    subtitle: 'Unit economics × store count — comps vs new units',
    intro: 'Build one four-wall P&L, then layer openings. Comp sales vs new units is the same split as retail.',
    formula: 'System sales ≈ AUV × units\nGrowth ≈ (1 + comps) × (1 + net new units) − 1',
    quote: 'Four-wall EBITDA is the real signal — strip corporate overhead.',
    growthKind: 'comp_unit',
    extras: [
      extra('compGrowth', 'Comparable restaurant sales %', 0.03, 'Same restaurants, year on year.'),
      extra('unitGrowth', 'Net new units %', 0.04, 'Openings minus closures.'),
    ],
    tickers: T(['MCD', 'SBUX', 'CMG', 'YUM', 'DRI', 'QSR', 'DPZ', 'WING', 'TXRH', 'CAVA', 'WEN']),
    names: ['mcdonald', 'starbucks', 'chipotle', 'restaurant', 'pizza', 'diner'],
  },
  {
    id: 'saas',
    label: 'SaaS & subscription',
    hash: '#mod-4',
    subtitle: 'ARR waterfall — NRR + new bookings',
    intro: 'Treat last 10-K revenue as a stand-in for ARR (EDGAR does not tag ARR). Ending ≈ beginning × NRR + new bookings.',
    formula: 'Net new ≈ beginning × (NRR − 1) + new bookings\nRule of 40 = growth % + FCF margin %',
    quote: 'New ARR − churned ARR = net new ARR. Simple until cohorts mature.',
    growthKind: 'nrr',
    extras: [
      extra('nrr', 'Net revenue retention', 1.1, '1.10 = 110% NRR. Below 1.0 means the base is shrinking.'),
      extra('newArrRate', 'New bookings as % of last year', 0.08, 'Brand-new ARR / last year’s revenue.'),
    ],
    tickers: T(['MSFT', 'ORCL', 'CRM', 'ADBE', 'NOW', 'INTU', 'IBM', 'SNPS', 'CDNS', 'WDAY', 'ADSK', 'FTNT', 'PANW', 'CRWD', 'DDOG', 'SNOW', 'TEAM', 'SPLK']),
    names: ['microsoft', 'oracle', 'salesforce', 'adobe', 'servicenow', 'intuit', 'software'],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing & industrial',
    hash: '#mod-5',
    subtitle: 'Volume × price — utilization and capex',
    intro: 'Fixed overhead means volume swings move margin more than price sometimes does. Split growth into volume vs price and watch capex intensity.',
    formula: 'Revenue = volume × ASP\nGrowth ≈ (1 + Δ volume) × (1 + Δ price) − 1',
    quote: 'A plant at 60% utilization burns cash. The same plant at 85% prints money.',
    growthKind: 'volume_price',
    extras: [
      extra('volumeGrowth', 'Volume growth %', 0.03, 'Units, not dollars.'),
      extra('priceGrowth', 'Price / mix %', 0.02, 'Average selling price and mix.'),
    ],
    tickers: T(['CAT', 'DE', 'GE', 'HON', 'MMM', 'BA', 'LMT', 'RTX', 'GD', 'NOC', 'EMR', 'ETN', 'ITW', 'PH', 'ROK', 'CMI', 'PCAR', 'F', 'GM', 'TSLA']),
    names: ['caterpillar', 'boeing', 'lockheed', 'general motors', 'ford', 'industrial', 'aerospace', 'automotive'],
  },
  {
    id: 'banking',
    label: 'Banks',
    hash: '#mod-6',
    subtitle: 'Balance sheet first — loan growth × ROA',
    intro: 'Banks are not a normal P&L. Assets earn a spread; deposits fund them. We grow assets (loan book proxy) and apply last 10-K ROA. Revenue still grows with the book.',
    formula: 'Assets_t = Assets_0 × (1 + loan growth)^t\nNI_t = Assets_t × ROA\nRevenue tracks the book',
    quote: 'Get the balance sheet right first. Revenue is a spread, not a product sale.',
    growthKind: 'loan',
    niMode: 'roa',
    extras: [
      extra('loanGrowth', 'Loan / asset growth %', 0.04, 'Balance-sheet growth.'),
    ],
    tickers: T(['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'USB', 'PNC', 'TFC', 'COF', 'SCHW', 'BK', 'STT', 'FITB', 'KEY', 'CFG', 'RF', 'HBAN', 'MTB', 'NTRS']),
    names: ['bank', 'goldman', 'morgan stanley', 'wells fargo', 'citigroup', 'capital one'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare & hospitals',
    hash: '#mod-7',
    subtitle: 'Volume × payor mix / price',
    intro: 'Net patient revenue is volume × mix × rate. Gross charges are fiction. We split growth into volume vs price/mix.',
    formula: 'Growth ≈ (1 + volume) × (1 + price/mix) − 1',
    quote: 'Who’s in the waiting room determines the margin more than how busy you are.',
    growthKind: 'volume_price',
    extras: [
      extra('volumeGrowth', 'Volume / utilization %', 0.02, 'Discharges, members, or visits.'),
      extra('priceGrowth', 'Price / payor mix %', 0.03, 'Rate and mix, not sticker price.'),
    ],
    tickers: T(['UNH', 'ELV', 'CI', 'HUM', 'CNC', 'MOH', 'HCA', 'UHS', 'THC', 'DVA', 'HIMS']),
    names: ['unitedhealth', 'elevance', 'cigna', 'humana', 'hospital', 'health'],
  },
  {
    id: 'energy',
    label: 'Energy & utilities',
    hash: '#mod-8',
    subtitle: 'Rate base × allowed ROE, or volume × commodity',
    intro: 'Regulated utilities earn on rate base. Merchant names swing with volume and price. Capex intensity is the cash tell either way.',
    formula: 'Regulated: NI ≈ rate base × allowed ROE\nMerchant: volume × price − fuel',
    quote: 'The regulator is a silent partner. Capex is the other one.',
    growthKind: 'loan',
    extras: [
      extra('loanGrowth', 'Rate base / volume growth %', 0.04, 'Allowed growth in the capital base, or produced volume.'),
    ],
    tickers: T(['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'OXY', 'WMB', 'KMI', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'PEG', 'ED', 'XEL', 'WEC']),
    names: ['exxon', 'chevron', 'utility', 'electric', 'energy', 'oil', 'gas'],
  },
  {
    id: 'pharma',
    label: 'Pharma & biotech',
    hash: '#mod-9',
    subtitle: 'Volume × net price — R&D and patent cliffs',
    intro: 'Cash cows plus a binary pipeline. We split growth into volume vs net price and keep R&D / sales in the sheet so you can see the spend.',
    formula: 'Product revenue ≈ patients × price × gross-to-net\nR&D = revenue × R&D intensity',
    quote: 'Pipeline value is probability-weighted. The rest is details.',
    growthKind: 'volume_price',
    extras: [
      extra('volumeGrowth', 'Patient / volume %', 0.04, 'Treated patients or units.'),
      extra('priceGrowth', 'Net price %', 0.02, 'After rebates (gross-to-net).'),
    ],
    tickers: T(['JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'ABT', 'TMO', 'DHR', 'SYK', 'MDT', 'ISRG', 'REGN', 'VRTX', 'BIIB']),
    names: ['johnson', 'pfizer', 'merck', 'abbvie', 'lilly', 'pharma', 'biotech', 'therapeutics'],
  },
  {
    id: 'telecom',
    label: 'Telecom',
    hash: '#mod-10',
    subtitle: 'Subscribers × ARPU — churn and capex hangover',
    intro: 'Service revenue is subs × ARPU. Capex (spectrum, fiber, towers) can eat FCF for years even when EBITDA looks fine.',
    formula: 'Revenue = subs × ARPU\nGrowth ≈ (1 + net adds) × (1 + ARPU growth) − 1',
    quote: 'Is ARPU growing faster than churn? If no, you are a declining annuity.',
    growthKind: 'volume_price',
    extras: [
      extra('volumeGrowth', 'Subscriber net-add %', 0.01, 'Change in the sub base.'),
      extra('priceGrowth', 'ARPU growth %', 0.02, 'Average revenue per user.'),
    ],
    tickers: T(['T', 'VZ', 'TMUS', 'CHTR', 'CMCSA', 'LUMN', 'FYBR']),
    names: ['at&t', 'verizon', 't-mobile', 'charter', 'comcast', 'telecom', 'wireless'],
  },
  {
    id: 'marketplace',
    label: 'Marketplaces & platforms',
    hash: '#mod-11',
    subtitle: 'GMV × take rate',
    intro: 'GMV is the merchandise; take rate is what the platform keeps. Take rate often compresses as you scale. EDGAR only has the kept revenue.',
    formula: 'Revenue = GMV × take rate\nGrowth ≈ (1 + GMV growth) × (1 + Δ take rate) − 1',
    quote: 'Model take rate as something that can fall while GMV rises.',
    growthKind: 'comp_unit',
    extras: [
      extra('compGrowth', 'GMV growth %', 0.12, 'Gross merchandise / gross bookings.'),
      extra('unitGrowth', 'Take-rate change %', -0.01, 'Negative means the cut shrinks.'),
    ],
    tickers: T(['AMZN', 'EBAY', 'ETSY', 'UBER', 'LYFT', 'ABNB', 'BKNG', 'EXPE', 'DASH']),
    names: ['amazon', 'uber', 'airbnb', 'booking', 'marketplace', 'platform'],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    hash: '#mod-12',
    subtitle: 'Premium growth — combined ratio is the underwriting tell',
    intro: 'Premiums now, claims later. Combined ratio > 100% means underwriting loses money and float has to work. We grow premiums and keep net margin as the 10-K stand-in for underwriting + investment.',
    formula: 'NPW growth = policy growth × rate\nCombined ratio = (losses + expense) / earned premium',
    quote: 'Float is the other P&L. Combined ratio says whether you get paid to hold it.',
    growthKind: 'loan',
    extras: [
      extra('loanGrowth', 'Premium growth %', 0.05, 'Policies × rate, not investment income.'),
    ],
    tickers: T(['PGR', 'ALL', 'AIG', 'MET', 'PRU', 'AFL', 'TRV', 'CB', 'HIG', 'CINF', 'WRB', 'L', 'AON', 'MMC', 'AJG']),
    names: ['insurance', 'progressive', 'allstate', 'metlife', 'prudential', 'aetna'],
  },
  {
    id: 'media',
    label: 'Media & advertising',
    hash: '#mod-13',
    subtitle: 'Audience × monetization — subs × ARPU or impressions × CPM',
    intro: 'Audience first, then price. Streaming is subs × ARPU; ads are impressions × CPM. We split growth into audience vs rate.',
    formula: 'Ad revenue = impressions × CPM\nSub revenue = subs × ARPU',
    quote: 'Audiences are the hard forecast. Monetization is the second one.',
    growthKind: 'volume_price',
    extras: [
      extra('volumeGrowth', 'Audience / sub growth %', 0.04, 'Users, subs, or impressions.'),
      extra('priceGrowth', 'ARPU / CPM growth %', 0.02, 'Monetization rate.'),
    ],
    tickers: T(['DIS', 'NFLX', 'WBD', 'PARA', 'FOX', 'NWSA', 'NYT', 'LYV', 'SPOT', 'ROKU']),
    names: ['disney', 'netflix', 'paramount', 'warner', 'media', 'news'],
  },
  {
    id: 'professional',
    label: 'Professional services',
    hash: '#mod-14',
    subtitle: 'Headcount × utilization × bill rate',
    intro: 'People model. Below ~70% utilization you burn cash; above ~85% you burn people. Revenue is the product of the three.',
    formula: 'Revenue = headcount × bill rate × utilization × days',
    quote: 'If utilization drops below 70%, you are burning cash.',
    growthKind: 'services',
    extras: [
      extra('headcountGrowth', 'Headcount growth %', 0.05, 'Billable FTEs.'),
      extra('utilDelta', 'Utilization change %', 0, 'Change in utilization, not the level.'),
      extra('rateGrowth', 'Bill-rate growth %', 0.03, 'Average realized rate.'),
    ],
    tickers: T(['ACN', 'IBM', 'CTSH', 'IT', 'EPAM', 'BR', 'PAYX', 'ADP']),
    names: ['accenture', 'cognizant', 'consult', 'staffing'],
  },
  {
    id: 'edtech',
    label: 'EdTech & education',
    hash: '#mod-15',
    subtitle: 'Learners × ARPU — looks like SaaS, content is the cost',
    intro: 'Same waterfall as SaaS, plus content refresh. We reuse NRR + new bookings.',
    formula: 'Revenue = B2C subs × ARPU + seats × license',
    quote: 'CAC is high. Completion rates tell you if word-of-mouth will show up.',
    growthKind: 'nrr',
    extras: [
      extra('nrr', 'Net retention', 1.05, 'Existing learner base.'),
      extra('newArrRate', 'New enrollments as % of last year', 0.1, 'New logos / learners.'),
    ],
    tickers: T(['CHGG', 'COUR', 'DUOL', 'LRN', 'STRA', 'ATGE']),
    names: ['education', 'chegg', 'coursera', 'duolingo'],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    hash: '#mod-16',
    subtitle: 'DAU × ARPDAU — retention is the compounding',
    intro: 'Live-service is DAU × ARPDAU. A little retention change compounds. We split growth into users vs spend per user.',
    formula: 'Mobile revenue = DAU × ARPDAU',
    quote: 'How many DAUs pay, and how much? Whales are existential.',
    growthKind: 'volume_price',
    extras: [
      extra('volumeGrowth', 'DAU / player growth %', 0.05, 'Active users.'),
      extra('priceGrowth', 'ARPDAU growth %', 0.03, 'Spend per daily active user.'),
    ],
    tickers: T(['EA', 'TTWO', 'RBLX', 'NTDOY', 'SONY']),
    names: ['electronic arts', 'take-two', 'roblox', 'activision', 'gaming'],
  },
  {
    id: 'realestate',
    label: 'Real estate & REITs',
    hash: '#mod-17',
    subtitle: 'NOI ≈ occupancy × rent — cap rates live outside EDGAR',
    intro: 'NOI is occupancy × rent minus opex. Cap rates (value) are not in EDGAR. We grow the operating line from occupancy and rent.',
    formula: 'NOI ≈ occupancy × rent − opex\nValue = NOI / cap rate  (cap rate is yours to type in Excel)',
    quote: 'If cap rates expand 50 bps and NOI is flat, you just lost a chunk of value.',
    growthKind: 'comp_unit',
    extras: [
      extra('compGrowth', 'Occupancy change %', 0.01, 'Change in occupancy.'),
      extra('unitGrowth', 'Rent growth %', 0.03, 'Market rent / lease spreads.'),
    ],
    tickers: T(['PLD', 'AMT', 'EQIX', 'SPG', 'O', 'PSA', 'WELL', 'DLR', 'CCI', 'EQR', 'AVB', 'VTR', 'ARE', 'BXP']),
    names: ['realty', 'reit', 'properties', 'prologis', 'welltower'],
  },
];

export function playbookById(id) {
  return PLAYBOOKS.find((p) => p.id === id) || PLAYBOOKS[0];
}

export function guessPlaybook(company) {
  const ticker = String(company?.fortune_ticker || company?.sec_ticker || '').toUpperCase();
  const name = `${company?.company || ''} ${company?.sec_name || ''}`.toLowerCase();
  for (const p of PLAYBOOKS) {
    if (p.id === 'generic') continue;
    if (ticker && p.tickers.has(ticker)) return p;
  }
  for (const p of PLAYBOOKS) {
    if (p.id === 'generic') continue;
    if (p.names.some((n) => name.includes(n))) return p;
  }
  return playbookById('generic');
}

export function extraDefaults(playbook) {
  const out = {};
  for (const field of playbook?.extras || []) out[field.key] = field.fallback;
  return out;
}
