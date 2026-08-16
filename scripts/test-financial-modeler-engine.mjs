/**
 * Financial modeler engine: the 3-statement model has to tie, the DCF has to
 * agree with a hand-computed discount, and comps have to leave missing
 * ingredients out of the median instead of counting them as zero.
 */
import assert from 'node:assert/strict';
import {
  defaultAssumptions,
  applyScenario,
  runThreeStatement,
  runDcf,
  dcfSensitivity,
  runComps,
  modelReadiness,
  median,
  mean,
} from '../financial-modeler/engine.js';

const B = 1e9;

function point(val, extra = {}) {
  return { val, unit: 'USD', end: '2025-12-31', form: '10-K', tag: 'Test', ...extra };
}

/** A tidy retailer: every tag present, so nothing falls into a residual. */
function retailer(overrides = {}) {
  const metrics = {
    revenue: point(100 * B),
    net_income: point(8 * B),
    gross_profit: point(40 * B),
    operating_income: point(12 * B),
    assets: point(150 * B),
    liabilities: point(90 * B),
    equity: point(60 * B),
    cash: point(20 * B),
    receivables: point(10 * B),
    inventory: point(15 * B),
    long_term_debt: point(30 * B),
    capex: point(5 * B),
    cfo: point(14 * B),
    shares_out: point(1e9, { unit: 'shares' }),
    eps_diluted: point(8, { unit: 'USD/shares' }),
    ...overrides,
  };
  return {
    cik: 1,
    entityName: 'Retailer Inc',
    asOfYear: 2025,
    metrics,
    ratios: { revenue_yoy: 0.05, gross_margin: 0.4, operating_margin: 0.12, capex_intensity: 0.05 },
  };
}

/* --------------------------- readiness / defaults --------------------- */

assert.equal(modelReadiness(retailer()).ok, true);
{
  const naked = { asOfYear: 2025, metrics: {} };
  const ready = modelReadiness(naked);
  assert.equal(ready.ok, false);
  assert.deepEqual(ready.missing, ['revenue', 'total assets', 'shareholders’ equity', 'operating or net income']);
  const run = runThreeStatement(naked, {});
  assert.equal(run.ok, false);
  assert.match(run.reason, /missing revenue/);
}

{
  const a = defaultAssumptions(retailer());
  assert.equal(a.revenueGrowth, 0.05);
  assert.equal(a.grossMargin, 0.4);
  assert.equal(a.ebitMargin, 0.12);
  assert.equal(a.capexPct, 0.05);
  // D&A is not tagged anywhere in the snapshot, so CapEx stands in for it.
  assert.equal(a.daPct, a.capexPct);
  assert.ok(Math.abs(a.dsoDays - 36.5) < 0.01);
}

{
  // A filer with no gross profit tag keeps a null gross margin — the model
  // drops the line rather than pretending cost of sales is zero.
  const bank = retailer({ gross_profit: null, inventory: null, receivables: null });
  bank.ratios = { ...bank.ratios, gross_margin: null };
  const a = defaultAssumptions(bank);
  assert.equal(a.grossMargin, null);
  assert.equal(a.dioDays, null);
  assert.equal(a.dsoDays, null);
  const model = runThreeStatement(bank, a);
  assert.equal(model.ok, true);
  for (const row of model.rows.slice(1)) {
    assert.equal(row.grossProfit, null);
    assert.equal(row.cogs, null);
    // Untagged working capital holds flat instead of being sized off a guess.
    assert.equal(row.receivables, 0);
  }
  assert.equal(model.checks.balances, true);
}

{
  const a = applyScenario(defaultAssumptions(retailer()), 'bull');
  assert.ok(Math.abs(a.revenueGrowth - 0.08) < 1e-12);
  assert.ok(Math.abs(a.ebitMargin - 0.14) < 1e-12);
  const bear = applyScenario(defaultAssumptions(retailer()), 'bear');
  assert.ok(Math.abs(bear.revenueGrowth - 0.02) < 1e-12);
}

/* ------------------------- 3-statement: it must tie -------------------- */

