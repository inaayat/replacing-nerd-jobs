/**
 * The Excel download has to be a real workbook, not a screenshot in XML: live
 * formulas, inputs isolated on one sheet, and the Wall Street Prep colour
 * code (blue input, black formula, green cross-sheet link).
 */
import assert from 'node:assert/strict';
import {
  defaultAssumptions,
  runThreeStatement,
  runDcf,
  dcfSensitivity,
  runComps,
} from '../financial-modeler/engine.js';
import { buildWorkbookXml, workbookFilename } from '../financial-modeler/workbook.js';

const B = 1e9;

function point(val, extra = {}) {
  return { val, unit: 'USD', end: '2025-12-31', form: '10-K', tag: 'Test', ...extra };
}

const headlines = {
  cik: 320193,
  entityName: 'Apple Inc.',
  asOfYear: 2025,
  metrics: {
    revenue: point(400 * B),
    net_income: point(100 * B),
    gross_profit: point(180 * B),
    operating_income: point(125 * B),
    assets: point(360 * B),
    liabilities: point(290 * B),
    equity: point(70 * B),
    cash: point(30 * B),
    receivables: point(65 * B),
    inventory: point(7 * B),
    long_term_debt: point(85 * B),
    capex: point(11 * B),
    cfo: point(118 * B),
    shares_out: point(15e9, { unit: 'shares' }),
    eps_diluted: point(6.5, { unit: 'USD/shares' }),
  },
  ratios: { revenue_yoy: 0.06, gross_margin: 0.45, operating_margin: 0.3125, capex_intensity: 0.0275 },
};

const company = { company: 'Apple', fortune_ticker: 'AAPL', sec_ticker: 'AAPL', cik: 320193, rank: 4 };

const assumptions = defaultAssumptions(headlines);
const model = runThreeStatement(headlines, assumptions);
model.shares = 15e9;
model.companyName = 'Apple';
const dcf = runDcf(model, { price: 230, shares: 15e9 });
const sensitivity = dcfSensitivity(model, dcf, { shares: 15e9 });
const comps = runComps(
  { company, headlines, price: 230 },
  [
    { company: { company: 'Peer A', cik: 2 }, headlines: { ...headlines, cik: 2 }, price: 180 },
    { company: { company: 'Peer B', cik: 3 }, headlines: { ...headlines, cik: 3 }, price: null },
  ]
);

const cards = [{ key: 'revenueGrowth', name: 'Sales growth', what: 'How much bigger it gets.', origin: 'From the 10-K.' }];

const xml = buildWorkbookXml({ company, headlines, model, dcf, sensitivity, comps, cards });

/* --------------------------- shape of the file ------------------------- */

assert.match(xml, /^<\?xml version="1\.0"\?>\n<\?mso-application progid="Excel\.Sheet"\?>/);
assert.equal(workbookFilename(company), 'AAPL-financial-model.xls');
assert.ok(!xml.includes('undefined'), 'no undefined leaked into a cell or a formula');
assert.ok(!xml.includes('NaN'), 'no NaN leaked into a cell');
assert.ok(!/R(undefined|NaN)C/.test(xml), 'every formula resolved a real row number');

const unescapeXml = (s) =>
  s == null
    ? null
    : s.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');

/** Split the workbook into sheets, and each sheet into its rows and cells. */
function parseSheets(source) {
  const sheets = new Map();
  for (const m of source.matchAll(/<Worksheet ss:Name="([^"]+)"><Table>([\s\S]*?)<\/Table><\/Worksheet>/g)) {
    const rows = [];
    for (const r of m[2].matchAll(/<Row(?:\/>|>([\s\S]*?)<\/Row>)/g)) {
      const cells = [];
      for (const c of (r[1] || '').matchAll(/<Cell([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/g)) {
        const attrs = c[1] || '';
        cells.push({
          style: attrs.match(/ss:StyleID="([^"]+)"/)?.[1] || null,
          formula: unescapeXml(attrs.match(/ss:Formula="([^"]+)"/)?.[1] || null),
          value: unescapeXml((c[2] || '').match(/<Data[^>]*>([\s\S]*?)<\/Data>/)?.[1] ?? null),
        });
      }
      rows.push(cells);
    }
    sheets.set(m[1], rows);
  }
  return sheets;
}

const sheets = parseSheets(xml);
const names = [...sheets.keys()];
assert.deepEqual(names, ['Cover', 'Assumptions', 'IS', 'BS', 'CFS', 'Schedules', 'DCF', 'Comps', 'Checks']);
// More than five sheets, so WSP wants a cover and a table of contents.
assert.ok(names.length > 5);
const coverText = sheets.get('Cover').flat().map((c) => c.value).join(' | ');
for (const name of names.slice(1)) {
  assert.ok(coverText.includes(name), `Cover's table of contents is missing ${name}`);
}
assert.ok(coverText.includes('USD'), 'Cover states the currency');
assert.ok(/[Mm]illions/.test(coverText), 'Cover states the scale');

