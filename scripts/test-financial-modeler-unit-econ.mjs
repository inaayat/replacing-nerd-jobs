/**
 * Unit-econ 3-statement: cups × price has to tie, interest must use the
 * beginning balance, and year-1 CapEx has to show up as depreciation later.
 */
import assert from 'node:assert/strict';
import {
  defaultUnitAssumptions,
  applyUnitScenario,
  runUnitEcon,
  UNIT_DIALS,
} from '../financial-modeler/unit-econ.js';
import { buildUnitWorkbook } from '../financial-modeler/workbook.js';

const a = defaultUnitAssumptions();
const model = runUnitEcon(a);

assert.equal(model.ok, true);
assert.equal(model.kind, 'unit');
assert.equal(model.rows.length, 5);
assert.equal(model.checks.balances, true, `imbalance ${model.checks.worstImbalance}`);

const y1 = model.rows[0];
assert.equal(y1.units, 20000);
assert.equal(y1.revenue, 20000 * 4);
assert.equal(y1.cogs, -(20000 * 1.2));
assert.equal(y1.grossProfit, y1.revenue + y1.cogs);
assert.equal(y1.labor, -(y1.revenue * 0.25));
assert.equal(y1.otherOpex, -8000);
assert.equal(y1.da, -(15000 / 5));
assert.equal(y1.capex, -15000, 'year 1 buys the kit');
assert.equal(y1.ppe, 15000 + y1.da, 'net PP&E is cost minus year-1 depreciation');

// Interest on the *opening* balances, not this year’s plug.
assert.equal(y1.interestExpense, -(5000 * 0.06));
assert.equal(y1.interestIncome, 25000 * 0.02);

const y2 = model.rows[1];
assert.ok(Math.abs(y2.units - 20000 * 1.08) < 1e-9);
assert.equal(y2.capex, -0);
assert.equal(y2.da, y1.da, 'straight-line until the kit is worn out');
assert.equal(y2.interestExpense, -(y1.debt * 0.06), 'year 2 interest uses year-1 ending debt');
assert.equal(y2.interestIncome, y1.cash * 0.02, 'year 2 cash interest uses year-1 ending cash');

for (const r of model.rows) {
  assert.ok(Math.abs(r.balanceCheck) < 0.05, `Y${r.year} does not tie: ${r.balanceCheck}`);
  assert.ok(
    Math.abs(r.cfo - (r.netIncome + r.daAddBack + r.deltaAr + r.deltaInv + r.deltaAp)) < 0.02,
    `Y${r.year} CFO does not reconcile to NI + D&A + working capital`
  );
}

{
  const bull = runUnitEcon(applyUnitScenario(a, 'bull'));
  const bear = runUnitEcon(applyUnitScenario(a, 'bear'));
  assert.ok(bull.rows[0].revenue > y1.revenue, 'bull raises the price');
  assert.ok(bear.rows[0].revenue < y1.revenue);
  assert.ok(bull.rows[1].units > y2.units, 'bull also raises cup growth');
  assert.ok(bear.rows[1].units < y2.units);
}

{
  // No working capital, no tax, no interest: cash movement is NI + DA − CapEx − debt paydown.
  const simple = runUnitEcon({
    ...a,
    dsoDays: 0,
    dioDays: 0,
    dpoDays: 0,
    taxRate: 0,
    interestRate: 0,
    cashYield: 0,
    payoutRatio: 0,
  });
  assert.equal(simple.checks.balances, true);
  const s1 = simple.rows[0];
  const expectedCash =
    a.openingCash + s1.netIncome + s1.daAddBack + s1.capex + s1.debtRepayment;
  assert.ok(Math.abs(s1.cash - expectedCash) < 0.02, `cash ${s1.cash} vs ${expectedCash}`);
}

{
  const worn = runUnitEcon({ ...a, usefulLife: 2, years: 4 });
  assert.equal(worn.rows[0].da, -7500);
  assert.equal(worn.rows[1].da, -7500);
  assert.equal(worn.rows[2].da, -0, 'depreciation stops when the kit is fully worn');
  assert.equal(worn.rows[3].da, -0);
  assert.equal(worn.checks.balances, true);
}

{
  const draw = runUnitEcon({ ...a, payoutRatio: 0.5 });
  assert.ok(draw.rows[0].dividends < 0);
  assert.ok(draw.rows[0].equity < y1.equity);
  assert.equal(draw.checks.balances, true);
}

console.log('test-financial-modeler-unit-econ: ok');

/* ------------------------------ workbook ------------------------------ */

const cards = UNIT_DIALS.map((d) => ({
  key: d.key,
  name: d.name,
  what: d.what,
  how: d.how,
  origin: d.originText(),
}));

const bytes = buildUnitWorkbook({ model, cards });
assert.ok(bytes instanceof Uint8Array);
assert.equal(bytes[0], 0x50);
assert.equal(bytes[1], 0x4b);

function unzipStored(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(buf.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    assert.equal(method, 0, `${name} must be STORED`);
    files.set(name, new TextDecoder().decode(buf.subarray(start, start + compSize)));
    offset = start + compSize;
  }
  return files;
}

const zip = unzipStored(bytes);
const book = zip.get('xl/workbook.xml');
const names = [...book.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(names, ['Cover', 'Assumptions', 'IS', 'CFS', 'BS', 'Checks']);
const allXml = [...zip.values()].join('\n');
assert.ok(!allXml.includes('undefined'), 'no undefined leaked into the unit workbook');
assert.ok(!allXml.includes('NaN'), 'no NaN leaked into the unit workbook');
assert.match(zip.get('xl/worksheets/sheet3.xml'), /Cups sold/);
assert.match(zip.get('xl/worksheets/sheet3.xml'), /Assumptions!/);
assert.match(zip.get('xl/worksheets/sheet4.xml'), /IS!/);
assert.match(zip.get('xl/worksheets/sheet5.xml'), /CFS!/);
assert.match(zip.get('xl/worksheets/sheet2.xml'), /Cups in year 1/);

console.log('test-financial-modeler-unit-econ workbook: ok');
