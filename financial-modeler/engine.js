/**
 * Financial modeling engine: 3-statement, DCF, and trading comps.
 *
 * Browser-safe ESM (no `node:` imports, no npm) — imported by the page and by
 * `scripts/test-financial-modeler-*.mjs`. Lives under `financial-modeler/`
 * rather than `lib/` because `middleware.js` 404s `/lib/` for browsers.
 *
 * Everything is in raw USD; the UI and the workbook divide by 1e6 to show
 * millions. Sign convention 1: income positive, expenses negative.
 *
 * A missing XBRL tag stays null. It is never read as zero — the only place a
 * number gets invented is the two labelled residual buckets on the balance
 * sheet, which exist so year 0 ties to the filed totals instead of to a guess.
 */
import { interestBearingDebt } from '../fortune-500/extract.js';

export const SCALE = 1e6;
export const FORECAST_YEARS = 5;

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function numberOr(v, fallback = null) {
  return finite(v) ? v : fallback;
}

function metric(headlines, key) {
  return numberOr(headlines?.metrics?.[key]?.val);
}

function filedDebt(headlines) {
  const total = interestBearingDebt(headlines?.metrics);
  return finite(total) ? total : null;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * What the model needs before it can run. Private filers have no 10-K, so they
 * have no headlines at all and get told that instead of a fabricated model.
 */
export function modelReadiness(headlines) {
  const missing = [];
  if (!finite(metric(headlines, 'revenue'))) missing.push('revenue');
  if (!finite(metric(headlines, 'assets'))) missing.push('total assets');
  if (!finite(metric(headlines, 'equity'))) missing.push('shareholders’ equity');
  if (!finite(metric(headlines, 'operating_income')) && !finite(metric(headlines, 'net_income'))) {
    missing.push('operating or net income');
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Defaults come from the filing wherever a tag exists, so the first render is
 * "last year, repeated" rather than someone else's forecast. Each one is
 * editable and every card on the page says where its number came from.
 */
export function defaultAssumptions(headlines) {
  const revenue = metric(headlines, 'revenue');
  const grossProfit = metric(headlines, 'gross_profit');
  const ebit = metric(headlines, 'operating_income');
  const netIncome = metric(headlines, 'net_income');
  const capex = metric(headlines, 'capex');
  const receivables = metric(headlines, 'receivables');
  const inventory = metric(headlines, 'inventory');
  const debt = filedDebt(headlines);
  const growth = headlines?.ratios?.revenue_yoy;

  const taxRate = 0.21;
  const grossMargin = finite(grossProfit) && revenue ? clamp(grossProfit / revenue, 0, 0.99) : null;
  const ebitMargin = finite(ebit) && revenue
    ? clamp(ebit / revenue, -0.5, 0.7)
    : finite(netIncome) && revenue
      ? clamp(netIncome / revenue / (1 - taxRate), -0.5, 0.7)
      : null;
  const capexPct = finite(capex) && revenue ? clamp(Math.abs(capex) / revenue, 0, 0.4) : 0.04;

  return {
    years: FORECAST_YEARS,
    scenario: 'base',
    revenueGrowth: finite(growth) ? clamp(growth, -0.15, 0.35) : 0.04,
    grossMargin,
    ebitMargin,
    taxRate,
    capexPct,
    // D&A is not one of the tags in the snapshot. CapEx is the standard
    // stand-in for a mature filer (steady state replaces what it wears out).
    daPct: capexPct,
    dsoDays: finite(receivables) && revenue ? clamp((365 * receivables) / revenue, 0, 240) : null,
    dioDays:
      finite(inventory) && revenue && finite(grossMargin)
        ? clamp((365 * inventory) / (revenue * (1 - grossMargin)), 0, 365)
        : finite(inventory) && revenue
          ? clamp((365 * inventory) / revenue, 0, 365)
          : null,
    interestRate: 0.05,
    cashYield: 0.03,
    debtRepaymentPct: finite(debt) && debt > 0 ? 0.05 : 0,
    payoutRatio: 0,
    // DCF
    riskFreeRate: 0.043,
    equityRiskPremium: 0.05,
    beta: 1,
    terminalGrowth: 0.025,
  };
}

const SCENARIO_TILT = {
  base: 0,
  bull: 1,
  bear: -1,
};

/** Bull/bear move the two guesses a beginner actually has an opinion about. */
export function applyScenario(assumptions, scenario) {
  const sign = SCENARIO_TILT[scenario] ?? 0;
  const bump = (v, delta) => (finite(v) ? v + sign * delta : v);
  return {
    ...assumptions,
    scenario,
    revenueGrowth: bump(assumptions.revenueGrowth, 0.03),
    ebitMargin: bump(assumptions.ebitMargin, 0.02),
  };
}

/**
 * Year 0 balance sheet, built so total assets and total liabilities + equity
 * are the filed totals exactly. Cash, receivables, inventory, and long-term
 * debt are the filed tags; everything the snapshot doesn't tag lands in a
 * residual line that says so in its own label.
 */
function openingBalanceSheet(headlines) {
  const assets = metric(headlines, 'assets');
  const equity = metric(headlines, 'equity');
  const filedLiabilities = metric(headlines, 'liabilities');
  const liabilities = finite(filedLiabilities) ? filedLiabilities : assets - equity;
  const cash = numberOr(metric(headlines, 'cash'), 0);
  const receivables = numberOr(metric(headlines, 'receivables'), 0);
  const inventory = numberOr(metric(headlines, 'inventory'), 0);
  const debt = numberOr(filedDebt(headlines), 0);
  return {
    cash,
    receivables,
    inventory,
    // Net PP&E, goodwill, and investments are one bucket: the snapshot has no
    // separate tag for them, and splitting a total we don't have would be a
    // guess wearing a line item's clothes.
    otherAssets: assets - cash - receivables - inventory,
    totalAssets: assets,
    debt,
    otherLiabilities: liabilities - debt,
    totalLiabilities: liabilities,
    equity,
    totalLiabEquity: liabilities + equity,
  };
}

function year0Row(headlines, a, open) {
  const revenue = metric(headlines, 'revenue');
  const grossProfit = metric(headlines, 'gross_profit');
  const ebitFiled = metric(headlines, 'operating_income');
  const ebit = finite(ebitFiled) ? ebitFiled : finite(a.ebitMargin) ? revenue * a.ebitMargin : null;
  const da = finite(a.daPct) ? revenue * a.daPct : null;
  return {
    year: headlines?.asOfYear ?? null,
    offset: 0,
    filed: true,
    revenue,
    cogs: finite(grossProfit) ? -(revenue - grossProfit) : null,
    grossProfit: finite(grossProfit) ? grossProfit : null,
    opex: finite(grossProfit) && finite(ebit) ? -(grossProfit - ebit) : finite(ebit) ? -(revenue - ebit) : null,
    da: finite(da) ? -da : null,
    ebitda: finite(ebit) && finite(da) ? ebit + da : null,
    ebit,
    interestExpense: null,
    interestIncome: null,
    pretax: null,
    taxes: null,
    netIncome: metric(headlines, 'net_income'),
    ...open,
    balanceCheck: open.totalAssets - open.totalLiabEquity,
    cfo: metric(headlines, 'cfo'),
    capex: finite(metric(headlines, 'capex')) ? -Math.abs(metric(headlines, 'capex')) : null,
    cfi: metric(headlines, 'cfi'),
    debtRepayment: null,
    dividends: null,
    cff: metric(headlines, 'cff'),
    netChangeCash: null,
    unleveredFcf: null,
  };
}

/**
 * The integrated model. Interest is charged on the *beginning* balance of debt
 * and earned on the beginning balance of cash, which is what keeps the sheet
 * out of a circular reference: no formula in it depends on its own answer.
 *
 * Cash is the plug — it absorbs whatever the three statements leave over — so
 * the balance check is a real test, not a definition.
 */
export function runThreeStatement(headlines, assumptions) {
  const ready = modelReadiness(headlines);
  if (!ready.ok) {
    return { ok: false, reason: `This filer is missing ${ready.missing.join(', ')} in the snapshot.`, missing: ready.missing };
  }
  const a = { ...defaultAssumptions(headlines), ...assumptions };
  const years = Number.isInteger(a.years) && a.years > 0 ? Math.min(10, a.years) : FORECAST_YEARS;
  const open = openingBalanceSheet(headlines);
  const rows = [year0Row(headlines, a, open)];

  const g = numberOr(a.revenueGrowth, 0);
  const gm = finite(a.grossMargin) ? a.grossMargin : null;
  const em = numberOr(a.ebitMargin, 0);
  const tax = clamp(numberOr(a.taxRate, 0.21), 0, 0.6);

  for (let i = 1; i <= years; i += 1) {
    const prev = rows[i - 1];
    const revenue = prev.revenue * (1 + g);
    const grossProfit = gm == null ? null : revenue * gm;
    const cogs = gm == null ? null : -(revenue - grossProfit);
    const ebit = revenue * em;
    const opex = gm == null ? -(revenue - ebit) : -(grossProfit - ebit);
    const da = revenue * numberOr(a.daPct, 0);
    const capex = revenue * numberOr(a.capexPct, 0);

    const interestExpense = -prev.debt * numberOr(a.interestRate, 0);
    const interestIncome = prev.cash * numberOr(a.cashYield, 0);
    const pretax = ebit + interestExpense + interestIncome;
    const taxes = pretax > 0 ? -pretax * tax : 0;
    const netIncome = pretax + taxes;

    const receivables = a.dsoDays == null ? prev.receivables : (revenue * a.dsoDays) / 365;
    const inventory =
      a.dioDays == null
        ? prev.inventory
        : gm == null
          ? (revenue * a.dioDays) / 365
          : (revenue * (1 - gm) * a.dioDays) / 365;
    const workingCapitalUse = receivables - prev.receivables + (inventory - prev.inventory);

    const cfo = netIncome + da - workingCapitalUse;
    const cfi = -capex;
    const debtRepayment = Math.min(prev.debt, prev.debt * numberOr(a.debtRepaymentPct, 0));
    const dividends = netIncome > 0 ? netIncome * clamp(numberOr(a.payoutRatio, 0), 0, 1) : 0;
    const cff = -debtRepayment - dividends;
    const netChangeCash = cfo + cfi + cff;

    const cash = prev.cash + netChangeCash;
    const otherAssets = prev.otherAssets + capex - da;
    const debt = prev.debt - debtRepayment;
    const otherLiabilities = prev.otherLiabilities;
    const equity = prev.equity + netIncome - dividends;
    const totalAssets = cash + receivables + inventory + otherAssets;
    const totalLiabilities = debt + otherLiabilities;

    rows.push({
      year: prev.year == null ? null : prev.year + 1,
      offset: i,
      filed: false,
      revenue,
      cogs,
      grossProfit,
      opex,
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
      otherAssets,
      totalAssets,
      debt,
      otherLiabilities,
      totalLiabilities,
      equity,
      totalLiabEquity: totalLiabilities + equity,
      balanceCheck: totalAssets - (totalLiabilities + equity),
      cfo,
      capex: -capex,
      cfi,
      debtRepayment: -debtRepayment,
      dividends: -dividends,
      cff,
      netChangeCash,
      // Unlevered: what the business throws off before anyone is paid interest.
      unleveredFcf: ebit * (1 - tax) + da - capex - workingCapitalUse,
    });
  }

  const worstCheck = rows.reduce((worst, r) => Math.max(worst, Math.abs(r.balanceCheck || 0)), 0);
  return {
    ok: true,
    assumptions: a,
    years,
    year0: headlines?.asOfYear ?? null,
    rows,
    residualNote:
      'Net PP&E, goodwill, and payables aren’t separate tags in this snapshot, so they sit in the two “other” lines. Those two lines are what make year 0 equal the filed totals.',
    checks: {
      // Filed dollars are big, so tolerance scales with the sheet.
      tolerance: Math.max(1, Math.abs(open.totalAssets) * 1e-9),
      worstImbalance: worstCheck,
      balances: worstCheck <= Math.max(1, Math.abs(open.totalAssets) * 1e-9),
    },
  };
}

/** Cost of equity by CAPM, then blended with after-tax debt at market weights. */
export function buildWacc(model, { price = null, shares = null } = {}) {
  const a = model?.assumptions || {};
  const row0 = model?.rows?.[0];
  const bookEquity = numberOr(row0?.equity, 0);
  const marketCap = finite(price) && finite(shares) ? price * shares : null;
  const equityValue = finite(marketCap) ? marketCap : bookEquity;
  const debt = numberOr(row0?.debt, 0);
  const total = equityValue + debt;
  const costOfEquity = numberOr(a.riskFreeRate, 0) + numberOr(a.beta, 1) * numberOr(a.equityRiskPremium, 0);
  const afterTaxCostOfDebt = numberOr(a.interestRate, 0) * (1 - numberOr(a.taxRate, 0.21));
  const equityWeight = total > 0 ? equityValue / total : 1;
  const debtWeight = 1 - equityWeight;
  return {
    costOfEquity,
    afterTaxCostOfDebt,
    equityValue,
    marketCap,
    usedBookEquity: !finite(marketCap),
    debt,
    equityWeight,
    debtWeight,
    wacc: costOfEquity * equityWeight + afterTaxCostOfDebt * debtWeight,
  };
}

function discountedValue(rows, wacc, terminalGrowth) {
  if (!(wacc > terminalGrowth)) return null;
  let pvExplicit = 0;
  const flows = [];
  for (const r of rows) {
    if (r.offset === 0) continue;
    const df = 1 / (1 + wacc) ** r.offset;
    const pv = r.unleveredFcf * df;
    pvExplicit += pv;
    flows.push({ year: r.year, offset: r.offset, fcf: r.unleveredFcf, discountFactor: df, pv });
  }
  const last = flows[flows.length - 1];
  if (!last) return null;
  const terminalValue = (last.fcf * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  const pvTerminal = terminalValue * last.discountFactor;
  return { flows, pvExplicit, terminalValue, pvTerminal, enterpriseValue: pvExplicit + pvTerminal };
}

/**
 * Two-stage DCF: the five years you just forecast, then a Gordon-growth stub
 * for everything after. Enterprise → equity bridge subtracts net debt.
 */
export function runDcf(model, { price = null, shares = null } = {}) {
  if (!model?.ok) return { ok: false, reason: model?.reason || 'No model.' };
  const a = model.assumptions;
  const wacc = buildWacc(model, { price, shares });
  const terminalGrowth = numberOr(a.terminalGrowth, 0.025);
  if (!(wacc.wacc > terminalGrowth)) {
    return {
      ok: false,
      wacc,
      terminalGrowth,
      reason: 'Terminal growth has to be below WACC, or the formula says the company is worth infinity.',
    };
  }
  const valued = discountedValue(model.rows, wacc.wacc, terminalGrowth);
  const row0 = model.rows[0];
  const netDebt = numberOr(row0.debt, 0) - numberOr(row0.cash, 0);
  const equityValue = valued.enterpriseValue - netDebt;
  const impliedPrice = finite(shares) && shares > 0 ? equityValue / shares : null;
  return {
    ok: true,
    wacc,
    terminalGrowth,
    ...valued,
    terminalShare: valued.enterpriseValue ? valued.pvTerminal / valued.enterpriseValue : null,
    netDebt,
    equityValue,
    shares: finite(shares) ? shares : null,
    impliedPrice,
    marketPrice: finite(price) ? price : null,
    upside: finite(impliedPrice) && finite(price) && price > 0 ? impliedPrice / price - 1 : null,
  };
}

export const WACC_STEPS = [-0.02, -0.01, 0, 0.01, 0.02];
export const GROWTH_STEPS = [-0.01, -0.005, 0, 0.005, 0.01];

/** WACC down the side, terminal growth across. Cells are implied share price. */
export function dcfSensitivity(model, dcf, { shares = null } = {}) {
  if (!dcf?.ok) return null;
  const netDebt = dcf.netDebt;
  const rowsOut = WACC_STEPS.map((dw) => {
    const wacc = dcf.wacc.wacc + dw;
    const cells = GROWTH_STEPS.map((dg) => {
      const g = dcf.terminalGrowth + dg;
      const valued = discountedValue(model.rows, wacc, g);
      if (!valued) return null;
      const equity = valued.enterpriseValue - netDebt;
      return finite(shares) && shares > 0 ? equity / shares : equity;
    });
    return { wacc, cells };
  });
  return {
    waccs: rowsOut.map((r) => r.wacc),
    growths: GROWTH_STEPS.map((d) => dcf.terminalGrowth + d),
    rows: rowsOut,
    unit: finite(shares) && shares > 0 ? 'price' : 'equity',
  };
}

/* ------------------------------- comps -------------------------------- */

function compRow(entry) {
  const { company, headlines, price } = entry;
  const shares = metric(headlines, 'shares_out');
  const revenue = metric(headlines, 'revenue');
  const ebit = metric(headlines, 'operating_income');
  const capex = metric(headlines, 'capex');
  const cash = metric(headlines, 'cash');
  const debt = filedDebt(headlines);
  const eps = metric(headlines, 'eps_diluted');
  const marketCap = finite(price) && finite(shares) ? price * shares : null;
  // Without a market cap there is no enterprise value, and a comp with no EV
  // is "not reported" — never a zero that drags the median down.
  const enterpriseValue =
    finite(marketCap) ? marketCap + numberOr(debt, 0) - numberOr(cash, 0) : null;
  const ebitda = finite(ebit) && finite(capex) ? ebit + Math.abs(capex) : null;
  return {
    cik: headlines?.cik ?? company?.cik ?? null,
    name: company?.company || headlines?.entityName || '',
    ticker: company?.fortune_ticker || company?.sec_ticker || '',
    price: finite(price) ? price : null,
    shares,
    marketCap,
    enterpriseValue,
    revenue,
    ebit,
    ebitda,
    eps,
    evRevenue: finite(enterpriseValue) && revenue ? enterpriseValue / revenue : null,
    evEbitda: finite(enterpriseValue) && ebitda && ebitda > 0 ? enterpriseValue / ebitda : null,
    pe: finite(price) && finite(eps) && eps > 0 ? price / eps : null,
  };
}

export const COMP_MULTIPLES = [
  { key: 'evRevenue', label: 'EV / Revenue', driver: 'revenue', bridge: 'ev' },
  { key: 'evEbitda', label: 'EV / EBITDA', driver: 'ebitda', bridge: 'ev' },
  { key: 'pe', label: 'P / E', driver: 'eps', bridge: 'price' },
];

export function median(values) {
  const sorted = values.filter(finite).slice().sort((x, y) => x - y);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values) {
  const list = values.filter(finite);
  if (!list.length) return null;
  return list.reduce((s, v) => s + v, 0) / list.length;
}

/**
 * @param {{company: object, headlines: object, price: number|null}} target
 * @param {Array<{company: object, headlines: object, price: number|null}>} peers
 */
export function runComps(target, peers = []) {
  const self = compRow(target);
  const rows = peers.map(compRow).filter((r) => r.cik !== self.cik);
  const stats = {};
  for (const m of COMP_MULTIPLES) {
    const values = rows.map((r) => r[m.key]).filter(finite);
    stats[m.key] = {
      count: values.length,
      mean: mean(values),
      median: median(values),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  }
  const netDebt = numberOr(self.enterpriseValue, null) != null
    ? self.enterpriseValue - self.marketCap
    : numberOr(filedDebt(target.headlines), 0) - numberOr(metric(target.headlines, 'cash'), 0);

  const implied = COMP_MULTIPLES.map((m) => {
    const multiple = stats[m.key].median;
    const driver = self[m.driver];
    if (!finite(multiple) || !finite(driver) || driver <= 0) {
      return { key: m.key, label: m.label, multiple, driver, value: null, pricePerShare: null, reported: false };
    }
    const value = multiple * driver;
    let pricePerShare = null;
    if (m.bridge === 'price') pricePerShare = value;
    else if (finite(self.shares) && self.shares > 0) pricePerShare = (value - netDebt) / self.shares;
    return { key: m.key, label: m.label, multiple, driver, value, pricePerShare, reported: true };
  });

  return {
    ok: rows.length > 0,
    self,
    rows,
    stats,
    netDebt,
    implied,
    reason: rows.length ? null : 'Pick at least one peer that has a share price — comps need a market value.',
  };
}