// No macros anywhere.
assert.ok(!/vbaProject|<Macro|x:MacrosImported/i.test(xml));

/* --------------------------- colour conventions ------------------------ */

const styleBlock = xml.match(/<Styles>[\s\S]*?<\/Styles>/)[0];
assert.match(styleBlock, /ss:ID="in"[\s\S]*?ss:Color="#0000FF"/, 'input style is blue');
assert.match(styleBlock, /ss:ID="calc"><Font ss:Color="#000000"/, 'formula style is black');
assert.match(styleBlock, /ss:ID="link"><Font ss:Color="#008000"/, 'cross-sheet link style is green');

const INPUT_STYLES = new Set(['in', 'inpct', 'innum']);
const LINK_STYLES = new Set(['link', 'linknum']);

for (const [name, rows] of sheets) {
  // Cover uses the three styles as colour swatches in its legend, not as data.
  if (name === 'Cover') continue;
  for (const cell of rows.flat()) {
    if (INPUT_STYLES.has(cell.style)) {
      assert.equal(cell.formula, null, `${name}: a blue cell must be typed in, not calculated`);
    }
    if (LINK_STYLES.has(cell.style)) {
      assert.match(cell.formula || '', /[A-Za-z]+!/, `${name}: a green cell must point at another sheet`);
    }
  }
}

/* ------------------ inputs isolated on the Assumptions sheet ----------- */

const assumptionRows = sheets.get('Assumptions');
const drivers = new Map();
assumptionRows.forEach((cells, i) => {
  const label = cells[0]?.value;
  if (label && cells[1] && INPUT_STYLES.has(cells[1].style)) drivers.set(label, i + 1);
});
for (const label of [
  'Revenue growth (per year)',
  'Operating (EBIT) margin',
  'Tax rate',
  'Capital expenditure (% of revenue)',
  'Terminal growth rate',
  'Diluted shares outstanding (millions)',
]) {
  assert.ok(drivers.has(label), `Assumptions is missing the ${label} input`);
}
// The plain-English copy travels with the cell.
const growthRow = assumptionRows[drivers.get('Revenue growth (per year)') - 1];
assert.equal(growthRow[2].value, 'How much bigger it gets.');
assert.equal(growthRow[3].value, 'From the 10-K.');

// Every Assumptions reference in the workbook lands on a row that really
// holds an input — reordering a driver used to silently repoint a formula.
const referenced = new Set();
for (const m of xml.matchAll(/Assumptions!R(\d+)C2/g)) referenced.add(Number(m[1]));
assert.ok(referenced.size >= 10, 'the statements should read a dozen-odd drivers');
const inputRowNumbers = new Set(drivers.values());
for (const row of referenced) {
  assert.ok(inputRowNumbers.has(row), `a formula points at Assumptions row ${row}, which is not an input cell`);
}

/* ---------------------- live formulas on every sheet ------------------- */

function findRow(sheet, label) {
  const rows = sheets.get(sheet);
  const idx = rows.findIndex((cells) => cells[0]?.value === label);
  assert.notEqual(idx, -1, `${sheet} has no row called ${label}`);
  return { number: idx + 1, cells: rows[idx] };
}

for (const sheet of ['IS', 'BS', 'CFS', 'Schedules', 'DCF', 'Comps', 'Checks']) {
  const formulas = sheets.get(sheet).flat().filter((c) => c.formula);
  assert.ok(formulas.length > 0, `${sheet} has no live formulas`);
}

// Historical column first, forecast to the right, no spacer columns.
const header = findRow('IS', 'US$ in millions').cells;
assert.equal(header[1].value, 'FY2025A');
assert.deepEqual(
  header.slice(2).map((c) => c.value),
  ['FY2026E', 'FY2027E', 'FY2028E', 'FY2029E', 'FY2030E']
);

// One row, one calculation: a forecast row uses the identical formula in
// every one of its columns.
for (const [sheet, label] of [
  ['IS', 'Revenue'],
  ['IS', 'Net income'],
  ['BS', 'Total assets'],
  ['CFS', 'Cash from operations'],
  ['Schedules', 'Accounts receivable'],
]) {
  const { cells } = findRow(sheet, label);
  const forecast = cells.slice(2).map((c) => c.formula);
  assert.equal(new Set(forecast).size, 1, `${sheet}!${label} does not use one consistent formula`);
  assert.ok(forecast[0], `${sheet}!${label} forecast cells are not formulas`);
}

// Year 0 is the filed number, hard-coded and blue; the forecast is black.
const revenue = findRow('IS', 'Revenue');
assert.equal(revenue.cells[1].style, 'in');
assert.equal(revenue.cells[1].value, '400000');
assert.equal(revenue.cells[1].formula, null);
assert.match(revenue.cells[2].formula, /^=RC\[-1\]\*\(1\+Assumptions!R\d+C2\)$/);

/* --------------------------- the balance check ------------------------- */