{
  const headlines = retailer();
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  assert.equal(model.ok, true);
  assert.equal(model.rows.length, 6, 'year 0 plus five forecast years');

  const row0 = model.rows[0];
  assert.equal(row0.totalAssets, 150 * B, 'year 0 total assets is the filed number');
  assert.equal(row0.totalLiabEquity, 150 * B);
  assert.equal(row0.otherAssets, 150 * B - 20 * B - 10 * B - 15 * B);
  assert.equal(row0.otherLiabilities, 90 * B - 30 * B);

  for (const row of model.rows) {
    assert.ok(
      Math.abs(row.balanceCheck) < model.checks.tolerance,
      `FY${row.year} balance check ${row.balanceCheck} exceeds tolerance`
    );
  }
  assert.equal(model.checks.balances, true);
}

{
  // The tie has to survive every dial being moved at once — that is the whole
  // point of cash being the plug rather than a forecast line.
  const headlines = retailer();
  const stress = {
    ...defaultAssumptions(headlines),
    revenueGrowth: 0.22,
    grossMargin: 0.31,
    ebitMargin: 0.05,
    taxRate: 0.3,
    capexPct: 0.12,
    daPct: 0.03,
    dsoDays: 90,
    dioDays: 120,
    interestRate: 0.09,
    debtRepaymentPct: 0.25,
    payoutRatio: 0.6,
  };
  const model = runThreeStatement(headlines, stress);
  for (const row of model.rows) {
    assert.ok(Math.abs(row.balanceCheck) < model.checks.tolerance, `stressed FY${row.year} does not tie`);
  }

  // Cash really is the residual: it moves by exactly the net change the cash
  // flow statement reports.
  for (let i = 1; i < model.rows.length; i += 1) {
    const prev = model.rows[i - 1];
    const row = model.rows[i];
    assert.ok(Math.abs(row.cash - (prev.cash + row.netChangeCash)) < 1);
    assert.ok(Math.abs(row.cff - (row.debtRepayment + row.dividends)) < 1);
    // Equity rolls forward as a corkscrew, not as a plug.
    assert.ok(Math.abs(row.equity - (prev.equity + row.netIncome + row.dividends)) < 1);
    // Interest is charged on the *beginning* balance, which is what keeps the
    // model out of a circular reference.
    assert.ok(Math.abs(row.interestExpense + prev.debt * stress.interestRate) < 1);
  }
}

{
  // Sign convention 1: income positive, expenses negative.
  const headlines = retailer();
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  for (const row of model.rows.slice(1)) {
    assert.ok(row.revenue > 0);
    assert.ok(row.cogs < 0, 'cost of sales is negative');
    assert.ok(row.opex < 0, 'operating expenses are negative');
    assert.ok(row.da < 0, 'depreciation is negative on the income statement');
    assert.ok(row.capex < 0, 'capital expenditure is a cash outflow');
    assert.ok(row.taxes <= 0, 'tax is negative');
    assert.ok(Math.abs(row.grossProfit - (row.revenue + row.cogs)) < 1);
    assert.ok(Math.abs(row.ebit - (row.grossProfit + row.opex)) < 1);
    assert.ok(Math.abs(row.netIncome - (row.pretax + row.taxes)) < 1);
  }
}

/* --------------------------------- DCF -------------------------------- */

{
  const headlines = retailer();
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  model.shares = 1e9;
  const dcf = runDcf(model, { price: 100, shares: 1e9 });
  assert.equal(dcf.ok, true);

  // Rebuild the discount by hand rather than trusting the engine's own sum.
  const w = dcf.wacc.wacc;
  const g = dcf.terminalGrowth;
  let pv = 0;
  for (const row of model.rows.slice(1)) pv += row.unleveredFcf / (1 + w) ** row.offset;
  assert.ok(Math.abs(pv - dcf.pvExplicit) < 1);
  const last = model.rows[model.rows.length - 1];
  const tv = (last.unleveredFcf * (1 + g)) / (w - g);
  assert.ok(Math.abs(tv - dcf.terminalValue) < 1);
  assert.ok(Math.abs(tv / (1 + w) ** last.offset - dcf.pvTerminal) < 1);
  assert.ok(Math.abs(dcf.enterpriseValue - (dcf.pvExplicit + dcf.pvTerminal)) < 1);

  // Enterprise → equity bridge.
  assert.equal(dcf.netDebt, 30 * B - 20 * B);
  assert.ok(Math.abs(dcf.equityValue - (dcf.enterpriseValue - dcf.netDebt)) < 1);
  assert.ok(Math.abs(dcf.impliedPrice - dcf.equityValue / 1e9) < 1e-9);
  assert.ok(Math.abs(dcf.upside - (dcf.impliedPrice / 100 - 1)) < 1e-12);

  // CAPM and the market-weighted blend.
  const wacc = dcf.wacc;
  assert.ok(Math.abs(wacc.costOfEquity - (0.043 + 1 * 0.05)) < 1e-12);
  assert.ok(Math.abs(wacc.afterTaxCostOfDebt - 0.05 * (1 - 0.21)) < 1e-12);
  assert.equal(wacc.marketCap, 100 * 1e9);
  assert.ok(Math.abs(wacc.equityWeight - (100 * B) / (100 * B + 30 * B)) < 1e-12);
  assert.ok(
    Math.abs(wacc.wacc - (wacc.costOfEquity * wacc.equityWeight + wacc.afterTaxCostOfDebt * wacc.debtWeight)) < 1e-12
  );
}

