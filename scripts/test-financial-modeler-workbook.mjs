/**
 * The Excel download has to be a real .xlsx, not XML pretending to be xls:
 * OOXML zip, live formulas, inputs isolated on one sheet, and the Wall Street
 * Prep colour code (blue input, black formula, green cross-sheet link).
 */
import assert from 'node:assert/strict';
import {
  defaultAssumptions,
  runThreeStatement,
  runDcf,
  dcfSensitivity,
  runComps,
} from '../financial-modeler/engine.js';
import {
  buildWorkbook,
  workbookFilename,
  STYLE,
  styleName,
  r1c1ToA1,
  colLetter,
  zipStore,
} from '../financial-modeler/workbook.js';

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

const cards = [{ key: 'revenueGrowth', name: 'Sales growth', what: 'How much bigger it gets.', how: 'This year’s sales ÷ last year’s − 1.', origin: 'From the 10-K.' }];

const bytes = buildWorkbook({ company, headlines, model, dcf, sensitivity, comps, cards });

/* --------------------------- zip / OOXML shape ------------------------- */

assert.ok(bytes instanceof Uint8Array, 'workbook is a zip byte array');
assert.equal(bytes[0], 0x50);
assert.equal(bytes[1], 0x4b);
assert.equal(bytes[2], 0x03);
assert.equal(bytes[3], 0x04);
assert.equal(workbookFilename(company), 'AAPL-financial-model.xlsx');

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
    assert.equal(method, 0, `${name} must be STORED (uncompressed)`);
    files.set(name, new TextDecoder().decode(buf.subarray(start, start + compSize)));
    offset = start + compSize;
  }
  return files;
}

const zip = unzipStored(bytes);
for (const part of [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/styles.xml',
  'xl/worksheets/sheet1.xml',
]) {
  assert.ok(zip.has(part), `xlsx is missing ${part}`);
}

const types = zip.get('[Content_Types].xml');
assert.match(types, /spreadsheetml\.sheet\.main\+xml/);
assert.match(types, /spreadsheetml\.worksheet\+xml/);
assert.match(types, /spreadsheetml\.styles\+xml/);
assert.ok(!/vnd\.ms-excel/.test(types), 'must not advertise the old SpreadsheetML 2003 type');

