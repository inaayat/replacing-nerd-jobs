/**
 * Unit-economics 3-statement model. Build from one sale (cups × price)
 * instead of last year’s 10-K totals. Same wiring as the filer model: cash
 * is the plug, interest uses beginning balances, the check is a real test.
 *
 * Browser-safe ESM with no imports — the page, the workbook, and
 * `scripts/test-financial-modeler-unit-econ.mjs` all load this file.
 */

export const UNIT_SCALE = 1;
export const UNIT_FORECAST_YEARS = 5;

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function numberOr(v, fallback = 0) {
  return finite(v) ? v : fallback;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** A lemonade stand: small enough that every line is a number you can feel. */
export function defaultUnitAssumptions() {
  return {
    years: UNIT_FORECAST_YEARS,
    scenario: 'base',
    units: 20000,
    price: 4,
    discountRate: 0,
    unitGrowth: 0.08,
    cogsPerUnit: 1.2,
    laborPct: 0.25,
    otherOpex: 8000,
    taxRate: 0.21,
    equipment: 15000,
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
  };
}

const SCENARIO_TILT = { base: 0, bull: 1, bear: -1 };

/** Bull/bear move volume growth and price — the two guesses a stall owner has. */
export function applyUnitScenario(assumptions, scenario) {
  const sign = SCENARIO_TILT[scenario] ?? 0;
  const bump = (v, delta) => (finite(v) ? v + sign * delta : v);
  return {
    ...assumptions,
    scenario,
    unitGrowth: bump(assumptions.unitGrowth, 0.04),
    price: bump(assumptions.price, 0.4),
  };
}

export const UNIT_DIAL_GROUPS = [
  { id: 'sale', label: 'One sale' },
  { id: 'cost', label: 'What it costs to make' },
  { id: 'capital', label: 'Cash, kit, and credit' },
];

export const UNIT_DIALS = [
  {
    key: 'units',
    group: 'sale',
    name: 'Cups in year 1',
    fmt: 'qty',
    min: 1000,
    max: 80000,
    step: 500,
    what: 'How many you sell in the first year.',
    how: 'Count cups, not dollars. Year 2 onwards grows this number by the growth rate below.',
    originText: () => 'Starts at 20,000 — a busy weekend stall, not a factory.',
    effect: 'Every dollar on the income statement starts from cups × price.',
  },
  {
    key: 'price',
    group: 'sale',
    name: 'Price per cup',
    fmt: 'usd',
    min: 0.5,
    max: 12,
    step: 0.1,
    what: 'What a customer pays before any discount.',
    how: 'The sticker price. Discounts live on their own slider so you can see them separately.',
    originText: () => 'Starts at $4, a typical lemonade / iced-coffee price.',
    effect: 'Sales = cups × this × (1 − discount).',
  },
  {
    key: 'discountRate',
    group: 'sale',
    name: 'Discount',
    fmt: 'pct',
    min: 0,
    max: 0.4,
    step: 0.01,
    what: 'How much of the sticker price you give away.',
    how: 'Promo, student deal, or “the first cup is free”. Revenue is price × (1 − this).',
    originText: () => 'Starts at 0% — full price until you decide otherwise.',
    effect: 'Cuts sales without changing how many cups you poured.',
  },
  {
    key: 'unitGrowth',
    group: 'sale',
    name: 'Cups growth',
    fmt: 'pct',
    min: -0.2,
    max: 0.4,
    step: 0.01,
    what: 'How much busier next year is than this year.',
    how: 'Next year’s cups ÷ this year’s cups, minus 1. Same idea as sales growth, but on volume.',
    originText: () => 'Starts at 8% — a stall that is catching on, not exploding.',
    effect: 'Compounds cups each year. Price stays on its own slider.',
  },
  {
    key: 'cogsPerUnit',
    group: 'cost',
    name: 'Cost per cup',
    fmt: 'usd',
    min: 0.1,
    max: 6,
    step: 0.05,
    what: 'Lemons, sugar, cup, lid — the stuff inside one sale.',
    how: 'Add up the ingredients for one cup. Gross profit is price (after discount) minus this.',
    originText: () => 'Starts at $1.20 of ingredients in a $4 cup.',
    effect: 'Cost of sales = cups × this. Inventory is sized off that cost.',
  },
  {
    key: 'laborPct',
    group: 'cost',
    name: 'Labor (% of sales)',
    fmt: 'pct',
    min: 0,
    max: 0.6,
    step: 0.01,
    what: 'What you pay people, as a share of sales.',
    how: 'Wages ÷ sales. A stall might be 20–35%. This sits in operating expenses, not COGS.',
    originText: () => 'Starts at 25% of sales.',
    effect: 'Scales with revenue, so busier years cost more in wages too.',
  },
  {
    key: 'otherOpex',
    group: 'cost',
    name: 'Other operating costs',
    fmt: 'usd',
    min: 0,
    max: 40000,
    step: 250,
    what: 'Rent, permits, napkins, the things that do not move with each cup.',
    how: 'Fixed dollars per year, not a percent. Insurance and a weekend pitch fee live here.',
    originText: () => 'Starts at $8,000 a year of keep-the-lights-on cost.',
    effect: 'The same bill every year, which is why growth helps the margin.',
  },
  {
    key: 'taxRate',
    group: 'cost',
    name: 'Tax rate',
    fmt: 'pct',
    min: 0,
    max: 0.4,
    step: 0.01,
    what: 'The cut of profit that goes to the government.',
    how: 'US federal is 21%. Add state if you want. Tax is only charged when pre-tax profit is positive.',
    originText: () => 'Starts at 21%, the US federal rate.',
    effect: 'Turns pre-tax profit into net income — the handoff to cash flow and equity.',
  },
  {
    key: 'equipment',
    group: 'capital',
    name: 'Equipment (year 1)',
    fmt: 'usd',
    min: 0,
    max: 60000,
    step: 500,
    what: 'The cart, the juicer, the cooler — bought once in year 1.',
    how: 'What you actually pay for the kit. Cash flow records the whole bill in year 1; the income statement spreads it over the useful life.',
    originText: () => 'Starts at $15,000 of kit, paid in year 1.',
    effect: 'Year-1 CapEx. Depreciation each year is this ÷ useful life.',
  },
  {
    key: 'usefulLife',
    group: 'capital',
    name: 'Useful life',
    fmt: 'years',
    min: 1,
    max: 10,
    step: 1,
    what: 'How many years the kit lasts before it is worn out.',
    how: 'Straight-line: depreciation each year = equipment ÷ this. After that, depreciation stops.',
    originText: () => 'Starts at 5 years.',
    effect: 'Longer life means a smaller depreciation charge each year.',
  },
  {
    key: 'openingCash',
    group: 'capital',
    name: 'Cash you start with',
    fmt: 'usd',
    min: 0,
    max: 80000,
    step: 500,
    what: 'Money in the till before year 1 sells a cup.',
    how: 'Founder cash plus anything already borrowed. Year 1’s cash flow adds to (or eats) this.',
    originText: () => 'Starts at $25,000 in the till.',
    effect: 'Beginning cash for year 1. Interest income is earned on this balance.',
  },
  {
    key: 'openingDebt',
    group: 'capital',
    name: 'Debt you start with',
    fmt: 'usd',
    min: 0,
    max: 40000,
    step: 500,
    what: 'What you already owe before year 1.',
    how: 'A startup loan or a family note. Opening equity is starting cash minus this.',
    originText: () => 'Starts at $5,000 of loan.',
    effect: 'Interest expense in year 1 is charged on this. Then you pay down a slice each year.',
  },
  {
    key: 'dsoDays',
    group: 'capital',
    name: 'Days to collect',
    fmt: 'days',
    min: 0,
    max: 60,
    step: 1,
    what: 'How long customers take to pay.',
    how: 'Receivables ÷ sales × 365. A stall paid in cash is ~0. Catering invoices might be 15–30.',
    originText: () => 'Starts at 5 days — mostly cash, a little invoiced.',
    effect: 'Higher days ties up cash in receivables.',
  },
  {
    key: 'dioDays',
    group: 'capital',
    name: 'Days of inventory',
    fmt: 'days',
    min: 0,
    max: 60,
    step: 1,
    what: 'How many days of ingredients you keep on the shelf.',
    how: 'Inventory ÷ cost of sales × 365. Lemons go off; this should stay small.',
    originText: () => 'Starts at 10 days of lemons and cups.',
    effect: 'Higher days ties up cash in inventory.',
  },
  {
    key: 'dpoDays',
    group: 'capital',
    name: 'Days to pay suppliers',
    fmt: 'days',
    min: 0,
    max: 60,
    step: 1,
    what: 'How long you take to pay the grocer.',
    how: 'Payables ÷ cost of sales × 365. Stretching this is an interest-free loan from suppliers.',
    originText: () => 'Starts at 15 days.',
    effect: 'Higher days is a source of cash (you have not paid yet).',
  },
  {
    key: 'interestRate',
    group: 'capital',
    name: 'Interest on debt',
    fmt: 'pct',
    min: 0,
    max: 0.2,
    step: 0.005,
    what: 'What the loan costs each year.',
    how: 'Charged on last year’s debt, so the interest line never depends on this year’s cash.',
    originText: () => 'Starts at 6%.',
    effect: 'Hits operating profit on the way to net income.',
  },
  {
    key: 'cashYield',
    group: 'capital',
    name: 'Interest on cash',
    fmt: 'pct',
    min: 0,
    max: 0.08,
    step: 0.0025,
    what: 'What spare cash earns in the bank.',
    how: 'Earned on last year’s cash, same non-circular trick as the debt interest.',
    originText: () => 'Starts at 2%.',
    effect: 'A little extra income when the till is full.',
  },
  {
    key: 'debtRepaymentPct',
    group: 'capital',
    name: 'Debt paid down',
    fmt: 'pct',
    min: 0,
    max: 0.4,
    step: 0.01,
    what: 'The slice of last year’s loan you repay this year.',
    how: 'Cash out on the cash flow statement; the balance sheet debt corkscrew shrinks by the same amount.',
    originText: () => 'Starts at 10% of the remaining loan each year.',
    effect: 'Uses cash now so later years pay less interest.',
  },
  {
    key: 'payoutRatio',
    group: 'capital',
    name: 'Owner draw',
    fmt: 'pct',
    min: 0,
    max: 0.8,
    step: 0.05,
    what: 'Share of net income you take out of the business.',
    how: 'Dividends ÷ net income, only when net income is positive. The rest stays in equity.',
    originText: () => 'Starts at 0% — leave the profit in the till while it is still a stall.',
    effect: 'Cash out, and a smaller equity balance.',
  },
];

/**
 * Integrated unit-econ 3-statement. Year 1 buys the equipment; later years
 * only depreciate it. Opening equity is starting cash minus starting debt.
 */
export function runUnitEcon(assumptions) {
  const a = { ...defaultUnitAssumptions(), ...assumptions };
  const years = Number.isInteger(a.years) && a.years > 0 ? Math.min(10, a.years) : UNIT_FORECAST_YEARS;
  const g = numberOr(a.unitGrowth, 0);
  const tax = clamp(numberOr(a.taxRate, 0.21), 0, 0.6);
  const life = Math.max(1, Math.round(numberOr(a.usefulLife, 5)));
  const equipment = Math.max(0, numberOr(a.equipment, 0));
  const daAnnual = equipment / life;
  const openingCash = numberOr(a.openingCash, 0);
  const openingDebt = Math.max(0, numberOr(a.openingDebt, 0));
  const openingEquity = openingCash - openingDebt;
  const rows = [];

  for (let i = 0; i < years; i += 1) {
    const prev = i === 0 ? null : rows[i - 1];
    const beginCash = prev ? prev.cash : openingCash;
    const beginDebt = prev ? prev.debt : openingDebt;
    const beginPpe = prev ? prev.ppe : 0;
    const beginEquity = prev ? prev.equity : openingEquity;
    const beginAr = prev ? prev.receivables : 0;
    const beginInv = prev ? prev.inventory : 0;
    const beginAp = prev ? prev.payables : 0;

    const units = numberOr(a.units, 0) * (1 + g) ** i;
    const price = numberOr(a.price, 0);
    const discount = clamp(numberOr(a.discountRate, 0), 0, 0.9);
    const revenue = units * price * (1 - discount);
    const cogs = -(units * numberOr(a.cogsPerUnit, 0));
    const grossProfit = revenue + cogs;
    const labor = -(revenue * numberOr(a.laborPct, 0));
    const otherOpex = -Math.abs(numberOr(a.otherOpex, 0));
    const da = i < life ? daAnnual : 0;
    const ebit = grossProfit + labor + otherOpex - da;
    const interestExpense = -(beginDebt * numberOr(a.interestRate, 0));
    const interestIncome = beginCash * numberOr(a.cashYield, 0);
    const pretax = ebit + interestExpense + interestIncome;
    const taxes = pretax > 0 ? -pretax * tax : 0;
    const netIncome = pretax + taxes;

    const receivables = (revenue * numberOr(a.dsoDays, 0)) / 365;
    const inventory = (-cogs * numberOr(a.dioDays, 0)) / 365;
    const payables = (-cogs * numberOr(a.dpoDays, 0)) / 365;
    const dAr = receivables - beginAr;
    const dInv = inventory - beginInv;
    const dAp = payables - beginAp;
    const workingCapitalUse = dAr + dInv - dAp;

    const capex = i === 0 ? equipment : 0;
    const cfo = netIncome + da - workingCapitalUse;
    const cfi = -capex;
    const debtRepayment = Math.min(beginDebt, beginDebt * numberOr(a.debtRepaymentPct, 0));
    const dividends = netIncome > 0 ? netIncome * clamp(numberOr(a.payoutRatio, 0), 0, 1) : 0;
    const cff = -debtRepayment - dividends;
    const netChangeCash = cfo + cfi + cff;

    const cash = beginCash + netChangeCash;
    const ppe = beginPpe + capex - da;
    const debt = beginDebt - debtRepayment;
    const equity = beginEquity + netIncome - dividends;
    const totalAssets = cash + receivables + inventory + ppe;
    const totalLiabilities = debt + payables;
    const totalLiabEquity = totalLiabilities + equity;

    rows.push({
      year: i + 1,
      offset: i + 1,
      filed: false,
      units,
      price,
      revenue,
      cogs,
      grossProfit,
      labor,
      otherOpex,
      opex: labor + otherOpex,
      da: -da,
      ebitda: ebit + da,
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
      totalAssets,
      debt,
      payables,
      otherLiabilities: payables,
      totalLiabilities,
      equity,
      totalLiabEquity,
      balanceCheck: totalAssets - totalLiabEquity,
      cfo,
      capex: -capex,
      cfi,
      debtRepayment: -debtRepayment,
      dividends: -dividends,
      cff,
      netChangeCash,
      daAddBack: da,
      deltaAr: -dAr,
      deltaInv: -dInv,
      deltaAp: dAp,
      unleveredFcf: ebit * (1 - tax) + da - capex - workingCapitalUse,
    });
  }

  const worstCheck = rows.reduce((worst, r) => Math.max(worst, Math.abs(r.balanceCheck || 0)), 0);
  return {
    ok: true,
    kind: 'unit',
    scale: UNIT_SCALE,
    unitLabel: 'US$',
    assumptions: a,
    years,
    year0: null,
    opening: { cash: openingCash, debt: openingDebt, equity: openingEquity },
    rows,
    residualNote:
      'Year 1 buys the equipment in cash. Depreciation is that bill spread over the useful life. Payables are the grocer’s invoice you have not paid yet. Cash is still the plug — if the check is zero, cups × price really did flow through all three statements.',
    checks: {
      tolerance: 0.05,
      worstImbalance: worstCheck,
      balances: worstCheck <= 0.05,
    },
  };
}