{
  // No share price means no market cap: WACC falls back to book equity and
  // says so, and the implied-vs-market comparison stays unreported.
  const headlines = retailer();
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  const dcf = runDcf(model, { price: null, shares: 1e9 });
  assert.equal(dcf.wacc.usedBookEquity, true);
  assert.equal(dcf.wacc.marketCap, null);
  assert.equal(dcf.marketPrice, null);
  assert.equal(dcf.upside, null);
  assert.ok(dcf.impliedPrice > 0);
}

{
  // Terminal growth at or above WACC is the classic beginner blow-up: refuse
  // rather than print an infinite valuation.
  const headlines = retailer();
  const model = runThreeStatement(headlines, { ...defaultAssumptions(headlines), terminalGrowth: 0.5 });
  const dcf = runDcf(model, { price: 100, shares: 1e9 });
  assert.equal(dcf.ok, false);
  assert.match(dcf.reason, /below WACC/);
}

{
  const headlines = retailer();
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  const dcf = runDcf(model, { price: 100, shares: 1e9 });
  const sens = dcfSensitivity(model, dcf, { shares: 1e9 });
  assert.equal(sens.rows.length, 5);
  assert.equal(sens.rows[0].cells.length, 5);
  assert.equal(sens.unit, 'price');
  // The centre cell is the model itself.
  assert.ok(Math.abs(sens.rows[2].cells[2] - dcf.impliedPrice) < 1e-6);
  // A higher discount rate is worth less; faster forever-growth is worth more.
  assert.ok(sens.rows[4].cells[2] < sens.rows[0].cells[2]);
  assert.ok(sens.rows[2].cells[4] > sens.rows[2].cells[0]);
}

/* -------------------------------- comps -------------------------------- */

assert.equal(median([]), null);
assert.equal(median([3, 1, 2]), 2);
assert.equal(median([4, 1, 3, 2]), 2.5);
assert.equal(mean([1, 2, 6]), 3);
assert.equal(mean([]), null);

{
  const target = { company: { company: 'Retailer Inc', cik: 1 }, headlines: retailer(), price: 100 };
  const peerA = {
    company: { company: 'Peer A', cik: 2 },
    headlines: { ...retailer(), cik: 2 },
    price: 60,
  };
  const peerB = {
    company: { company: 'Peer B', cik: 3 },
    headlines: { ...retailer(), cik: 3 },
    price: 140,
  };
  const comps = runComps(target, [peerA, peerB]);
  assert.equal(comps.ok, true);
  assert.equal(comps.rows.length, 2);

  // EV = market cap + debt − cash, and EBITDA is EBIT plus the CapEx stand-in.
  const a = comps.rows[0];
  assert.equal(a.marketCap, 60 * B);
  assert.equal(a.enterpriseValue, 60 * B + 30 * B - 20 * B);
  assert.equal(a.ebitda, 12 * B + 5 * B);
  assert.ok(Math.abs(a.evRevenue - (70 * B) / (100 * B)) < 1e-12);
  assert.ok(Math.abs(a.pe - 60 / 8) < 1e-12);

  assert.equal(comps.stats.evRevenue.count, 2);
  assert.ok(Math.abs(comps.stats.pe.median - (60 / 8 + 140 / 8) / 2) < 1e-12);
  assert.ok(Math.abs(comps.stats.pe.mean - comps.stats.pe.median) < 1e-12);

  const pe = comps.implied.find((i) => i.key === 'pe');
  assert.equal(pe.reported, true);
  assert.ok(Math.abs(pe.pricePerShare - comps.stats.pe.median * 8) < 1e-9);

  const evRev = comps.implied.find((i) => i.key === 'evRevenue');
  const impliedEv = comps.stats.evRevenue.median * 100 * B;
  assert.ok(Math.abs(evRev.pricePerShare - (impliedEv - comps.netDebt) / 1e9) < 1e-9);
}