const book = zip.get('xl/workbook.xml');
assert.match(book, /fullCalcOnLoad="1"/, 'Excel should recalc on open');
const names = [...book.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(names, ['Cover', 'Assumptions', 'IS', 'BS', 'CFS', 'Schedules', 'DCF', 'Comps', 'Checks']);
assert.ok(names.length > 5);

const allXml = [...zip.values()].join('\n');
assert.ok(!allXml.includes('undefined'), 'no undefined leaked into a cell or a formula');
assert.ok(!allXml.includes('NaN'), 'no NaN leaked into a cell');
assert.ok(!/vbaProject|<Macro|x:MacrosImported/i.test(allXml));
assert.ok(!/urn:schemas-microsoft-com:office:spreadsheet/.test(allXml), 'must not be SpreadsheetML 2003');

/* --------------------------- colour conventions ------------------------ */

const styleBlock = zip.get('xl/styles.xml');
assert.match(styleBlock, /<color rgb="FF0000FF"/, 'input style is blue');
assert.match(styleBlock, /<color rgb="FF008000"/, 'cross-sheet link style is green');
assert.match(styleBlock, /<color rgb="FF000000"/, 'formula style is black');

const fonts = [...styleBlock.matchAll(/<font>([\s\S]*?)<\/font>/g)].map((m) => m[1]);
const fontColor = (font) => font.match(/<color rgb="([A-F0-9]+)"/)?.[1];
assert.equal(fontColor(fonts[4]), 'FF0000FF', 'font 4 is the blue input face');
assert.equal(fontColor(fonts[5]), 'FF008000', 'font 5 is the green link face');
assert.equal(fontColor(fonts[0]), 'FF000000', 'font 0 is black');

const cellXfsXml = styleBlock.match(/<cellXfs[\s\S]*?<\/cellXfs>/)[0];
const xfs = [...cellXfsXml.matchAll(/<xf\b([^>]*)/g)].map((m) => m[1]);
assert.match(xfs[STYLE.in], /fontId="4"/, 'in xf uses the blue font');
assert.match(xfs[STYLE.inpct], /fontId="4"/);
assert.match(xfs[STYLE.innum], /fontId="4"/);
assert.match(xfs[STYLE.calc], /fontId="0"/, 'calc xf uses the black font');
assert.match(xfs[STYLE.link], /fontId="5"/, 'link xf uses the green font');
assert.match(xfs[STYLE.linknum], /fontId="5"/);

/* -------------------- parse sheets (A1 → R1C1 for asserts) ------------- */

function colNumber(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function a1RefToR1c1(absCol, letters, absRow, rowNum, curRow, curCol) {
  const col = colNumber(letters);
  const row = Number(rowNum);
  const r = absRow ? `R${row}` : row === curRow ? 'R' : `R[${row - curRow}]`;
  const c = absCol ? `C${col}` : col === curCol ? 'C' : `C[${col - curCol}]`;
  return r + c;
}

function a1ToR1c1(formula, curRow, curCol) {
  return String(formula).replace(
    /(?:([A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Z]+)(\$?)(\d+)/g,
    (_, sheet, dollarCol, letters, dollarRow, rowNum) => {
      const ref = a1RefToR1c1(dollarCol === '$', letters, dollarRow === '$', rowNum, curRow, curCol);
      return sheet ? `${sheet}!${ref}` : ref;
    }
  );
}

const unescapeXml = (s) =>
  s == null
    ? null
    : s.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');

function parseSheetXml(xml) {
  const rows = [];
  for (const rm of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(rm[1]);
    while (rows.length < rowNum) rows.push([]);
    const cells = rows[rowNum - 1];
    for (const cm of rm[2].matchAll(/<c ([^>]+)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = attrs.match(/\br="([A-Z]+)(\d+)"/);
      if (!ref) continue;
      const col = colNumber(ref[1]);
      const xf = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0);
      const body = cm[2] || '';
      const fRaw = unescapeXml(body.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1] ?? null);
      const inline = unescapeXml(body.match(/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/)?.[1] ?? null);
      const v = unescapeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? null);
      while (cells.length < col) cells.push({ style: null, formula: null, value: null, a1: null });
      const formula = fRaw == null ? null : a1ToR1c1(fRaw.startsWith('=') ? fRaw : `=${fRaw}`, rowNum, col);
      cells[col - 1] = {
        style: styleName(xf),
        formula,
        a1: fRaw == null ? null : fRaw.startsWith('=') ? fRaw : `=${fRaw}`,
        value: inline != null ? inline : v,
      };
    }
  }
  return rows;
}

function parseWorkbook(buf) {
  const parts = unzipStored(buf);
  const wb = parts.get('xl/workbook.xml');
  const sheetNames = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  const sheets = new Map();
  sheetNames.forEach((name, i) => {
    sheets.set(name, parseSheetXml(parts.get(`xl/worksheets/sheet${i + 1}.xml`)));
  });
  return { sheets, xml: [...parts.values()].join('\n'), parts };
}

const { sheets, xml } = parseWorkbook(bytes);
const coverText = sheets.get('Cover').flat().map((c) => c.value).join(' | ');
for (const name of names.slice(1)) {
  assert.ok(coverText.includes(name), `Cover's table of contents is missing ${name}`);
}
assert.ok(coverText.includes('USD'), 'Cover states the currency');
assert.ok(/[Mm]illions/.test(coverText), 'Cover states the scale');
assert.ok(coverText.includes('How the three statements connect'));
assert.match(coverText, /[Pp]lug/, 'Cover says cash is the plug');

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
const growthRow = assumptionRows[drivers.get('Revenue growth (per year)') - 1];
assert.equal(growthRow[2].value, 'How much bigger it gets.');
assert.equal(growthRow[3].value, 'This year’s sales ÷ last year’s − 1.');
assert.equal(growthRow[4].value, 'From the 10-K.');

const referenced = new Set();
for (const m of xml.matchAll(/Assumptions!\$B\$(\d+)/g)) referenced.add(Number(m[1]));
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

const header = findRow('IS', 'US$ in millions').cells;
assert.equal(header[1].value, 'FY2025A');
assert.deepEqual(
  header.slice(2).map((c) => c.value),
  ['FY2026E', 'FY2027E', 'FY2028E', 'FY2029E', 'FY2030E']
);

// One row, one calculation: after converting A1 back to R1C1, a forecast row
// uses the identical formula in every column.
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

const revenue = findRow('IS', 'Revenue');
assert.equal(revenue.cells[1].style, 'in');
assert.equal(revenue.cells[1].value, '400000');
assert.equal(revenue.cells[1].formula, null);
assert.match(revenue.cells[2].formula, /^=RC\[-1\]\*\(1\+Assumptions!R\d+C2\)$/);
assert.match(revenue.cells[2].a1, /^=B4\*\(1\+Assumptions!\$B\$\d+\)$/);

/* --------------------------- the balance check ------------------------- */

const totalAssets = findRow('BS', 'Total assets');
const totalLE = findRow('BS', 'Total liabilities & equity');
const check = findRow('BS', 'Check: assets − (liabilities + equity)');
assert.equal(check.cells[1].formula, `=R${totalAssets.number}C-R${totalLE.number}C`);
for (const cell of check.cells.slice(1)) {
  assert.equal(cell.formula, `=R${totalAssets.number}C-R${totalLE.number}C`);
  assert.equal(cell.style, 'check');
}
for (const row of model.rows) assert.ok(Math.abs(row.balanceCheck) < model.checks.tolerance);

const dashCheck = findRow('Checks', 'Balance sheet: assets − (liabilities + equity)');
assert.match(dashCheck.cells[1].formula, /^=BS!R\d+C$/);
const cashAlarm = findRow('Checks', 'Cash never goes negative');
assert.match(cashAlarm.cells[1].formula, /IF\(BS!R\d+C>=0,"OK","NEGATIVE"\)/);

/* -------------------- statements wired to each other ------------------- */

const bsCash = findRow('BS', 'Cash & equivalents');
assert.match(bsCash.cells[2].formula, /^=CFS!R\d+C$/);
assert.equal(bsCash.cells[2].style, 'link');
const beginCash = findRow('CFS', 'Beginning cash');
const endCash = findRow('CFS', 'Ending cash');
assert.equal(beginCash.cells[2].formula, `=R${endCash.number}C[-1]`);

const debtBegin = findRow('Schedules', 'Beginning balance');
const interest = findRow('IS', 'Interest expense');
assert.match(interest.cells[2].formula, /^=-Schedules!R\d+C\*Assumptions!R\d+C2$/);
assert.ok(debtBegin.number > 0);

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
const upside = findRow('DCF', 'Implied upside / (downside)');
assert.match(upside.cells[1].formula, /^=IFERROR\(/);

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

const peerB = compRows.find((cells) => cells[0]?.value === 'Peer B');
assert.equal(peerB[2].value, null, 'no price for the unpriced peer');
assert.equal(peerB[5].value, null, 'no net debt without an enterprise value');
assert.match(peerB[10].formula, /^=IFERROR\(/);

/* ---------------------- picking only some of the models ---------------- */

const isOnly = parseWorkbook(
  buildWorkbook({ company, headlines, model, dcf, sensitivity, comps, cards, include: { dcf: false, comps: false } })
);
assert.deepEqual([...isOnly.sheets.keys()], ['Cover', 'Assumptions', 'IS', 'BS', 'CFS', 'Schedules', 'Checks']);

/* ---------------------- converter + zip smoke -------------------------- */

assert.equal(r1c1ToA1('RC[-1]*(1+Assumptions!R6C2)', 4, 3), 'B4*(1+Assumptions!$B$6)');
assert.equal(r1c1ToA1('R8C-R14C', 8, 4), 'D$8-D$14');
assert.equal(r1c1ToA1('CFS!R16C', 4, 3), 'CFS!C$16');
assert.equal(colLetter(1), 'A');
assert.equal(colLetter(27), 'AA');

const roundTrip = unzipStored(zipStore([{ name: 'hello.txt', data: 'hi' }]));
assert.equal(roundTrip.get('hello.txt'), 'hi');

console.log('financial modeler workbook tests passed');
