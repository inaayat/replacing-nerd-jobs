/**
 * Workbook exports for unit, capital, strategic, and market exercises must
 * be real .xlsx files with populated Assumptions inputs (no blank drivers).
 */
import assert from 'node:assert/strict';
import { defaultSingleUnitAssumptions, runSingleUnitPortfolio, SINGLE_UNIT_DIALS } from '../financial-modeler/unit-portfolio.js';
import { defaultCapitalProjectAssumptions, runCapitalProject, CAPITAL_DIALS } from '../financial-modeler/capital-project.js';
import { defaultStrategicAssumptions, runStrategicAppraisal, STRATEGIC_DIALS } from '../financial-modeler/strategic-investment.js';
import { defaultMarketEntryAssumptions, runMarketEntry, MARKET_DIALS } from '../financial-modeler/market-entry.js';
import {
  buildUnitWorkbook,
  buildCapitalWorkbook,
  buildStrategicWorkbook,
  buildMarketWorkbook,
  exerciseWorkbookFilename,
} from '../financial-modeler/workbook.js';
import { dependencyRowKeys } from '../financial-modeler/dependencies.js';

function unzipStored(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(buf.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    files.set(name, new TextDecoder().decode(buf.subarray(start, start + compSize)));
    offset = start + compSize;
  }
  return files;
}

function assumptionValues(xml) {
  const labels = [...xml.matchAll(/<c r="A(\d+)"[^>]*>[\s\S]*?<t>([^<]+)<\/t>/g)].map((m) => [Number(m[1]), m[2]]);
  const values = new Map();
  for (const m of xml.matchAll(/<c r="B(\d+)"[^>]*s="([678])"[^>]*><v>([^<]+)<\/v>/g)) {
    values.set(Number(m[1]), Number(m[3]));
  }
  const out = new Map();
  for (const [row, label] of labels) {
    if (values.has(row)) out.set(label, values.get(row));
  }
  return out;
}

function cardsFrom(dials) {
  return dials.map((d) => ({
    key: d.key,
    name: d.name,
    what: d.what,
    how: d.how,
    origin: d.originText?.() || '',
  }));
}

/* ------------------------------- unit ---------------------------------- */

{
  const assumptions = defaultSingleUnitAssumptions('lemonade');
  const model = runSingleUnitPortfolio(assumptions);
  assert.equal(model.ok, true);
  const bytes = buildUnitWorkbook({ model, cards: cardsFrom(SINGLE_UNIT_DIALS) });
  assert.equal(bytes[0], 0x50);
  assert.equal(exerciseWorkbookFilename('unit', 'lemonade'), 'lemonade-stall-model.xlsx');

  const zip = unzipStored(bytes);
  const assump = zip.get('xl/worksheets/sheet2.xml');
  const vals = assumptionValues(assump);
  for (const label of ['Capacity', 'Core price', 'Volume growth (per year)', 'Variable cost / transaction', 'Opening investment (year 1 CapEx)']) {
    assert.ok(vals.has(label), `unit Assumptions missing ${label}`);
    assert.ok(Number.isFinite(vals.get(label)), `${label} must not be blank`);
  }
  assert.equal(vals.get('Capacity'), 20000);
  assert.equal(vals.get('Core price'), 4);
  assert.equal(vals.get('Variable cost / transaction'), 1.2);
  assert.match(zip.get('xl/worksheets/sheet3.xml'), /Transactions/);
  assert.match(zip.get('xl/worksheets/sheet3.xml'), /Assumptions!/);
  assert.ok(dependencyRowKeys('capacity', 'unit', 'three').includes('revenue'));
}

/* ------------------------------ capital -------------------------------- */

{
  const model = runCapitalProject(defaultCapitalProjectAssumptions());
  const bytes = buildCapitalWorkbook({ model, cards: cardsFrom(CAPITAL_DIALS) });
  const zip = unzipStored(bytes);
  const vals = assumptionValues(zip.get('xl/worksheets/sheet2.xml'));
  for (const label of ['Phase 1 spend', 'Phase 2 spend', 'Price per unit', 'Hurdle rate']) {
    assert.ok(vals.has(label), `capital Assumptions missing ${label}`);
    assert.ok(Number.isFinite(vals.get(label)), `${label} must not be blank`);
  }
  assert.match(zip.get('xl/worksheets/sheet3.xml'), /CapEx/);
}

/* ----------------------------- strategic ------------------------------- */

{
  const model = runStrategicAppraisal(defaultStrategicAssumptions());
  const bytes = buildStrategicWorkbook({ model, cards: cardsFrom(STRATEGIC_DIALS) });
  const zip = unzipStored(bytes);
  const vals = assumptionValues(zip.get('xl/worksheets/sheet2.xml'));
  assert.ok(vals.has('Hurdle rate') && vals.get('Hurdle rate') === 0.12);
  assert.ok(vals.has('P(Build)'));
  assert.match(zip.get('xl/worksheets/sheet3.xml'), /Build/);
}

/* ------------------------------- market -------------------------------- */

{
  const model = runMarketEntry(defaultMarketEntryAssumptions());
  const bytes = buildMarketWorkbook({ model, cards: cardsFrom(MARKET_DIALS) });
  const zip = unzipStored(bytes);
  const vals = assumptionValues(zip.get('xl/worksheets/sheet2.xml'));
  assert.ok(vals.has('Addressable market') && vals.get('Addressable market') === 500_000_000);
  assert.ok(vals.has('FX rate (local per USD)'));
  assert.match(zip.get('xl/worksheets/sheet3.xml'), /owned|Owned|Structure/i);
}

console.log('test-financial-modeler-exercise-workbooks: ok');