const totalAssets = findRow('BS', 'Total assets');
const totalLE = findRow('BS', 'Total liabilities & equity');
const check = findRow('BS', 'Check: assets − (liabilities + equity)');
assert.equal(check.cells[1].formula, `=R${totalAssets.number}C-R${totalLE.number}C`);
for (const cell of check.cells.slice(1)) {
  assert.equal(cell.formula, `=R${totalAssets.number}C-R${totalLE.number}C`);
  assert.equal(cell.style, 'check');
}
// It is a live check, so it must read zero on the numbers we shipped.
for (const row of model.rows) assert.ok(Math.abs(row.balanceCheck) < model.checks.tolerance);

// The error dashboard mirrors it and adds a negative-cash alarm.
const dashCheck = findRow('Checks', 'Balance sheet: assets − (liabilities + equity)');
assert.match(dashCheck.cells[1].formula, /^=BS!R\d+C$/);
const cashAlarm = findRow('Checks', 'Cash never goes negative');
assert.match(cashAlarm.cells[1].formula, /IF\(BS!R\d+C>=0,"OK","NEGATIVE"\)/);

/* -------------------- statements wired to each other ------------------- */

// Cash is the plug: the balance sheet reads it off the cash flow statement,
// which in turn reads last year's balance sheet.
const bsCash = findRow('BS', 'Cash & equivalents');
assert.match(bsCash.cells[2].formula, /^=CFS!R\d+C$/);
assert.equal(bsCash.cells[2].style, 'link');
const beginCash = findRow('CFS', 'Beginning cash');
const endCash = findRow('CFS', 'Ending cash');
assert.equal(beginCash.cells[2].formula, `=R${endCash.number}C[-1]`);

// Interest reads the *beginning* debt balance, so there is no circularity and
// Excel never needs iterative calculation switched on.
const debtBegin = findRow('Schedules', 'Beginning balance');
const interest = findRow('IS', 'Interest expense');
assert.match(interest.cells[2].formula, /^=-Schedules!R\d+C\*Assumptions!R\d+C2$/);
assert.ok(debtBegin.number > 0);

// The corkscrews are BASE schedules, not restatements.
const eqEnd = sheets.get('Schedules').findIndex((cells) => cells[0]?.value === 'Ending balance');
assert.notEqual(eqEnd, -1);

/* ---------------------------------- DCF -------------------------------- */

const wacc = findRow('DCF', 'WACC');
assert.match(wacc.cells[1].formula, /^=R\d+C\*R\d+C\+R\d+C\*R\d+C$/);
const coe = findRow('DCF', 'Cost of equity (CAPM)');
assert.match(coe.cells[1].formula, /^=R\d+C\+R\d+C\*R\d+C$/);
const fcf = findRow('DCF', 'Unlevered free cash flow');
assert.match(fcf.cells[2].formula, /^=SUM\(R\d+C:R\d+C\)$/);
const price = findRow('DCF', 'Implied share price');
assert.match(price.cells[1].formula, /^=R\d+C2\/R\d+C2$/);
// A missing market price must not blow up the sheet.
const upside = findRow('DCF', 'Implied upside / (downside)');
assert.match(upside.cells[1].formula, /^=IFERROR\(/);

// The sensitivity grid recalculates rather than freezing today's answer.
const sensCells = sheets
  .get('DCF')
  .flat()
  .filter((c) => c.formula?.includes('NPV('));
assert.equal(sensCells.length, 25, 'a 5 × 5 live sensitivity table');
for (const cell of sensCells) assert.match(cell.formula, /^=IFERROR\(\(NPV\(RC2,/);

/* --------------------------------- comps ------------------------------- */

const compRows = sheets.get('Comps');
const medianRow = compRows.find((cells) => cells[0]?.value === 'Median');
assert.ok(medianRow, 'Comps has a median row');
for (const cell of medianRow.slice(10)) {
  assert.match(cell.formula, /^=IFERROR\(MEDIAN\(R\d+C\d+:R\d+C\d+\),"nr"\)$/);
}
const meanRow = compRows.find((cells) => cells[0]?.value === 'Mean');
for (const cell of meanRow.slice(10)) assert.match(cell.formula, /AVERAGE\(/);

// The unpriced peer is written with blank price/EV cells and its multiples
// come out as "nr" — never as a zero that would drag the median down.
const peerB = compRows.find((cells) => cells[0]?.value === 'Peer B');
assert.equal(peerB[2].value, null, 'no price for the unpriced peer');
assert.equal(peerB[5].value, null, 'no net debt without an enterprise value');
assert.match(peerB[10].formula, /^=IFERROR\(/);

/* ---------------------- picking only some of the models ---------------- */

const isOnly = parseSheets(
  buildWorkbookXml({ company, headlines, model, dcf, sensitivity, comps, cards, include: { dcf: false, comps: false } })
);
assert.deepEqual([...isOnly.keys()], ['Cover', 'Assumptions', 'IS', 'BS', 'CFS', 'Schedules', 'Checks']);

console.log('financial modeler workbook tests passed');