{
  // A peer with no share price contributes nothing — it must not be read as a
  // zero multiple, which would halve the median.
  const target = { company: { company: 'Retailer Inc', cik: 1 }, headlines: retailer(), price: 100 };
  const priced = { company: { company: 'Peer A', cik: 2 }, headlines: { ...retailer(), cik: 2 }, price: 60 };
  const unpriced = { company: { company: 'Peer B', cik: 3 }, headlines: { ...retailer(), cik: 3 }, price: null };
  const comps = runComps(target, [priced, unpriced]);
  assert.equal(comps.rows.length, 2);
  assert.equal(comps.rows[1].enterpriseValue, null);
  assert.equal(comps.rows[1].evRevenue, null);
  assert.equal(comps.rows[1].pe, null);
  assert.equal(comps.stats.evRevenue.count, 1);
  assert.equal(comps.stats.evRevenue.median, comps.rows[0].evRevenue);
  assert.equal(comps.stats.pe.median, comps.rows[0].pe);
}

{
  // A peer that never tags operating income has no EBITDA, so EV/EBITDA is
  // "not reported" for it while EV/Revenue still works.
  const target = { company: { company: 'Retailer Inc', cik: 1 }, headlines: retailer(), price: 100 };
  const noEbit = {
    company: { company: 'Bank Co', cik: 2 },
    headlines: { ...retailer({ operating_income: null, capex: null }), cik: 2 },
    price: 60,
  };
  const comps = runComps(target, [noEbit]);
  assert.equal(comps.rows[0].ebitda, null);
  assert.equal(comps.rows[0].evEbitda, null);
  assert.ok(comps.rows[0].evRevenue > 0);
  assert.equal(comps.stats.evEbitda.count, 0);
  assert.equal(comps.stats.evEbitda.median, null);
  const evEbitda = comps.implied.find((i) => i.key === 'evEbitda');
  assert.equal(evEbitda.reported, false);
  assert.equal(evEbitda.pricePerShare, null);
}

{
  // GoDaddy-style: LongTermDebtNoncurrent without the legacy LongTermDebt tag.
  const headlines = retailer({
    long_term_debt: null,
    debt_noncurrent: point(3_765_200_000, { tag: 'LongTermDebtNoncurrent' }),
    debt_current: point(15_100_000, { tag: 'LongTermDebtCurrent' }),
    cash: point(1_080_900_000),
    liabilities: point(7_819_800_000),
    equity: point(215_100_000),
    assets: point(8_034_900_000),
  });
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  assert.equal(model.ok, true);
  assert.equal(model.rows[0].debt, 3_765_200_000 + 15_100_000);
  const dcf = runDcf(model, { price: 50, shares: 1e9 });
  assert.equal(dcf.ok, true);
  assert.equal(dcf.netDebt, 3_765_200_000 + 15_100_000 - 1_080_900_000);
  assert.ok(dcf.wacc.debt > 3e9, 'WACC debt weight uses interest-bearing debt, not zero');
}

{
  const headlines = retailer({
    debt_current: point(12.35e9, { tag: 'LongTermDebtCurrent' }),
    debt_noncurrent: point(78.33e9, { tag: 'LongTermDebtNoncurrent' }),
    long_term_debt: point(90.68e9, { tag: 'LongTermDebt' }),
    liabilities: point(120e9),
    equity: point(60e9),
    assets: point(150e9),
  });
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  assert.equal(model.rows[0].debt, 90.68e9, 'dual-tagged filer uses current + noncurrent, not legacy total twice');
}

{
  const target = { company: { company: 'Retailer Inc', cik: 1 }, headlines: retailer(), price: 100 };
  const empty = runComps(target, []);
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /at least one peer/);
}

console.log('financial modeler engine tests passed');
